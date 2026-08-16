use std::{
    collections::HashMap, env, fs::OpenOptions, io::Write, path::PathBuf, sync::Mutex,
    time::Duration,
};

#[derive(serde::Serialize)]
struct DroppedFile {
    name: String,
    bytes: Vec<u8>,
}

#[derive(serde::Serialize)]
struct ChatCompletionResponse {
    status: u16,
    body: String,
    #[serde(rename = "retryAfter")]
    retry_after: Option<String>,
}

#[derive(serde::Serialize)]
struct SavedReport {
    path: String,
}

#[derive(serde::Serialize)]
struct BinarySaveSession {
    id: String,
    path: String,
}

#[derive(Default)]
struct SaveSessionState(Mutex<HashMap<String, PathBuf>>);

struct HttpClientState {
    chat: Result<reqwest::Client, String>,
    resource: Result<reqwest::Client, String>,
}

impl Default for HttpClientState {
    fn default() -> Self {
        Self {
            chat: build_http_client(20),
            resource: build_http_client(15),
        }
    }
}

fn build_http_client(connect_timeout_secs: u64) -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(connect_timeout_secs))
        .build()
        .map_err(|error| format!("初始化接口客户端失败：{error}"))
}

fn normalize_chat_timeout_ms(timeout_ms: Option<u64>) -> u64 {
    timeout_ms.unwrap_or(240_000).clamp(5_000, 600_000)
}

fn normalize_resource_timeout_ms(timeout_ms: Option<u64>) -> u64 {
    timeout_ms.unwrap_or(30_000).clamp(5_000, 120_000)
}

#[cfg(target_os = "windows")]
fn build_taskbar_attention_icon() -> tauri::image::Image<'static> {
    const SIZE: u32 = 32;
    const OUTER_RADIUS_SQUARED: i32 = 14 * 14;
    const INNER_RADIUS_SQUARED: i32 = 10 * 10;
    let center = (SIZE as i32 - 1) / 2;
    let mut rgba = vec![0_u8; (SIZE * SIZE * 4) as usize];

    for y in 0..SIZE as i32 {
        for x in 0..SIZE as i32 {
            let dx = x - center;
            let dy = y - center;
            let distance_squared = dx * dx + dy * dy;
            let pixel = ((y as u32 * SIZE + x as u32) * 4) as usize;
            if distance_squared <= OUTER_RADIUS_SQUARED {
                let color = if distance_squared <= INNER_RADIUS_SQUARED {
                    [239, 68, 68, 255]
                } else {
                    [248, 250, 252, 255]
                };
                rgba[pixel..pixel + 4].copy_from_slice(&color);
            }
        }
    }

    tauri::image::Image::new_owned(rgba, SIZE, SIZE)
}

#[tauri::command]
fn set_taskbar_attention(window: tauri::WebviewWindow, active: bool) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let overlay = active.then(build_taskbar_attention_icon);
        window
            .set_overlay_icon(overlay)
            .map_err(|error| format!("更新任务栏完成提示失败：{error}"))?;
    }

    #[cfg(any(target_os = "windows", target_os = "macos", target_os = "linux"))]
    window
        .request_user_attention(active.then_some(tauri::UserAttentionType::Informational))
        .map_err(|error| format!("更新任务栏提醒状态失败：{error}"))?;

    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    let _ = (window, active);

    Ok(())
}

