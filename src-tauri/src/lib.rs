use std::{collections::HashMap, env, path::PathBuf, time::Duration};

#[derive(serde::Serialize)]
struct DroppedFile {
    name: String,
    bytes: Vec<u8>,
}

#[derive(serde::Serialize)]
struct ChatCompletionResponse {
    status: u16,
    body: String,
}

#[derive(serde::Serialize)]
struct SavedReport {
    path: String,
}

#[tauri::command]
fn read_dropped_file(path: String) -> Result<DroppedFile, String> {
    let path = PathBuf::from(path);
    let metadata = std::fs::metadata(&path)
        .map_err(|error| format!("Failed to read file metadata: {error}"))?;

    if !metadata.is_file() {
        return Err("Only files can be dropped, not folders.".to_string());
    }

    const MAX_FILE_SIZE: u64 = 100 * 1024 * 1024;
    if metadata.len() > MAX_FILE_SIZE {
        return Err("File is larger than 100MB. Please split it before uploading.".to_string());
    }

    let extension = path
        .extension()
        .and_then(|extension| extension.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();

    if !matches!(extension.as_str(), "csv" | "xlsx" | "xls") {
        return Err("Only .csv, .xlsx, and .xls files are supported.".to_string());
    }

    let name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("uploaded-file")
        .to_string();

    let bytes = std::fs::read(&path)
        .map_err(|error| format!("Failed to read file content: {error}"))?;

    Ok(DroppedFile { name, bytes })
}

#[tauri::command]
async fn post_chat_completion(
    url: String,
    api_key: String,
    body: serde_json::Value,
    timeout_ms: Option<u64>,
    headers: Option<HashMap<String, String>>,
) -> Result<ChatCompletionResponse, String> {
    let parsed_url = reqwest::Url::parse(&url)
        .map_err(|error| format!("Invalid API URL: {error}"))?;
    if !matches!(parsed_url.scheme(), "https" | "http") {
        return Err("API URL must start with http or https.".to_string());
    }

    let timeout_ms = timeout_ms.unwrap_or(240_000).clamp(5_000, 600_000);
    let client = reqwest::Client::builder()
        .timeout(Duration::from_millis(timeout_ms))
        .connect_timeout(Duration::from_secs(20))
        .build()
        .map_err(|error| format!("Failed to initialize API client: {error}"))?;

    let mut request = client.post(parsed_url).json(&body);
    if let Some(headers) = headers {
        for (key, value) in headers {
            if !key.trim().is_empty() {
                request = request.header(key, value);
            }
        }
    } else {
        request = request.bearer_auth(api_key);
    }

    let response = request
        .send()
        .await
        .map_err(|error| {
            if error.is_timeout() {
                format!(
                    "API request timed out after {} seconds. The provider may be busy, the network may be unstable, or concurrency may be too high.",
                    (timeout_ms + 999) / 1000
                )
            } else if error.is_connect() {
                format!("Failed to connect to API. Check Base URL or network status: {error}")
            } else {
                format!("API request failed: {error}")
            }
        })?;

    let status = response.status().as_u16();
    let body = response
        .text()
        .await
        .map_err(|error| format!("Failed to read API response: {error}"))?;

    Ok(ChatCompletionResponse { status, body })
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

    Err("Failed to locate the system Downloads directory.".to_string())
}

fn sanitize_filename_with_default(filename: &str, default_extension: &str) -> String {
    let cleaned: String = filename
        .chars()
        .map(|ch| {
            if ch.is_control() || matches!(ch, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|') {
                '_'
            } else {
                ch
            }
        })
        .collect();
    let cleaned = cleaned.trim().trim_matches('.').to_string();
    if cleaned.is_empty() {
        format!("nexus_l10n_report.{default_extension}")
    } else if PathBuf::from(&cleaned).extension().is_some() {
        cleaned
    } else {
        format!("{cleaned}.{default_extension}")
    }
}

fn sanitize_filename(filename: &str) -> String {
    sanitize_filename_with_default(filename, "csv")
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
    std::fs::create_dir_all(&directory)
        .map_err(|error| format!("Failed to create downloads directory: {error}"))?;

    let safe_filename = sanitize_filename(&filename);
    let path = unique_report_path(directory, safe_filename);
    std::fs::write(&path, content.as_bytes())
        .map_err(|error| format!("Failed to save report file: {error}"))?;

    Ok(SavedReport {
        path: path.to_string_lossy().to_string(),
    })
}

#[tauri::command]
fn save_binary_report_to_downloads(filename: String, bytes: Vec<u8>) -> Result<SavedReport, String> {
    let directory = downloads_dir()?;
    std::fs::create_dir_all(&directory)
        .map_err(|error| format!("Failed to create downloads directory: {error}"))?;

    let extension = PathBuf::from(&filename)
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("xlsx")
        .to_ascii_lowercase();
    let safe_filename = sanitize_filename_with_default(&filename, &extension);
    let path = unique_report_path(directory, safe_filename);
    std::fs::write(&path, bytes)
        .map_err(|error| format!("Failed to save report file: {error}"))?;

    Ok(SavedReport {
        path: path.to_string_lossy().to_string(),
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            read_dropped_file,
            post_chat_completion,
            save_report_to_downloads,
            save_binary_report_to_downloads
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