#[tauri::command]
fn read_dropped_file(path: String) -> Result<DroppedFile, String> {
    let path = PathBuf::from(path);
    let metadata =
        std::fs::metadata(&path).map_err(|error| format!("无法读取文件信息：{error}"))?;

    if !metadata.is_file() {
        return Err("只能拖入文件，不能拖入文件夹".to_string());
    }

    const MAX_FILE_SIZE: u64 = 100 * 1024 * 1024;
    if metadata.len() > MAX_FILE_SIZE {
        return Err("文件超过 100MB，请拆分后再上传".to_string());
    }

    let extension = path
        .extension()
        .and_then(|extension| extension.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();

    if !matches!(extension.as_str(), "csv" | "xlsx" | "xls") {
        return Err("仅支持 .csv、.xlsx、.xls 文件".to_string());
    }

    let name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("uploaded-file")
        .to_string();

    let bytes = std::fs::read(&path).map_err(|error| format!("无法读取文件内容：{error}"))?;

    Ok(DroppedFile { name, bytes })
}

#[tauri::command]
async fn post_chat_completion(
    http: tauri::State<'_, HttpClientState>,
    url: String,
    api_key: String,
    body: serde_json::Value,
    timeout_ms: Option<u64>,
    headers: Option<HashMap<String, String>>,
) -> Result<ChatCompletionResponse, String> {
    let parsed_url = reqwest::Url::parse(&url).map_err(|error| format!("接口地址无效：{error}"))?;
    if !matches!(parsed_url.scheme(), "https" | "http") {
        return Err("接口地址必须是 http 或 https".to_string());
    }

    let timeout_ms = normalize_chat_timeout_ms(timeout_ms);
    let client = http.chat.as_ref().map_err(|error| error.clone())?;

    let mut request = client
        .post(parsed_url)
        .timeout(Duration::from_millis(timeout_ms))
        .json(&body);
    if let Some(headers) = headers {
        for (key, value) in headers {
            if !key.trim().is_empty() {
                request = request.header(key, value);
            }
        }
    } else {
        request = request.bearer_auth(api_key);
    }

    let response = request.send().await.map_err(|error| {
        if error.is_timeout() {
            format!(
                "请求接口超时（超过 {} 秒），可能是接口繁忙、网络不稳定或通道并发过高",
                (timeout_ms + 999) / 1000
            )
        } else if error.is_connect() {
            format!("无法连接接口，请检查 Base URL 或网络状态：{error}")
        } else {
            format!("请求接口失败：{error}")
        }
    })?;

    let status = response.status().as_u16();
    let retry_after = response
        .headers()
        .get(reqwest::header::RETRY_AFTER)
        .and_then(|value| value.to_str().ok())
        .map(str::to_owned);
    let body = response
        .text()
        .await
        .map_err(|error| format!("读取接口返回失败：{error}"))?;

    Ok(ChatCompletionResponse {
        status,
        body,
        retry_after,
    })
}

#[tauri::command]
async fn get_api_resource(
    http: tauri::State<'_, HttpClientState>,
    url: String,
    api_key: String,
    timeout_ms: Option<u64>,
    headers: Option<HashMap<String, String>>,
) -> Result<ChatCompletionResponse, String> {
    let parsed_url = reqwest::Url::parse(&url).map_err(|error| format!("接口地址无效：{error}"))?;
    if !matches!(parsed_url.scheme(), "https" | "http") {
        return Err("接口地址必须是 http 或 https".to_string());
    }

    let timeout_ms = normalize_resource_timeout_ms(timeout_ms);
    let client = http.resource.as_ref().map_err(|error| error.clone())?;

    let mut request = client
        .get(parsed_url)
        .timeout(Duration::from_millis(timeout_ms));
    if let Some(headers) = headers {
        for (key, value) in headers {
            if !key.trim().is_empty() {
                request = request.header(key, value);
            }
        }
    } else if !api_key.trim().is_empty() {
        request = request.bearer_auth(api_key);
    }

    let response = request.send().await.map_err(|error| {
        if error.is_timeout() {
            format!(
                "读取模型列表超时（超过 {} 秒），请稍后重试",
                (timeout_ms + 999) / 1000
            )
        } else if error.is_connect() {
            format!("无法连接模型列表接口，请检查 Base URL 或网络状态：{error}")
        } else {
            format!("读取模型列表失败：{error}")
        }
    })?;

    let status = response.status().as_u16();
    let retry_after = response
        .headers()
        .get(reqwest::header::RETRY_AFTER)
        .and_then(|value| value.to_str().ok())
        .map(str::to_owned);
    let body = response
        .text()
        .await
        .map_err(|error| format!("读取模型列表返回失败：{error}"))?;

    Ok(ChatCompletionResponse {
        status,
        body,
        retry_after,
    })
}

fn downloads_dir() -> Result<PathBuf, String> {
    #[cfg(target_os = "windows")]
    {
        if let Ok(profile) = env::var("USERPROFILE") {
            return Ok(PathBuf::from(profile).join("Downloads"));
        }
        let drive = env::var("HOMEDRIVE").unwrap_or_default();
        let path = env::var("HOMEPATH").unwrap_or_default();
        if !drive.is_empty() || !path.is_empty() {
            return Ok(PathBuf::from(format!("{drive}{path}")).join("Downloads"));
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        if let Ok(home) = env::var("HOME") {
            return Ok(PathBuf::from(home).join("Downloads"));
        }
    }

    Err("无法定位系统下载目录".to_string())
}

fn sanitize_download_filename(filename: &str, fallback: &str) -> String {
    let cleaned: String = filename
        .chars()
        .map(|ch| {
            if ch.is_control() || matches!(ch, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|')
            {
                '_'
            } else {
                ch
            }
        })
        .collect();
    let cleaned = cleaned.trim().trim_matches('.').to_string();
    if cleaned.is_empty() {
        fallback.to_string()
    } else {
        cleaned
    }
}

fn sanitize_filename(filename: &str) -> String {
    let cleaned = sanitize_download_filename(filename, "nexus_l10n_report.csv");
    if cleaned.to_ascii_lowercase().ends_with(".csv") {
        cleaned
    } else {
        format!("{cleaned}.csv")
    }
}

fn unique_report_path(directory: PathBuf, filename: String) -> PathBuf {
    let path = directory.join(&filename);
    if !path.exists() {
        return path;
    }

    let file_path = PathBuf::from(&filename);
    let stem = file_path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("nexus_l10n_report");
    let extension = file_path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("csv");

    for index in 1..1000 {
        let candidate = directory.join(format!("{stem}-{index}.{extension}"));
        if !candidate.exists() {
            return candidate;
        }
    }

    directory.join(format!(
        "{stem}-{}.{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|duration| duration.as_secs())
            .unwrap_or(0),
        extension
    ))
}

#[tauri::command]
fn save_report_to_downloads(filename: String, content: String) -> Result<SavedReport, String> {
    let directory = downloads_dir()?;
    std::fs::create_dir_all(&directory).map_err(|error| format!("无法创建下载目录：{error}"))?;

    let safe_filename = sanitize_filename(&filename);
    let path = unique_report_path(directory, safe_filename);
    std::fs::write(&path, content.as_bytes())
        .map_err(|error| format!("无法保存结果文件：{error}"))?;

    Ok(SavedReport {
        path: path.to_string_lossy().to_string(),
    })
}

#[tauri::command]
fn save_binary_report_to_downloads(
    filename: String,
    bytes: Vec<u8>,
) -> Result<SavedReport, String> {
    let directory = downloads_dir()?;
    std::fs::create_dir_all(&directory).map_err(|error| format!("无法创建下载目录：{error}"))?;

    let safe_filename = sanitize_download_filename(&filename, "nexus_report.xlsx");
    let path = unique_report_path(directory, safe_filename);
    std::fs::write(&path, bytes).map_err(|error| format!("无法保存结果文件：{error}"))?;

    Ok(SavedReport {
        path: path.to_string_lossy().to_string(),
    })
}

#[tauri::command]
fn start_binary_report_save(
    state: tauri::State<'_, SaveSessionState>,
    filename: String,
) -> Result<BinarySaveSession, String> {
    let directory = downloads_dir()?;
    std::fs::create_dir_all(&directory)
        .map_err(|error| format!("failed to create downloads directory: {error}"))?;

    let safe_filename = sanitize_download_filename(&filename, "nexus_report.xlsx");
    let path = unique_report_path(directory, safe_filename);
    std::fs::File::create(&path)
        .map_err(|error| format!("failed to create output file: {error}"))?;

    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    let id = format!("{}-{timestamp}", std::process::id());

    let mut sessions = state
        .0
        .lock()
        .map_err(|_| "failed to lock save session state".to_string())?;
    sessions.insert(id.clone(), path.clone());

    Ok(BinarySaveSession {
        id,
        path: path.to_string_lossy().to_string(),
    })
}

#[tauri::command]
fn append_binary_report_chunk(
    state: tauri::State<'_, SaveSessionState>,
    id: String,
    bytes: Vec<u8>,
) -> Result<(), String> {
    let path = {
        let sessions = state
            .0
            .lock()
            .map_err(|_| "failed to lock save session state".to_string())?;
        sessions
            .get(&id)
            .cloned()
            .ok_or_else(|| "save session was not found".to_string())?
    };

    let mut file = OpenOptions::new()
        .append(true)
        .open(&path)
        .map_err(|error| format!("failed to open output file: {error}"))?;
    file.write_all(&bytes)
        .map_err(|error| format!("failed to write output chunk: {error}"))?;
    file.flush()
        .map_err(|error| format!("failed to flush output file: {error}"))?;

    Ok(())
}

#[tauri::command]
fn finish_binary_report_save(
    state: tauri::State<'_, SaveSessionState>,
    id: String,
) -> Result<SavedReport, String> {
    let path = {
        let mut sessions = state
            .0
            .lock()
            .map_err(|_| "failed to lock save session state".to_string())?;
        sessions
            .remove(&id)
            .ok_or_else(|| "save session was not found".to_string())?
    };

    Ok(SavedReport {
        path: path.to_string_lossy().to_string(),
    })
}

#[tauri::command]
fn abort_binary_report_save(
    state: tauri::State<'_, SaveSessionState>,
    id: String,
) -> Result<(), String> {
    let path = {
        let mut sessions = state
            .0
            .lock()
            .map_err(|_| "failed to lock save session state".to_string())?;
        sessions.remove(&id)
    };

    if let Some(path) = path {
        let _ = std::fs::remove_file(path);
    }

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(SaveSessionState::default())
        .manage(HttpClientState::default())
        .invoke_handler(tauri::generate_handler![
            read_dropped_file,
            post_chat_completion,
            get_api_resource,
            save_report_to_downloads,
            save_binary_report_to_downloads,
            start_binary_report_save,
            append_binary_report_chunk,
            finish_binary_report_save,
            abort_binary_report_save,
            set_taskbar_attention
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::{normalize_chat_timeout_ms, normalize_resource_timeout_ms};

    #[cfg(target_os = "windows")]
    use super::build_taskbar_attention_icon;

    #[test]
    fn chat_timeout_keeps_existing_defaults_and_bounds() {
        assert_eq!(normalize_chat_timeout_ms(None), 240_000);
        assert_eq!(normalize_chat_timeout_ms(Some(1)), 5_000);
        assert_eq!(normalize_chat_timeout_ms(Some(45_000)), 45_000);
        assert_eq!(normalize_chat_timeout_ms(Some(900_000)), 600_000);
    }

    #[test]
    fn resource_timeout_keeps_existing_defaults_and_bounds() {
        assert_eq!(normalize_resource_timeout_ms(None), 30_000);
        assert_eq!(normalize_resource_timeout_ms(Some(1)), 5_000);
        assert_eq!(normalize_resource_timeout_ms(Some(45_000)), 45_000);
        assert_eq!(normalize_resource_timeout_ms(Some(900_000)), 120_000);
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn taskbar_attention_icon_is_a_small_transparent_red_badge() {
        let icon = build_taskbar_attention_icon();
        assert_eq!(icon.width(), 32);
        assert_eq!(icon.height(), 32);
        assert_eq!(icon.rgba().len(), 32 * 32 * 4);
        assert!(icon
            .rgba()
            .chunks_exact(4)
            .any(|pixel| pixel == [239, 68, 68, 255]));
        assert!(icon
            .rgba()
            .chunks_exact(4)
            .any(|pixel| pixel == [0, 0, 0, 0]));
    }
}
