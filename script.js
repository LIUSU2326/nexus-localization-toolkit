function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function escapeAttribute(text) {
    return escapeHtml(text).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function setStatus(type, text, subtext = '', actionCallback = null, actionLabel = '查看') {
    const statusBar = document.getElementById('statusBar');
    const statusIcon = document.getElementById('statusIcon');
    const statusText = document.getElementById('statusText');
    const statusSubtext = document.getElementById('statusSubtext');
    const statusAction = document.getElementById('statusAction');

    statusBar.className = `status-bar ${type}`;
    statusText.textContent = text;
    statusSubtext.textContent = subtext;

    if (actionCallback) {
        statusAction.style.display = 'block';
        statusAction.textContent = actionLabel;
        statusAction.onclick = actionCallback;
    } else {
        statusAction.style.display = 'none';
        statusAction.textContent = '查看';
    }

    statusBar.style.display = 'flex';

    if (type === 'success') {
        recordRecentTask({
            title: text || '任务完成',
            detail: subtext || '',
            status: 'success'
        });
        if (Notification.permission === 'granted') {
            new Notification('任务完成', {
                body: subtext || text
            });
        }
    } else if (type === 'error') {
        recordRecentTask({
            title: text || '任务异常',
            detail: subtext || '',
            status: 'error'
        });
    }
}

function hideStatus() {
    const statusBar = document.getElementById('statusBar');
    statusBar.style.display = 'none';
}

const UX_RECENT_TASKS_KEY = 'nexus_ux_recent_tasks_v1';

function getActiveToolKey() {
    return document.querySelector('.nav-item.active')?.dataset.tool || 'split';
}

function loadRecentTasks() {
    try {
        return JSON.parse(localStorage.getItem(UX_RECENT_TASKS_KEY) || '[]');
    } catch {
        return [];
    }
}

function saveRecentTasks(tasks) {
    localStorage.setItem(UX_RECENT_TASKS_KEY, JSON.stringify((tasks || []).slice(0, 8)));
}

function recordRecentTask(task) {
    const nextTask = {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        tool: getActiveToolKey(),
        title: task?.title || '未命名任务',
        detail: task?.detail || '',
        status: task?.status || 'ready',
        createdAt: Date.now()
    };
    saveRecentTasks([nextTask, ...loadRecentTasks()]);
    renderRecentTasks();
}

function formatRelativeTime(timestamp) {
    const diff = Math.max(0, Date.now() - Number(timestamp || Date.now()));
    const minute = 60 * 1000;
    const hour = 60 * minute;
    if (diff < minute) return '刚刚';
    if (diff < hour) return `${Math.floor(diff / minute)} 分钟前`;
    if (diff < 24 * hour) return `${Math.floor(diff / hour)} 小时前`;
    return `${Math.floor(diff / (24 * hour))} 天前`;
}

function renderRecentTasks() {
    const list = document.getElementById('recentTaskList');
    if (!list) return;
    const tasks = loadRecentTasks();
    if (!tasks.length) {
        list.innerHTML = '<div class="recent-task-empty">选择文件或完成任务后会显示在这里</div>';
        return;
    }
    list.innerHTML = tasks.map(task => `
        <div class="recent-task-item ${escapeAttribute(task.status || 'ready')}">
            <span class="recent-task-icon">${task.status === 'success' ? '✓' : task.status === 'error' ? '!' : '•'}</span>
            <div>
                <strong>${escapeHtml(task.title)}</strong>
                <small>${escapeHtml(task.detail || '')}${task.detail ? ' · ' : ''}${formatRelativeTime(task.createdAt)}</small>
            </div>
        </div>
    `).join('');
}

function renderSelectedFileList(input, files = []) {
    const uploadArea = input?.closest?.('.upload-area-large, .upload-area-small') ||
        input?.parentElement?.querySelector?.('.upload-area-large, .upload-area-small');
    if (!uploadArea) return;
    let list = uploadArea.querySelector('.selected-file-list');
    if (!list) {
        list = document.createElement('div');
        list.className = 'selected-file-list';
        uploadArea.appendChild(list);
    }
    const selectedFiles = Array.from(files || []);
    if (!selectedFiles.length) {
        list.innerHTML = '';
        list.style.display = 'none';
        return;
    }
    list.style.display = 'grid';
    list.innerHTML = selectedFiles.slice(0, 4).map(file => `
        <div class="selected-file-pill">
            <span>${escapeHtml(file.name)}</span>
            <small>${formatFileSize(file.size || 0)}</small>
        </div>
    `).join('') + (selectedFiles.length > 4 ? `<div class="selected-file-more">还有 ${selectedFiles.length - 4} 个文件</div>` : '');
}

function bindUxFileTelemetry() {
    document.querySelectorAll('input[type="file"]').forEach(input => {
        input.addEventListener('change', () => {
            const files = Array.from(input.files || []);
            renderSelectedFileList(input, files);
            if (!files.length) return;
            const totalSize = files.reduce((sum, file) => sum + (file.size || 0), 0);
            const inputState = document.getElementById('inspectorInputState');
            const outputState = document.getElementById('inspectorOutputState');
            if (inputState) inputState.textContent = files.length > 1 ? `${files.length} 个文件` : files[0].name;
            if (outputState) outputState.textContent = '等待开始';
            updateInspectorEstimate(files);
            recordRecentTask({
                title: files.length > 1 ? `${files.length} 个文件已选择` : files[0].name,
                detail: `${formatFileSize(totalSize)} · 等待处理`,
                status: 'ready'
            });
        });
    });
}

function getToolEstimateText(tool, files, totalSize) {
    if (!files.length) return '上传后估算';
    if (tool === 'split' || tool === 'convert') return totalSize > 5 * 1024 * 1024 ? '约 10 秒内' : '约数秒';
    if (tool === 'translate') return files.length > 1 || totalSize > 1024 * 1024 ? '约 2 到 8 分钟' : '约 1 到 3 分钟';
    if (tool === 'l10n-check') return files.length > 1 || totalSize > 1024 * 1024 ? '约 3 到 10 分钟' : '约 1 到 4 分钟';
    if (tool === 'glossary' || tool === 'glossary-organize') return totalSize > 1024 * 1024 ? '约 2 到 6 分钟' : '约 1 到 3 分钟';
    return '上传后估算';
}

function updateInspectorEstimate(files = []) {
    const selectedFiles = Array.from(files || []);
    const totalSize = selectedFiles.reduce((sum, file) => sum + (file.size || 0), 0);
    const filesEl = document.getElementById('inspectorEstimateFiles');
    const sizeEl = document.getElementById('inspectorEstimateSize');
    const timeEl = document.getElementById('inspectorEstimateTime');
    const badgeEl = document.getElementById('inspectorEstimateBadge');
    if (filesEl) filesEl.textContent = String(selectedFiles.length);
    if (sizeEl) sizeEl.textContent = selectedFiles.length ? formatFileSize(totalSize) : '-';
    if (timeEl) timeEl.textContent = getToolEstimateText(getActiveToolKey(), selectedFiles, totalSize);
    if (badgeEl) badgeEl.textContent = selectedFiles.length ? '已估算' : '待选择';
}

function renderApiSummary() {
    const apiConfig = typeof getApiConfig === 'function' ? getApiConfig() : null;
    const profileName = apiConfig?.profileName || getPlatformName(apiConfig?.provider) || '未配置通道';
    const model = apiConfig?.model || getDefaultModelForProvider?.(apiConfig?.provider) || '';
    const hasKey = Boolean(String(apiConfig?.apiKey || '').trim());
    const concurrency = Number(apiConfig?.concurrency || apiConfig?.profileConcurrency || 1);

    const apiName = document.getElementById('inspectorApiName');
    const apiModel = document.getElementById('inspectorApiModel');
    const apiHealth = document.getElementById('inspectorApiHealth');
    const apiConcurrency = document.getElementById('inspectorApiConcurrency');
    const topbarApiStatus = document.getElementById('topbarApiStatus');

    if (apiName) apiName.textContent = hasKey ? profileName : '未配置通道';
    if (apiModel) apiModel.textContent = hasKey ? model : '保存 API Key 后可用于翻译、检测和术语处理';
    if (apiHealth) apiHealth.textContent = hasKey ? '已连接' : '待配置';
    if (apiConcurrency) apiConcurrency.textContent = hasKey ? String(concurrency) : '-';
    if (topbarApiStatus) {
        topbarApiStatus.classList.toggle('online', hasKey);
        topbarApiStatus.innerHTML = `<span class="status-dot"></span>${hasKey ? 'AI 通道已连接' : 'AI 通道待配置'}`;
    }
}

function getSelectVisualConfig(select) {
    if (!select) return null;
    if (select.id === 'sourceLang' || select.id === 'targetLang') {
        const visual = getLanguageVisual(select.value);
        return { kind: 'language', mark: visual.flag, text: visual.name };
    }
    if (select.id === 'apiProvider') {
        const visual = getPlatformVisual(select.value);
        return { kind: `provider ${visual.tone}`, mark: visual.mark, text: visual.label };
    }
    if (['globalAiModel', 'aiModel', 'glossaryModel', 'organizeGlossaryModel'].includes(select.id)) {
        const provider = document.getElementById('apiProvider')?.value || getApiConfig()?.provider || 'custom';
        const visual = getPlatformVisual(provider);
        return { kind: `provider ${visual.tone}`, mark: visual.mark, text: getModelTraitTags(select.value)[0] || '模型' };
    }
    return null;
}

function enhanceVisualSelect(select) {
    if (!select || select.dataset.visualEnhanced === 'true') return;
    const row = select.closest('.setting-row, .api-config-content .setting-row');
    if (!row) return;
    row.classList.add('visual-select-row');
    const prefix = document.createElement('span');
    prefix.className = 'select-visual-prefix';
    row.appendChild(prefix);

    const update = () => {
        const config = getSelectVisualConfig(select);
        if (!config) return;
        prefix.className = `select-visual-prefix ${config.kind}`;
        prefix.textContent = config.mark;
        prefix.title = config.text;
        row.dataset.visualText = config.text;
    };

    select.addEventListener('change', () => {
        update();
        renderApiSummary();
    });
    select.dataset.visualEnhanced = 'true';
    update();
}

function enhanceDeepChoiceSurfaces() {
    [
        'sourceLang',
        'targetLang',
        'apiProvider',
        'globalAiModel',
        'aiModel',
        'glossaryModel',
        'organizeGlossaryModel'
    ].forEach(id => enhanceVisualSelect(document.getElementById(id)));

    const updateModelSelects = () => {
        ['globalAiModel', 'aiModel', 'glossaryModel', 'organizeGlossaryModel'].forEach(id => {
            const select = document.getElementById(id);
            if (!select) return;
            const row = select.closest('.setting-row');
            if (!row) return;
            let hint = row.querySelector('.model-trait-strip');
            if (!hint) {
                hint = document.createElement('div');
                hint.className = 'model-trait-strip';
                row.appendChild(hint);
            }
            hint.innerHTML = getModelTraitHtml(select.value);
        });
    };

    document.addEventListener('change', (event) => {
        if (event.target?.matches?.('#apiProvider, #globalAiModel, #aiModel, #glossaryModel, #organizeGlossaryModel')) {
            updateModelSelects();
            ['globalAiModel', 'aiModel', 'glossaryModel', 'organizeGlossaryModel'].forEach(id => {
                const select = document.getElementById(id);
                const row = select?.closest('.visual-select-row');
                const prefix = row?.querySelector('.select-visual-prefix');
                if (select && prefix) {
                    const config = getSelectVisualConfig(select);
                    prefix.className = `select-visual-prefix ${config.kind}`;
                    prefix.textContent = config.mark;
                    prefix.title = config.text;
                }
            });
        }
    });
    document.addEventListener('nexus:api-profiles-updated', updateModelSelects);
    updateModelSelects();
}

function revealWorkspaceInspector() {
    const panel = document.getElementById('apiConfigPanel');
    const inspector = document.getElementById('workspaceInspector');
    if (panel) panel.style.display = 'none';
    if (inspector) inspector.style.display = 'grid';
}

const TRANSLATION_STORAGE_KEY = 'nexus_translation_progress';

function saveTranslationProgress(data) {
    const progress = {
        timestamp: Date.now(),
        fileName: data.fileName,
        totalRows: data.totalRows,
        currentRow: data.currentRow,
        translatedData: data.translatedData,
        successCount: data.successCount,
        failCount: data.failCount,
        selectedColumns: data.selectedColumns,
        targetLang: data.targetLang,
        selectedProfileIds: data.selectedProfileIds || []
    };
    localStorage.setItem(TRANSLATION_STORAGE_KEY, JSON.stringify(progress));
}

function loadTranslationProgress() {
    const stored = localStorage.getItem(TRANSLATION_STORAGE_KEY);
    if (!stored) return null;

    try {
        const progress = JSON.parse(stored);
        const age = Date.now() - progress.timestamp;
        if (age > 24 * 60 * 60 * 1000) {
            clearTranslationProgress();
            return null;
        }
        return progress;
    } catch {
        return null;
    }
}

function clearTranslationProgress() {
    localStorage.removeItem(TRANSLATION_STORAGE_KEY);
}

function downloadWorkbookFile(workbook, fileName) {
    const arrayBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([arrayBuffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

const TRANSLATION_PROJECTS_KEY = 'translationProjects';
const DEFAULT_TRANSLATION_PROJECT_KEY = 'nexus_default_translation_project';
const GLOSSARY_LIBRARY_KEY = 'nexus_glossary_library';
const API_PROFILES_KEY = 'nexus_api_profiles';
const ACTIVE_API_PROFILE_KEY = 'nexus_active_api_profile';
const API_REQUEST_TIMEOUT_MS = 240000;
const API_PREFLIGHT_TIMEOUT_MS = 45000;

function formatDurationSeconds(ms) {
    return `${Math.max(1, Math.ceil(ms / 1000))} 秒`;
}

function createApiTimeoutError(timeoutMs) {
    const error = new Error(`API 请求超时（超过 ${formatDurationSeconds(timeoutMs)}）。可能是接口繁忙、网络不稳定、单通道并发过高，或当前批次文本过长。`);
    error.name = 'ApiTimeoutError';
    error.isTimeout = true;
    return error;
}

function createAbortError() {
    return new DOMException('Request aborted', 'AbortError');
}

async function withHardTimeout(promise, timeoutMs = API_REQUEST_TIMEOUT_MS, signal = null) {
    if (signal?.aborted) {
        throw createAbortError();
    }

    let timeoutId = null;
    let abortHandler = null;
    const timeoutPromise = new Promise((_, reject) => {
        if (timeoutMs > 0) {
            timeoutId = setTimeout(() => {
                reject(createApiTimeoutError(timeoutMs));
            }, timeoutMs);
        }

        if (signal) {
            abortHandler = () => reject(createAbortError());
            signal.addEventListener('abort', abortHandler, { once: true });
        }
    });

    try {
        return await Promise.race([promise, timeoutPromise]);
    } finally {
        if (timeoutId) clearTimeout(timeoutId);
        if (signal && abortHandler) {
            signal.removeEventListener('abort', abortHandler);
        }
    }
}

function loadGlossaryLibrary() {
    const stored = localStorage.getItem(GLOSSARY_LIBRARY_KEY);
    if (!stored) return [];

    try {
        const library = JSON.parse(stored);
        return Array.isArray(library) ? library : [];
    } catch {
        return [];
    }
}

function saveGlossaryLibrary(library) {
    localStorage.setItem(GLOSSARY_LIBRARY_KEY, JSON.stringify(library));
}

function makeStableId(text) {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
        hash = ((hash << 5) - hash + text.charCodeAt(i)) >>> 0;
    }
    return hash.toString(36);
}

function makePromptCacheKey(namespace, text) {
    return `${namespace}_${makeStableId(String(text || ''))}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
}

function hasCjkText(text) {
    return /[\u3400-\u9fff]/.test(String(text || ''));
}

function hasLatinText(text) {
    return /[A-Za-z]/.test(String(text || ''));
}

function normalizeHeaderText(text) {
    return String(text || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function isIdLikeGlossaryValue(value) {
    const text = String(value || '').trim();
    if (!text) return false;
    const normalized = normalizeHeaderText(text);
    return normalized === 'id' ||
        normalized === 'string id' ||
        normalized === 'key' ||
        normalized === '编号' ||
        normalized === '序号' ||
        /^[\d._-]+$/.test(text);
}

function isChineseGlossaryHeader(value) {
    const text = normalizeHeaderText(value);
    return text.includes('中文') ||
        text.includes('简体') ||
        text.includes('繁体') ||
        text.includes('chinese') ||
        text.includes('zh-cn') ||
        text.includes('zh_cn');
}

function isEnglishGlossaryHeader(value) {
    const text = normalizeHeaderText(value);
    return text.includes('英文') ||
        text.includes('英语') ||
        text.includes('english') ||
        text === 'en' ||
        text.includes('en-us') ||
        text.includes('en_us');
}

function isGlossaryHeaderRow(source, target, type) {
    const sourceText = normalizeHeaderText(source);
    const targetText = normalizeHeaderText(target);
    const typeText = normalizeHeaderText(type);
    return (sourceText.includes('术语') && (targetText.includes('译') || targetText.includes('translation'))) ||
        (sourceText.includes('term') && (targetText.includes('translation') || targetText.includes('target'))) ||
        (isIdLikeGlossaryValue(source) && isChineseGlossaryHeader(target) && isEnglishGlossaryHeader(type));
}

function repairLegacyGlossaryTerm(source, target, type) {
    if (isGlossaryHeaderRow(source, target, type)) return null;

    if (isIdLikeGlossaryValue(source) && hasCjkText(target) && hasLatinText(type)) {
        return {
            source: String(target || '').trim(),
            target: String(type || '').trim(),
            type: ''
        };
    }

    return {
        source: String(source || '').trim(),
        target: String(target || '').trim(),
        type: String(type || '').trim()
    };
}

function normalizeGlossaryTerms(terms) {
    return (terms || []).map(term => {
        const source = term.source ?? term.term ?? '';
        const target = term.target ?? term.translation ?? '';
        const type = term.type ?? '';
        const count = Number(term.count || 1);
        const confidence = Number(term.confidence ?? term.score ?? 0);
        const repaired = repairLegacyGlossaryTerm(source, target, type);
        if (!repaired) return null;

        return {
            source: repaired.source,
            target: repaired.target,
            type: repaired.type,
            originalType: String(term.originalType || term.rawType || repaired.type || '').trim(),
            organizedType: String(term.organizedType || term.normalizedType || term.standardType || '').trim(),
            secondaryType: String(term.secondaryType || term.subType || term.subcategory || '').trim(),
            categoryReason: String(term.categoryReason || term.classificationReason || term.reason || '').trim(),
            mergeNote: String(term.mergeNote || term.duplicateNote || '').trim(),
            count: Number.isFinite(count) ? count : 1,
            confidence: Number.isFinite(confidence) ? confidence : 0,
            note: String(term.note || term.reason || term.description || '').trim(),
            extractionSource: String(term.extractionSource || term.origin || '').trim(),
            extractionBatch: String(term.extractionBatch || term.batch || '').trim(),
            referenceId: String(term.referenceId || term.id || term.rowId || term.key || '').trim(),
            referenceRows: String(term.referenceRows || term.rows || term.rowNumbers || '').trim(),
            originalTranslation: String(term.originalTranslation || term.currentTarget || term.originalTarget || term.observedTarget || '').trim(),
            finalTranslation: String(term.finalTranslation || term.finalTarget || term.revisedTarget || term.fixedTarget || '').trim(),
            english: String(term.english || term.en || term.target || term.translation || '').trim(),
            japanese: String(term.japanese || term.ja || term.jp || '').trim(),
            korean: String(term.korean || term.ko || '').trim(),
            traditionalChinese: String(term.traditionalChinese || term.zhTW || term['zh-TW'] || '').trim(),
            french: String(term.french || term.fr || '').trim(),
            german: String(term.german || term.de || '').trim(),
            spanish: String(term.spanish || term.es || '').trim(),
            portuguese: String(term.portuguese || term.pt || '').trim(),
            russian: String(term.russian || term.ru || '').trim(),
            thai: String(term.thai || term.th || '').trim(),
            vietnamese: String(term.vietnamese || term.vi || '').trim(),
            indonesian: String(term.indonesian || term.idTarget || term.idTranslation || '').trim(),
            qualityStatus: String(term.qualityStatus || term.qaStatus || '').trim(),
            qualityIssues: String(term.qualityIssues || term.issues || '').trim(),
            qualitySuggestion: String(term.qualitySuggestion || term.suggestion || '').trim()
        };
    }).filter(term => term?.source);
}

function getGlossaryEffectiveTarget(term) {
    return String(term?.finalTranslation || term?.finalTarget || term?.revisedTarget || term?.fixedTarget || term?.target || term?.translation || '').trim();
}

function getGlossaryOriginDisplayLabel(origin) {
    if (origin === 'extracted') return '提取生成';
    if (origin === 'reviewed') return '人工审核';
    return '上传记录';
}

function splitGlossaryReferenceList(value) {
    return String(value || '')
        .split(/[;,，；\s]+/)
        .map(item => item.trim())
        .filter(Boolean);
}

function extractGlossaryReferenceNumbers(value) {
    const numbers = [];
    splitGlossaryReferenceList(value).forEach(item => {
        const matches = String(item || '').match(/\d+/g) || [];
        matches.forEach(match => {
            const number = Number(match);
            if (Number.isFinite(number)) numbers.push(number);
        });
    });
    return numbers;
}

function glossaryTermAppliesToTask(term, task = null) {
    if (!term || !task) return true;
    const rowNumbers = extractGlossaryReferenceNumbers(term.referenceRows);
    const ids = new Set(splitGlossaryReferenceList(term.referenceId).map(item => normalizeHeaderText(item)).filter(Boolean));
    if (rowNumbers.length === 0 && ids.size === 0) return true;

    const taskRows = [
        task.rowIndex,
        Number.isInteger(task.rowIndex) ? task.rowIndex + 1 : null,
        task.originalRowNumber,
        task.originalReferences?.['原始行号']
    ].map(Number).filter(Number.isFinite);
    const rowMatch = rowNumbers.length > 0 && rowNumbers.some(row => taskRows.includes(row));

    const taskIds = [
        task.id,
        task.referenceId,
        task.originalReferences?.['原始行号'],
        ...Object.values(task.originalReferences || {})
    ].map(value => normalizeHeaderText(value)).filter(Boolean);
    const idMatch = ids.size > 0 && taskIds.some(id => ids.has(id));
    return rowMatch || idMatch;
}

function getGlossaryOrganizedType(term) {
    return String(term?.organizedType || term?.normalizedType || term?.standardType || term?.type || '').trim();
}

async function readSpreadsheetRows(file) {
    const extension = file.name.split('.').pop().toLowerCase();

    if (extension === 'csv') {
        const { text } = await readCSVWithEncoding(file);
        const workbook = XLSX.read(text, { type: 'string', cellDates: true });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        return {
            rows: XLSX.utils.sheet_to_json(sheet, { header: 1 }),
            text,
            workbook,
            sheetName
        };
    }

    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    return {
        rows: XLSX.utils.sheet_to_json(sheet, { header: 1 }),
        text: XLSX.utils.sheet_to_csv(sheet),
        workbook,
        sheetName
    };
}

async function readSpreadsheetSheets(file) {
    const extension = file.name.split('.').pop().toLowerCase();

    if (extension === 'csv') {
        const { text, encoding } = await readCSVWithEncoding(file);
        const workbook = XLSX.read(text, { type: 'string', cellDates: true });
        const sheetName = workbook.SheetNames[0] || 'CSV';
        const sheet = workbook.Sheets[sheetName];
        return {
            encoding,
            workbook,
            sheets: [{
                sheetName: 'CSV',
                rows: XLSX.utils.sheet_to_json(sheet, { header: 1 })
            }]
        };
    }

    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
    return {
        encoding: 'N/A (Excel)',
        workbook,
        sheets: workbook.SheetNames.map(sheetName => ({
            sheetName,
            rows: XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 })
        }))
    };
}

function normalizeColorValue(value) {
    const text = String(value || '').trim().toUpperCase();
    if (!text) return '';
    if (text.startsWith('#')) return text.slice(1);
    return text.replace(/^0X/, '').replace(/[^0-9A-F]/g, '');
}

const EXCEL_INDEXED_COLORS = {
    2: 'FFFFFF',
    3: 'FF0000',
    4: '00FF00',
    5: '0000FF',
    6: 'FFFF00',
    7: 'FF00FF',
    8: '00FFFF',
    9: '800000',
    10: '008000',
    11: '000080',
    12: '808000',
    13: '800080',
    14: '008080',
    15: 'C0C0C0',
    16: '808080',
    17: '9999FF',
    18: '993366',
    19: 'FFFFCC',
    20: 'CCFFFF',
    21: '660066',
    22: 'FF8080',
    23: '0066CC',
    24: 'CCCCFF',
    25: '000080',
    26: 'FF00FF',
    27: 'FFFF00',
    28: '00FFFF',
    29: '800080',
    30: '800000',
    31: '008080',
    32: '0000FF',
    33: '00CCFF',
    34: 'CCFFFF',
    35: 'CCFFCC',
    36: 'FFFF99',
    37: '99CCFF',
    38: 'FF99CC',
    39: 'CC99FF',
    40: 'FFCC99',
    41: '3366FF',
    42: '33CCCC',
    43: '99CC00',
    44: 'FFCC00',
    45: 'FF9900',
    46: 'FF6600',
    47: '666699',
    48: '969696',
    49: '003366',
    50: '339966',
    51: '003300',
    52: '333300',
    53: '993300',
    54: '993366',
    55: '333399',
    56: '333333'
};

const EXCEL_DEFAULT_THEME_COLORS = [
    '000000',
    'FFFFFF',
    '1F497D',
    'EEECE1',
    '4F81BD',
    'C0504D',
    '9BBB59',
    '8064A2',
    '4BACC6',
    'F79646',
    '0000FF',
    '800080'
];

function normalizeRgbHex(value) {
    let color = normalizeColorValue(value);
    if (color.length === 8) color = color.slice(2);
    return color.length === 6 ? color : '';
}

function clampColorChannel(value) {
    return Math.max(0, Math.min(255, Math.round(value)));
}

function applyExcelTint(hexColor, tintValue) {
    const color = normalizeRgbHex(hexColor);
    const tint = Number(tintValue);
    if (!color || !Number.isFinite(tint) || tint === 0) return color;
    const channels = [0, 2, 4].map(index => Number.parseInt(color.slice(index, index + 2), 16));
    const tinted = channels.map(channel => {
        const next = tint < 0
            ? channel * (1 + tint)
            : channel + (255 - channel) * tint;
        return clampColorChannel(next).toString(16).padStart(2, '0').toUpperCase();
    });
    return tinted.join('');
}

function getThemeColor(themeIndex, themeColors = []) {
    const index = Number(themeIndex);
    if (!Number.isFinite(index)) return '';
    return normalizeRgbHex(themeColors[index] || EXCEL_DEFAULT_THEME_COLORS[index] || '');
}

function getColorAttributeValue(colorNode, themeColors = []) {
    if (!colorNode) return '';
    const rgb = colorNode.getAttribute?.('rgb') || colorNode.rgb || '';
    if (rgb) return normalizeColorValue(rgb);

    const indexed = colorNode.getAttribute?.('indexed') ?? colorNode.indexed;
    if (indexed !== undefined && indexed !== '') {
        return normalizeColorValue(EXCEL_INDEXED_COLORS[Number(indexed)] || indexed);
    }

    const theme = colorNode.getAttribute?.('theme') ?? colorNode.theme;
    if (theme !== undefined && theme !== '') {
        const tint = colorNode.getAttribute?.('tint') ?? colorNode.tint;
        return applyExcelTint(getThemeColor(theme, themeColors), tint);
    }

    return '';
}

function createStyleMarker(fillColor = '', fontColor = '', source = '', fontColors = null) {
    const normalizedFill = normalizeColorValue(fillColor);
    const normalizedFont = normalizeColorValue(fontColor);
    const normalizedFonts = Array.isArray(fontColors)
        ? [...new Set(fontColors.map(color => normalizeColorValue(color)).filter(Boolean))]
        : [];
    if (!normalizedFill && !normalizedFont && normalizedFonts.length === 0) return null;
    return {
        fillColor: normalizedFill,
        fontColor: normalizedFont || normalizedFonts[0] || '',
        fontColors: normalizedFonts.length ? normalizedFonts : (normalizedFont ? [normalizedFont] : []),
        source: source || [
            normalizedFill ? 'background' : '',
            (normalizedFont || normalizedFonts.length) ? 'font' : ''
        ].filter(Boolean).join('+')
    };
}

function getMarkerFillColor(marker) {
    if (!marker) return '';
    if (typeof marker === 'string') return normalizeColorValue(marker);
    return normalizeColorValue(marker.fillColor || marker.color || '');
}

function getMarkerFontColor(marker) {
    if (!marker || typeof marker === 'string') return '';
    return normalizeColorValue(marker.fontColor || '');
}

function getMarkerFontColors(marker) {
    if (!marker || typeof marker === 'string') return [];
    const colors = Array.isArray(marker.fontColors) ? marker.fontColors : [marker.fontColor];
    return [...new Set(colors.map(color => normalizeColorValue(color)).filter(Boolean))];
}

function mergeStyleMarkers(...markers) {
    const usable = markers.filter(Boolean);
    if (!usable.length) return null;
    const fillColor = usable.map(marker => getMarkerFillColor(marker)).find(Boolean) || '';
    const fontColors = usable.flatMap(marker => getMarkerFontColors(marker));
    const fontColor = fontColors[0] || usable.map(marker => getMarkerFontColor(marker)).find(Boolean) || '';
    const source = [...new Set(usable.map(marker => marker?.source).filter(Boolean))].join('+');
    return createStyleMarker(fillColor, fontColor, source, fontColors);
}

function getMarkerDisplaySource(marker) {
    const fillColor = getMarkerFillColor(marker);
    const fontColor = getMarkerFontColor(marker);
    if (fillColor && fontColor) return '背景色+文字颜色';
    if (fontColor) return '文字颜色';
    if (fillColor) return '背景色';
    return '';
}

function getWorkbookSheetXmlIndex(workbook, sheetName) {
    const sheets = workbook?.Workbook?.Sheets;
    if (!Array.isArray(sheets)) return -1;
    return sheets.findIndex(sheet => sheet?.name === sheetName);
}

function getStyleFillColorFromWorkbook(workbook, styleIndex) {
    const styles = workbook?.Styles;
    const cellXfs = styles?.CellXf || styles?.CellXfs || [];
    const fills = styles?.Fills || styles?.fills || [];
    const xf = cellXfs?.[Number(styleIndex)];
    const fillId = Number(xf?.fillId ?? xf?.fillID ?? xf?.fillid);
    if (!Number.isFinite(fillId) || fillId < 0) return '';
    const fill = fills?.[fillId];
    const fg = fill?.fgColor || fill?.fgcolor || fill?.foregroundColor || {};
    const bg = fill?.bgColor || fill?.bgcolor || fill?.backgroundColor || {};
    return normalizeColorValue(fg.rgb || fg.indexed || fg.theme || bg.rgb || bg.indexed || bg.theme || '');
}

function getStyleFontColorFromWorkbook(workbook, styleIndex) {
    const styles = workbook?.Styles;
    const cellXfs = styles?.CellXf || styles?.CellXfs || [];
    const fonts = styles?.Fonts || styles?.fonts || [];
    const xf = cellXfs?.[Number(styleIndex)];
    const fontId = Number(xf?.fontId ?? xf?.fontID ?? xf?.fontid);
    if (!Number.isFinite(fontId) || fontId < 0) return '';
    const font = fonts?.[fontId];
    const color = font?.color || font?.fgColor || font?.fgcolor || {};
    return normalizeColorValue(color.rgb || color.indexed || color.theme || '');
}

function getCellStyleMarker(workbook, cell) {
    if (!cell) return '';
    const styleIndex = Number(cell?.s?.index ?? cell?.s?.style ?? cell?.s?.xfId ?? cell?.s ?? 0);
    return createStyleMarker(
        getStyleFillColorFromWorkbook(workbook, styleIndex),
        getStyleFontColorFromWorkbook(workbook, styleIndex),
        'workbook-style'
    );
}

function getCellFillColor(workbook, cell) {
    return getMarkerFillColor(getCellStyleMarker(workbook, cell));
}

function extractWorksheetColorMap(workbook, sheetName) {
    const sheet = workbook?.Sheets?.[sheetName];
    const ref = sheet?.['!ref'];
    const map = new Map();
    if (!sheet || !ref) return map;
    const range = XLSX.utils.decode_range(ref);
    for (let row = range.s.r; row <= range.e.r; row++) {
        for (let col = range.s.c; col <= range.e.c; col++) {
            const addr = XLSX.utils.encode_cell({ r: row, c: col });
            const marker = getCellStyleMarker(workbook, sheet[addr]);
            if (marker) map.set(addr, marker);
        }
    }
    return map;
}

function readSheetRowsWithStyles(workbook, sheetName) {
    const sheet = workbook?.Sheets?.[sheetName];
    const ref = sheet?.['!ref'];
    if (!sheet || !ref) {
        return { rows: [], colorMap: new Map() };
    }
    const range = XLSX.utils.decode_range(ref);
    const rows = [];
    const colorMap = new Map();
    for (let row = range.s.r; row <= range.e.r; row++) {
        const values = [];
        for (let col = range.s.c; col <= range.e.c; col++) {
            const addr = XLSX.utils.encode_cell({ r: row, c: col });
            const cell = sheet[addr];
            values.push(cell?.v ?? '');
            const marker = getCellStyleMarker(workbook, cell);
            if (marker) colorMap.set(addr, marker);
        }
        rows.push(values);
    }
    return { rows, colorMap };
}

async function readSpreadsheetWorkbook(file) {
    const extension = file.name.split('.').pop().toLowerCase();
    if (extension === 'csv') {
        const { text, encoding } = await readCSVWithEncoding(file);
        const workbook = XLSX.read(text, { type: 'string', cellDates: true, cellStyles: true, cellNF: true });
        return { workbook, encoding, fileName: file.name };
    }

    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true, cellStyles: true, cellNF: true });
    return { workbook, encoding: 'N/A (Excel)', fileName: file.name };
}

function parseXmlDocument(text) {
    if (!text) return null;
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    return doc.querySelector('parsererror') ? null : doc;
}

async function loadZipFileText(zip, path) {
    const entry = zip?.file(path);
    if (!entry) return '';
    return entry.async('text');
}

function getXmlChildrenByName(node, name) {
    if (!node) return [];
    return Array.from(node.getElementsByTagNameNS('*', name));
}

function parseThemeColorMap(themeXmlText) {
    const doc = parseXmlDocument(themeXmlText);
    const scheme = getXmlChildrenByName(doc, 'clrScheme')[0];
    if (!scheme) return EXCEL_DEFAULT_THEME_COLORS;
    const themeOrder = ['dk1', 'lt1', 'dk2', 'lt2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink'];
    return themeOrder.map(name => {
        const node = Array.from(scheme.children || []).find(child => child.localName === name);
        const srgb = getXmlChildrenByName(node, 'srgbClr')[0]?.getAttribute('val');
        const sys = getXmlChildrenByName(node, 'sysClr')[0]?.getAttribute('lastClr');
        return normalizeRgbHex(srgb || sys || '') || EXCEL_DEFAULT_THEME_COLORS[themeOrder.indexOf(name)] || '';
    });
}

function normalizeZipTargetPath(target) {
    let path = String(target || '').replace(/^\//, '');
    if (!path.startsWith('xl/')) {
        path = `xl/${path}`;
    }
    return path;
}

function getSheetXmlPathMap(workbookXmlText, relsXmlText) {
    const workbookDoc = parseXmlDocument(workbookXmlText);
    const relsDoc = parseXmlDocument(relsXmlText);
    const relMap = new Map();

    getXmlChildrenByName(relsDoc, 'Relationship').forEach(rel => {
        const id = rel.getAttribute('Id');
        const target = rel.getAttribute('Target');
        if (id && target) {
            relMap.set(id, normalizeZipTargetPath(target));
        }
    });

    const sheetMap = new Map();
    getXmlChildrenByName(workbookDoc, 'sheet').forEach(sheet => {
        const name = sheet.getAttribute('name') || '';
        const relId = sheet.getAttribute('r:id') || sheet.getAttribute('id') || '';
        const path = relMap.get(relId) || '';
        if (name && path) {
            sheetMap.set(name, path);
        }
    });

    return sheetMap;
}

function parseStylesFillColorMap(stylesXmlText, themeColors = []) {
    const doc = parseXmlDocument(stylesXmlText);
    const fills = [];
    const fonts = [];
    const xfs = [];

    const fillsNode = getXmlChildrenByName(doc, 'fills')[0];
    const fillNodes = fillsNode
        ? Array.from(fillsNode.children).filter(node => node.localName === 'fill')
        : getXmlChildrenByName(doc, 'fill');
    fillNodes.forEach(fill => {
        const patternFill = getXmlChildrenByName(fill, 'patternFill')[0];
        if (!patternFill) {
            fills.push('');
            return;
        }
        const fgColor = getXmlChildrenByName(patternFill, 'fgColor')[0];
        const bgColor = getXmlChildrenByName(patternFill, 'bgColor')[0];
        fills.push(getColorAttributeValue(fgColor, themeColors) || getColorAttributeValue(bgColor, themeColors));
    });

    const fontsNode = getXmlChildrenByName(doc, 'fonts')[0];
    const fontNodes = fontsNode
        ? Array.from(fontsNode.children).filter(node => node.localName === 'font')
        : getXmlChildrenByName(doc, 'font');
    fontNodes.forEach(font => {
        const colorNode = getXmlChildrenByName(font, 'color')[0];
        fonts.push(getColorAttributeValue(colorNode, themeColors));
    });

    const cellXfsNode = getXmlChildrenByName(doc, 'cellXfs')[0];
    const xfNodes = cellXfsNode
        ? Array.from(cellXfsNode.children).filter(node => node.localName === 'xf')
        : getXmlChildrenByName(doc, 'xf');
    xfNodes.forEach(xf => {
        xfs.push({
            fillId: Number(xf.getAttribute('fillId') || xf.getAttribute('fillid') || 0),
            fontId: Number(xf.getAttribute('fontId') || xf.getAttribute('fontid') || 0)
        });
    });

    return { fills, fonts, xfs };
}

function getFillColorFromStyles(styleIndex, styleMap) {
    const xfs = styleMap?.xfs || [];
    const fills = styleMap?.fills || [];
    const xf = xfs[Number(styleIndex)] || null;
    const fillId = Number(xf?.fillId);
    if (!Number.isFinite(fillId) || fillId < 0) return '';
    return fills[fillId] || '';
}

function getFontColorFromStyles(styleIndex, styleMap) {
    const xfs = styleMap?.xfs || [];
    const fonts = styleMap?.fonts || [];
    const xf = xfs[Number(styleIndex)] || null;
    const fontId = Number(xf?.fontId);
    if (!Number.isFinite(fontId) || fontId < 0) return '';
    return fonts[fontId] || '';
}

function getStyleMarkerFromStyles(styleIndex, styleMap) {
    return createStyleMarker(
        getFillColorFromStyles(styleIndex, styleMap),
        getFontColorFromStyles(styleIndex, styleMap),
        'xlsx-style'
    );
}

function parseRichTextMarkerFromNode(node, source = 'rich-text', themeColors = []) {
    if (!node) return null;
    const colors = getXmlChildrenByName(node, 'rPr')
        .flatMap(runProperties => getXmlChildrenByName(runProperties, 'color'))
        .map(colorNode => getColorAttributeValue(colorNode, themeColors))
        .filter(Boolean);
    if (!colors.length) return null;
    return createStyleMarker('', colors[0], source, colors);
}

function parseSharedStringRichTextColorMap(sharedStringsXmlText, themeColors = []) {
    const doc = parseXmlDocument(sharedStringsXmlText);
    const map = new Map();
    const root = getXmlChildrenByName(doc, 'sst')[0] || doc?.documentElement;
    const items = root
        ? Array.from(root.children).filter(node => node.localName === 'si')
        : [];
    items.forEach((item, index) => {
        const marker = parseRichTextMarkerFromNode(item, 'shared-rich-text', themeColors);
        if (marker) map.set(index, marker);
    });
    return map;
}

function getCellSharedStringIndex(cell) {
    const valueNode = getXmlChildrenByName(cell, 'v')[0];
    const value = Number(valueNode?.textContent || '');
    return Number.isFinite(value) ? value : -1;
}

function getInlineRichTextMarker(cell, themeColors = []) {
    const inlineString = getXmlChildrenByName(cell, 'is')[0];
    return parseRichTextMarkerFromNode(inlineString, 'inline-rich-text', themeColors);
}

function parseSheetCellColorMap(sheetXmlText, styleMap, sharedRichTextMarkers = new Map(), themeColors = []) {
    const doc = parseXmlDocument(sheetXmlText);
    const map = new Map();
    getXmlChildrenByName(doc, 'row').forEach(row => {
        const ref = Number(row.getAttribute('r'));
        const styleIndex = Number(row.getAttribute('s') || 0);
        const marker = getStyleMarkerFromStyles(styleIndex, styleMap);
        if (Number.isFinite(ref) && marker) {
            map.set(`__ROW_${ref - 1}`, marker);
        }
    });
    getXmlChildrenByName(doc, 'c').forEach(cell => {
        const ref = cell.getAttribute('r');
        if (!ref) return;
        const styleIndex = Number(cell.getAttribute('s') || 0);
        const styleMarker = getStyleMarkerFromStyles(styleIndex, styleMap);
        const type = cell.getAttribute('t') || '';
        const richMarker = type === 's'
            ? sharedRichTextMarkers.get(getCellSharedStringIndex(cell))
            : getInlineRichTextMarker(cell, themeColors);
        const marker = mergeStyleMarkers(styleMarker, richMarker);
        if (marker) {
            map.set(ref, marker);
        }
    });
    return map;
}

function parseReviewMarkerColor(color) {
    const normalized = normalizeColorValue(color);
    if (!normalized) return false;
    return !['0', '00', '1', '01', '64', '65', '000000', 'FFFFFF', '00000000', 'FFFFFFFF', 'FF000000', 'FFFFFFFF'].includes(normalized);
}

function isReviewStyleMarker(marker) {
    return parseReviewMarkerColor(getMarkerFillColor(marker)) ||
        parseReviewMarkerColor(getMarkerFontColor(marker));
}

function getReviewMarkerColor(marker) {
    return parseReviewMarkerColor(getMarkerFillColor(marker))
        ? getMarkerFillColor(marker)
        : getMarkerFontColor(marker);
}

function colorToRgb(color) {
    let value = normalizeColorValue(color);
    if (!value) return null;
    if (value.length === 8) value = value.slice(2);
    if (value.length !== 6) return null;
    const r = Number.parseInt(value.slice(0, 2), 16);
    const g = Number.parseInt(value.slice(2, 4), 16);
    const b = Number.parseInt(value.slice(4, 6), 16);
    if (![r, g, b].every(Number.isFinite)) return null;
    return { r, g, b };
}

function classifyReviewColor(color) {
    const rgb = colorToRgb(color);
    if (!rgb) return '';
    if (rgb.g >= 70 && rgb.g > rgb.r * 1.08 && rgb.g > rgb.b * 1.15) return 'green';
    if (rgb.r >= 80 && rgb.r > rgb.g * 1.25 && rgb.r > rgb.b * 1.15) return 'red';
    return '';
}

function getReviewMarkerSemantics(marker) {
    const colors = [
        ...getMarkerFontColors(marker),
        getMarkerFontColor(marker),
        getMarkerFillColor(marker)
    ].filter(color => parseReviewMarkerColor(color));
    const semantics = new Set(colors.map(classifyReviewColor).filter(Boolean));
    return {
        hasGreen: semantics.has('green'),
        hasRed: semantics.has('red'),
        semanticList: [...semantics]
    };
}

async function extractWorksheetColorMapFromFile(file, workbook, sheetName) {
    if (!file || !/\.xlsx$/i.test(file.name || '') || typeof JSZip === 'undefined') {
        return extractWorksheetColorMap(workbook, sheetName);
    }

    try {
        const arrayBuffer = await file.arrayBuffer();
        const zip = await JSZip.loadAsync(arrayBuffer);
        const workbookXml = await loadZipFileText(zip, 'xl/workbook.xml');
        const relsXml = await loadZipFileText(zip, 'xl/_rels/workbook.xml.rels');
        const stylesXml = await loadZipFileText(zip, 'xl/styles.xml');
        const themeXml = await loadZipFileText(zip, 'xl/theme/theme1.xml');
        const sheetMap = getSheetXmlPathMap(workbookXml, relsXml);
        const workbookIndex = Array.isArray(workbook?.SheetNames) ? workbook.SheetNames.indexOf(sheetName) : -1;
        const sheetXmlPath = sheetMap.get(sheetName) || (workbookIndex >= 0 ? `xl/worksheets/sheet${workbookIndex + 1}.xml` : '');
        if (!sheetXmlPath) return extractWorksheetColorMap(workbook, sheetName);

        const sheetXml = await loadZipFileText(zip, sheetXmlPath);
        const sharedStringsXml = await loadZipFileText(zip, 'xl/sharedStrings.xml');
        const themeColors = parseThemeColorMap(themeXml);
        const styleMap = parseStylesFillColorMap(stylesXml, themeColors);
        const sharedRichTextMarkers = parseSharedStringRichTextColorMap(sharedStringsXml, themeColors);
        return parseSheetCellColorMap(sheetXml, styleMap, sharedRichTextMarkers, themeColors);
    } catch (error) {
        console.warn('Failed to read worksheet colors from xlsx XML:', error);
        return extractWorksheetColorMap(workbook, sheetName);
    }
}

function findWorksheetByName(sheetNames, preferredNames) {
    const normalized = preferredNames.map(name => normalizeHeaderText(name));
    for (const preferred of normalized) {
        const exact = sheetNames.find(name => normalizeHeaderText(name) === preferred);
        if (exact) return exact;
    }
    for (const preferred of normalized) {
        const partial = sheetNames.find(name => normalizeHeaderText(name).includes(preferred));
        if (partial) return partial;
    }
    return sheetNames[0] || '';
}

function findOptionalWorksheetByName(sheetNames, preferredNames) {
    const normalized = preferredNames.map(name => normalizeHeaderText(name));
    for (const preferred of normalized) {
        const exact = sheetNames.find(name => normalizeHeaderText(name) === preferred);
        if (exact) return exact;
    }
    for (const preferred of normalized) {
        const partial = sheetNames.find(name => normalizeHeaderText(name).includes(preferred));
        if (partial) return partial;
    }
    return '';
}

function inferReviewColumns(rows) {
    const headers = (rows[0] || []).map(cell => normalizeHeaderText(cell));
    const findIndex = (keywords, negativeKeywords = [], excludeIndexes = new Set()) => headers.findIndex((header, index) => {
        if (excludeIndexes.has(index)) return false;
        if (negativeKeywords.some(keyword => header.includes(normalizeHeaderText(keyword)))) return false;
        return keywords.some(keyword => header.includes(normalizeHeaderText(keyword)));
    });
    const finalTranslationIndex = findIndex(['AI润色修正译文', 'AI修正译文', '修正后译文', '最终译文', 'final', 'fixed', 'revised']);
    const sourceIndex = findIndex(['原文', '源文', '中文', 'source'], ['译文', 'translation', 'target', '修正']);
    return {
        idIndex: findIndex(['定位ID/Key', 'ID/Key', '定位ID', '定位Key', 'ID', 'Key', 'reference id', 'referenceid']),
        rowIndex: findIndex(['定位行号', '行号', 'row', 'line']),
        sourceIndex,
        termIndex: findIndex(['原文术语', '中文术语', '术语', 'term'], ['译文', 'translation', 'target']),
        originalTranslationIndex: findIndex(
            ['原译文', '当前译法', '原有译文', '英文', '英语', 'target', 'translation', 'english', 'en'],
            ['修正后', 'ai', 'final', 'fixed', 'revised'],
            new Set([sourceIndex, finalTranslationIndex].filter(index => index >= 0))
        ),
        finalTranslationIndex,
        statusIndex: findIndex(['人工处理状态', '处理状态', '状态', 'status']),
        noteIndex: findIndex(['备注', '说明', '原因', 'reason', 'note']),
        colorIndex: findIndex(['标色', '颜色', 'color', 'fill'])
    };
}

function normalizeReviewDecisionText(text) {
    const value = String(text || '').trim().toLowerCase();
    if (!value) return '';
    if (/(不采用|不用|不要|拒绝|驳回|忽略|排除|删除|去掉|不改|维持原译|保持原译|skip|ignore|exclude|remove|reject)/i.test(value)) return 'ignore';
    if (/(采用|通过|同意|执行|按.*修改|改成|改为|替换为|使用|保留建议|accept|apply|keep|pass)/i.test(value)) return 'keep';
    if (/(忽略|排除|删除|去掉|不改|不用改|无需改|保持|维持原译|不要|skip|ignore|exclude|remove)/i.test(value)) return 'ignore';
    if (/(保留|通过|采用|keep|pass|accept)/i.test(value)) return 'keep';
    return '';
}

function normalizeReviewDisplayDecision(decision) {
    if (decision === 'revise') return '按备注修正';
    if (decision === 'ai-review') return '等待 AI 理解';
    if (decision === 'ignore') return '不采用修改';
    if (decision === 'keep') return '采用术语';
    return '未标记';
}

function reviewTextNeedsAiDecision(text) {
    const value = String(text || '').trim();
    if (!value) return false;
    if (normalizeReviewDecisionText(value)) return false;
    return value.length >= 4 || /[，。；、,.!?？！]/.test(value);
}

function buildReviewRows(report) {
    return [[
        '定位ID/Key',
        '定位行号',
        '原文',
        '原译文',
        'AI/最终译文',
        '人工处理状态',
        '检测到颜色标记',
        '标记来源',
        '匹配术语',
        '备注',
        '建议处理',
        '匹配提示'
    ], ...report.entries.map(entry => [
        entry.referenceId || '',
        entry.rowNumber || '',
        entry.sourceText || '',
        entry.originalTranslation || '',
        entry.finalTranslation || '',
        normalizeReviewDisplayDecision(entry.decision),
        entry.hasMarker ? '是' : '否',
        entry.markerSource || '',
        (entry.matchedTerms || []).join('; '),
        [entry.note, entry.aiReason ? `AI理解：${entry.aiReason}` : ''].filter(Boolean).join('；'),
        entry.decision === 'ignore'
            ? '不采用该修改，从最终术语表排除匹配术语'
            : entry.decision === 'keep'
                ? '采用该术语，保留匹配术语'
                : entry.decision === 'revise'
                    ? '按人工备注修正译文并保留'
                    : entry.decision === 'ai-review'
                        ? '备注需要人工确认，暂按原术语表保留'
                        : '无人工标记，按原术语表保留',
        entry.decision && (!entry.matchedTerms || entry.matchedTerms.length === 0)
            ? '未匹配到术语表，已放入“需人工确认”'
            : ''
    ])];
}

    function buildReviewGlossaryRows(glossaryTerms) {
        return [
            ['定位ID/Key', '定位行号', '提取批次', '原文术语（中文）', '原译文/当前译法', '指定译文（英文）', '整理后译文（可直接使用）', '类型', '出现次数', '置信度', '术语质量状态', '术语问题', '修正建议', '提取依据', '提取来源'],
            ...(glossaryTerms || []).map(term => [
                term.referenceId || '',
                term.referenceRows || '',
                term.extractionBatch || '',
                term.term || term.source || '',
                term.originalTranslation || '',
                term.translation || term.target || '',
                term.finalTranslation || term.translation || term.target || term.originalTranslation || '',
                term.type || '',
                term.count || '',
                term.confidence || '',
                term.qualityStatus || '',
                term.qualityIssues || '',
                term.qualitySuggestion || '',
                term.note || '',
                term.extractionSource || ''
            ])
        ];
    }

function buildIgnoredReviewRows(report) {
    return [[
        '定位ID/Key',
        '定位行号',
        '原文术语（中文）',
        '指定译文（英文）',
        '匹配来源',
        '人工标记来源',
        '备注'
    ], ...(report.ignoredTerms || report.removedTerms || []).map(item => {
        const term = item.term || item;
        return [
            term.referenceId || item.referenceId || '',
            term.referenceRows || item.rowNumber || '',
            term.term || term.source || item.sourceText || '',
            term.translation || term.target || item.finalTranslation || item.originalTranslation || '',
            item.matchReason || item.reviewReason || '',
            item.reviewSource || '',
            item.note || term.note || ''
        ];
    })];
}

function buildNeedsConfirmationRows(report) {
    return [[
        '定位ID/Key',
        '定位行号',
        '原文',
        '原译文',
        'AI/最终译文',
        '颜色标记',
        '标记来源',
        '人工处理状态',
        '备注',
        '需要确认原因'
    ], ...(report.unmatchedEntries || []).map(entry => [
        entry.referenceId || '',
        entry.rowNumber || '',
        entry.sourceText || '',
        entry.originalTranslation || '',
        entry.finalTranslation || '',
        entry.hasMarker ? '是' : '否',
        entry.markerSource || '',
        normalizeReviewDisplayDecision(entry.decision),
        entry.note || '',
        entry.unmatchedReason || '未能匹配到术语表条目'
    ])];
}

function buildReviewSummaryRows(report) {
    return [
        ['字段', '值'],
        ['源文件', report.sourceFileName || ''],
        ['审核工作表', report.sheetName || ''],
        ['术语来源', report.glossarySheetName || report.termSourceLabel || '当前术语表/返稿行'],
        ['审核总行数', report.totalRows || 0],
        ['颜色标记行数', report.markerRows || 0],
        ['仅背景色标记行数', report.fillMarkerRows || 0],
        ['仅文字颜色标记行数', report.fontMarkerRows || 0],
        ['背景色+文字颜色标记行数', report.mixedMarkerRows || 0],
        ['人工状态行数', report.statusCount || 0],
        ['原始术语数', report.sourceTermCount || 0],
        ['最终术语数', report.finalTermCount || report.keepCount || 0],
        ['排除术语数', report.removedTermCount || report.ignoreCount || 0],
        ['缩小适用范围术语数', report.prunedTermCount || 0],
        ['按返稿修正术语数', report.modifiedTermCount || 0],
        ['AI 理解红色复杂备注数', report.aiReviewStats?.resolved || 0],
        ['待人工理解红色备注数', report.aiReviewStats?.skipped || 0],
        ['AI 理解失败数', report.aiReviewStats?.failed || 0],
        ['待人工确认行数', report.unmatchedIgnoreCount || 0],
        ['生成时间', new Date().toISOString()]
    ];
}

function buildReviewWorkbook(report) {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(buildReviewGlossaryRows(report.finalTerms || report.keptTerms || [])), '最终术语表');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(buildIgnoredReviewRows(report)), '人工忽略清单');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(buildNeedsConfirmationRows(report)), '需人工确认');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(buildReviewSummaryRows(report)), '识别报告');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(buildReviewRows(report)), '审核清单');
    return workbook;
}

function saveGlossaryEntry({ name, sourceFileName, terms, origin, runMeta = null }) {
    const normalizedTerms = normalizeGlossaryTerms(terms);
    if (normalizedTerms.length === 0) return null;

    const id = `glossary_${makeStableId(`${origin}:${sourceFileName || name}`)}`;
    const library = loadGlossaryLibrary();
    const entry = {
        id,
        name: name || sourceFileName || '未命名术语表',
        sourceFileName: sourceFileName || '',
        origin: origin || 'uploaded',
        terms: normalizedTerms,
        ...(runMeta ? { runMeta } : {}),
        updatedAt: Date.now()
    };

    const existingIndex = library.findIndex(item => item.id === id);
    if (existingIndex >= 0) {
        library[existingIndex] = entry;
    } else {
        library.unshift(entry);
    }

    saveGlossaryLibrary(library);
    document.dispatchEvent(new CustomEvent('nexus:glossary-library-updated'));
    return entry;
}

function findHeaderColumn(headers, keywords, excludeIndexes = new Set()) {
    return headers.findIndex((header, index) => {
        if (excludeIndexes.has(index)) return false;
        return keywords.some(keyword => header.includes(keyword));
    });
}

function findHeaderColumnAvoiding(headers, keywords, negativeKeywords = [], excludeIndexes = new Set()) {
    return headers.findIndex((header, index) => {
        if (excludeIndexes.has(index)) return false;
        if (negativeKeywords.some(keyword => header.includes(keyword))) return false;
        return keywords.some(keyword => header.includes(keyword));
    });
}

function getGlossaryColumnStats(rows, index) {
    return rows.reduce((stats, row) => {
        const value = row[index] === undefined ? '' : String(row[index]).trim();
        if (!value) return stats;
        stats.nonEmpty++;
        if (hasCjkText(value)) stats.cjk++;
        if (hasLatinText(value)) stats.latin++;
        if (isIdLikeGlossaryValue(value)) stats.idLike++;
        return stats;
    }, { nonEmpty: 0, cjk: 0, latin: 0, idLike: 0 });
}

function inferGlossaryColumnIndexes(rows) {
    const width = Math.max(0, ...rows.map(row => row.length || 0));
    const stats = Array.from({ length: width }, (_, index) => ({
        index,
        ...getGlossaryColumnStats(rows.slice(0, 100), index)
    }));

    const sourceCandidate = stats
        .filter(item => item.nonEmpty > 0 && item.cjk > 0 && item.idLike / item.nonEmpty < 0.6)
        .sort((a, b) => (b.cjk / b.nonEmpty) - (a.cjk / a.nonEmpty))[0];
    const targetCandidate = stats
        .filter(item => item.nonEmpty > 0 && item.index !== sourceCandidate?.index && item.latin > 0 && item.idLike / item.nonEmpty < 0.6)
        .sort((a, b) => (b.latin / b.nonEmpty) - (a.latin / a.nonEmpty))[0];

    return {
        sourceIndex: sourceCandidate?.index ?? 0,
        targetIndex: targetCandidate?.index ?? (sourceCandidate?.index === 0 ? 1 : 0)
    };
}

function parseGlossaryTableRows(rows) {
    if (!rows || rows.length === 0) return [];

    const headers = (rows[0] || []).map(cell => String(cell || '').trim().toLowerCase());
    const hasHeader = headers.some(header =>
        header.includes('术语') ||
        header.includes('原文') ||
        header.includes('源文') ||
        header.includes('中文') ||
        header.includes('简体') ||
        header.includes('英文') ||
        header.includes('英语') ||
        header.includes('译文') ||
        header.includes('翻译') ||
        header.includes('chinese') ||
        header.includes('english') ||
        header.includes('term') ||
        header.includes('source') ||
        header.includes('target') ||
        header.includes('translation')
    );

    const dataRows = hasHeader ? rows.slice(1) : rows;
    const inferred = inferGlossaryColumnIndexes(dataRows);
    let sourceIndex = hasHeader
        ? findHeaderColumn(headers, ['原文', '源文', '源术语', '中文', '简体', 'chinese', 'source'])
        : inferred.sourceIndex;
    if (sourceIndex < 0 && hasHeader) {
        sourceIndex = findHeaderColumn(headers, ['术语', 'term']);
    }
    let targetIndex = hasHeader
        ? findHeaderColumn(headers, ['指定译文', '推荐英文', '标准译文', '规范译文', '建议译文'], new Set([sourceIndex]))
        : inferred.targetIndex;
    if (targetIndex < 0 && hasHeader) {
        targetIndex = findHeaderColumnAvoiding(
            headers,
            ['译文', '翻译', '目标', '英文', '英语', 'english', 'translation', 'target'],
            ['原译文', '当前译法', '当前译文', '整理后', '可直接使用', '最终', 'final', 'original', 'current'],
            new Set([sourceIndex])
        );
    }
    if (targetIndex < 0 && hasHeader) {
        targetIndex = findHeaderColumn(headers, ['译文', '翻译', '目标', '英文', '英语', 'english', 'translation', 'target'], new Set([sourceIndex]));
    }
    let typeIndex = hasHeader ? findHeaderColumn(headers, ['类型', '分类', 'type', 'category'], new Set([sourceIndex, targetIndex])) : -1;
    const countIndex = hasHeader ? findHeaderColumn(headers, ['出现次数', '次数', 'count']) : -1;
    const confidenceIndex = hasHeader ? findHeaderColumn(headers, ['置信度', 'confidence', 'score']) : -1;
    const noteIndex = hasHeader ? findHeaderColumn(headers, ['提取依据', '依据', '备注', '说明', 'note', 'reason', 'description']) : -1;
    const extractionSourceIndex = hasHeader ? findHeaderColumn(headers, ['提取来源', '来源', 'source type', 'extraction source', 'extractionsource']) : -1;
    const extractionBatchIndex = hasHeader ? findHeaderColumn(headers, ['提取批次', '批次', 'batch']) : -1;
    const referenceIdIndex = hasHeader ? findHeaderColumn(headers, ['定位id', '定位 id', '定位key', '定位 key', 'id/key', 'id', 'key', 'string id', 'referenceid']) : -1;
    const referenceRowsIndex = hasHeader ? findHeaderColumn(headers, ['定位行号', '行号', 'reference rows', 'referencerows', 'rows']) : -1;
    const originalTranslationIndex = hasHeader ? findHeaderColumn(headers, ['原译文', '当前译法', '当前译文', '原有译文', 'original translation', 'current translation', 'currenttarget', 'observedtarget']) : -1;
    const finalTranslationIndex = hasHeader ? findHeaderColumn(headers, ['整理后译文', '可直接使用', '最终译文', '修正版译文', 'final translation', 'finaltarget', 'revisedtarget', 'fixedtarget']) : -1;
    const usedTranslationColumns = new Set([sourceIndex, targetIndex, originalTranslationIndex, finalTranslationIndex].filter(index => index >= 0));
    const englishIndex = hasHeader ? findHeaderColumn(headers, ['英文', '英语', 'english', 'en', 'en-us', 'en_us'], usedTranslationColumns) : -1;
    const japaneseIndex = hasHeader ? findHeaderColumn(headers, ['日文', '日语', 'japanese', 'ja', 'jp'], usedTranslationColumns) : -1;
    const koreanIndex = hasHeader ? findHeaderColumn(headers, ['韩文', '韩语', 'korean', 'ko', 'kr'], usedTranslationColumns) : -1;
    const traditionalChineseIndex = hasHeader ? findHeaderColumn(headers, ['繁体', '繁体中文', 'traditional chinese', 'zh-tw', 'zh_tw', 'zh-hant'], usedTranslationColumns) : -1;
    const frenchIndex = hasHeader ? findHeaderColumn(headers, ['法文', '法语', 'french', 'fr'], usedTranslationColumns) : -1;
    const germanIndex = hasHeader ? findHeaderColumn(headers, ['德文', '德语', 'german', 'de'], usedTranslationColumns) : -1;
    const spanishIndex = hasHeader ? findHeaderColumn(headers, ['西班牙文', '西班牙语', 'spanish', 'es'], usedTranslationColumns) : -1;
    const portugueseIndex = hasHeader ? findHeaderColumn(headers, ['葡萄牙文', '葡萄牙语', 'portuguese', 'pt'], usedTranslationColumns) : -1;
    const russianIndex = hasHeader ? findHeaderColumn(headers, ['俄文', '俄语', 'russian', 'ru'], usedTranslationColumns) : -1;
    const thaiIndex = hasHeader ? findHeaderColumn(headers, ['泰文', '泰语', 'thai', 'th'], usedTranslationColumns) : -1;
    const vietnameseIndex = hasHeader ? findHeaderColumn(headers, ['越南文', '越南语', 'vietnamese', 'vi'], usedTranslationColumns) : -1;
    const indonesianIndex = hasHeader ? findHeaderColumn(headers, ['印尼文', '印尼语', 'indonesian', 'id'], usedTranslationColumns) : -1;
    const qualityStatusIndex = hasHeader ? findHeaderColumn(headers, ['术语质量状态', '质量状态', '检测状态', 'quality status', 'qualitystatus']) : -1;
    const qualityIssuesIndex = hasHeader ? findHeaderColumn(headers, ['术语问题', '质量问题', '问题', 'quality issues', 'qualityissues', 'issues']) : -1;
    const qualitySuggestionIndex = hasHeader ? findHeaderColumn(headers, ['修正建议', '建议', 'quality suggestion', 'qualitysuggestion', 'suggestion']) : -1;

    if (sourceIndex < 0) sourceIndex = 0;
    if (targetIndex < 0 || targetIndex === sourceIndex) targetIndex = sourceIndex === 0 ? 1 : 0;
    if (typeIndex === sourceIndex || typeIndex === targetIndex) typeIndex = -1;

    return dataRows.map(row => {
        const rawSource = row[sourceIndex] === undefined ? '' : String(row[sourceIndex]).trim();
        const rawTarget = targetIndex >= 0 && row[targetIndex] !== undefined ? String(row[targetIndex]).trim() : '';
        const rawType = typeIndex >= 0 && row[typeIndex] !== undefined ? String(row[typeIndex]).trim() : '';
        const count = countIndex >= 0 && row[countIndex] !== undefined ? Number(row[countIndex]) : 1;
        const confidence = confidenceIndex >= 0 && row[confidenceIndex] !== undefined ? Number(row[confidenceIndex]) : 0;
        const note = noteIndex >= 0 && row[noteIndex] !== undefined ? String(row[noteIndex]).trim() : '';
        const extractionSource = extractionSourceIndex >= 0 && row[extractionSourceIndex] !== undefined ? String(row[extractionSourceIndex]).trim() : '';
        const extractionBatch = extractionBatchIndex >= 0 && row[extractionBatchIndex] !== undefined ? String(row[extractionBatchIndex]).trim() : '';
        const referenceId = referenceIdIndex >= 0 && row[referenceIdIndex] !== undefined ? String(row[referenceIdIndex]).trim() : '';
        const referenceRows = referenceRowsIndex >= 0 && row[referenceRowsIndex] !== undefined ? String(row[referenceRowsIndex]).trim() : '';
        const originalTranslation = originalTranslationIndex >= 0 && row[originalTranslationIndex] !== undefined ? String(row[originalTranslationIndex]).trim() : '';
        const finalTranslation = finalTranslationIndex >= 0 && row[finalTranslationIndex] !== undefined ? String(row[finalTranslationIndex]).trim() : '';
        const getCell = index => index >= 0 && row[index] !== undefined ? String(row[index]).trim() : '';
        const qualityStatus = qualityStatusIndex >= 0 && row[qualityStatusIndex] !== undefined ? String(row[qualityStatusIndex]).trim() : '';
        const qualityIssues = qualityIssuesIndex >= 0 && row[qualityIssuesIndex] !== undefined ? String(row[qualityIssuesIndex]).trim() : '';
        const qualitySuggestion = qualitySuggestionIndex >= 0 && row[qualitySuggestionIndex] !== undefined ? String(row[qualitySuggestionIndex]).trim() : '';
        const repaired = repairLegacyGlossaryTerm(rawSource, rawTarget, rawType);
        if (!repaired) return null;

        return {
            source: repaired.source,
            target: repaired.target,
            type: repaired.type,
            originalType: rawType,
            organizedType: '',
            secondaryType: '',
            categoryReason: '',
            mergeNote: '',
            count: Number.isFinite(count) ? count : 1,
            confidence: Number.isFinite(confidence) ? confidence : 0,
            note,
            extractionSource,
            extractionBatch,
            referenceId,
            referenceRows,
            originalTranslation,
            finalTranslation,
            english: getCell(englishIndex),
            japanese: getCell(japaneseIndex),
            korean: getCell(koreanIndex),
            traditionalChinese: getCell(traditionalChineseIndex),
            french: getCell(frenchIndex),
            german: getCell(germanIndex),
            spanish: getCell(spanishIndex),
            portuguese: getCell(portugueseIndex),
            russian: getCell(russianIndex),
            thai: getCell(thaiIndex),
            vietnamese: getCell(vietnameseIndex),
            indonesian: getCell(indonesianIndex),
            qualityStatus,
            qualityIssues,
            qualitySuggestion
        };
    }).filter(term => term?.source && !isIdLikeGlossaryValue(term.source));
}

function loadTranslationProjectsFromStorage() {
    const stored = localStorage.getItem(TRANSLATION_PROJECTS_KEY);
    if (!stored) return [];

    try {
        const projects = JSON.parse(stored);
        return Array.isArray(projects) ? projects : [];
    } catch {
        return [];
    }
}

function getDefaultTranslationProjectId() {
    return localStorage.getItem(DEFAULT_TRANSLATION_PROJECT_KEY) || 'yongbingxiaozhen';
}

function setDefaultTranslationProjectId(projectId) {
    if (!projectId) {
        localStorage.removeItem(DEFAULT_TRANSLATION_PROJECT_KEY);
    } else {
        localStorage.setItem(DEFAULT_TRANSLATION_PROJECT_KEY, projectId);
    }
    document.dispatchEvent(new CustomEvent('nexus:projects-updated'));
}

function getPreferredTranslationProject(projects = []) {
    if (!Array.isArray(projects) || projects.length === 0) return null;
    const defaultId = getDefaultTranslationProjectId();
    return projects.find(project => project.id === defaultId) ||
        projects.find(project => project.id === 'yongbingxiaozhen') ||
        projects[0] ||
        null;
}

function isOnline() {
    return navigator.onLine;
}

function waitForNetwork(signal = null) {
    if (navigator.onLine) return Promise.resolve();
    if (signal?.aborted) {
        return Promise.reject(createAbortError());
    }

    return new Promise((resolve, reject) => {
        const cleanup = () => {
            window.removeEventListener('online', handleOnline);
            signal?.removeEventListener('abort', handleAbort);
        };
        const handleOnline = () => {
            cleanup();
            resolve();
        };
        const handleAbort = () => {
            cleanup();
            reject(createAbortError());
        };

        window.addEventListener('online', handleOnline, { once: true });
        signal?.addEventListener('abort', handleAbort, { once: true });
    });
}

function delayWithSignal(ms, signal = null) {
    if (!ms || ms <= 0) return Promise.resolve();
    if (signal?.aborted) {
        return Promise.reject(new DOMException('Request aborted', 'AbortError'));
    }

    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            signal?.removeEventListener('abort', abort);
            resolve();
        }, ms);
        const abort = () => {
            clearTimeout(timeout);
            reject(new DOMException('Request aborted', 'AbortError'));
        };

        signal?.addEventListener('abort', abort, { once: true });
    });
}

const CUSTOM_MODEL_OPTION = '__custom_model__';

const PLATFORM_CONFIG = {
    deepseek: { name: 'DeepSeek', baseUrl: 'https://api.deepseek.com', models: [
        { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash' },
        { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro' },
        { id: 'deepseek-chat', name: 'DeepSeek Chat' },
        { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner' }
    ]},
    openai: { name: 'OpenAI 官方', baseUrl: 'https://api.openai.com/v1', models: [
        { id: 'gpt-5.5', name: 'GPT-5.5' },
        { id: 'gpt-5.4', name: 'GPT-5.4' },
        { id: 'gpt-5.4-mini', name: 'GPT-5.4 Mini' },
        { id: 'gpt-5.4-nano', name: 'GPT-5.4 Nano' },
        { id: 'gpt-5', name: 'GPT-5' },
        { id: 'gpt-5-mini', name: 'GPT-5 Mini' }
    ]},
    openaiProxy: { name: 'OpenAI 中转站', baseUrl: 'https://api.chatanywhere.com.cn/v1', models: [
        { id: 'gpt-5.5', name: 'GPT-5.5' },
        { id: 'gpt-5.4', name: 'GPT-5.4' },
        { id: 'gpt-5.4-mini', name: 'GPT-5.4 Mini' },
        { id: 'gpt-5.4-nano', name: 'GPT-5.4 Nano' },
        { id: 'gpt-5', name: 'GPT-5' },
        { id: 'gpt-5-mini', name: 'GPT-5 Mini' }
    ]},
    gemini: { name: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', models: [
        { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro Preview' },
        { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash Preview' },
        { id: 'gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash-Lite' },
        { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
        { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
        { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash-Lite' }
    ]},
    xiaomi: { name: '小米 MiMo', baseUrl: 'https://api.xiaomimimo.com/v1', models: [
        { id: 'mimo-v2-flash', name: 'MiMo V2 Flash' },
        { id: 'mimo-v2-pro', name: 'MiMo V2 Pro' },
        { id: 'mimo-v2-omni', name: 'MiMo V2 Omni' },
        { id: 'mimo-v2.5-pro', name: 'MiMo V2.5 Pro' },
        { id: 'mimo-v2.5', name: 'MiMo V2.5' }
    ]},
    aigocodeOpenai: { name: 'AIGoCode GPT / Codex 网关', baseUrl: 'https://api.aigocode.com/v1', gateway: true, protocol: 'openai-responses', allowCustomModel: true, models: [
        { id: 'gpt-5.5', name: 'GPT-5.5' },
        { id: 'gpt-5.4', name: 'GPT-5.4' },
        { id: 'gpt-5.3-codex', name: 'GPT-5.3 Codex' },
        { id: 'gpt-5', name: 'GPT-5' },
        { id: 'gpt-5-mini', name: 'GPT-5 Mini' }
    ]},
    aigocodeClaude: { name: 'AIGoCode Claude 网关', baseUrl: 'https://api.aigocode.com/v1', gateway: true, protocol: 'anthropic-messages', allowCustomModel: true, models: [
        { id: 'claude-opus-4-6', name: 'Claude Opus 4.6（推荐）' },
        { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6' },
        { id: 'claude-opus-4-7', name: 'Claude Opus 4.7' },
        { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5' },
        { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5' },
        { id: 'claude-sonnet-4', name: 'Claude Sonnet 4' },
        { id: 'claude-opus-4-1', name: 'Claude Opus 4.1' },
        { id: 'claude-opus-4', name: 'Claude Opus 4' }
    ]},
    aigocodeGemini: { name: 'AIGoCode Gemini 网关', baseUrl: 'https://api.aigocode.com/v1beta', gateway: true, protocol: 'gemini-generate', allowCustomModel: true, models: [
        { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro Preview' },
        { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash Preview' },
        { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
        { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' }
    ]},
    aliyun: { name: '阿里云通义千问', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', models: [
        { id: 'qwen3.6-max-preview', name: '通义千问 Qwen3.6 Max Preview' },
        { id: 'qwen3.6-plus', name: '通义千问 Qwen3.6 Plus' },
        { id: 'qwen3.6-flash', name: '通义千问 Qwen3.6 Flash' },
        { id: 'qwen3.5-plus', name: '通义千问 Qwen3.5 Plus' },
        { id: 'qwen3.5-flash', name: '通义千问 Qwen3.5 Flash' },
        { id: 'qwen3-max', name: '通义千问 Qwen3 Max' },
        { id: 'qwen-plus', name: '通义千问 Plus' },
        { id: 'qwen-flash', name: '通义千问 Flash' },
        { id: 'qwen-turbo', name: '通义千问 Turbo' }
    ]},
    tencent: { name: '腾讯云 TokenHub', baseUrl: 'https://tokenhub.tencentmaas.com/v1', models: [
        { id: 'hy3-preview', name: 'HY3 Preview' },
        { id: 'hunyuan-2.0-thinking-20251109', name: '混元 2.0 Thinking' },
        { id: 'hunyuan-2.0-instruct-20251111', name: '混元 2.0 Instruct' },
        { id: 'hunyuan-role-latest', name: 'Hunyuan Role Latest' },
        { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro' },
        { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash' },
        { id: 'deepseek-v3.2', name: 'DeepSeek V3.2' },
        { id: 'deepseek-v3.1-terminus', name: 'DeepSeek V3.1 Terminus' },
        { id: 'glm-5.1', name: 'GLM-5.1' },
        { id: 'kimi-k2.6', name: 'Kimi K2.6' },
        { id: 'minimax-m2.7', name: 'MiniMax M2.7' }
    ]},
    doubao: { name: '字节跳动豆包', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', allowCustomModel: true, models: [
        { id: 'doubao-seed-2-0-lite-260428', name: '豆包 Seed 2.0 Lite（260428，推荐）' },
        { id: 'doubao-seed-2-0-lite', name: '豆包 Seed 2.0 Lite（短 ID，需控制台支持）' },
        { id: 'doubao-seed-2-0-pro-260215', name: '豆包 Seed 2.0 Pro' },
        { id: 'doubao-seed-2-0-lite-260215', name: '豆包 Seed 2.0 Lite（260215）' },
        { id: 'doubao-seed-2-0-mini-260215', name: '豆包 Seed 2.0 Mini' },
        { id: 'doubao-seed-1-8-251228', name: '豆包 Seed 1.8' },
        { id: 'doubao-seed-1-6-251015', name: '豆包 Seed 1.6' },
        { id: 'doubao-seed-1-6-flash-250828', name: '豆包 Seed 1.6 Flash' },
        { id: 'doubao-seed-1-6-thinking-250715', name: '豆包 Seed 1.6 Thinking' }
    ]},
    youdao: { name: '有道智云大模型网关', baseUrl: 'https://openapi.youdao.com/llmgateway/api/v1', models: [
        { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash' },
        { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro' },
        { id: 'deepseek-v3.2-chat-251201', name: 'DeepSeek V3.2 Chat' },
        { id: 'deepseek-v3.2-reasoner-251201', name: 'DeepSeek V3.2 Reasoner' },
        { id: 'deepseek-v3.1-chat-250922', name: 'DeepSeek V3.1 Chat' },
        { id: 'deepseek-v3.1-reasoner-250922', name: 'DeepSeek V3.1 Reasoner' },
        { id: 'qwen3.5-plus', name: 'Qwen 3.5 Plus' },
        { id: 'qwen3.6-plus', name: 'Qwen 3.6 Plus' },
        { id: 'glm-5', name: 'GLM-5' },
        { id: 'glm-5.1', name: 'GLM-5.1' },
        { id: 'minimax-m2.5', name: 'Minimax M2.5' },
        { id: 'minimax-m2.7', name: 'Minimax M2.7' },
        { id: 'kimi-k2.5', name: 'Kimi K2.5' },
        { id: 'kimi-k2.6', name: 'Kimi K2.6' }
    ]},
    youdaoTranslate: { name: '有道智云大模型翻译', baseUrl: 'https://openapi.youdao.com/proxy/http/llm-trans', translationOnly: true, models: [
        { id: 'youdao-ziyue-pro-14b', name: '子曰翻译 Pro 14B' },
        { id: 'youdao-ziyue-lite-1.5b', name: '子曰翻译 Lite 1.5B' }
    ]},
    custom: { name: '自定义平台', baseUrl: '', allowCustomModel: true, models: [] }
};

function getPlatformName(provider) {
    return PLATFORM_CONFIG[provider]?.name || provider || '未知平台';
}

const PLATFORM_VISUALS = {
    deepseek: { mark: 'DS', tone: 'deepseek', label: 'DeepSeek' },
    openai: { mark: '◎', tone: 'openai', label: 'OpenAI' },
    openaiProxy: { mark: '◎', tone: 'openai', label: 'OpenAI' },
    gemini: { mark: '✦', tone: 'gemini', label: 'Gemini' },
    aigocodeGemini: { mark: '✦', tone: 'gemini', label: 'Gemini' },
    aigocodeOpenai: { mark: '◎', tone: 'openai', label: 'GPT' },
    aigocodeClaude: { mark: 'C', tone: 'claude', label: 'Claude' },
    xiaomi: { mark: 'MI', tone: 'mimo', label: 'MiMo' },
    aliyun: { mark: 'Q', tone: 'qwen', label: 'Qwen' },
    tencent: { mark: 'T', tone: 'tencent', label: 'Tencent' },
    doubao: { mark: '豆', tone: 'doubao', label: 'Doubao' },
    youdao: { mark: '有', tone: 'youdao', label: 'Youdao' },
    youdaoTranslate: { mark: '译', tone: 'youdao', label: 'Youdao' },
    custom: { mark: 'API', tone: 'custom', label: 'Custom' }
};

const LANGUAGE_VISUALS = {
    'zh-CN': { flag: '🇨🇳', name: '中文（简体）' },
    'zh-TW': { flag: '🇨🇳', name: '中文（繁体）' },
    en: { flag: '🇺🇸', name: '英语' },
    ja: { flag: '🇯🇵', name: '日语' },
    ko: { flag: '🇰🇷', name: '韩语' },
    fr: { flag: '🇫🇷', name: '法语' },
    de: { flag: '🇩🇪', name: '德语' },
    es: { flag: '🇪🇸', name: '西班牙语' },
    pt: { flag: '🇵🇹', name: '葡萄牙语' },
    ru: { flag: '🇷🇺', name: '俄语' },
    th: { flag: '🇹🇭', name: '泰语' },
    vi: { flag: '🇻🇳', name: '越南语' },
    id: { flag: '🇮🇩', name: '印尼语' }
};

function getPlatformVisual(provider) {
    return PLATFORM_VISUALS[provider] || { mark: 'API', tone: 'custom', label: getPlatformName(provider) };
}

function getProviderMarkHtml(provider) {
    const visual = getPlatformVisual(provider);
    return `<span class="provider-mark ${escapeAttribute(visual.tone)}" title="${escapeAttribute(visual.label)}">${escapeHtml(visual.mark)}</span>`;
}

function getModelTraitTags(modelId = '') {
    const id = String(modelId || '').toLowerCase();
    const tags = [];
    if (/flash|lite|mini|turbo|haiku/.test(id)) tags.push('快速');
    if (/pro|opus|max|reason|thinking/.test(id)) tags.push('高精度');
    if (/preview/.test(id)) tags.push('预览');
    if (/codex/.test(id)) tags.push('代码');
    return tags.slice(0, 3);
}

function getModelTraitHtml(modelId) {
    const tags = getModelTraitTags(modelId);
    if (tags.length === 0) return '<span class="model-trait muted">通用</span>';
    return tags.map(tag => `<span class="model-trait">${escapeHtml(tag)}</span>`).join('');
}

function getLanguageVisual(lang) {
    return LANGUAGE_VISUALS[lang] || { flag: '🌐', name: lang || '语言' };
}

function getProviderProtocol(provider) {
    return PLATFORM_CONFIG[provider]?.protocol || 'openai-chat';
}

function isGatewayProvider(provider) {
    return PLATFORM_CONFIG[provider]?.gateway === true;
}

function getDefaultModelForProvider(provider) {
    const models = PLATFORM_CONFIG[provider]?.models || [];
    return models[0]?.id || '';
}

function getModelDisplayName(provider, modelId) {
    const model = (PLATFORM_CONFIG[provider]?.models || []).find(item => item.id === modelId);
    return model ? `${model.name} (${model.id})` : (modelId ? `自定义模型 (${modelId})` : '未选择模型');
}

function platformAllowsCustomModel(provider) {
    return PLATFORM_CONFIG[provider]?.allowCustomModel === true;
}

const DOUBAO_MODEL_FALLBACK_ORDER = [
    'doubao-seed-2-0-lite-260428',
    'doubao-seed-2-0-lite',
    'doubao-seed-2-0-pro-260215',
    'doubao-seed-2-0-lite-260215',
    'doubao-seed-2-0-mini-260215'
];

function isDoubaoModelAccessError(error) {
    const text = `${error?.message || ''} ${error?.rawText || ''} ${JSON.stringify(error?.payload || '')}`;
    return /has\s+not\s+activated\s+the\s+model|activate\s+the\s+model\s+service|model.*not.*activated|model.*not.*found|invalid.*model|unsupported.*model|not\s+support.*model|does\s+not\s+exist|do\s+not\s+have\s+access|no\s+access|permission|unauthorized\s+model|模型.*未开通|未开通.*模型|模型.*不存在|不支持.*模型/i.test(text);
}

function getDoubaoFallbackModels(currentModel) {
    const current = String(currentModel || '').trim();
    const configuredModels = (PLATFORM_CONFIG.doubao?.models || []).map(model => model.id).filter(Boolean);
    return [...new Set([...DOUBAO_MODEL_FALLBACK_ORDER, ...configuredModels])]
        .filter(model => model && model !== current);
}

function isPlatformDefaultName(name) {
    const normalizedName = String(name || '').trim();
    if (!normalizedName) return false;
    return Object.values(PLATFORM_CONFIG).some(platform => platform.name === normalizedName);
}

function normalizeProfileName(provider, name) {
    const value = String(name || '').trim();
    const platformName = getPlatformName(provider);
    if (!value) return platformName;
    if (value !== platformName && isPlatformDefaultName(value)) {
        return platformName;
    }
    return value;
}

function normalizeProviderBaseUrl(provider, baseUrl) {
    const trimmed = String(baseUrl || '').trim().replace(/\/+$/, '');
    if (!trimmed) return trimmed;

    if (provider === 'gemini') {
        try {
            const url = new URL(trimmed);
            if (/generativelanguage\.googleapis\.com$/i.test(url.hostname) &&
                !/\/openai(?:\/|$)/i.test(url.pathname)) {
                const path = url.pathname.replace(/\/+$/, '') || '/v1beta';
                if (/\/v1(?:beta)?$/i.test(path)) {
                    url.pathname = `${path}/openai`;
                } else {
                    url.pathname = `${path}/openai`;
                }
                return url.toString().replace(/\/+$/, '');
            }
        } catch {
            return trimmed;
        }
    }

    return trimmed;
}

function normalizeApiProfile(profile) {
    const provider = PLATFORM_CONFIG[profile?.provider] ? profile.provider : 'deepseek';
    const platformModels = PLATFORM_CONFIG[provider]?.models || [];
    let rawModel = String(profile?.model || '').trim();
    if (provider === 'doubao' && rawModel === 'doubao-seed-2-0-lite') {
        rawModel = 'doubao-seed-2-0-lite-260428';
    }
    const model = rawModel && (platformAllowsCustomModel(provider) || platformModels.some(item => item.id === rawModel))
        ? rawModel
        : getDefaultModelForProvider(provider);
    const name = normalizeProfileName(provider, profile?.name);
    const concurrency = Math.max(1, Math.min(10, Number(profile?.concurrency || 3)));
    let baseUrl = normalizeProviderBaseUrl(provider, profile?.baseUrl || PLATFORM_CONFIG[provider]?.baseUrl || '');
    if (provider === 'youdao' && /^https:\/\/openapi\.youdao\.com\/api\/?$/i.test(baseUrl)) {
        baseUrl = PLATFORM_CONFIG.youdao.baseUrl;
    }
    if (provider === 'youdaoTranslate' && /^https:\/\/openapi\.youdao\.com\/llm_trans\/?$/i.test(baseUrl)) {
        baseUrl = PLATFORM_CONFIG.youdaoTranslate.baseUrl;
    }
    if (provider === 'xiaomi' && /^https:\/\/api\.xiaomimimo\.com\/(?:anthropic(?:\/v1\/messages)?|v1\/chat\/completions)\/?$/i.test(baseUrl)) {
        baseUrl = PLATFORM_CONFIG.xiaomi.baseUrl;
    }

    return {
        id: profile?.id || `api_${Date.now().toString(36)}_${makeStableId(`${provider}:${name}:${model}`)}`,
        name,
        provider,
        apiKey: String(profile?.apiKey || '').trim(),
        apiSecret: String(profile?.apiSecret || '').trim(),
        baseUrl,
        model,
        concurrency: Number.isFinite(concurrency) ? concurrency : 3,
        updatedAt: profile?.updatedAt || Date.now()
    };
}

function loadLegacyApiConfig() {
    const stored = localStorage.getItem('apiConfig');
    if (!stored) return null;

    try {
        return JSON.parse(stored);
    } catch (e) {
        console.error('Failed to parse legacy API config:', e);
        return null;
    }
}

function loadApiProfiles() {
    const stored = localStorage.getItem(API_PROFILES_KEY);
    if (stored) {
        try {
            const profiles = JSON.parse(stored);
            return Array.isArray(profiles) ? profiles.map(normalizeApiProfile) : [];
        } catch (e) {
            console.error('Failed to parse API profiles:', e);
        }
    }

    const legacy = loadLegacyApiConfig();
    if (legacy && legacy.apiKey) {
        return [normalizeApiProfile({
            id: 'api_legacy_default',
            name: getPlatformName(legacy.provider || 'deepseek'),
            provider: legacy.provider || 'deepseek',
            apiKey: legacy.apiKey || '',
            baseUrl: legacy.baseUrl || '',
            model: legacy.model || getDefaultModelForProvider(legacy.provider || 'deepseek'),
            concurrency: 3,
            updatedAt: Date.now()
        })];
    }

    return [];
}

function saveApiProfiles(profiles) {
    const normalizedProfiles = (profiles || []).map(profile => normalizeApiProfile({
        ...profile,
        updatedAt: profile.updatedAt || Date.now()
    }));
    localStorage.setItem(API_PROFILES_KEY, JSON.stringify(normalizedProfiles));
    document.dispatchEvent(new CustomEvent('nexus:api-profiles-updated'));
    return normalizedProfiles;
}

function getActiveApiProfile() {
    const profiles = loadApiProfiles();
    if (profiles.length === 0) return null;

    const activeId = localStorage.getItem(ACTIVE_API_PROFILE_KEY);
    return profiles.find(profile => profile.id === activeId) || profiles[0];
}

function setActiveApiProfile(profile) {
    if (!profile) return;
    localStorage.setItem(ACTIVE_API_PROFILE_KEY, profile.id);
    localStorage.setItem('apiConfig', JSON.stringify({
        provider: profile.provider,
        apiKey: profile.apiKey,
        apiSecret: profile.apiSecret,
        baseUrl: profile.baseUrl,
        model: profile.model
    }));
    document.dispatchEvent(new CustomEvent('nexus:api-profiles-updated'));
}

function isApiProfileChatCompatible(profile) {
    const platform = PLATFORM_CONFIG[profile?.provider];
    if (!platform || platform.translationOnly) return false;
    return platform.chatCompletions !== false;
}

function isApiProfileTranslationOnly(profile) {
    return PLATFORM_CONFIG[profile?.provider]?.translationOnly === true;
}

function isApiProfileTranslationCompatible(profile) {
    return isApiProfileChatCompatible(profile) || isApiProfileTranslationOnly(profile);
}

function isApiProfileCredentialComplete(profile) {
    if (!profile?.apiKey) return false;
    if (isApiProfileTranslationOnly(profile)) {
        return Boolean(profile.apiSecret);
    }
    return true;
}

function getApiProfileLabel(profile) {
    if (!profile) return '未选择模型';
    return `${profile.name || profile.profileName || getPlatformName(profile.provider)} · ${getModelDisplayName(profile.provider, profile.model)}`;
}

function getCompactModelLabel(profile) {
    if (!profile) return '';
    const platformName = getPlatformName(profile.provider);
    const model = String(profile.model || '').trim();
    return [platformName, model].filter(Boolean).join(' · ');
}

function getProfileConcurrency(profile) {
    const concurrency = Number(profile?.concurrency || 3);
    return Number.isFinite(concurrency) ? Math.max(1, Math.min(10, concurrency)) : 3;
}

function getUsableApiProfiles() {
    return loadApiProfiles().filter(profile => profile.apiKey && isApiProfileChatCompatible(profile));
}

function getUsableTranslationProfiles() {
    return loadApiProfiles().filter(profile =>
        isApiProfileTranslationCompatible(profile) &&
        isApiProfileCredentialComplete(profile)
    );
}

function getDefaultSelectedProfiles(selectedIds) {
    const usableProfiles = getUsableApiProfiles();
    const usableIds = new Set(usableProfiles.map(profile => profile.id));
    const selectedSet = new Set([...selectedIds].filter(id => usableIds.has(id)));

    if (selectedSet.size === 0 && usableProfiles.length > 0) {
        const activeProfile = getActiveApiProfile();
        const defaultProfile = usableProfiles.find(profile => activeProfile && profile.id === activeProfile.id) || usableProfiles[0];
        selectedSet.add(defaultProfile.id);
    }

    return selectedSet;
}

function renderApiProfileChecklist(container, selectedIds, onChange, emptyText) {
    const profiles = loadApiProfiles().filter(profile => !isApiProfileTranslationOnly(profile));
    const nextSelectedIds = getDefaultSelectedProfiles(selectedIds);
    const activeProfile = getActiveApiProfile();
    container.innerHTML = '';

    if (profiles.length === 0) {
        container.innerHTML = `<div class="resource-empty">${emptyText || '暂无可用于本地化检测的 API 通道。请先在顶部“API 配置”中保存 DeepSeek、Gemini、通义千问等检测通道。'}</div>`;
        onChange(nextSelectedIds);
        return nextSelectedIds;
    }

    profiles.forEach(profile => {
        const compatible = isApiProfileChatCompatible(profile);
        const hasKey = Boolean(profile.apiKey);
        const isUsable = compatible && hasKey;
        const isDefaultProfile = Boolean(activeProfile && activeProfile.id === profile.id);
        const isDefaultSelected = isDefaultProfile && nextSelectedIds.has(profile.id);
        const disabledReason = !hasKey
            ? '未保存 API Key'
            : (!compatible ? '该平台当前不是 Chat Completions 兼容接口' : '');
        const label = document.createElement('label');
        label.className = `resource-check-item ai-channel-card ${nextSelectedIds.has(profile.id) ? 'selected' : ''} ${isUsable ? '' : 'disabled'}`;
        label.innerHTML = `
            ${getProviderMarkHtml(profile.provider)}
            <input type="checkbox" value="${profile.id}" ${nextSelectedIds.has(profile.id) ? 'checked' : ''} ${isUsable ? '' : 'disabled'}>
            <span class="resource-main">
                <span class="resource-title-line">
                    <span class="resource-title">${escapeHtml(profile.name)}</span>
                    ${isDefaultProfile ? `<span class="resource-default-tag">${isDefaultSelected ? '默认主检测' : '默认通道'}</span>` : ''}
                    ${hasKey ? '<span class="resource-status-tag online">已连接</span>' : '<span class="resource-status-tag warning">缺少 Key</span>'}
                </span>
                <span class="resource-meta">
                    ${getPlatformName(profile.provider)} · ${escapeHtml(getModelDisplayName(profile.provider, profile.model))}
                </span>
                <span class="resource-chip-row">
                    ${getModelTraitHtml(profile.model)}
                    <span class="model-trait muted">并发 ${getProfileConcurrency(profile)}</span>
                    ${disabledReason ? `<span class="model-trait warning">${escapeHtml(disabledReason)}</span>` : ''}
                </span>
            </span>
        `;

        const checkbox = label.querySelector('input');
        checkbox.addEventListener('change', () => {
            if (checkbox.checked) {
                nextSelectedIds.add(profile.id);
            } else {
                nextSelectedIds.delete(profile.id);
            }
            label.classList.toggle('selected', checkbox.checked);
            onChange(new Set(nextSelectedIds));
        });

        container.appendChild(label);
    });

    onChange(new Set(nextSelectedIds));
    return nextSelectedIds;
}

function getDefaultSelectedTranslationProfiles(selectedIds) {
    const usableProfiles = getUsableTranslationProfiles();
    const usableIds = new Set(usableProfiles.map(profile => profile.id));
    const selectedSet = new Set([...selectedIds].filter(id => usableIds.has(id)));

    if (selectedSet.size === 0 && usableProfiles.length > 0) {
        const activeProfile = getActiveApiProfile();
        const defaultProfile = usableProfiles.find(profile => activeProfile && profile.id === activeProfile.id) || usableProfiles[0];
        selectedSet.add(defaultProfile.id);
    }

    return selectedSet;
}

function renderTranslationProfileChecklist(container, selectedIds, onChange, emptyText) {
    const profiles = loadApiProfiles();
    const nextSelectedIds = getDefaultSelectedTranslationProfiles(selectedIds);
    container.innerHTML = '';

    if (profiles.length === 0) {
        container.innerHTML = `<div class="resource-empty">${emptyText || '暂无 API 通道。请先在顶部“API 配置”中保存至少一个通道。'}</div>`;
        onChange(nextSelectedIds);
        return nextSelectedIds;
    }

    profiles.forEach(profile => {
        const compatible = isApiProfileTranslationCompatible(profile);
        const hasKey = Boolean(profile.apiKey);
        const hasSecret = !isApiProfileTranslationOnly(profile) || Boolean(profile.apiSecret);
        const isUsable = compatible && hasKey && hasSecret;
        const disabledReason = !hasKey
            ? '未保存 API Key/应用 ID'
            : (!hasSecret ? '未保存应用密钥' : (!compatible ? '该平台当前不支持文本翻译' : ''));
        const label = document.createElement('label');
        label.className = `resource-check-item ai-channel-card ${nextSelectedIds.has(profile.id) ? 'selected' : ''} ${isUsable ? '' : 'disabled'}`;
        label.innerHTML = `
            ${getProviderMarkHtml(profile.provider)}
            <input type="checkbox" value="${profile.id}" ${nextSelectedIds.has(profile.id) ? 'checked' : ''} ${isUsable ? '' : 'disabled'}>
            <span class="resource-main">
                <span class="resource-title-line">
                    <span class="resource-title">${escapeHtml(profile.name)}</span>
                    ${hasKey ? '<span class="resource-status-tag online">已连接</span>' : '<span class="resource-status-tag warning">缺少 Key</span>'}
                    ${isApiProfileTranslationOnly(profile) ? '<span class="resource-status-tag">翻译专用</span>' : ''}
                </span>
                <span class="resource-meta">
                    ${getPlatformName(profile.provider)} · ${escapeHtml(getModelDisplayName(profile.provider, profile.model))}
                </span>
                <span class="resource-chip-row">
                    ${getModelTraitHtml(profile.model)}
                    <span class="model-trait muted">并发 ${getProfileConcurrency(profile)}</span>
                    ${disabledReason ? `<span class="model-trait warning">${escapeHtml(disabledReason)}</span>` : ''}
                </span>
            </span>
        `;

        const checkbox = label.querySelector('input');
        checkbox.addEventListener('change', () => {
            if (checkbox.checked) {
                nextSelectedIds.add(profile.id);
            } else {
                nextSelectedIds.delete(profile.id);
            }
            label.classList.toggle('selected', checkbox.checked);
            onChange(new Set(nextSelectedIds));
        });

        container.appendChild(label);
    });

    onChange(new Set(nextSelectedIds));
    return nextSelectedIds;
}

function initApiConfig() {
    const profileNameInput = document.getElementById('apiProfileName');
    const providerSelect = document.getElementById('apiProvider');
    const customModelInput = document.getElementById('apiCustomModel');
    const customModelRow = document.getElementById('apiCustomModelRow');
    const baseUrlInput = document.getElementById('baseUrl');
    const apiKeyInput = document.getElementById('apiKey');
    const apiKeyLabel = document.getElementById('apiKeyLabel');
    const apiSecretInput = document.getElementById('apiSecret');
    const apiSecretLabel = document.getElementById('apiSecretLabel');
    const apiSecretRow = document.getElementById('apiSecretRow');
    const concurrencyInput = document.getElementById('apiProfileConcurrency');
    const testBtn = document.getElementById('testApiProfileBtn');
    const saveBtn = document.getElementById('saveApiKeyBtn');
    const clearBtn = document.getElementById('clearApiKeyBtn');
    const apiStatus = document.getElementById('apiStatus');
    const toggleBtn = document.getElementById('toggleApiConfig');
    const closeBtn = document.getElementById('closeApiConfig');
    const configContent = document.getElementById('apiConfigContent');
    const baseUrlRow = document.getElementById('baseUrlRow');
    const globalAiModelSelect = document.getElementById('globalAiModel');
    const profileList = document.getElementById('apiProfileList');
    const profileCount = document.getElementById('apiProfileCount');
    let lastAppliedProvider = providerSelect.value;
    let editingProfileId = '';
    let isEditingProfile = false;
    let pendingDeleteProfileId = '';
    let pendingDeleteTimer = null;

    function bindSecretToggles() {
        document.querySelectorAll('.secret-toggle').forEach(button => {
            const input = document.getElementById(button.dataset.target);
            if (!input) return;

            const show = () => {
                input.type = 'text';
                button.classList.add('is-showing');
                button.title = '松开隐藏';
            };
            const hide = () => {
                input.type = 'password';
                button.classList.remove('is-showing');
                button.title = '按住显示';
            };

            button.addEventListener('mousedown', (event) => {
                event.preventDefault();
                show();
            });
            button.addEventListener('mouseup', hide);
            button.addEventListener('mouseleave', hide);
            button.addEventListener('touchstart', (event) => {
                event.preventDefault();
                show();
            }, { passive: false });
            button.addEventListener('touchend', hide);
            button.addEventListener('touchcancel', hide);
            button.addEventListener('keydown', (event) => {
                if (event.key === ' ' || event.key === 'Enter') {
                    event.preventDefault();
                    show();
                }
            });
            button.addEventListener('keyup', hide);
            button.addEventListener('blur', hide);
        });
    }

    function normalizeBaseUrlValue(value) {
        return (value || '').trim().replace(/\/+$/, '');
    }

    function isAnotherPlatformDefaultBaseUrl(provider, baseUrl) {
        const normalizedBaseUrl = normalizeBaseUrlValue(baseUrl);
        if (!normalizedBaseUrl) return false;

        return Object.entries(PLATFORM_CONFIG).some(([key, platform]) => {
            return key !== provider &&
                platform.baseUrl &&
                normalizeBaseUrlValue(platform.baseUrl) === normalizedBaseUrl;
        });
    }

    function updateCustomModelVisibility() {
        const provider = providerSelect.value;
        const shouldShow = platformAllowsCustomModel(provider) &&
            globalAiModelSelect?.value === CUSTOM_MODEL_OPTION;
        customModelRow.style.display = shouldShow ? 'flex' : 'none';
        if (!shouldShow) {
            customModelInput.value = '';
        }
    }

    function applyProviderDefaults(provider, options = {}) {
        const {
            useDefaultBaseUrl = true,
            showStatus = false,
            resetName = false,
            resetCredentials = false,
            resetEditing = false
        } = options;
        const platform = PLATFORM_CONFIG[provider] || PLATFORM_CONFIG.deepseek;

        providerSelect.value = PLATFORM_CONFIG[provider] ? provider : 'deepseek';
        if (resetEditing) {
            editingProfileId = '';
            isEditingProfile = false;
        }
        if (resetName) {
            profileNameInput.value = platform.name;
        }
        if (resetCredentials) {
            apiKeyInput.value = '';
            apiSecretInput.value = '';
        }
        if (useDefaultBaseUrl) {
            baseUrlInput.value = platform.baseUrl || '';
        }
        customModelInput.value = '';
        baseUrlInput.placeholder = platform.baseUrl || 'https://your-api-host/v1';
        if (apiKeyLabel) {
            apiKeyLabel.textContent = provider === 'youdaoTranslate' ? '应用 ID / appKey' : 'API Key';
        }
        apiKeyInput.placeholder = provider === 'youdaoTranslate' ? '有道应用 ID / appKey' : '必须填写您自己的 API Key';
        if (apiSecretLabel) {
            apiSecretLabel.textContent = provider === 'youdaoTranslate' ? '应用密钥 / appSecret' : 'API Secret';
        }
        apiSecretInput.placeholder = provider === 'youdaoTranslate' ? '有道应用密钥 / appSecret' : 'API Secret';
        apiSecretRow.style.display = provider === 'youdaoTranslate' ? 'flex' : 'none';
        if (provider !== 'youdaoTranslate') {
            apiSecretInput.value = '';
        }
        baseUrlRow.style.display = 'flex';
        updateModelSelect(providerSelect.value, true);
        updateCustomModelVisibility();
        lastAppliedProvider = providerSelect.value;

        if (showStatus) {
            apiStatus.textContent = '已切换平台，Base URL 和模型列表已更新，确认无误后请保存';
            apiStatus.className = 'api-status';
        }
    }

    function loadProfileToForm(profile, options = {}) {
        const { editing = false } = options;
        const normalized = normalizeApiProfile(profile || {
            provider: 'deepseek',
            name: getPlatformName('deepseek'),
            baseUrl: PLATFORM_CONFIG.deepseek.baseUrl,
            model: getDefaultModelForProvider('deepseek'),
            concurrency: 3
        });
        const platform = PLATFORM_CONFIG[normalized.provider] || PLATFORM_CONFIG.deepseek;
        const modelKnownToPlatform = (platform.models || []).some(item => item.id === normalized.model);

        editingProfileId = editing ? (normalized.id || '') : '';
        isEditingProfile = editing;
        profileNameInput.value = normalized.name || platform.name;
        providerSelect.value = normalized.provider;
        baseUrlInput.value = normalized.baseUrl || platform.baseUrl || '';
        baseUrlInput.placeholder = platform.baseUrl || 'https://your-api-host/v1';
        if (apiKeyLabel) {
            apiKeyLabel.textContent = normalized.provider === 'youdaoTranslate' ? '应用 ID / appKey' : 'API Key';
        }
        apiKeyInput.placeholder = normalized.provider === 'youdaoTranslate' ? '有道应用 ID / appKey' : '必须填写您自己的 API Key';
        apiKeyInput.value = normalized.apiKey || '';
        apiSecretInput.value = normalized.apiSecret || '';
        if (apiSecretLabel) {
            apiSecretLabel.textContent = normalized.provider === 'youdaoTranslate' ? '应用密钥 / appSecret' : 'API Secret';
        }
        apiSecretInput.placeholder = normalized.provider === 'youdaoTranslate' ? '有道应用密钥 / appSecret' : 'API Secret';
        apiSecretRow.style.display = normalized.provider === 'youdaoTranslate' ? 'flex' : 'none';
        customModelInput.value = '';
        concurrencyInput.value = getProfileConcurrency(normalized);
        baseUrlRow.style.display = 'flex';
        updateModelSelect(normalized.provider, true);
        if (globalAiModelSelect && normalized.model) {
            if (modelKnownToPlatform) {
                globalAiModelSelect.value = normalized.model;
                syncModelSelects(normalized.model);
            } else if (platformAllowsCustomModel(normalized.provider)) {
                globalAiModelSelect.value = CUSTOM_MODEL_OPTION;
                customModelInput.value = normalized.model;
            }
        }
        updateCustomModelVisibility();
        lastAppliedProvider = normalized.provider;
    }

    function getProfileFromForm() {
        const provider = providerSelect.value;
        const platform = PLATFORM_CONFIG[provider] || PLATFORM_CONFIG.deepseek;
        const selectedOption = globalAiModelSelect?.value || getDefaultModelForProvider(provider);
        const customModel = platformAllowsCustomModel(provider) && selectedOption === CUSTOM_MODEL_OPTION
            ? customModelInput.value.trim()
            : '';
        const selectedModel = customModel || (selectedOption === CUSTOM_MODEL_OPTION ? '' : selectedOption) || getDefaultModelForProvider(provider);
        const profileName = profileNameInput.value.trim() || platform.name;

        return normalizeApiProfile({
            id: editingProfileId || undefined,
            name: profileName,
            provider,
            apiKey: apiKeyInput.value.trim(),
            apiSecret: provider === 'youdaoTranslate' ? apiSecretInput.value.trim() : '',
            baseUrl: baseUrlInput.value.trim() || platform.baseUrl || '',
            model: selectedModel,
            concurrency: concurrencyInput.value,
            updatedAt: Date.now()
        });
    }

    function clearProfileForm() {
        editingProfileId = '';
        isEditingProfile = false;
        profileNameInput.value = '';
        apiKeyInput.value = '';
        apiSecretInput.value = '';
        customModelInput.value = '';
        concurrencyInput.value = '3';
        applyProviderDefaults('deepseek', { useDefaultBaseUrl: true, resetName: true });
    }

    function renderApiProfileList() {
        const profiles = loadApiProfiles();
        const activeProfile = getActiveApiProfile();
        profileCount.textContent = `${profiles.length} 个`;
        profileList.innerHTML = '';

        if (profiles.length === 0) {
            profileList.innerHTML = '<div class="resource-empty">暂无 API 通道。填写上方信息并点击“保存通道”后，本地化检测就可以勾选使用。</div>';
            return;
        }

        profiles.forEach(profile => {
            const compatible = isApiProfileChatCompatible(profile);
            const translationOnly = isApiProfileTranslationOnly(profile);
            const isActive = activeProfile && activeProfile.id === profile.id;
            const item = document.createElement('div');
            item.className = `api-profile-item ${isActive ? 'active' : ''}`;
            const deletePending = pendingDeleteProfileId === profile.id;
            item.innerHTML = `
                ${getProviderMarkHtml(profile.provider)}
                <div class="api-profile-main">
                    <div class="api-profile-title">
                        <strong title="${escapeAttribute(profile.name)}">${escapeHtml(profile.name)}</strong>
                        <span class="api-profile-tag">${isActive ? '默认' : getPlatformName(profile.provider)}</span>
                        ${profile.apiKey ? '<span class="api-profile-tag success">已保存 Key</span>' : '<span class="api-profile-tag warning">未填写 Key</span>'}
                        ${isGatewayProvider(profile.provider) ? '<span class="api-profile-tag gateway">中转网关</span>' : ''}
                        ${translationOnly ? '<span class="api-profile-tag">翻译专用</span>' : (compatible ? '' : '<span class="api-profile-tag warning">需单独适配</span>')}
                    </div>
                    <div class="api-profile-meta">
                        ${getPlatformName(profile.provider)} · ${escapeHtml(getModelDisplayName(profile.provider, profile.model))} · 并发 ${getProfileConcurrency(profile)}${translationOnly ? ` · ${profile.apiSecret ? '已保存 Secret' : '未填写 Secret'}` : ''}
                    </div>
                    <div class="resource-chip-row">
                        ${getModelTraitHtml(profile.model)}
                        <span class="model-trait muted">${getProviderProtocol(profile.provider)}</span>
                    </div>
                </div>
                <div class="api-profile-actions">
                    <button class="action-btn secondary mini" type="button" data-action="default">${isActive ? '默认中' : '设为默认'}</button>
                    <button class="action-btn secondary mini" type="button" data-action="test">测试</button>
                    <button class="action-btn secondary mini" type="button" data-action="edit">编辑</button>
                    <button class="action-btn mini danger ${deletePending ? 'confirm' : ''}" type="button" data-action="delete">${deletePending ? '确认删除' : '删除'}</button>
                </div>
            `;

            item.querySelector('[data-action="default"]').addEventListener('click', () => {
                setActiveApiProfile(profile);
                loadProfileToForm(profile);
                isEditingProfile = false;
                renderApiProfileList();
                apiStatus.textContent = `已设为默认通道：${profile.name}`;
                apiStatus.className = 'api-status success';
            });

            item.querySelector('[data-action="test"]').addEventListener('click', (event) => {
                testApiProfile(profile, event.currentTarget);
            });

            item.querySelector('[data-action="edit"]').addEventListener('click', () => {
                loadProfileToForm(profile, { editing: true });
                apiStatus.textContent = `正在编辑通道：${profile.name}`;
                apiStatus.className = 'api-status';
            });

            item.querySelector('[data-action="delete"]').addEventListener('click', () => {
                if (pendingDeleteProfileId !== profile.id) {
                    pendingDeleteProfileId = profile.id;
                    if (pendingDeleteTimer) {
                        clearTimeout(pendingDeleteTimer);
                    }
                    pendingDeleteTimer = setTimeout(() => {
                        if (pendingDeleteProfileId === profile.id) {
                            pendingDeleteProfileId = '';
                            renderApiProfileList();
                            apiStatus.textContent = '';
                        }
                    }, 5000);
                    renderApiProfileList();
                    apiStatus.textContent = `再次点击“确认删除”即可删除通道：${profile.name}`;
                    apiStatus.className = 'api-status error';
                    return;
                }

                if (pendingDeleteTimer) {
                    clearTimeout(pendingDeleteTimer);
                    pendingDeleteTimer = null;
                }
                pendingDeleteProfileId = '';

                const nextProfiles = loadApiProfiles().filter(item => item.id !== profile.id);
                saveApiProfiles(nextProfiles);
                if (localStorage.getItem(ACTIVE_API_PROFILE_KEY) === profile.id) {
                    if (nextProfiles[0]) {
                        setActiveApiProfile(nextProfiles[0]);
                        loadProfileToForm(nextProfiles[0]);
                    } else {
                        localStorage.removeItem(ACTIVE_API_PROFILE_KEY);
                        localStorage.removeItem('apiConfig');
                        clearProfileForm();
                    }
                }
                if (editingProfileId === profile.id) {
                    clearProfileForm();
                }
                renderApiProfileList();
                apiStatus.textContent = 'API 通道已删除';
                apiStatus.className = 'api-status success';
            });

            profileList.appendChild(item);
        });
    }

    function handleProviderChange() {
        if (providerSelect.value === lastAppliedProvider) return;

        applyProviderDefaults(providerSelect.value, {
            useDefaultBaseUrl: true,
            showStatus: true,
            resetName: true,
            resetCredentials: true,
            resetEditing: true
        });
    }

    loadApiConfig();
    renderApiProfileList();
    bindSecretToggles();

    providerSelect.addEventListener('input', handleProviderChange);
    providerSelect.addEventListener('change', handleProviderChange);
    providerSelect.addEventListener('blur', handleProviderChange);
    globalAiModelSelect.addEventListener('change', () => {
        updateCustomModelVisibility();
    });

    async function testApiProfile(profileInput, triggerButton = testBtn) {
        const profile = normalizeApiProfile(profileInput);
        if (!profile.apiKey) {
            apiStatus.textContent = profile.provider === 'youdaoTranslate' ? '请输入有道应用 ID / appKey' : '请输入 API Key';
            apiStatus.className = 'api-status error';
            return false;
        }
        if (profile.provider === 'youdaoTranslate') {
            apiStatus.textContent = '有道大模型翻译是专用翻译接口，当前不做通用模型连通性测试';
            apiStatus.className = 'api-status';
            return true;
        }
        if (!profile.model) {
            apiStatus.textContent = '请输入模型 ID';
            apiStatus.className = 'api-status error';
            return false;
        }

        const originalButtonText = triggerButton?.textContent || '';
        if (triggerButton) {
            triggerButton.disabled = true;
            triggerButton.textContent = '测试中';
        }
        apiStatus.textContent = `正在测试通道：${profile.name}`;
        apiStatus.className = 'api-status';
        let doubaoFallbackModel = '';
        try {
            await requestModelContent(profile, {
                model: profile.model,
                messages: [{ role: 'user', content: '不要推理，不要解释，请只回复 OK。' }],
                temperature: 0,
                max_tokens: getPreflightMaxTokens(profile, profile.model, 0)
            }, null, API_PREFLIGHT_TIMEOUT_MS, {
                reasoningEffort: 'minimal',
                onDoubaoModelFallback: ({ toModel }) => {
                    doubaoFallbackModel = toModel || '';
                }
            });
            apiStatus.textContent = doubaoFallbackModel
                ? `通道测试通过：${profile.name}（已自动改用可用模型 ${doubaoFallbackModel}，建议保存通道）`
                : `通道测试通过：${profile.name}`;
            apiStatus.className = 'api-status success';
            if (doubaoFallbackModel && profile.provider === 'doubao') {
                profile.model = doubaoFallbackModel;
                if (globalAiModelSelect && [...globalAiModelSelect.options].some(option => option.value === doubaoFallbackModel)) {
                    globalAiModelSelect.value = doubaoFallbackModel;
                    syncModelSelects(doubaoFallbackModel);
                } else if (globalAiModelSelect && platformAllowsCustomModel('doubao')) {
                    globalAiModelSelect.value = CUSTOM_MODEL_OPTION;
                    customModelInput.value = doubaoFallbackModel;
                    updateCustomModelVisibility();
                }
            }
            return true;
        } catch (error) {
            const familyHint = isGatewayProvider(profile.provider)
                ? '请确认这个 Key 属于当前选择的 AIGoCode 模型族，并支持第三方调用。'
                : profile.provider === 'xiaomi'
                    ? 'MiMo 使用官方 OpenAI-compatible 入口；如果仍失败，请确认已开通对应模型/插件服务，并检查 Key、模型权限和账户余额。'
                : profile.provider === 'doubao'
                    ? '豆包需要 Key + 正确模型 ID；请优先选择 doubao-seed-2-0-lite-260428，或填写火山方舟“API 接入”里显示的 ep-* 接入点 ID，Base URL 保持 https://ark.cn-beijing.volces.com/api/v3。'
                : '请检查 API Key、Base URL、模型权限或账户余额。';
            apiStatus.textContent = `通道测试失败：${error.message || '接口返回异常'} ${familyHint}`;
            apiStatus.className = 'api-status error';
            return false;
        } finally {
            if (triggerButton) {
                triggerButton.disabled = false;
                triggerButton.textContent = originalButtonText || '测试';
            }
        }
    }

    async function testCurrentProfile() {
        return testApiProfile(getProfileFromForm(), testBtn);
    }

    toggleBtn.addEventListener('click', () => {
        if (configContent.style.display === 'none') {
            configContent.style.display = 'grid';
            toggleBtn.textContent = '收起内容';
            toggleBtn.setAttribute('aria-expanded', 'true');
        } else {
            configContent.style.display = 'none';
            toggleBtn.textContent = '展开内容';
            toggleBtn.setAttribute('aria-expanded', 'false');
        }
    });
    closeBtn?.addEventListener('click', revealWorkspaceInspector);

    testBtn.addEventListener('click', () => {
        testCurrentProfile();
    });

    saveBtn.addEventListener('click', () => {
        const profile = getProfileFromForm();

        if (!profile.apiKey) {
            apiStatus.textContent = profile.provider === 'youdaoTranslate' ? '请输入有道应用 ID / appKey' : '请输入 API Key';
            apiStatus.className = 'api-status error';
            return;
        }
        if (profile.provider === 'youdaoTranslate' && !profile.apiSecret) {
            apiStatus.textContent = '请输入有道应用密钥 / appSecret';
            apiStatus.className = 'api-status error';
            return;
        }
        if (!profile.model) {
            apiStatus.textContent = '请输入模型 ID';
            apiStatus.className = 'api-status error';
            return;
        }

        const profiles = loadApiProfiles();
        const existingIndex = isEditingProfile
            ? profiles.findIndex(item => item.id === profile.id)
            : -1;
        if (isEditingProfile && existingIndex >= 0) {
            profiles[existingIndex] = profile;
        } else {
            const newProfile = normalizeApiProfile({
                ...profile,
                id: undefined,
                updatedAt: Date.now()
            });
            profiles.unshift(newProfile);
            Object.assign(profile, newProfile);
        }

        saveApiProfiles(profiles);
        setActiveApiProfile(profile);
        editingProfileId = '';
        isEditingProfile = false;
        renderApiProfileList();

        const savedProfileName = profile.name;
        const savedTranslationOnly = isApiProfileTranslationOnly(profile);
        const savedChatCompatible = isApiProfileChatCompatible(profile);
        clearProfileForm();

        apiStatus.textContent = savedTranslationOnly
            ? '有道翻译通道保存成功，可在文本翻译中勾选使用'
            : (savedChatCompatible
            ? 'API 通道保存成功'
            : 'API 通道已保存，但该平台当前不参与 AI 检测');
        apiStatus.textContent += `：${savedProfileName}`;
        apiStatus.className = 'api-status success';
        renderApiSummary();
        setTimeout(() => {
            apiStatus.textContent = '';
        }, 2000);
    });

    clearBtn.addEventListener('click', () => {
        clearProfileForm();
        renderApiSummary();
        apiStatus.textContent = '已清空表单，已保存通道不会被删除';
        apiStatus.className = 'api-status';
        setTimeout(() => {
            apiStatus.textContent = '';
        }, 2000);
    });

    function loadApiConfig() {
        const profiles = loadApiProfiles();
        if (profiles.length > 0) {
            if (!localStorage.getItem(API_PROFILES_KEY)) {
                saveApiProfiles(profiles);
            }
            const activeProfile = getActiveApiProfile() || profiles[0];
            setActiveApiProfile(activeProfile);
            loadProfileToForm(activeProfile);
        } else {
            applyProviderDefaults('deepseek', { useDefaultBaseUrl: true });
        }
    }
}

function getApiConfig() {
    const activeProfile = getActiveApiProfile();
    if (activeProfile) {
        return {
            profileId: activeProfile.id,
            provider: activeProfile.provider,
            apiKey: activeProfile.apiKey,
            apiSecret: activeProfile.apiSecret,
            baseUrl: activeProfile.baseUrl,
            model: activeProfile.model,
            name: activeProfile.name,
            concurrency: activeProfile.concurrency
        };
    }

    const legacy = loadLegacyApiConfig();
    if (legacy) {
        return legacy;
    }

    return { provider: 'deepseek', apiKey: '', baseUrl: 'https://api.deepseek.com' };
}

function revealApiConfigPanel() {
    const panel = document.getElementById('apiConfigPanel');
    const content = document.getElementById('apiConfigContent');
    const apiKeyInput = document.getElementById('apiKey');
    const inspector = document.getElementById('workspaceInspector');

    if (panel) {
        panel.style.display = 'block';
        panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    if (inspector) {
        inspector.style.display = 'none';
    }

    if (content) {
        content.style.display = 'grid';
    }
    const toggleBtn = document.getElementById('toggleApiConfig');
    if (toggleBtn) {
        toggleBtn.textContent = '收起内容';
        toggleBtn.setAttribute('aria-expanded', 'true');
    }

    if (apiKeyInput) {
        setTimeout(() => apiKeyInput.focus(), 350);
    }
}

function ensureApiKeyConfigured(featureName) {
    const apiConfig = getApiConfig();
    const apiKey = String(apiConfig.apiKey || '').trim();
    if (apiKey && isApiProfileChatCompatible(apiConfig)) return true;

    setStatus(
        'error',
        apiKey ? '当前默认通道不能用于 AI 检测/提取' : '未添加 API Key',
        apiKey
            ? `${featureName} 需要 Chat Completions 兼容通道。有道智云大模型翻译只用于“文本翻译”，请切换或新增 DeepSeek/Gemini/通义等 AI 通道。`
            : `${featureName} 需要先在顶部 API 配置区域新增并保存至少一个可用 API 通道，然后再开始执行。`,
        revealApiConfigPanel,
        '去配置'
    );
    revealApiConfigPanel();
    return false;
}

function getApiBaseUrl(provider, configBaseUrl) {
    const platform = PLATFORM_CONFIG[provider];
    if (configBaseUrl && configBaseUrl.trim()) {
        return normalizeProviderBaseUrl(provider, configBaseUrl);
    }
    if (platform && platform.baseUrl) {
        return normalizeProviderBaseUrl(provider, platform.baseUrl);
    }
    return PLATFORM_CONFIG.deepseek.baseUrl;
}

function getChatCompletionsEndpoint(provider, baseUrl) {
    const platform = PLATFORM_CONFIG[provider];
    if (platform && (platform.translationOnly || platform.chatCompletions === false)) {
        throw new Error(`${platform.name} 不是 OpenAI Chat Completions 兼容接口，当前工具暂不支持把它用于 AI 检测/提取`);
    }

    const normalized = normalizeProviderBaseUrl(provider, baseUrl || PLATFORM_CONFIG.deepseek.baseUrl);
    if (/\/chat\/completions$/i.test(normalized)) {
        return normalized;
    }

    const url = new URL(normalized);
    const path = url.pathname.replace(/\/+$/, '');
    const alreadyVersioned = /(^|\/)(v1|v1beta|api\/v3|compatible-mode\/v1|openai)$/i.test(path);
    url.pathname = `${path}${alreadyVersioned ? '' : '/v1'}/chat/completions`.replace(/\/{2,}/g, '/');
    return url.toString();
}

function getOpenAiResponsesEndpoint(provider, baseUrl) {
    const normalized = normalizeProviderBaseUrl(provider, baseUrl || PLATFORM_CONFIG.deepseek.baseUrl);
    if (/\/responses$/i.test(normalized)) {
        return normalized;
    }

    const url = new URL(normalized);
    const path = url.pathname.replace(/\/+$/, '');
    const alreadyVersioned = /(^|\/)v1$/i.test(path);
    url.pathname = `${path}${alreadyVersioned ? '' : '/v1'}/responses`.replace(/\/{2,}/g, '/');
    return url.toString();
}

function getAnthropicMessagesEndpoint(provider, baseUrl) {
    const normalized = normalizeProviderBaseUrl(provider, baseUrl || 'https://api.anthropic.com/v1');
    if (/\/messages$/i.test(normalized)) {
        return normalized;
    }

    const url = new URL(normalized);
    const path = url.pathname.replace(/\/+$/, '');
    const alreadyVersioned = /(^|\/)v1$/i.test(path);
    url.pathname = `${path}${alreadyVersioned ? '' : '/v1'}/messages`.replace(/\/{2,}/g, '/');
    return url.toString();
}

function getGeminiGenerateContentEndpoint(provider, baseUrl, model) {
    const normalized = normalizeProviderBaseUrl(provider, baseUrl || 'https://generativelanguage.googleapis.com/v1beta');
    if (/:generateContent$/i.test(normalized)) {
        return normalized;
    }

    const url = new URL(normalized);
    const path = url.pathname.replace(/\/+$/, '');
    const modelPath = encodeURIComponent(model || getDefaultModelForProvider(provider)).replace(/%2F/g, '/');
    url.pathname = `${path}/models/${modelPath}:generateContent`.replace(/\/{2,}/g, '/');
    return url.toString();
}

function normalizeMessageText(content) {
    if (Array.isArray(content)) {
        return content.map(part => {
            if (typeof part === 'string') return part;
            return part?.text || part?.content || part?.output_text || '';
        }).join('');
    }
    return String(content || '');
}

function normalizePromptCacheControl(value) {
    if (!value) return null;
    if (typeof value === 'object') {
        return {
            type: value.type || 'ephemeral',
            ...(value.ttl ? { ttl: value.ttl } : {})
        };
    }
    return { type: 'ephemeral' };
}

function getMessageCacheControl(message, cacheEnabled = true) {
    if (!cacheEnabled) return null;
    return normalizePromptCacheControl(message?.cacheControl || message?.cache_control);
}

function splitSystemAndConversation(messages = [], options = {}) {
    const cacheEnabled = options.promptCache !== false;
    const systemBlocks = [];
    const conversation = [];

    messages.forEach(message => {
        const role = message?.role || 'user';
        const text = normalizeMessageText(message?.content).trim();
        if (!text) return;
        const cacheControl = getMessageCacheControl(message, cacheEnabled);
        if (role === 'system' || role === 'developer') {
            systemBlocks.push({ text, cacheControl });
        } else {
            conversation.push({
                role: role === 'assistant' ? 'assistant' : 'user',
                content: text,
                cacheControl
            });
        }
    });

    if (conversation.length === 0 && systemBlocks.length > 0) {
        conversation.push({
            role: 'user',
            content: systemBlocks.map(block => block.text).join('\n\n'),
            cacheControl: systemBlocks.some(block => block.cacheControl) ? { type: 'ephemeral' } : null
        });
        systemBlocks.length = 0;
    }

    return {
        systemText: systemBlocks.map(block => block.text).join('\n\n'),
        systemBlocks,
        conversation
    };
}

function createOpenAiResponsesBody(body, apiConfig = null) {
    const { systemText, conversation } = splitSystemAndConversation(body.messages || [], {
        promptCache: body.enable_prompt_cache !== false
    });
    const inputText = conversation.length === 1 && conversation[0].role === 'user'
        ? conversation[0].content
        : conversation.map(message => {
            const label = message.role === 'assistant' ? 'Assistant' : 'User';
            return `${label}: ${message.content}`;
        }).join('\n\n');

    const payload = {
        model: body.model,
        input: inputText || systemText || '',
        max_output_tokens: body.max_output_tokens || body.max_tokens || 1024
    };

    if (systemText && inputText) {
        payload.instructions = systemText;
    }
    if (Number.isFinite(Number(body.temperature)) && apiConfig?.provider !== 'aigocodeOpenai') {
        payload.temperature = Number(body.temperature);
    }
    if (apiConfig?.provider === 'aigocodeOpenai') {
        payload.store = false;
    }
    if (body.enable_prompt_cache !== false && apiConfig?.provider === 'openai' && body.prompt_cache_key) {
        payload.prompt_cache_key = body.prompt_cache_key;
    }

    return payload;
}

function normalizeChatMessagesForOpenAi(body) {
    return (body.messages || []).map(message => {
        const role = message?.role === 'assistant'
            ? 'assistant'
            : (message?.role === 'system' || message?.role === 'developer' ? 'system' : 'user');
        return {
            role,
            content: normalizeMessageText(message?.content)
        };
    }).filter(message => message.content);
}

function createAigocodeOpenAiChatBody(body, model) {
    const payload = {
        model,
        messages: normalizeChatMessagesForOpenAi(body),
        max_tokens: body.max_tokens || body.max_output_tokens || 1024
    };

    if (payload.messages.length === 0) {
        payload.messages.push({ role: 'user', content: '' });
    }

    return payload;
}

function createChatCompletionsBody(apiConfig, body) {
    const payload = { ...body };
    if (Array.isArray(body.messages)) {
        payload.messages = normalizeChatMessagesForOpenAi(body);
    }
    if (!payload.model) {
        payload.model = apiConfig?.model || getDefaultModelForProvider(apiConfig?.provider);
    }
    if (!Array.isArray(payload.messages) || payload.messages.length === 0) {
        payload.messages = [{ role: 'user', content: 'OK' }];
    }
    if (apiConfig?.provider === 'doubao') {
        payload.messages = normalizeChatMessagesForOpenAi({ messages: payload.messages });
        if (!Array.isArray(payload.messages) || payload.messages.length === 0) {
            payload.messages = [{ role: 'user', content: 'OK' }];
        }
        delete payload.reasoning_effort;
        delete payload.max_output_tokens;
    }
    if (apiConfig?.provider !== 'openai' || payload.enable_prompt_cache === false) {
        delete payload.prompt_cache_key;
        delete payload.prompt_cache_retention;
    }
    delete payload.enable_prompt_cache;
    return payload;
}

function shouldUseAigocodeResponses(model) {
    return /codex/i.test(String(model || ''));
}

function createAigocodeOpenAiChatRequest(apiConfig, body, model) {
    const baseUrl = getApiBaseUrl(apiConfig?.provider, apiConfig?.baseUrl);
    return {
        endpoint: getChatCompletionsEndpoint(apiConfig?.provider, baseUrl),
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiConfig.apiKey}`
        },
        body: createAigocodeOpenAiChatBody(body, model)
    };
}

function createAnthropicTextBlock(text, cacheControl = null) {
    return {
        type: 'text',
        text,
        ...(cacheControl ? { cache_control: cacheControl } : {})
    };
}

function createAnthropicMessagesBody(body) {
    const { systemText, systemBlocks, conversation } = splitSystemAndConversation(body.messages || [], {
        promptCache: body.enable_prompt_cache !== false
    });
    const hasCachedSystemBlock = systemBlocks.some(block => block.cacheControl);
    const payload = {
        model: body.model,
        max_tokens: body.max_tokens || body.max_output_tokens || 1024,
        messages: conversation.map(message => ({
            role: message.role === 'assistant' ? 'assistant' : 'user',
            content: [createAnthropicTextBlock(message.content, message.cacheControl)]
        }))
    };

    if (hasCachedSystemBlock) {
        payload.system = systemBlocks.map(block => createAnthropicTextBlock(block.text, block.cacheControl));
    } else if (systemText) {
        payload.system = systemText;
    }
    if (Number.isFinite(Number(body.temperature))) {
        payload.temperature = Number(body.temperature);
    }

    return payload;
}

function createGeminiGenerateContentBody(body) {
    const { systemText, conversation } = splitSystemAndConversation(body.messages || []);
    const payload = {
        contents: conversation.map(message => ({
            role: message.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: message.content }]
        })),
        generationConfig: {
            temperature: Number.isFinite(Number(body.temperature)) ? Number(body.temperature) : 0.2,
            maxOutputTokens: body.max_output_tokens || body.max_tokens || 1024
        }
    };

    if (systemText) {
        payload.systemInstruction = {
            parts: [{ text: systemText }]
        };
    }

    return payload;
}

function createOpenAiCompatibleHeaders(apiConfig) {
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiConfig.apiKey}`
    };
}

function createAnthropicCompatibleHeaders(apiConfig, options = {}) {
    const headers = {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01'
    };

    if (apiConfig?.provider === 'xiaomi') {
        headers['Authorization'] = `Bearer ${apiConfig.apiKey}`;
        return headers;
    }

    if (apiConfig?.provider === 'aigocodeClaude') {
        const authStyle = options.authStyle || 'x-api-key';
        if (authStyle === 'bearer') {
            headers['Authorization'] = `Bearer ${apiConfig.apiKey}`;
        } else if (authStyle === 'both') {
            headers['x-api-key'] = apiConfig.apiKey;
            headers['Authorization'] = `Bearer ${apiConfig.apiKey}`;
        } else {
            headers['x-api-key'] = apiConfig.apiKey;
        }
        return headers;
    }

    headers['x-api-key'] = apiConfig.apiKey;
    return headers;
}

function createProviderRequest(apiConfig, body, options = {}) {
    const provider = apiConfig?.provider || 'deepseek';
    const protocol = getProviderProtocol(provider);
    const baseUrl = getApiBaseUrl(provider, apiConfig?.baseUrl);
    const model = body.model || apiConfig?.model || getDefaultModelForProvider(provider);

    if (provider === 'aigocodeOpenai' && !shouldUseAigocodeResponses(model)) {
        return createAigocodeOpenAiChatRequest(apiConfig, body, model);
    }

    if (protocol === 'openai-responses') {
        return {
            endpoint: getOpenAiResponsesEndpoint(provider, baseUrl),
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiConfig.apiKey}`
            },
            body: createOpenAiResponsesBody({ ...body, model }, apiConfig)
        };
    }

    if (protocol === 'anthropic-messages') {
        return {
            endpoint: getAnthropicMessagesEndpoint(provider, baseUrl),
            headers: createAnthropicCompatibleHeaders(apiConfig, options.anthropicHeaders || {}),
            body: createAnthropicMessagesBody({ ...body, model })
        };
    }

    if (protocol === 'gemini-generate') {
        return {
            endpoint: getGeminiGenerateContentEndpoint(provider, baseUrl, model),
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': apiConfig.apiKey
            },
            body: createGeminiGenerateContentBody({ ...body, model })
        };
    }

    return {
        endpoint: getChatCompletionsEndpoint(provider, baseUrl),
        headers: createOpenAiCompatibleHeaders(apiConfig),
        body: createChatCompletionsBody(apiConfig, body)
    };
}

function getApiResponseErrorMessage(payload, rawText, fallback = '接口返回异常') {
    const code = payload?.error?.code ?? payload?.code;
    const status = payload?.error?.status ?? payload?.status;
    const rawMessage = payload?.error?.message || payload?.message || payload?.msg || rawText || fallback;
    const retryDelayMs = getApiRetryDelayMs(payload, rawText);
    const text = `${rawMessage || ''} ${rawText || ''}`;
    const numericCode = Number(code);

    if (isApiRateLimitSignal(code, status, rawMessage, rawText)) {
        const retryText = retryDelayMs > 0 ? `；接口建议约 ${Math.ceil(retryDelayMs / 1000)} 秒后再试` : '';
        return `额度或频率已达到限制${retryText}。原始提示：${rawMessage}`;
    }

    if (numericCode === 503 || status === 'UNAVAILABLE' || /high demand|UNAVAILABLE|overloaded|temporar|try again later/i.test(text)) {
        return `模型服务当前繁忙或临时不可用，通常不是 API Key 错误。建议稍后重试，或临时切换到同系列 Flash/其他可用模型。原始提示：${rawMessage}`;
    }

    if (/thinking level .*not supported|reasoning.*not supported|minimal is not supported/i.test(text)) {
        return `该模型不支持当前测试请求的思考等级参数，工具会改用兼容参数后重试。原始提示：${rawMessage}`;
    }

    if (/no available accounts/i.test(text)) {
        return `AIGoCode 当前没有可用账号承接这个模型请求。请在 AIGoCode 后台确认该 Key 属于所选模型族、已开启第三方调用，并尝试切换到文档推荐的 Claude Opus 4.6。原始提示：${rawMessage}`;
    }

    const message = rawMessage ||
        payload?.error?.details?.[0]?.reason ||
        payload?.message ||
        payload?.msg ||
        rawText ||
        fallback;

    return String(message).replace(/\s+/g, ' ').trim();
}

function isApiRateLimitSignal(code, status, message = '', rawText = '') {
    const numericCode = Number(code);
    const numericStatus = Number(status);
    const text = `${message || ''} ${rawText || ''}`;
    return numericCode === 429 ||
        numericCode === 411 ||
        numericStatus === 429 ||
        status === 'RESOURCE_EXHAUSTED' ||
        /quota|rate.?limit|qps|RESOURCE_EXHAUSTED|频率|限流|访问频率/i.test(text);
}

function parseRetryDelayMs(value) {
    const text = String(value || '').trim();
    if (!text) return 0;

    const secondsMatch = text.match(/^([\d.]+)s$/i);
    if (secondsMatch) {
        return Math.ceil(Number(secondsMatch[1]) * 1000);
    }

    const millisMatch = text.match(/^([\d.]+)ms$/i);
    if (millisMatch) {
        return Math.ceil(Number(millisMatch[1]));
    }

    return 0;
}

function getApiRetryDelayMs(payload, rawText = '') {
    const details = Array.isArray(payload?.error?.details) ? payload.error.details : [];
    for (const detail of details) {
        const retryDelay = detail?.retryDelay || detail?.retry_delay;
        const delayMs = parseRetryDelayMs(retryDelay);
        if (delayMs > 0) return delayMs;
    }

    const text = `${payload?.error?.message || payload?.message || payload?.msg || ''} ${rawText || ''}`;
    const retryMatch = text.match(/retry\s+in\s+([\d.]+)\s*s/i);
    if (retryMatch) {
        return Math.ceil(Number(retryMatch[1]) * 1000);
    }

    return 0;
}

function isPromptCacheUnsupportedError(error) {
    const text = `${error?.message || ''} ${error?.rawText || ''}`;
    return /cache_control|prompt_cache|prompt.?cache|cache key|unsupported.*cache|unknown parameter.*cache|invalid.*cache/i.test(text);
}

function isAigocodeNoAvailableAccountsError(error) {
    const text = `${error?.message || ''} ${error?.rawText || ''}`;
    return /no available accounts/i.test(text);
}

function hasPromptCacheMetadata(body = {}) {
    if (body.prompt_cache_key || body.prompt_cache_retention) return true;
    return (body.messages || []).some(message => message?.cacheControl || message?.cache_control);
}

function withoutPromptCaching(body = {}) {
    const copy = { ...body };
    copy.enable_prompt_cache = false;
    delete copy.prompt_cache_key;
    delete copy.prompt_cache_retention;
    copy.messages = (body.messages || []).map(message => {
        const next = { ...message };
        delete next.cacheControl;
        delete next.cache_control;
        return next;
    });
    return copy;
}

async function tryDoubaoModelFallback(apiConfig, tunedBody, currentModel, signal, timeoutMs, responseConfig, originalError, options = {}) {
    if (apiConfig?.provider !== 'doubao' || options.disableDoubaoModelFallback || !isDoubaoModelAccessError(originalError)) {
        return null;
    }

    const fallbackModels = getDoubaoFallbackModels(currentModel);
    const failedModels = [];
    for (const fallbackModel of fallbackModels) {
        try {
            const fallbackConfig = { ...apiConfig, model: fallbackModel };
            const fallbackBody = { ...tunedBody, model: fallbackModel };
            const fallbackRequest = createProviderRequest(fallbackConfig, fallbackBody);
            const fallbackResponse = await postChatCompletion(
                fallbackConfig,
                fallbackRequest.endpoint,
                fallbackRequest.body,
                signal,
                timeoutMs,
                fallbackRequest.headers
            );
            const content = await readModelResponseContent(fallbackResponse, { ...responseConfig, model: fallbackModel });
            if (typeof options.onDoubaoModelFallback === 'function') {
                options.onDoubaoModelFallback({
                    fromModel: currentModel,
                    toModel: fallbackModel
                });
            }
            return { content, model: fallbackModel };
        } catch (fallbackError) {
            failedModels.push(`${fallbackModel}: ${fallbackError?.message || 'failed'}`);
            if (!isDoubaoModelAccessError(fallbackError)) {
                throw fallbackError;
            }
        }
    }

    const error = new Error(
        `豆包当前模型 ${currentModel} 不可用，已尝试 ${fallbackModels.join('、')} 仍失败。` +
        `请使用火山方舟控制台“API 调用/推理接入点”显示的模型 ID 或 ep-* 接入点 ID。原始错误：${originalError?.message || 'model unavailable'}`
    );
    error.status = originalError?.status;
    error.payload = originalError?.payload;
    error.rawText = [originalError?.rawText, failedModels.join(' | ')].filter(Boolean).join(' | ');
    error.retryAfterMs = originalError?.retryAfterMs || 0;
    error.isRateLimited = originalError?.isRateLimited || false;
    throw error;
}

function createApiRequestError(message, status, payload, rawText) {
    const error = new Error(message);
    const code = payload?.error?.code ?? payload?.code;
    const payloadStatus = payload?.error?.status ?? payload?.status;
    error.status = status;
    error.payload = payload;
    error.rawText = rawText;
    error.retryAfterMs = getApiRetryDelayMs(payload, rawText);
    error.isRateLimited = isApiRateLimitSignal(code, status || payloadStatus, message, rawText);
    error.isTemporary = status === 500 ||
        status === 502 ||
        status === 503 ||
        payloadStatus === 'UNAVAILABLE' ||
        /high demand|UNAVAILABLE|overloaded|temporar|try again later/i.test(`${message || ''} ${rawText || ''}`);
    return error;
}

function normalizeChatContent(content) {
    if (Array.isArray(content)) {
        return content.map(part => {
            if (typeof part === 'string') return part;
            return part?.text || part?.content || part?.output_text || '';
        }).join('');
    }
    return String(content || '');
}

function extractChatCompletionContent(payload) {
    const choice = payload?.choices?.[0];
    const content = normalizeChatContent(choice?.message?.content ?? choice?.text ?? '');
    return content.trim();
}

function extractOpenAiResponsesContent(payload) {
    if (typeof payload?.output_text === 'string') {
        return payload.output_text.trim();
    }

    const output = Array.isArray(payload?.output) ? payload.output : [];
    const text = output.flatMap(item => Array.isArray(item?.content) ? item.content : [])
        .map(part => part?.text || part?.content || part?.output_text || '')
        .join('');
    return text.trim();
}

function extractAnthropicMessagesContent(payload) {
    const content = Array.isArray(payload?.content) ? payload.content : [];
    return content.map(part => {
        if (typeof part === 'string') return part;
        return part?.text || '';
    }).join('').trim();
}

function extractGeminiGenerateContent(payload) {
    const parts = payload?.candidates?.[0]?.content?.parts;
    if (!Array.isArray(parts)) return '';
    return parts.map(part => part?.text || '').join('').trim();
}

function getProviderFinishReason(payload, protocol) {
    if (protocol === 'openai-responses') {
        return payload?.status === 'incomplete'
            ? (payload?.incomplete_details?.reason || 'incomplete')
            : '';
    }
    if (protocol === 'anthropic-messages') {
        return payload?.stop_reason || '';
    }
    if (protocol === 'gemini-generate') {
        return payload?.candidates?.[0]?.finishReason || '';
    }
    return payload?.choices?.[0]?.finish_reason || payload?.choices?.[0]?.finishReason || '';
}

function extractProviderContent(payload, apiConfig) {
    const protocol = getProviderProtocol(apiConfig?.provider);
    if (protocol === 'openai-responses') {
        return extractOpenAiResponsesContent(payload);
    }
    if (protocol === 'anthropic-messages') {
        return extractAnthropicMessagesContent(payload);
    }
    if (protocol === 'gemini-generate') {
        return extractGeminiGenerateContent(payload);
    }
    return extractChatCompletionContent(payload);
}

async function readModelResponseContent(response, apiConfig) {
    const rawText = await response.text();
    let payload = null;

    try {
        payload = rawText ? JSON.parse(rawText) : null;
    } catch {
        payload = null;
    }

    if (!response.ok) {
        throw createApiRequestError(
            getApiResponseErrorMessage(payload, rawText, `HTTP ${response.status}`),
            response.status,
            payload,
            rawText
        );
    }

    const content = extractProviderContent(payload, apiConfig);
    if (!content) {
        const protocol = getProviderProtocol(apiConfig?.provider);
        const finishReason = getProviderFinishReason(payload, protocol);
        const reasonText = finishReason ? `，finish_reason: ${finishReason}` : '';
        const error = new Error(`接口返回为空${reasonText}`);
        error.finishReason = finishReason;
        error.isOutputTruncated = /length|MAX_TOKENS|max_tokens|incomplete|max_output/i.test(String(finishReason || ''));
        error.isEmptyEndTurn = /end_turn/i.test(String(finishReason || ''));
        throw error;
    }

    return content;
}

async function readChatCompletionContent(response) {
    return readModelResponseContent(response, { provider: 'openai' });
}

function createTextResponse(status, body) {
    return {
        ok: status >= 200 && status < 300,
        status,
        async text() {
            return body || '';
        }
    };
}

function isGeminiProfile(apiConfig) {
    return apiConfig?.provider === 'gemini' || getProviderProtocol(apiConfig?.provider) === 'gemini-generate';
}

function isReasoningHeavyModel(model = '') {
    return /reasoner|reasoning|thinking|v4-pro|v2-pro|mimo-v2|claude|opus|sonnet|gpt-5|r1|o1|o3|o4|gemini-3/i.test(String(model || ''));
}

function getPreflightMaxTokens(apiConfig, model, attempt = 0) {
    if (apiConfig?.provider === 'xiaomi') return attempt > 0 ? 128 : 32;
    if (isGatewayProvider(apiConfig?.provider)) return attempt > 0 ? 128 : 32;
    if (isGeminiProfile(apiConfig)) return attempt > 0 ? 4096 : 2048;
    if (isReasoningHeavyModel(model)) return attempt > 0 ? 4096 : 2048;
    return attempt > 0 ? 1024 : 256;
}

function getChatOutputMaxTokens(apiConfig, model, taskCount = 1) {
    if (isGeminiProfile(apiConfig)) return 8192;
    if (isReasoningHeavyModel(model)) return 8192;
    return taskCount > 18 ? 6144 : 4096;
}

function getProviderReasoningEffort(apiConfig, requested = 'low') {
    const value = requested || 'low';
    if (isGeminiProfile(apiConfig) && value === 'minimal') {
        return 'low';
    }
    return value;
}

function withProviderChatTuning(apiConfig, body, options = {}) {
    if (!isGeminiProfile(apiConfig)) return body;
    const requestedReasoningEffort = body.reasoning_effort || options.reasoningEffort || 'low';

    return {
        ...body,
        reasoning_effort: getProviderReasoningEffort(apiConfig, requestedReasoningEffort)
    };
}

async function postChatCompletion(apiConfig, endpoint, body, signal = null, timeoutMs = API_REQUEST_TIMEOUT_MS, headers = null) {
    if (signal?.aborted) {
        throw createAbortError();
    }

    const invoke = window.__TAURI__?.core?.invoke;
    if (invoke) {
        const response = await withHardTimeout(
            invoke('post_chat_completion', {
                url: endpoint,
                apiKey: apiConfig.apiKey,
                body,
                timeoutMs,
                headers
            }),
            timeoutMs,
            signal
        );
        if (signal?.aborted) {
            throw createAbortError();
        }
        return createTextResponse(Number(response?.status || 0), String(response?.body || ''));
    }

    const requestController = new AbortController();
    let timedOut = false;
    const timeoutId = timeoutMs > 0
        ? setTimeout(() => {
            timedOut = true;
            requestController.abort();
        }, timeoutMs)
        : null;
    const abortFromParent = () => requestController.abort();

    if (signal) {
        signal.addEventListener('abort', abortFromParent, { once: true });
    }

    try {
        return await fetch(endpoint, {
            method: 'POST',
            signal: requestController.signal,
            headers: headers || {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiConfig.apiKey}`
            },
            body: JSON.stringify(body)
        });
    } catch (error) {
        if (timedOut && !signal?.aborted) {
            throw createApiTimeoutError(timeoutMs);
        }
        throw error;
    } finally {
        if (timeoutId) clearTimeout(timeoutId);
        if (signal) {
            signal.removeEventListener('abort', abortFromParent);
        }
    }
}

async function requestModelContent(apiConfig, body, signal = null, timeoutMs = API_REQUEST_TIMEOUT_MS, options = {}) {
    const tunedBody = withProviderChatTuning(apiConfig, body, options);
    const request = createProviderRequest(apiConfig, tunedBody);
    const model = tunedBody.model || apiConfig?.model || getDefaultModelForProvider(apiConfig?.provider);
    const responseConfig = apiConfig?.provider === 'aigocodeOpenai' && !shouldUseAigocodeResponses(model)
        ? { ...apiConfig, provider: 'openai' }
        : apiConfig;
    try {
        const response = await postChatCompletion(
            apiConfig,
            request.endpoint,
            request.body,
            signal,
            timeoutMs,
            request.headers
        );
        return readModelResponseContent(response, responseConfig);
    } catch (error) {
        if (hasPromptCacheMetadata(tunedBody) && isPromptCacheUnsupportedError(error)) {
            const uncachedBody = withoutPromptCaching(tunedBody);
            const uncachedRequest = createProviderRequest(apiConfig, uncachedBody);
            const uncachedResponse = await postChatCompletion(
                apiConfig,
                uncachedRequest.endpoint,
                uncachedRequest.body,
                signal,
                timeoutMs,
                uncachedRequest.headers
            );
            return readModelResponseContent(uncachedResponse, responseConfig);
        }

        const doubaoFallback = await tryDoubaoModelFallback(
            apiConfig,
            tunedBody,
            model,
            signal,
            timeoutMs,
            responseConfig,
            error,
            options
        );
        if (doubaoFallback) {
            return doubaoFallback.content;
        }

        const canRetryAsChat = apiConfig?.provider === 'aigocodeOpenai' &&
            shouldUseAigocodeResponses(model) &&
            /unsupported\s+content\s+type|content.?type/i.test(String(error?.message || error?.rawText || ''));
        if (!canRetryAsChat) {
            if (apiConfig?.provider === 'aigocodeClaude' && isAigocodeNoAvailableAccountsError(error)) {
                const bearerRequest = createProviderRequest(apiConfig, tunedBody, {
                    anthropicHeaders: { authStyle: 'bearer' }
                });
                const bearerResponse = await postChatCompletion(
                    apiConfig,
                    bearerRequest.endpoint,
                    bearerRequest.body,
                    signal,
                    timeoutMs,
                    bearerRequest.headers
                );
                return readModelResponseContent(bearerResponse, responseConfig);
            }
            throw error;
        }

        const fallbackRequest = createAigocodeOpenAiChatRequest(apiConfig, tunedBody, model);
        const fallbackResponse = await postChatCompletion(
            apiConfig,
            fallbackRequest.endpoint,
            fallbackRequest.body,
            signal,
            timeoutMs,
            fallbackRequest.headers
        );
        return readModelResponseContent(fallbackResponse, { ...apiConfig, provider: 'openai' });
    }
}

async function callAPI(prompt, model, provider) {
    const apiConfig = getApiConfig();
    const selectedModel = model || apiConfig.model || getDefaultModelForProvider(apiConfig.provider);

    if (!apiConfig.apiKey) {
        throw new Error('请先配置 API Key');
    }

    console.log('📡 准备调用API');
    console.log('📍 Base URL:', getApiBaseUrl(apiConfig.provider, apiConfig.baseUrl));
    console.log('🧠 Model:', selectedModel);
    console.log('🔑 API Key长度:', apiConfig.apiKey.length);

    return requestModelContent(apiConfig, {
        model: selectedModel,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3
    });
}

function updateModelSelect(provider, forceProviderDefault = false) {
    const aiModelSelect = document.getElementById('aiModel');
    const glossaryModelSelect = document.getElementById('glossaryModel');
    const organizeGlossaryModelSelect = document.getElementById('organizeGlossaryModel');
    const globalAiModelSelect = document.getElementById('globalAiModel');

    const platform = PLATFORM_CONFIG[provider];
    if (!platform) return;

    const models = platform.models.length > 0 ? [...platform.models] : [];
    if (platformAllowsCustomModel(provider)) {
        models.push({ id: CUSTOM_MODEL_OPTION, name: '手动输入模型 ID' });
    }
    if (models.length === 0) {
        models.push({ id: '', name: '未内置模型，请选择其他平台' });
    }

    [aiModelSelect, glossaryModelSelect, organizeGlossaryModelSelect, globalAiModelSelect].forEach(select => {
        if (!select) return;
        const currentValue = select.value;
        const hasCurrentModel = !forceProviderDefault && models.some(model => model.id === currentValue);
        const selectedValue = hasCurrentModel ? currentValue : models[0].id;

        select.innerHTML = models.map((model) => {
            const isSelected = selectedValue === model.id;
            const label = model.id ? `${model.name} (${model.id})` : model.name;
            return `<option value="${model.id}" ${isSelected ? 'selected' : ''}>${label}</option>`;
        }).join('');
        select.value = selectedValue;
    });
}

function syncModelSelects(selectedModel) {
    const aiModelSelect = document.getElementById('aiModel');
    const glossaryModelSelect = document.getElementById('glossaryModel');
    const organizeGlossaryModelSelect = document.getElementById('organizeGlossaryModel');

    [aiModelSelect, glossaryModelSelect, organizeGlossaryModelSelect].forEach(select => {
        if (!select) return;
        const hasModel = [...select.options].some(option => option.value === selectedModel);
        if (hasModel) {
            select.value = selectedModel;
        }
    });
}

function syncGlobalModel() {
    const globalAiModelSelect = document.getElementById('globalAiModel');
    if (!globalAiModelSelect) return;

    globalAiModelSelect.addEventListener('change', () => {
        const selectedModel = globalAiModelSelect.value;
        syncModelSelects(selectedModel);
    });
}

function initWorkbenchResizers() {
    const root = document.documentElement;
    const sidebarHandle = document.getElementById('sidebarResizeHandle');
    const panelHandle = document.getElementById('panelResizeHandle');

    function getStoredSize(key, fallback, min, max) {
        const raw = Number(localStorage.getItem(key));
        return Number.isFinite(raw) ? Math.min(max, Math.max(min, raw)) : fallback;
    }

    function setSize(name, key, value, min, max) {
        const next = Math.min(max, Math.max(min, value));
        root.style.setProperty(name, `${next}px`);
        localStorage.setItem(key, String(Math.round(next)));
    }

    setSize('--sidebar-width', 'nexus_sidebar_width', getStoredSize('nexus_sidebar_width', 236, 184, 300), 184, 300);
    setSize('--inspector-width', 'nexus_inspector_width', getStoredSize('nexus_inspector_width', 420, 340, 560), 340, 560);

    function installDrag(handle, onMove) {
        if (!handle) return;

        handle.addEventListener('pointerdown', (event) => {
            if (window.innerWidth < 1500 && handle === panelHandle) return;
            event.preventDefault();
            handle.setPointerCapture?.(event.pointerId);
            document.body.classList.add('is-resizing-layout');

            const move = (moveEvent) => onMove(moveEvent.clientX);
            const up = () => {
                document.body.classList.remove('is-resizing-layout');
                window.removeEventListener('pointermove', move);
                window.removeEventListener('pointerup', up);
            };

            window.addEventListener('pointermove', move);
            window.addEventListener('pointerup', up, { once: true });
        });
    }

    installDrag(sidebarHandle, (clientX) => {
        setSize('--sidebar-width', 'nexus_sidebar_width', clientX, 184, 300);
    });

    installDrag(panelHandle, (clientX) => {
        const contentRight = window.innerWidth - 24;
        setSize('--inspector-width', 'nexus_inspector_width', contentRight - clientX, 340, 560);
    });
}

function initCommandPalette({ showTool }) {
    const trigger = document.getElementById('commandSearchTrigger');
    const palette = document.getElementById('commandPalette');
    const input = document.getElementById('commandPaletteInput');
    const results = document.getElementById('commandPaletteResults');
    const closeButton = document.getElementById('commandPaletteClose');
    if (!trigger || !palette || !input || !results) return;

    let activeIndex = 0;
    let visibleCommands = [];

    const staticCommands = [
        {
            id: 'tool-split',
            title: '文件拆分',
            hint: '上传 CSV 或 Excel，按行数拆分并打包下载',
            group: '工具',
            keywords: 'split 文件 拆分 切分 csv excel xlsx',
            action: () => showTool('split')
        },
        {
            id: 'tool-translate',
            title: '文本翻译',
            hint: '批量翻译游戏文本，支持项目规则和术语表',
            group: '工具',
            keywords: 'translate 翻译 文本 ai 多语言 游戏 项目',
            action: () => showTool('translate')
        },
        {
            id: 'tool-convert',
            title: '格式转换',
            hint: '转换编码、分隔符和换行符',
            group: '工具',
            keywords: 'convert 格式 转换 编码 utf csv 分隔符 换行',
            action: () => showTool('convert')
        },
        {
            id: 'tool-l10n',
            title: '本地化检测',
            hint: '检查术语、变量、长度和译文质量',
            group: '工具',
            keywords: 'l10n 本地化 检测 质检 校对 检查 质量',
            action: () => showTool('l10n-check')
        },
        {
            id: 'tool-glossary',
            title: '术语表',
            hint: '提取、上传、恢复和管理项目术语表',
            group: '工具',
            keywords: 'glossary 术语 术语表 提取 上传 恢复 管理',
            action: () => showTool('glossary')
        },
        {
            id: 'tool-glossary-organize',
            title: '术语整理',
            hint: '合并重复项，整理已有术语表',
            group: '工具',
            keywords: 'organize 整理 术语 合并 去重 分类',
            action: () => showTool('glossary-organize')
        },
        {
            id: 'api-config',
            title: 'API 配置',
            hint: '打开 API 通道、平台、模型和 Key 设置',
            group: '设置',
            keywords: 'api key 模型 model 平台 provider gemini openai deepseek 配置 通道',
            action: () => {
                showTool('translate');
                setTimeout(() => revealApiConfigPanel(), 80);
            }
        },
        {
            id: 'project-section',
            title: '游戏项目',
            hint: '跳到文本翻译中的项目选择区',
            group: '设置',
            keywords: '项目 游戏 project 规则 标准 佣兵小镇',
            action: () => {
                showTool('translate');
                setTimeout(() => document.querySelector('.project-selector')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
            }
        }
    ];

    function getProjectCommands() {
        return loadTranslationProjectsFromStorage().map(project => ({
            id: `project-${project.id}`,
            title: project.name,
            hint: '选择这个游戏项目，并跳到文本翻译',
            group: '项目',
            keywords: `项目 游戏 project ${project.name} ${project.rules || ''}`,
            action: () => {
                showTool('translate');
                setDefaultTranslationProjectId(project.id);
                setTimeout(() => {
                    const safeProjectId = window.CSS?.escape ? CSS.escape(project.id) : String(project.id).replace(/"/g, '\\"');
                    const projectItem = document.querySelector(`[data-project-id="${safeProjectId}"]`);
                    if (projectItem) {
                        projectItem.click();
                        projectItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    } else {
                        document.querySelector('.project-selector')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                }, 120);
            }
        }));
    }

    function normalizeText(value) {
        return String(value || '').trim().toLowerCase();
    }

    function getCommands() {
        const deduped = new Map();
        [...staticCommands, ...getProjectCommands()].forEach(command => {
            if (!deduped.has(command.id)) deduped.set(command.id, command);
        });
        return [...deduped.values()];
    }

    function scoreCommand(command, query) {
        if (!query) return 1;
        const title = normalizeText(command.title);
        const group = normalizeText(command.group);
        const haystack = normalizeText(`${command.title} ${command.hint} ${command.group} ${command.keywords}`);
        if (title === query) return 100;
        if (title.includes(query)) return 80;
        if (group.includes(query)) return 60;
        if (haystack.includes(query)) return 40;
        return 0;
    }

    function renderResults() {
        const query = normalizeText(input.value);
        visibleCommands = getCommands()
            .map(command => ({ command, score: scoreCommand(command, query) }))
            .filter(item => item.score > 0)
            .sort((a, b) => b.score - a.score || a.command.title.localeCompare(b.command.title, 'zh-CN'))
            .slice(0, 12)
            .map(item => item.command);

        activeIndex = Math.min(activeIndex, Math.max(visibleCommands.length - 1, 0));

        if (visibleCommands.length === 0) {
            results.innerHTML = '<div class="command-empty">没有找到匹配项。可以试试“翻译”、“API”、“术语表”或项目名称。</div>';
            return;
        }

        results.innerHTML = visibleCommands.map((command, index) => `
            <button class="command-item ${index === activeIndex ? 'active' : ''}" type="button" data-command-index="${index}">
                <span class="command-item-main">
                    <strong>${escapeHtml(command.title)}</strong>
                    <small>${escapeHtml(command.hint || '')}</small>
                </span>
                <span class="command-item-group">${escapeHtml(command.group || '命令')}</span>
            </button>
        `).join('');

        results.querySelectorAll('[data-command-index]').forEach(button => {
            button.addEventListener('mouseenter', () => {
                activeIndex = Number(button.dataset.commandIndex) || 0;
                updateActiveResult();
            });
            button.addEventListener('pointerdown', (event) => {
                event.preventDefault();
                runActiveCommand(Number(button.dataset.commandIndex) || 0);
            });
        });
    }

    function updateActiveResult() {
        results.querySelectorAll('[data-command-index]').forEach(button => {
            const index = Number(button.dataset.commandIndex) || 0;
            button.classList.toggle('active', index === activeIndex);
        });
    }

    function openPalette() {
        palette.style.display = 'flex';
        palette.setAttribute('aria-hidden', 'false');
        input.value = '';
        activeIndex = 0;
        renderResults();
        requestAnimationFrame(() => input.focus());
    }

    function closePalette() {
        palette.style.display = 'none';
        palette.setAttribute('aria-hidden', 'true');
        input.value = '';
    }

    function runActiveCommand(index = activeIndex) {
        const command = visibleCommands[index];
        if (!command) return;
        closePalette();
        command.action();
    }

    trigger.addEventListener('click', openPalette);
    closeButton?.addEventListener('click', closePalette);
    palette.addEventListener('click', (event) => {
        if (event.target === palette) closePalette();
    });
    input.addEventListener('input', () => {
        activeIndex = 0;
        renderResults();
    });
    input.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            event.preventDefault();
            closePalette();
        } else if (event.key === 'ArrowDown') {
            event.preventDefault();
            activeIndex = Math.min(activeIndex + 1, visibleCommands.length - 1);
            renderResults();
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            activeIndex = Math.max(activeIndex - 1, 0);
            renderResults();
        } else if (event.key === 'Enter') {
            event.preventDefault();
            runActiveCommand();
        }
    });

    document.addEventListener('keydown', (event) => {
        const isMac = navigator.platform.toLowerCase().includes('mac');
        const isShortcut = (isMac ? event.metaKey : event.ctrlKey) && event.key.toLowerCase() === 'k';
        if (!isShortcut) return;
        event.preventDefault();
        if (palette.style.display === 'flex') closePalette();
        else openPalette();
    });
}

document.addEventListener('DOMContentLoaded', function() {
    const navItems = document.querySelectorAll('.nav-item');
    const tools = {
        split: document.getElementById('split-tool'),
        translate: document.getElementById('translate-tool'),
        convert: document.getElementById('convert-tool'),
        'l10n-check': document.getElementById('l10n-check-tool'),
        glossary: document.getElementById('glossary-tool'),
        'glossary-organize': document.getElementById('glossary-organize-tool')
    };

    const apiConfigPanel = document.getElementById('apiConfigPanel');
    const toolsRequiringApi = ['translate', 'l10n-check', 'glossary', 'glossary-organize'];
    const currentToolLabel = document.getElementById('currentToolLabel');
    const inspectorToolName = document.getElementById('inspectorToolName');
    const inspectorToolDesc = document.getElementById('inspectorToolDesc');
    const inspectorToolBadge = document.getElementById('inspectorToolBadge');
    const workspaceInspector = document.getElementById('workspaceInspector');
    const toolMeta = {
        split: {
            name: '文件拆分',
            badge: '本地处理',
            desc: '上传 CSV 或 Excel 文件，按行数拆分并打包下载。'
        },
        translate: {
            name: '文本翻译',
            badge: '需要 API',
            desc: '按项目、语言、术语表和模型通道批量翻译游戏文本。'
        },
        convert: {
            name: '格式转换',
            badge: '本地处理',
            desc: '转换编码、分隔符和换行符，输出干净的 CSV 或 Excel 文件。'
        },
        'l10n-check': {
            name: '本地化检测',
            badge: '需要 API',
            desc: '对照原文和译文，检查术语、变量、长度和语言质量。'
        },
        glossary: {
            name: '术语表',
            badge: '可用 API',
            desc: '提取、上传、恢复和管理项目术语表。'
        },
        'glossary-organize': {
            name: '术语整理',
            badge: '需要 API',
            desc: '整理已有术语表，合并重复项并生成审核后的最终术语表。'
        }
    };

    function showTool(targetTool) {
        navItems.forEach(i => {
            i.classList.toggle('active', i.dataset.tool === targetTool);
        });

        Object.values(tools).forEach(tool => {
            tool.style.display = 'none';
        });

        if (tools[targetTool]) {
            tools[targetTool].style.display = 'block';
        }

        const requiresApi = toolsRequiringApi.includes(targetTool);
        if (apiConfigPanel) apiConfigPanel.style.display = 'none';
        if (workspaceInspector) {
            workspaceInspector.style.display = 'grid';
        }

        const meta = toolMeta[targetTool] || toolMeta.split;
        if (currentToolLabel) currentToolLabel.textContent = meta.name;
        if (inspectorToolName) inspectorToolName.textContent = meta.name;
        if (inspectorToolDesc) inspectorToolDesc.textContent = meta.desc;
        if (inspectorToolBadge) inspectorToolBadge.textContent = meta.badge;
        if (inspectorToolBadge) inspectorToolBadge.classList.toggle('api-needed', requiresApi);
        const inputState = document.getElementById('inspectorInputState');
        const outputState = document.getElementById('inspectorOutputState');
        if (inputState) inputState.textContent = '等待文件';
        if (outputState) outputState.textContent = requiresApi ? 'AI 生成 / 本地导出' : '本地生成';
        updateInspectorEstimate([]);
        renderApiSummary();
    }

    navItems.forEach(item => {
        item.addEventListener('click', function() {
            showTool(this.dataset.tool);
        });
    });

    initApiConfig();
    syncGlobalModel();
    initWorkbenchResizers();
    installFileDropGuards();
    initCommandPalette({ showTool });
    bindUxFileTelemetry();
    enhanceDeepChoiceSurfaces();
    renderRecentTasks();
    renderApiSummary();
    document.getElementById('openApiConfigBtn')?.addEventListener('click', revealApiConfigPanel);
    document.querySelectorAll('[data-open-api-config]').forEach(button => {
        button.addEventListener('click', revealApiConfigPanel);
    });
    document.getElementById('clearRecentTasksBtn')?.addEventListener('click', () => {
        saveRecentTasks([]);
        renderRecentTasks();
    });
    document.querySelectorAll('[data-quick-tool]').forEach(button => {
        button.addEventListener('click', () => showTool(button.dataset.quickTool));
    });

    const activeTool = document.querySelector('.nav-item.active')?.dataset.tool || 'split';
    showTool(activeTool);

    if ('Notification' in window) {
        Notification.requestPermission();
    }

    initSplitTool();
    initTranslateTool();
    initConvertTool();
    initL10nCheckTool();
    initGlossaryTool();
    initGlossaryOrganizeTool();
});

function encodeCSVContent(content, encoding) {
    let bytes;
    let type;

    switch (encoding.toLowerCase()) {
        case 'gbk':
            if (typeof iconv !== 'undefined' && iconv.encode) {
                bytes = iconv.encode(content, 'GBK');
            } else {
                bytes = new TextEncoder().encode(content);
            }
            type = 'text/csv;charset=GBK';
            break;
        case 'gb2312':
            if (typeof iconv !== 'undefined' && iconv.encode) {
                bytes = iconv.encode(content, 'GB2312');
            } else {
                bytes = new TextEncoder().encode(content);
            }
            type = 'text/csv;charset=GB2312';
            break;
        case 'big5':
            if (typeof iconv !== 'undefined' && iconv.encode) {
                bytes = iconv.encode(content, 'Big5');
            } else {
                bytes = new TextEncoder().encode(content);
            }
            type = 'text/csv;charset=Big5';
            break;
        case 'utf-16':
            const utf16Buffer = new ArrayBuffer(content.length * 2);
            const utf16View = new Uint16Array(utf16Buffer);
            for (let i = 0; i < content.length; i++) {
                utf16View[i] = content.charCodeAt(i);
            }
            bytes = utf16Buffer;
            type = 'text/csv;charset=UTF-16';
            break;
        case 'utf-8':
        default:
            bytes = new TextEncoder().encode(content);
            type = 'text/csv;charset=UTF-8';
            break;
    }

    return { bytes, type };
}

const uploadDropHandlers = new Map();
const handledUploadDropEvents = new WeakSet();

function bindUploadDrop(uploadArea, fileInput, onFile) {
    const targets = [uploadArea, fileInput].filter(Boolean);
    uploadDropHandlers.set(uploadArea, onFile);

    const markActive = (e) => {
        if (!e.dataTransfer) return false;

        e.preventDefault();
        e.stopPropagation();

        if (e.dataTransfer) {
            e.dataTransfer.dropEffect = 'copy';
        }

        document.body.classList.add('file-drag-active');
        setActiveUploadArea(uploadArea);
        return true;
    };

    targets.forEach(target => {
        target.addEventListener('dragenter', (e) => {
            markActive(e);
        }, true);

        target.addEventListener('dragover', (e) => {
            markActive(e);
        }, true);

        target.addEventListener('dragleave', (e) => {
            if (!isFileDragEvent(e)) return;

            e.preventDefault();
            e.stopPropagation();
            uploadArea.classList.remove('dragover');
        }, true);

        target.addEventListener('drop', (e) => {
            if (handledUploadDropEvents.has(e)) return;
            handleUploadDropEvent(e, uploadArea, onFile);
        }, true);
    });
}

function isFileDragEvent(e) {
    if (!e.dataTransfer) return false;
    if (e.dataTransfer?.files?.length > 0) return true;

    const items = Array.from(e.dataTransfer?.items || []);
    if (items.some(item => item.kind === 'file')) return true;

    const types = Array.from(e.dataTransfer?.types || []).map(type => String(type).toLowerCase());
    return types.includes('files') ||
        types.includes('application/x-moz-file') ||
        types.includes('public.file-url') ||
        types.includes('public.url') ||
        types.includes('text/uri-list') ||
        types.some(type => type.includes('file'));
}

function getDroppedFile(e) {
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
        return files[0];
    }

    const items = e.dataTransfer?.items;
    if (!items) return null;

    for (const item of items) {
        if (item.kind === 'file') {
            const file = item.getAsFile();
            if (file) return file;
        }
    }

    return null;
}

function getUploadAreaFromDrop(e) {
    const targetArea = e.target.closest?.('.upload-area-large, .upload-area-small');
    if (targetArea) return targetArea;

    return getUploadAreaAtPoint(e.clientX, e.clientY);
}

function getUploadAreaAtPoint(clientX, clientY) {
    const pointTarget = document.elementFromPoint(clientX, clientY);
    const pointArea = pointTarget?.closest?.('.upload-area-large, .upload-area-small');
    if (pointArea) return pointArea;

    const visibleAreas = Array.from(document.querySelectorAll('.upload-area-large, .upload-area-small'))
        .filter(area => area.getClientRects().length > 0 && getComputedStyle(area).visibility !== 'hidden');

    return visibleAreas.length === 1 ? visibleAreas[0] : null;
}

function getUploadAreaFromTauriPosition(position) {
    const x = Number(position?.x || 0);
    const y = Number(position?.y || 0);
    const scale = window.devicePixelRatio || 1;

    return getUploadAreaAtPoint(x / scale, y / scale) ||
        getUploadAreaAtPoint(x, y);
}

function setActiveUploadArea(activeArea) {
    document.querySelectorAll('.upload-area-large, .upload-area-small').forEach((area) => {
        area.classList.toggle('dragover', area === activeArea);
    });
}

function clearUploadDragState() {
    document.body.classList.remove('file-drag-active');
    setActiveUploadArea(null);
}

function handleUploadDropEvent(e, uploadArea, onFile) {
    if (!e.dataTransfer) return false;

    e.preventDefault();
    e.stopPropagation();
    handledUploadDropEvents.add(e);
    clearUploadDragState();

    const file = getDroppedFile(e);
    if (!file) return false;

    if (typeof onFile === 'function' && onFile.length >= 2) {
        onFile(file, Array.from(e.dataTransfer?.files || []));
    } else {
        onFile(file);
    }
    return true;
}

function makeFileFromTauriPayload(payload, sourcePath) {
    const fileName = payload?.name || sourcePath.split(/[\\/]/).pop() || 'uploaded-file';
    const bytes = payload?.bytes instanceof Uint8Array ? payload.bytes : new Uint8Array(payload?.bytes || []);
    return new File([bytes], fileName);
}

async function installTauriFileDropBridge() {
    const tauri = window.__TAURI__;
    const getCurrentWebview = tauri?.webview?.getCurrentWebview;
    const invoke = tauri?.core?.invoke;

    if (!getCurrentWebview || !invoke) return;

    try {
        const webview = getCurrentWebview();
        await webview.onDragDropEvent(async (event) => {
            const payload = event.payload;

            if (payload.type === 'leave') {
                clearUploadDragState();
                return;
            }

            const uploadArea = getUploadAreaFromTauriPosition(payload.position);

            if (payload.type === 'enter' || payload.type === 'over') {
                document.body.classList.add('file-drag-active');
                setActiveUploadArea(uploadArea);
                return;
            }

            if (payload.type !== 'drop') return;

            clearUploadDragState();

            const handler = uploadArea ? uploadDropHandlers.get(uploadArea) : null;
            const path = payload.paths?.[0];
            if (!handler || !path) return;

            try {
                const droppedPayload = await invoke('read_dropped_file', { path });
                handler(makeFileFromTauriPayload(droppedPayload, path));
            } catch (error) {
                setStatus('error', '拖拽上传失败', String(error));
            }
        });
    } catch (error) {
        console.warn('Tauri drag/drop bridge is unavailable:', error);
    }
}

function installFileDropGuards() {
    installTauriFileDropBridge();

    document.addEventListener('dragenter', (e) => {
        if (!isFileDragEvent(e)) return;
        document.body.classList.add('file-drag-active');
    }, true);

    document.addEventListener('dragover', (e) => {
        if (!isFileDragEvent(e)) return;
        e.preventDefault();
        document.body.classList.add('file-drag-active');
        setActiveUploadArea(getUploadAreaFromDrop(e));
        if (e.dataTransfer) {
            e.dataTransfer.dropEffect = 'copy';
        }
    }, true);

    document.addEventListener('drop', (e) => {
        if (!isFileDragEvent(e)) return;

        const uploadArea = getUploadAreaFromDrop(e);
        const handler = uploadArea ? uploadDropHandlers.get(uploadArea) : null;

        if (uploadArea && handler && handleUploadDropEvent(e, uploadArea, handler)) {
            return;
        }

        e.preventDefault();
        clearUploadDragState();
    }, true);

    document.addEventListener('dragleave', (e) => {
        if (!isFileDragEvent(e)) return;

        const leftWindow = e.clientX <= 0 ||
            e.clientY <= 0 ||
            e.clientX >= window.innerWidth ||
            e.clientY >= window.innerHeight;

        if (leftWindow) {
            clearUploadDragState();
        }
    }, true);

    document.addEventListener('dragend', () => {
        clearUploadDragState();
    }, true);
}

function initSplitTool() {
    const uploadArea = document.getElementById('splitUploadArea');
    const fileInput = document.getElementById('splitFileInput');
    const fileInfo = document.getElementById('splitFileInfo');
    const progressSection = document.getElementById('splitProgressSection');
    const downloadSection = document.getElementById('splitDownloadSection');
    const downloadList = document.getElementById('splitDownloadList');
    const rowsPerFileInput = document.getElementById('rowsPerFile');
    const splitBtn = document.getElementById('splitBtn');
    const resetBtn = document.getElementById('splitResetBtn');
    const downloadAllBtn = document.getElementById('splitDownloadAllBtn');

    let sheetData = null;
    let originalFileName = '';
    let splitFiles = [];

    fileInput.addEventListener('click', (e) => e.stopPropagation());
    uploadArea.addEventListener('click', () => fileInput.click());
    bindUploadDrop(uploadArea, fileInput, handleSplitFile);

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleSplitFile(e.target.files[0]);
        }
    });

    rowsPerFileInput.addEventListener('input', updateSplitEstimate);
    splitBtn.addEventListener('click', startSplit);
    resetBtn.addEventListener('click', resetSplitTool);
    downloadAllBtn.addEventListener('click', downloadAllAsZip);

    async function handleSplitFile(file) {
        originalFileName = file.name.replace(/\.(csv|xlsx|xls)$/i, '');
        const extension = file.name.split('.').pop().toLowerCase();

        document.getElementById('splitFileName').textContent = file.name;
        document.getElementById('splitFileSize').textContent = formatFileSize(file.size);

        if (extension === 'csv') {
            const { text, encoding } = await readCSVWithEncoding(file);
            document.getElementById('splitFileEncoding').textContent = encoding;

            const result = XLSX.read(text, { type: 'string', cellDates: true });
            const sheetName = result.SheetNames[0];
            sheetData = XLSX.utils.sheet_to_json(result.Sheets[sheetName], { header: 1 });
        } else {
            document.getElementById('splitFileEncoding').textContent = 'N/A (Excel)';
            const arrayBuffer = await file.arrayBuffer();
            const result = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
            const sheetName = result.SheetNames[0];
            sheetData = XLSX.utils.sheet_to_json(result.Sheets[sheetName], { header: 1 });
        }

        document.getElementById('splitTotalRows').textContent = sheetData.length;
        document.getElementById('splitTotalCols').textContent = sheetData[0] ? sheetData[0].length : 0;

        updateSplitEstimate();
        fileInfo.style.display = 'block';
        downloadSection.style.display = 'none';
    }

    function updateSplitEstimate() {
        const totalRows = parseInt(document.getElementById('splitTotalRows').textContent) || 0;
        const rowsPerFile = parseInt(rowsPerFileInput.value) || 1;
        const estimated = Math.ceil(totalRows / rowsPerFile);
        document.getElementById('splitEstimatedFiles').textContent = estimated + ' 个文件';
    }

    async function startSplit() {
        const rowsPerFile = parseInt(rowsPerFileInput.value) || 1;
        const outputEncoding = document.getElementById('splitEncoding').value;
        const totalRows = sheetData?.length || 0;
        const totalFiles = Math.ceil(totalRows / rowsPerFile);

        progressSection.style.display = 'block';
        hideStatus();

        setStatus('processing', '正在拆分文件...', `预计生成 ${totalFiles} 个文件`);

        splitFiles = [];
        let currentRow = 0;
        let fileIndex = 1;

        try {
            while (currentRow < totalRows) {
                const endRow = Math.min(currentRow + rowsPerFile, totalRows);
                const chunkData = sheetData.slice(currentRow, endRow);

                const ws = XLSX.utils.aoa_to_sheet(chunkData);
                const csvContent = XLSX.utils.sheet_to_csv(ws);

                const { bytes, type } = encodeCSVContent(csvContent, outputEncoding);
                const blob = new Blob([bytes], { type: type });

                const fileName = `${originalFileName}_${fileIndex}.csv`;
                splitFiles.push({ name: fileName, blob: blob });

                currentRow = endRow;
                fileIndex++;

                const progress = Math.round(((fileIndex - 1) / totalFiles) * 100);
                updateSplitProgress(fileIndex - 1, totalFiles, progress);
                await new Promise(resolve => setTimeout(resolve, 10));
            }

            progressSection.style.display = 'none';
            downloadSection.style.display = 'block';

            downloadList.innerHTML = '';
            splitFiles.forEach((file) => {
                const item = document.createElement('div');
                item.className = 'download-item';

                const downloadBtn = document.createElement('button');
                downloadBtn.textContent = '下载';
                downloadBtn.addEventListener('click', () => downloadFile(file.blob, file.name));

                item.innerHTML = `<span>${file.name}</span>`;
                item.appendChild(downloadBtn);
                downloadList.appendChild(item);
            });

            setStatus('success', '拆分完成！', `已成功生成 ${splitFiles.length} 个文件`, function() {
                document.getElementById('split-tool').scrollIntoView({ behavior: 'smooth' });
            });

        } catch (error) {
            console.error('Split error:', error);
            setStatus('error', '拆分失败', error.message);
            progressSection.style.display = 'none';
        }
    }

    function updateSplitProgress(current, total, percent) {
        document.getElementById('splitProgressText').textContent = `${current} / ${total}`;
        document.getElementById('splitProgressPercent').textContent = `${percent}%`;
        document.getElementById('splitProgressFill').style.width = `${percent}%`;
    }

    function downloadFile(blob, fileName) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    async function downloadAllAsZip() {
        if (splitFiles.length === 0) {
            alert('没有文件可下载');
            return;
        }

        setStatus('processing', '正在打包文件...', '请稍候');

        try {
            const zip = new JSZip();

            for (const file of splitFiles) {
                const content = await file.blob.arrayBuffer();
                zip.file(file.name, content);
            }

            const zipBlob = await zip.generateAsync({ type: 'blob' });
            const zipFileName = `${originalFileName}_split.zip`;

            downloadFile(zipBlob, zipFileName);

            setStatus('success', '打包完成！', `已生成 ${zipFileName}`);
        } catch (error) {
            console.error('Zip error:', error);
            setStatus('error', '打包失败', error.message);
        }
    }

    function resetSplitTool() {
        sheetData = null;
        l10nSources = [];
        selectedSourceIds = new Set();
        originalFileName = '';
        splitFiles = [];

        fileInput.value = '';
        rowsPerFileInput.value = '5000';

        document.getElementById('splitTotalRows').textContent = '-';
        document.getElementById('splitTotalCols').textContent = '-';
        document.getElementById('splitEstimatedFiles').textContent = '-';

        downloadList.innerHTML = '';
        document.getElementById('splitProgressFill').style.width = '0%';

        fileInfo.style.display = 'none';
        progressSection.style.display = 'none';
        downloadSection.style.display = 'none';
    }
}

function initTranslateTool() {
    const uploadArea = document.getElementById('translateUploadArea');
    const fileInput = document.getElementById('translateFileInput');
    const fileInfo = document.getElementById('translateFileInfo');
    const columnSelectSection = document.getElementById('translateColumnSelect');
    const translateBtn = document.getElementById('translateBtn');
    const downloadBtn = document.getElementById('translateDownloadBtn');
    const resetBtn = document.getElementById('translateResetBtn');
    const confirmColumnBtn = document.getElementById('translateConfirmColumnBtn');
    const projectList = document.getElementById('projectList');
    const addProjectBtn = document.getElementById('addProjectBtn');
    const projectModal = document.getElementById('projectModal');
    const closeModalBtn = document.getElementById('closeModalBtn');
    const saveProjectBtn = document.getElementById('saveProjectBtn');
    const cancelProjectBtn = document.getElementById('cancelProjectBtn');
    const viewProjectBtn = document.getElementById('viewProjectBtn');
    const editProjectBtn = document.getElementById('editProjectBtn');
    const progressSection = document.getElementById('translateProgressSection');
    const downloadSection = document.getElementById('translateDownloadSection');
    const pauseBtn = document.getElementById('translatePauseBtn');
    const resumeBtn = document.getElementById('translateResumeBtn');
    const downloadProgressBtn = document.getElementById('translateDownloadProgressBtn');
    const downloadReportBtn = document.getElementById('translateDownloadReportBtn');
    const downloadFinalReportBtn = document.getElementById('translateDownloadFinalReportBtn');
    const retryFailedBtn = document.getElementById('translateRetryFailedBtn');
    const cancelTranslateBtn = document.getElementById('translateCancelBtn');
    const translateProfileList = document.getElementById('translateProfileList');
    const translateGlossaryList = document.getElementById('translateGlossaryList');
    const translateSheetSelectPanel = document.getElementById('translateSheetSelectPanel');
    const translateSheetSelectList = document.getElementById('translateSheetSelectList');
    const translateSheetSelectCount = document.getElementById('translateSheetSelectCount');
    const translatePostCheckInput = document.getElementById('translatePostCheck');

    let isPaused = false;
    let isTranslationCancelled = false;
    let currentTranslateAbortController = null;
    let activeTranslateRunId = null;
    let resumeResolvers = [];
    let selectedTranslateProfileIds = new Set();
    let translateSources = [];
    let selectedTranslateSourceIds = new Set();
    let selectedTranslateGlossaryIds = new Set();
    let translatedWorkbook = null;
    let translationRunReport = null;
    let failedTranslationTasks = [];
    let pendingRetryTranslationTasks = null;

    const DEFAULT_PROJECTS = [
        {
            id: 'yongbingxiaozhen',
            name: '佣兵小镇',
            rules: `翻译标准：
1. 翻译后的文本需要和ID完全对应
2. 如果出现^符号，可认为是,号（翻译后可用逗号代替）
3. 如果出现引用""''符号，翻译时不能使用英文的双引""符号，否则将出现报错，可使用英文、中文单引号，或中文双引号
4. 所有的%s%d文本都是代文本，实际游戏内根据功能有不同的正式文本，则翻译时，%s%d不可被替换，需要按照语义用在对应且正确的位置
5. 所有的色号代码不可被替换（如<color=#34cd3f>、</color>、<outline color=#2B183D width=2>等），只翻译文本即可
6. 所有的\\n都是代表游戏中换行，\\n不可被替换
7. 界面文本限制翻译后字数，尽量简短翻译，避免超框、显示不全等问题，可适当进行精简，只保留重要信息
8. 所有文本翻译为英文时最多乘中文字数3倍，即2字文本英文字符小于6，10字文本英文字符小于30，其他语言同理。`
        }
    ];

    let projects = [];
    let currentProject = null;
    let sheetData = null;
    let originalFileName = '';
    let translatedData = null;
    let translatedDataLocal = null;
    let selectedColumns = [];
    let successCount = 0;
    let failCount = 0;

    function makeTranslateSourceId(fileName, sheetName, index) {
        return `translate_source_${makeStableId(`${fileName}:${sheetName}:${index}`)}`;
    }

    function getSelectedTranslateSources() {
        return translateSources.filter(source => selectedTranslateSourceIds.has(source.id));
    }

    function rebuildTranslateSheetData() {
        const selectedSources = getSelectedTranslateSources();
        if (selectedSources.length === 0) {
            sheetData = null;
            return;
        }

        const firstRows = selectedSources.find(source => Array.isArray(source.rows) && source.rows.length > 0)?.rows || [];
        const header = Array.isArray(firstRows[0]) ? [...firstRows[0]] : [];
        sheetData = [header];

        selectedSources.forEach(source => {
            source.rowMap = new Map();
            const rows = Array.isArray(source.rows) ? source.rows.slice(1) : [];
            rows.forEach((row, rowOffset) => {
                sheetData.push(Array.isArray(row) ? [...row] : []);
                source.rowMap.set(sheetData.length - 1, rowOffset + 1);
            });
        });
    }

    function findTranslateSourceForRow(rowIndex) {
        return translateSources.find(source => source.rowMap?.has(rowIndex)) || null;
    }

    function getTranslateOriginalRowNumber(rowIndex) {
        const source = findTranslateSourceForRow(rowIndex);
        const originalRowIndex = source?.rowMap?.get(rowIndex) ?? rowIndex;
        return originalRowIndex + 1;
    }

    function getTranslateDisplaySourceName(source) {
        if (!source) return '';
        return source.sheetName && source.sheetName !== 'CSV'
            ? `${source.fileName} / ${source.sheetName}`
            : source.fileName;
    }

    function getTranslateSourceOutput(source) {
        if (!source.outputRows) {
            source.outputRows = (source.rows || []).map(row => Array.isArray(row) ? [...row] : []);
            source.outputHeader = source.outputRows[0] || [];
            source.outputColMap = new Map();
        }
        return source.outputRows;
    }

    function ensureTranslateOutputColumn(task) {
        const source = task.source;
        const outputRows = getTranslateSourceOutput(source);
        const header = outputRows[0] || [];
        const key = `${task.colIndex}:${task.profile.id}`;
        if (!source.outputColMap.has(key)) {
            const targetColIndex = header.length;
            const targetLangName = getTranslateLanguageName(document.getElementById('targetLang').value);
            const sourceHeader = header[task.colIndex] || `列${task.colIndex + 1}`;
            header.push(`${sourceHeader} (${targetLangName} · ${getCompactModelLabel(task.profile)})`);
            const hasQa = Boolean(translatePostCheckInput?.checked);
            if (hasQa) {
                header.push(`${sourceHeader} (${targetLangName} · ${getCompactModelLabel(task.profile)} · 检测)`);
            }
            source.outputColMap.set(key, {
                translationCol: targetColIndex,
                qaCol: hasQa ? targetColIndex + 1 : -1
            });
            outputRows[0] = header;
            outputRows.forEach((row, rowIndex) => {
                if (rowIndex === 0) return;
                if (row[targetColIndex] === undefined) row[targetColIndex] = '';
                if (hasQa && row[targetColIndex + 1] === undefined) row[targetColIndex + 1] = '';
            });
        }
        return source.outputColMap.get(key);
    }

    loadProjects();
    renderProjects();
    renderTranslateProfileList();
    renderTranslateGlossaryList();
    document.addEventListener('nexus:api-profiles-updated', renderTranslateProfileList);
    document.addEventListener('nexus:glossary-library-updated', renderTranslateGlossaryList);

    fileInput.addEventListener('click', (e) => e.stopPropagation());
    uploadArea.addEventListener('click', () => fileInput.click());
    bindUploadDrop(uploadArea, fileInput, (file, files = []) => handleTranslateFiles(files.length > 0 ? files : [file]));

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleTranslateFiles([...e.target.files]);
        }
    });

    addProjectBtn.addEventListener('click', () => openModal());
    closeModalBtn.addEventListener('click', () => closeModal());
    cancelProjectBtn.addEventListener('click', () => closeModal());
    saveProjectBtn.addEventListener('click', saveProject);
    viewProjectBtn.addEventListener('click', toggleViewMode);
    editProjectBtn.addEventListener('click', toggleEditMode);
    translateBtn.addEventListener('click', startTranslate);
    downloadBtn.addEventListener('click', downloadTranslated);
    resetBtn.addEventListener('click', resetTranslateTool);
    confirmColumnBtn.addEventListener('click', confirmColumnSelection);
    pauseBtn.addEventListener('click', pauseTranslate);
    resumeBtn.addEventListener('click', resumeTranslate);
    downloadProgressBtn.addEventListener('click', downloadCurrentProgress);
    downloadReportBtn?.addEventListener('click', downloadTranslationReport);
    downloadFinalReportBtn?.addEventListener('click', downloadTranslationReport);
    retryFailedBtn?.addEventListener('click', retryFailedTranslations);
    cancelTranslateBtn.addEventListener('click', cancelTranslateTask);

    projectModal.addEventListener('click', (e) => {
        if (e.target === projectModal) closeModal();
    });

    function pauseTranslate() {
        if (isTranslationCancelled) return;
        isPaused = true;
        pauseBtn.style.display = 'none';
        resumeBtn.style.display = 'inline-flex';
        downloadProgressBtn.style.display = 'inline-flex';
        updateTranslationRunActions();
        setStatus('warning', '翻译已暂停', '点击"继续"按钮恢复翻译');

        if (translatedDataLocal && translatedDataLocal.length > 0) {
            saveTranslationProgress({
                fileName: originalFileName,
                totalRows: sheetData.length,
                currentRow: sheetData.length,
                translatedData: translatedDataLocal,
                successCount: successCount,
                failCount: failCount,
                selectedColumns: selectedColumns,
                targetLang: document.getElementById('targetLang').value,
                selectedProfileIds: [...selectedTranslateProfileIds]
            });
            console.log('💾 已保存当前翻译进度');
        }
    }

    function resumeTranslate() {
        if (isTranslationCancelled) return;
        if (!ensureTranslateProfilesConfigured('继续文本翻译')) {
            return;
        }

        isPaused = false;
        pauseBtn.style.display = 'inline-flex';
        resumeBtn.style.display = 'none';
        downloadProgressBtn.style.display = 'none';
        updateTranslationRunActions();
        hideStatus();
        resolveResumeWaiters();
    }

    function waitForResume() {
        if (!isPaused) return Promise.resolve();
        return new Promise(resolve => {
            resumeResolvers.push(resolve);
        });
    }

    function resolveResumeWaiters() {
        const waiters = resumeResolvers;
        resumeResolvers = [];
        waiters.forEach(resolve => resolve());
    }

    function throwIfTranslationCancelled(runId) {
        if (isTranslationCancelled || activeTranslateRunId !== runId) {
            throw new Error('TRANSLATION_CANCELLED');
        }
    }

    function cancelTranslateTask(options = {}) {
        const { silent = false } = options;
        isTranslationCancelled = true;
        activeTranslateRunId = null;

        if (currentTranslateAbortController) {
            currentTranslateAbortController.abort();
            currentTranslateAbortController = null;
        }
        resolveResumeWaiters();

        isPaused = false;
        pauseBtn.style.display = 'inline-flex';
        resumeBtn.style.display = 'none';
        downloadProgressBtn.style.display = 'none';
        updateTranslationRunActions();
        progressSection.style.display = 'none';
        downloadSection.style.display = 'none';
        clearTranslationProgress();

        translatedData = null;
        translatedDataLocal = null;
        translatedWorkbook = null;
        translationRunReport = null;
        failedTranslationTasks = [];
        successCount = 0;
        failCount = 0;
        document.getElementById('translateProgressFill').style.width = '0%';
        document.getElementById('translateProgressText').textContent = '0 / 0';
        document.getElementById('translateProgressPercent').textContent = '0%';
        document.getElementById('translateProgressInfo').textContent = '';

        if (!silent) {
            setStatus('warning', '翻译任务已取消', '已停止后续请求。现在可以重新选择模型、调整配置，或上传新的文件。');
        }
    }

    function renderTranslateProfileList() {
        if (!translateProfileList) return;

        selectedTranslateProfileIds = renderTranslationProfileChecklist(
            translateProfileList,
            selectedTranslateProfileIds,
            (nextIds) => {
                selectedTranslateProfileIds = nextIds;
            },
            '暂无 API 通道。请先在顶部“API 配置”中保存至少一个通道。'
        );
    }

    function renderTranslateGlossaryList() {
        if (!translateGlossaryList) return;
        const library = loadGlossaryLibrary();
        const availableIds = new Set(library.map(entry => entry.id));
        selectedTranslateGlossaryIds = new Set([...selectedTranslateGlossaryIds].filter(id => availableIds.has(id)));
        translateGlossaryList.innerHTML = '';

        if (library.length === 0) {
            translateGlossaryList.innerHTML = '<div class="resource-empty">暂无可用术语表。可以先在“术语表”功能中上传或提取术语；不选择时将按项目规则直接翻译。</div>';
            return;
        }

        library.forEach(entry => {
            const entryTerms = normalizeGlossaryTerms(entry.terms);
            const label = document.createElement('label');
            label.className = 'resource-check-item';
            label.innerHTML = `
                <input type="checkbox" value="${entry.id}" ${selectedTranslateGlossaryIds.has(entry.id) ? 'checked' : ''}>
                <span class="resource-main">
                    <span class="resource-title">${escapeHtml(entry.name)}</span>
                    <span class="resource-meta">${entryTerms.length} 条术语 · ${getGlossaryOriginDisplayLabel(entry.origin)}${entry.sourceFileName ? ` · ${escapeHtml(entry.sourceFileName)}` : ''}</span>
                </span>
            `;

            const checkbox = label.querySelector('input');
            checkbox.addEventListener('change', () => {
                if (checkbox.checked) {
                    selectedTranslateGlossaryIds.add(entry.id);
                } else {
                    selectedTranslateGlossaryIds.delete(entry.id);
                }
            });

            translateGlossaryList.appendChild(label);
        });
    }

    function getSelectedTranslateGlossaryTerms() {
        const library = loadGlossaryLibrary();
        return library
            .filter(entry => selectedTranslateGlossaryIds.has(entry.id))
            .flatMap(entry => normalizeGlossaryTerms(entry.terms));
    }

    function getSelectedTranslateProfiles() {
        return getUsableTranslationProfiles().filter(profile =>
            selectedTranslateProfileIds.has(profile.id) &&
            isApiProfileCredentialComplete(profile)
        );
    }

    function ensureTranslateProfilesConfigured(featureName) {
        const profiles = getSelectedTranslateProfiles();
        if (profiles.length > 0) return true;

        setStatus(
            'error',
            '未选择可用翻译通道',
            `${featureName} 需要先在顶部 API 配置中保存可用通道，并在文本翻译里至少勾选一个通道。`,
            revealApiConfigPanel,
            '去配置'
        );
        revealApiConfigPanel();
        return false;
    }

    async function downloadCurrentProgress() {
        const workbook = buildTranslationWorkbook();
        if (!workbook) {
            alert('没有可下载的进度数据');
            return;
        }

        const fileName = `${originalFileName}_progress.xlsx`;
        downloadWorkbookFile(workbook, fileName);

        setStatus('success', '进度文件已下载', fileName);
    }

    function loadProjects() {
        const stored = localStorage.getItem(TRANSLATION_PROJECTS_KEY);
        if (stored) {
            try {
                projects = JSON.parse(stored);
                if (!Array.isArray(projects)) {
                    projects = [];
                }
            } catch {
                projects = [];
            }
        } else {
            projects = [];
        }
        restoreDefaultProjects();
        if (projects.length > 0 && !currentProject) {
            currentProject = getPreferredTranslationProject(projects);
        }
    }

    function restoreDefaultProjects() {
        let changed = false;

        DEFAULT_PROJECTS.forEach(defaultProject => {
            const exists = projects.some(project => project.id === defaultProject.id);
            if (!exists) {
                projects.unshift({ ...defaultProject });
                changed = true;
            }
        });

        if (!currentProject || !projects.some(project => project.id === currentProject.id)) {
            currentProject = getPreferredTranslationProject(projects);
        }

        if (changed || !localStorage.getItem(TRANSLATION_PROJECTS_KEY)) {
            saveProjectsToStorage();
        }
    }

    function saveProjectsToStorage() {
        localStorage.setItem(TRANSLATION_PROJECTS_KEY, JSON.stringify(projects));
        document.dispatchEvent(new CustomEvent('nexus:projects-updated'));
    }

    function renderProjects() {
        projectList.innerHTML = '';
        const defaultProjectId = getDefaultTranslationProjectId();
        projects.forEach(project => {
            const div = document.createElement('div');
            div.className = `project-item ${currentProject && currentProject.id === project.id ? 'active' : ''}`;
            div.dataset.projectId = project.id;
            const isDefaultProject = project.id === defaultProjectId;
            div.innerHTML = `
                <div class="project-info">
                    <span class="project-name">${escapeHtml(project.name)}${isDefaultProject ? '<span class="project-default-badge">默认</span>' : ''}</span>
                    <span class="project-hint">点击选择 · 双击编辑</span>
                </div>
                <div class="project-actions">
                    <button class="action-btn mini ghost" data-id="${project.id}" data-action="view" title="查看项目规则">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                            <circle cx="12" cy="12" r="3"/>
                        </svg>
                        <span>查看</span>
                    </button>
                    <button class="action-btn mini secondary ${isDefaultProject ? 'disabled' : ''}" data-id="${project.id}" data-action="default" title="设为默认项目">
                        <span>${isDefaultProject ? '默认中' : '设默认'}</span>
                    </button>
                    <button class="action-btn mini primary" data-id="${project.id}" data-action="edit">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                        <span>编辑</span>
                    </button>
                    <button class="action-btn mini danger ${project.id === 'yongbingxiaozhen' ? 'disabled' : ''}" data-id="${project.id}" data-action="delete">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        </svg>
                    </button>
                </div>
            `;

            div.addEventListener('click', (e) => {
                const actionBtn = e.target.closest('[data-action]');
                if (actionBtn) {
                    const action = actionBtn.dataset.action;
                    if (action === 'view') {
                        viewProject(project.id);
                    } else if (action === 'default' && project.id !== getDefaultTranslationProjectId()) {
                        setDefaultProject(project.id);
                    } else if (action === 'edit') {
                        editProject(project.id);
                    } else if (action === 'delete' && project.id !== 'yongbingxiaozhen') {
                        deleteProject(project.id);
                    }
                } else {
                    selectProject(project.id);
                }
            });

            div.addEventListener('dblclick', () => {
                editProject(project.id);
            });

            projectList.appendChild(div);
        });
    }

    function viewProject(id) {
        const project = projects.find(p => p.id === id);
        if (project) {
            openModal(project, true);
        }
    }

    function selectProject(id) {
        currentProject = projects.find(p => p.id === id);
        renderProjects();
    }

    function setDefaultProject(id) {
        const project = projects.find(p => p.id === id);
        if (!project) return;
        currentProject = project;
        setDefaultTranslationProjectId(id);
        saveProjectsToStorage();
        renderProjects();
        setStatus('success', '已设置默认游戏项目', project.name);
    }

    function openModal(project = null, viewOnly = false) {
        const isEdit = project !== null;
        document.getElementById('modalTitle').textContent = viewOnly ? '查看项目' : (isEdit ? '编辑项目' : '添加项目');
        document.getElementById('projectName').value = project ? project.name : '';
        document.getElementById('projectRules').value = project ? project.rules : '';
        projectModal.dataset.editId = project ? project.id : '';

        const nameInput = document.getElementById('projectName');
        const rulesTextarea = document.getElementById('projectRules');

        if (viewOnly && project) {
            nameInput.disabled = true;
            rulesTextarea.disabled = true;
            saveProjectBtn.style.display = 'none';
            viewProjectBtn.style.display = 'none';
            editProjectBtn.style.display = 'inline-flex';
        } else {
            nameInput.disabled = false;
            rulesTextarea.disabled = false;
            saveProjectBtn.style.display = 'inline-flex';
            viewProjectBtn.style.display = 'none';
            editProjectBtn.style.display = 'none';
        }

        projectModal.style.display = 'flex';
    }

    function toggleViewMode() {
        const editId = projectModal.dataset.editId;
        if (editId) {
            const project = projects.find(p => p.id === editId);
            openModal(project, true);
        }
    }

    function toggleEditMode() {
        const editId = projectModal.dataset.editId;
        if (editId) {
            const project = projects.find(p => p.id === editId);
            openModal(project, false);
        }
    }

    function closeModal() {
        projectModal.style.display = 'none';
        document.getElementById('projectName').value = '';
        document.getElementById('projectRules').value = '';
        projectModal.dataset.editId = '';
    }

    function editProject(id) {
        const project = projects.find(p => p.id === id);
        if (project) {
            openModal(project);
        }
    }

    function deleteProject(id) {
        if (id === 'yongbingxiaozhen') return;
        projects = projects.filter(p => p.id !== id);
        if (currentProject && currentProject.id === id) {
            currentProject = getPreferredTranslationProject(projects);
        }
        if (getDefaultTranslationProjectId() === id) {
            setDefaultTranslationProjectId(currentProject?.id || '');
        }
        saveProjectsToStorage();
        renderProjects();
    }

    function saveProject() {
        const name = document.getElementById('projectName').value.trim();
        const rules = document.getElementById('projectRules').value.trim();

        if (!name) {
            alert('请输入项目名称');
            return;
        }

        const editId = projectModal.dataset.editId;
        if (editId) {
            const project = projects.find(p => p.id === editId);
            if (project) {
                project.name = name;
                project.rules = rules;
            }
        } else {
            const id = 'project_' + Date.now();
            projects.push({ id, name, rules });
            currentProject = projects.find(project => project.id === id) || currentProject;
        }

        saveProjectsToStorage();
        renderProjects();
        closeModal();
    }

    async function handleTranslateFile(file) {
        return handleTranslateFiles([file]);
    }

    async function handleTranslateFiles(files) {
        const fileList = [...(files || [])].filter(Boolean);
        if (fileList.length === 0) return;
        if (progressSection.style.display !== 'none') {
            cancelTranslateTask({ silent: true });
        }

        const sourceGroups = [];
        const encodings = new Set();
        let sourceIndex = 0;

        for (const file of fileList) {
            const parsed = await readSpreadsheetSheets(file);
            if (parsed.encoding) encodings.add(parsed.encoding);
            parsed.sheets.forEach(sheet => {
                if (!sheet.rows || sheet.rows.length === 0) return;
                sourceGroups.push({
                    id: makeTranslateSourceId(file.name, sheet.sheetName, sourceIndex),
                    fileName: file.name,
                    sheetName: sheet.sheetName || 'Sheet1',
                    rows: sheet.rows,
                    outputRows: null,
                    outputHeader: null,
                    outputColMap: new Map(),
                    rowMap: new Map()
                });
                sourceIndex++;
            });
        }

        translateSources = sourceGroups;
        selectedTranslateSourceIds = new Set(translateSources.map(source => source.id));
        rebuildTranslateSheetData();
        originalFileName = fileList.length === 1
            ? fileList[0].name.replace(/\.(csv|xlsx|xls)$/i, '')
            : `批量翻译_${fileList.length}个文件`;

        document.getElementById('translateFileName').textContent = fileList.length === 1
            ? fileList[0].name
            : `${fileList.length} 个文件 / ${translateSources.length} 个工作表`;
        document.getElementById('translateFileEncoding').textContent = [...encodings].join(' / ') || '-';
        document.getElementById('translateTotalRows').textContent = Math.max(0, (sheetData?.length || 1) - 1);
        document.getElementById('translateTotalCols').textContent = sheetData?.[0] ? sheetData[0].length : 0;

        selectedColumns = [];
        translatedData = null;
        translatedDataLocal = null;
        translatedWorkbook = null;
        translationRunReport = null;
        failedTranslationTasks = [];
        clearTranslationProgress();
        renderTranslateSheetSelectList();
        renderColumnList();
        updateTranslationRunActions();

        fileInfo.style.display = 'block';
        columnSelectSection.style.display = 'block';
        downloadSection.style.display = 'none';
        setStatus('success', '已载入新文件', fileList.length === 1 ? fileList[0].name : `${fileList.length} 个文件`);
    }

    function renderTranslateSheetSelectList() {
        if (!translateSheetSelectPanel || !translateSheetSelectList || !translateSheetSelectCount) return;
        const showPanel = translateSources.length > 1;
        translateSheetSelectPanel.style.display = showPanel ? 'block' : 'none';
        translateSheetSelectList.innerHTML = '';

        if (!showPanel) {
            translateSheetSelectCount.textContent = `${translateSources.length} 个`;
            return;
        }

        const selectedCount = getSelectedTranslateSources().length;
        translateSheetSelectCount.textContent = `${selectedCount} / ${translateSources.length}`;

        translateSources.forEach(source => {
            const rowCount = Math.max(0, (source.rows?.length || 1) - 1);
            const colCount = source.rows?.[0]?.length || 0;
            const label = document.createElement('label');
            label.className = 'resource-check-item';
            label.innerHTML = `
                <input type="checkbox" value="${source.id}" ${selectedTranslateSourceIds.has(source.id) ? 'checked' : ''}>
                <span class="resource-main">
                    <span class="resource-title">${escapeHtml(getTranslateDisplaySourceName(source))}</span>
                    <span class="resource-meta">${rowCount} 行 · ${colCount} 列</span>
                </span>
            `;

            const checkbox = label.querySelector('input');
            checkbox.addEventListener('change', () => {
                if (checkbox.checked) {
                    selectedTranslateSourceIds.add(source.id);
                } else {
                    selectedTranslateSourceIds.delete(source.id);
                }
                rebuildTranslateSheetData();
                selectedColumns = [];
                renderTranslateSheetSelectList();
                renderColumnList();
                document.getElementById('translateTotalRows').textContent = Math.max(0, (sheetData?.length || 1) - 1);
                document.getElementById('translateTotalCols').textContent = sheetData?.[0] ? sheetData[0].length : 0;
            });

            translateSheetSelectList.appendChild(label);
        });
    }

    function renderColumnList() {
        const columnList = document.getElementById('translateColumnList');
        columnList.innerHTML = '';

        if (!sheetData || sheetData.length === 0 || !sheetData[0]) {
            columnList.innerHTML = '<p class="column-hint">无法读取列信息</p>';
            return;
        }

        const headers = sheetData[0];
        if (selectedColumns.length === 0) {
            const autoIndex = inferTranslateSourceColumnIndex();
            if (autoIndex >= 0) selectedColumns = [autoIndex];
        }
        headers.forEach((header, index) => {
            const div = document.createElement('div');
            const isSelected = selectedColumns.includes(index);
            div.className = `column-item ${isSelected ? 'selected' : ''}`;
            div.innerHTML = `
                <span class="column-index">列 ${index + 1}</span>
                <span class="column-name">${header || '(空列名)'}</span>
                <span class="column-preview">${getColumnPreview(index)}</span>
            `;
            div.addEventListener('click', () => toggleColumn(index));
            columnList.appendChild(div);
        });
    }

    function detectTranslateColumnLanguage(colIndex) {
        if (!sheetData || sheetData.length <= 1) return 'unknown';
        const sampleRows = sheetData.slice(1, Math.min(21, sheetData.length));
        const languages = [];

        for (const row of sampleRows) {
            const cell = row?.[colIndex];
            if (cell && typeof cell === 'string' && cell.trim()) {
                languages.push(detectLanguage(cell));
            }
        }

        if (languages.length === 0) return 'unknown';
        const counts = languages.reduce((map, lang) => {
            map[lang] = (map[lang] || 0) + 1;
            return map;
        }, {});
        return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'unknown';
    }

    function inferTranslateSourceColumnIndex() {
        if (!sheetData || !Array.isArray(sheetData[0])) return -1;
        const headers = sheetData[0].map(header => String(header || '').toLowerCase());
        const headerMatch = headers.findIndex(header =>
            /原文|源文|中文|简体|source|zh|chinese/.test(header) &&
            !/译文|英文|english|translation|target/.test(header)
        );
        if (headerMatch >= 0) return headerMatch;

        const languageMatch = headers.findIndex((_, index) => detectTranslateColumnLanguage(index) === 'chinese');
        return languageMatch >= 0 ? languageMatch : -1;
    }

    function getColumnPreview(colIndex) {
        if (sheetData.length <= 1) return '无数据';
        const previewRows = sheetData.slice(1, 4);
        const values = previewRows.map(row => {
            const val = row[colIndex];
            if (val === undefined || val === null) return '';
            const str = String(val);
            return str.length > 15 ? str.substring(0, 15) + '...' : str;
        }).filter(v => v);
        return values.join(' | ') || '无数据';
    }

    function toggleColumn(index) {
        const idx = selectedColumns.indexOf(index);
        if (idx > -1) {
            selectedColumns.splice(idx, 1);
        } else {
            selectedColumns.push(index);
        }
        renderColumnList();
    }

    function confirmColumnSelection() {
        if (selectedColumns.length === 0) {
            alert('请至少选择一列进行翻译');
            return;
        }
        columnSelectSection.style.display = 'none';
    }

    function getTranslateLanguageName(lang) {
        const langNames = {
            'en': '英语',
            'ja': '日语',
            'ko': '韩语',
            'zh-TW': '繁体中文',
            'fr': '法语',
            'de': '德语',
            'es': '西班牙语',
            'pt': '葡萄牙语',
            'ru': '俄语',
            'th': '泰语',
            'vi': '越南语',
            'id': '印尼语'
        };
        return langNames[lang] || lang;
    }

    function getTranslateTargetLanguageKeys(targetLang) {
        const map = {
            en: ['finalTranslation', 'english', 'target', 'translation', 'en'],
            ja: ['japanese', 'ja', 'jp', '日文', '日语'],
            ko: ['korean', 'ko', '韩文', '韩语'],
            'zh-TW': ['traditionalChinese', 'zhTW', 'zh-TW', '繁体', '繁体中文'],
            fr: ['french', 'fr', '法文', '法语'],
            de: ['german', 'de', '德文', '德语'],
            es: ['spanish', 'es', '西班牙文', '西班牙语'],
            pt: ['portuguese', 'pt', '葡萄牙文', '葡萄牙语'],
            ru: ['russian', 'ru', '俄文', '俄语'],
            th: ['thai', 'th', '泰文', '泰语'],
            vi: ['vietnamese', 'vi', '越南文', '越南语'],
            id: ['indonesian', 'id', '印尼文', '印尼语']
        };
        return map[targetLang] || [];
    }

    function getTermTargetForLanguage(term, targetLang) {
        const keys = getTranslateTargetLanguageKeys(targetLang);
        for (const key of keys) {
            const value = term?.[key];
            if (value !== undefined && value !== null && String(value).trim()) {
                return String(value).trim();
            }
        }
        return getGlossaryEffectiveTarget(term);
    }

    function getRelevantTranslateGlossaryTerms(texts, glossaryTerms, targetLang, limit = 80) {
        const combined = Array.isArray(texts) ? texts.join('\n') : String(texts || '');
        const seen = new Set();
        return normalizeGlossaryTerms(glossaryTerms)
            .filter(term => term.source && combined.includes(term.source))
            .map(term => ({
                source: term.source,
                target: getTermTargetForLanguage(term, targetLang),
                type: term.type || '',
                note: term.note || term.qualitySuggestion || term.qualityIssues || ''
            }))
            .filter(term => {
                if (!term.target) return false;
                const key = `${term.source}|${term.target}`;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            })
            .sort((a, b) => b.source.length - a.source.length)
            .slice(0, limit);
    }

    function buildTranslateGlossaryPromptSection(glossaryTerms, targetLang) {
        if (!glossaryTerms.length) return '';
        const langName = getTranslateLanguageName(targetLang);
        const rows = glossaryTerms.map(term => {
            const typeText = term.type ? `；类型：${term.type}` : '';
            const noteText = term.note ? `；备注：${term.note}` : '';
            return `- ${term.source} => ${term.target}${typeText}${noteText}`;
        }).join('\n');
        return `\n术语表硬性要求：\n以下术语如果出现在原文中，翻译成${langName}时必须使用指定译法。不要自行改写固定术语。\n${rows}\n`;
    }

    function extractFormatTokens(text) {
        return String(text || '').match(/%[\d$.]*[sdif]|\\n|<[^>]+>|\{[^}]+\}|\[[A-Z0-9_]+\]/gi) || [];
    }

    function extractNumberTokens(text) {
        return String(text || '').match(/\d+(?:[.,]\d+)?%?/g) || [];
    }

    function summarizeTranslationQa(sourceText, translatedText, glossaryTerms) {
        const issues = [];
        const target = String(translatedText || '');
        const sourceTokens = extractFormatTokens(sourceText);
        const targetTokens = new Set(extractFormatTokens(target));
        const missingTokens = sourceTokens.filter(token => !targetTokens.has(token));
        if (missingTokens.length) issues.push(`缺少格式/占位符：${[...new Set(missingTokens)].join(', ')}`);

        const sourceNumbers = extractNumberTokens(sourceText);
        const targetNumbers = new Set(extractNumberTokens(target));
        const missingNumbers = sourceNumbers.filter(number => !targetNumbers.has(number));
        if (missingNumbers.length) issues.push(`数字不一致：${[...new Set(missingNumbers)].join(', ')}`);

        glossaryTerms.forEach(term => {
            if (sourceText.includes(term.source) && term.target && !target.includes(term.target)) {
                issues.push(`术语未遵守：${term.source} 应译为 ${term.target}`);
            }
        });

        if (isTranslateFailureText(target)) issues.push('模型翻译失败');
        return issues.length ? `需确认：${issues.join('；')}` : '通过';
    }

    function updateTranslationRunActions() {
        const hasReport = Boolean(translationRunReport);
        const hasFailures = failedTranslationTasks.length > 0;
        if (downloadReportBtn) downloadReportBtn.style.display = hasReport ? 'inline-flex' : 'none';
        if (downloadFinalReportBtn) downloadFinalReportBtn.style.display = hasReport ? 'inline-flex' : 'none';
        if (retryFailedBtn) retryFailedBtn.style.display = hasFailures ? 'inline-flex' : 'none';
    }

    function buildTranslationTaskKey(source, rowIndex, colIndex, profile) {
        return [
            source?.fileName || '',
            source?.sheetName || '',
            rowIndex,
            colIndex,
            profile?.id || profile?.model || ''
        ].join('|');
    }

    function collectTranslationTasks(activeProfiles) {
        const tasks = [];
        let filteredEmpty = 0;
        let filteredSpecial = 0;
        const glossaryTerms = getSelectedTranslateGlossaryTerms();
        const targetLang = document.getElementById('targetLang').value;

        for (let i = 1; i < (sheetData?.length || 0); i++) {
            const row = sheetData[i];
            if (!row) continue;
            const source = findTranslateSourceForRow(i);
            if (!source) continue;

            for (const originalColIndex of selectedColumns) {
                const cell = row[originalColIndex];
                if (typeof cell !== 'string') {
                    filteredEmpty++;
                    continue;
                }
                if (!cell.trim()) {
                    filteredEmpty++;
                    continue;
                }
                if (isSpecialCode(cell)) {
                    filteredSpecial++;
                    continue;
                }

                activeProfiles.forEach(profile => {
                    const glossary = getRelevantTranslateGlossaryTerms(cell, glossaryTerms, targetLang);
                    tasks.push({
                        rowIndex: i,
                        originalRowIndex: source.rowMap?.get(i) ?? i,
                        originalRowNumber: getTranslateOriginalRowNumber(i),
                        colIndex: originalColIndex,
                        text: cell,
                        source,
                        profile,
                        glossaryTerms: glossary,
                        taskKey: buildTranslationTaskKey(source, i, originalColIndex, profile)
                    });
                });
            }
        }

        console.log(`收集到 ${tasks.length} 个翻译任务 (过滤空值: ${filteredEmpty}, 过滤特殊代码: ${filteredSpecial})`);
        return tasks;
    }

    function writeTranslationResult(task, translated, qaStatus = '') {
        const outputRows = getTranslateSourceOutput(task.source);
        const cols = ensureTranslateOutputColumn(task);
        const outputRowIndex = task.originalRowIndex ?? task.rowIndex;
        const row = outputRows[outputRowIndex] || [];
        row[cols.translationCol] = translated;
        if (cols.qaCol >= 0) row[cols.qaCol] = qaStatus;
        outputRows[outputRowIndex] = row;
    }

    function buildTranslationWorkbook() {
        const selectedSources = getSelectedTranslateSources();
        if (!selectedSources.length) return null;

        const workbook = XLSX.utils.book_new();
        selectedSources.forEach((source, index) => {
            const rows = getTranslateSourceOutput(source);
            const baseName = source.sheetName && source.sheetName !== 'CSV'
                ? source.sheetName
                : source.fileName.replace(/\.(csv|xlsx|xls)$/i, '');
            const safeName = String(baseName || `Sheet${index + 1}`).replace(/[\\/?*[\]:]/g, '_').slice(0, 31) || `Sheet${index + 1}`;
            XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), safeName);
        });

        if (translationRunReport?.entries?.length) {
            XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(buildTranslationReportRows()), '翻译报告');
        }

        return workbook;
    }

    function buildTranslationReportRows() {
        const rows = [[
            '状态',
            '来源文件',
            '工作表',
            '原始行号',
            '列',
            '通道',
            '模型',
            '原文',
            '译文',
            '命中术语',
            '译后检测',
            '错误'
        ]];

        (translationRunReport?.entries || []).forEach(entry => {
            rows.push([
                entry.status || '',
                entry.sourceFile || '',
                entry.sheetName || '',
                entry.rowNumber || '',
                entry.column || '',
                entry.profile || '',
                entry.model || '',
                entry.sourceText || '',
                entry.translatedText || '',
                entry.glossary || '',
                entry.qaStatus || '',
                entry.error || ''
            ]);
        });

        if (failedTranslationTasks.length) {
            rows.push([]);
            rows.push(['失败任务', '来源文件', '工作表', '原始行号', '列', '通道', '模型', '原文']);
            failedTranslationTasks.forEach(task => {
                rows.push([
                    'failed',
                    task.source?.fileName || '',
                    task.source?.sheetName || '',
                    task.originalRowNumber || '',
                    task.colIndex + 1,
                    task.profile?.name || '',
                    task.profile?.model || '',
                    task.text || ''
                ]);
            });
        }

        return rows;
    }

    function downloadTranslationReport() {
        if (!translationRunReport) {
            alert('暂无翻译报告');
            return;
        }
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(buildTranslationReportRows()), '翻译报告');
        downloadWorkbookFile(workbook, `${originalFileName}_translation_report.xlsx`);
    }

    async function retryFailedTranslations() {
        if (!failedTranslationTasks.length) {
            alert('没有需要补跑的失败翻译');
            return;
        }
        const activeProfiles = getSelectedTranslateProfiles();
        pendingRetryTranslationTasks = [...failedTranslationTasks].map((task, index) => {
            const profile = activeProfiles.find(item => item.id === task.profile?.id) ||
                activeProfiles[index % Math.max(1, activeProfiles.length)] ||
                task.profile;
            const targetLang = document.getElementById('targetLang').value;
            return {
                ...task,
                profile,
                taskKey: buildTranslationTaskKey(task.source, task.rowIndex, task.colIndex, profile),
                glossaryTerms: getRelevantTranslateGlossaryTerms(task.text, getSelectedTranslateGlossaryTerms(), targetLang)
            };
        });
        failedTranslationTasks = [];
        updateTranslationRunActions();
        await startTranslate();
        pendingRetryTranslationTasks = null;
    }

    async function startTranslate() {
        if (activeTranslateRunId && progressSection.style.display !== 'none') {
            setStatus('warning', '已有翻译任务正在运行', '请先点击“取消任务”停止当前任务，或点击“暂停”保存当前进度。');
            return;
        }

        const sourceLang = document.getElementById('sourceLang').value;
        const targetLang = document.getElementById('targetLang').value;
        let activeProfiles = getSelectedTranslateProfiles();
        const retryTasks = pendingRetryTranslationTasks ? [...pendingRetryTranslationTasks] : null;
        const glossaryTermsForRun = getSelectedTranslateGlossaryTerms();

        console.log('🚀 开始翻译', { targetLang, currentProject: currentProject?.name, selectedColumns, sheetDataLength: sheetData?.length });

        if (!currentProject) {
            alert('请先选择游戏项目');
            return;
        }

        if (!retryTasks && selectedColumns.length === 0) {
            alert('请先选择要翻译的列');
            return;
        }

        if (!retryTasks && (!sheetData || sheetData.length === 0)) {
            console.error('❌ sheetData为空');
            alert('没有可翻译的数据');
            return;
        }

        if (!ensureTranslateProfilesConfigured('文本翻译')) {
            clearTranslationProgress();
            progressSection.style.display = 'none';
            downloadSection.style.display = 'none';
            return;
        }

        activeProfiles = getSelectedTranslateProfiles();
        isTranslationCancelled = false;
        isPaused = false;
        const runId = `translate_${Date.now().toString(36)}`;
        const runController = new AbortController();
        activeTranslateRunId = runId;
        currentTranslateAbortController = runController;
        const runSignal = runController.signal;

        progressSection.style.display = 'block';
        pauseBtn.style.display = 'inline-flex';
        resumeBtn.style.display = 'none';
        downloadProgressBtn.style.display = 'none';
        hideStatus();

        const translationList = document.getElementById('translationList');
        if (!retryTasks) translationList.innerHTML = '';

        const totalRows = sheetData.length;
        const totalCells = (totalRows - 1) * selectedColumns.length * activeProfiles.length;

        console.log(`📈 预计翻译 ${totalCells} 个单元格 (共 ${totalRows} 行, ${selectedColumns.length} 列)`);

        if (!retryTasks) {
            translateSources.forEach(source => {
                source.outputRows = (source.rows || []).map(row => Array.isArray(row) ? [...row] : []);
                source.outputHeader = source.outputRows[0] || [];
                source.outputColMap = new Map();
            });
            translatedDataLocal = sheetData ? sheetData.map(row => Array.isArray(row) ? [...row] : []) : [];
            translatedWorkbook = null;
            translationRunReport = {
                createdAt: new Date().toISOString(),
                sourceName: originalFileName,
                targetLang,
                totalTasks: 0,
                successCount: 0,
                failCount: 0,
                entries: []
            };
            failedTranslationTasks = [];
        } else if (!translationRunReport) {
            translationRunReport = {
                createdAt: new Date().toISOString(),
                sourceName: originalFileName,
                targetLang,
                totalTasks: retryTasks.length,
                successCount,
                failCount,
                entries: []
            };
        }

        let startRow = 1;
        if (!retryTasks) {
            successCount = 0;
            failCount = 0;
        }
        let translateCount = 0;
        let runSuccessCount = 0;
        let runFailCount = 0;

        const savedProgress = retryTasks ? null : loadTranslationProgress();
        if (savedProgress && savedProgress.fileName === originalFileName) {
            const shouldResume = confirm(`检测到未完成的翻译任务，已翻译 ${savedProgress.successCount} 个，失败 ${savedProgress.failCount} 个。是否继续？`);
            if (shouldResume) {
                translatedDataLocal = savedProgress.translatedData;
                if (Array.isArray(savedProgress.selectedProfileIds)) {
                    selectedTranslateProfileIds = new Set(savedProgress.selectedProfileIds);
                    renderTranslateProfileList();
                    activeProfiles = getSelectedTranslateProfiles();
                }
                startRow = savedProgress.currentRow;
                successCount = savedProgress.successCount;
                failCount = savedProgress.failCount;
                translateCount = successCount + failCount;
            } else {
                clearTranslationProgress();
                startRow = 1;
            }
        }

        setStatus('processing', '正在翻译文本...', `预计翻译 ${totalCells} 个单元格`);

        try {
            console.log('📊 翻译任务统计:', { totalRows, startRow, selectedColumns });

            const translationTasks = retryTasks || collectTranslationTasks(activeProfiles);


            let completedCount = 0;
            const totalTasks = translationTasks.length;

            if (totalTasks === 0) {
                clearTranslationProgress();
                translatedWorkbook = buildTranslationWorkbook();
                translatedData = translatedDataLocal;
                progressSection.style.display = 'none';
                downloadSection.style.display = 'block';
                document.getElementById('translatedCount').textContent = '0';
                updateTranslationRunActions();
                setStatus('success', '翻译完成', '没有需要翻译的有效文本');
                return;
            }

            function commitTranslateResult(task, translated) {
                throwIfTranslationCancelled(runId);
                const isFailed = isTranslateFailureText(translated);
                if (isFailed) {
                    failCount++;
                    runFailCount++;
                } else {
                    successCount++;
                    runSuccessCount++;
                }
                const qaTerms = task.glossaryTerms || [];
                const qaStatus = translatePostCheckInput?.checked
                    ? summarizeTranslationQa(task.text, translated, qaTerms)
                    : '';
                writeTranslationResult(task, translated, qaStatus);
                translateCount++;
                completedCount++;

                translationRunReport = translationRunReport || { entries: [] };
                translationRunReport.entries.push({
                    taskKey: task.taskKey,
                    status: isFailed ? 'failed' : 'success',
                    sourceFile: task.source?.fileName || '',
                    sheetName: task.source?.sheetName || '',
                    rowNumber: task.originalRowNumber || task.rowIndex + 1,
                    column: task.colIndex + 1,
                    profile: task.profile?.name || getCompactModelLabel(task.profile),
                    model: task.profile?.model || '',
                    sourceText: task.text,
                    translatedText: translated,
                    glossary: qaTerms.map(term => `${term.source}=>${term.target}`).join('; '),
                    qaStatus,
                    error: isFailed ? translated : ''
                });

                addTranslationItem(translationList, task.text, translated, task.rowIndex, task.colIndex, task.profile);

                const progress = Math.round((completedCount / totalTasks) * 100);
                updateTranslateProgress(completedCount, totalTasks, progress);
                document.getElementById('translateProgressInfo').textContent =
                    `正在翻译... (已完成 ${completedCount}/${totalTasks} 个，通道 ${task.profile.name})`;

                if (completedCount % 10 === 0) {
                    saveTranslationProgress({
                        fileName: originalFileName,
                        totalRows: sheetData?.length || 0,
                        currentRow: task?.rowIndex || 1,
                        translatedData: translatedDataLocal,
                        successCount: successCount,
                        failCount: failCount,
                        selectedColumns: selectedColumns,
                        targetLang: targetLang,
                        selectedProfileIds: [...selectedTranslateProfileIds]
                    });
                    translatedWorkbook = buildTranslationWorkbook();
                    updateTranslationRunActions();
                }
            }

            async function processTranslateTask(task) {
                throwIfTranslationCancelled(runId);
                while (isPaused && !isTranslationCancelled) {
                    await waitForResume();
                }
                throwIfTranslationCancelled(runId);

                await waitForNetwork(runSignal);

                const translated = await translateTextWithRetry(task.text, sourceLang, targetLang, currentProject.rules, task.profile, 3, runSignal, task.glossaryTerms);
                throwIfTranslationCancelled(runId);
                commitTranslateResult(task, translated);
            }

            async function processTranslateTaskBatch(tasks) {
                if (!tasks.length) return;

                throwIfTranslationCancelled(runId);
                while (isPaused && !isTranslationCancelled) {
                    await waitForResume();
                }
                throwIfTranslationCancelled(runId);

                const profile = tasks[0].profile;
                const translations = await translateBatchWithRetry(tasks, sourceLang, targetLang, currentProject.rules, profile, runSignal, 2, glossaryTermsForRun);
                throwIfTranslationCancelled(runId);

                if (translations && translations.length === tasks.length) {
                    tasks.forEach((task, index) => {
                        commitTranslateResult(task, translations[index] || makeTranslateFailureText(task.text));
                    });
                    return;
                }

                for (const task of tasks) {
                    await processTranslateTask(task);
                }
            }

            async function runTranslateQueues() {
                const tasksByProfile = new Map(activeProfiles.map(profile => [profile.id, []]));
                translationTasks.forEach(task => {
                    tasksByProfile.get(task.profile.id)?.push(task);
                });

                const workers = [];
                activeProfiles.forEach(profile => {
                    const queue = tasksByProfile.get(profile.id) || [];
                    let nextIndex = 0;
                    const workerCount = Math.min(getProfileConcurrency(profile), queue.length);

                    for (let workerIndex = 0; workerIndex < workerCount; workerIndex++) {
                        workers.push((async () => {
                            while (nextIndex < queue.length) {
                                throwIfTranslationCancelled(runId);
                                const batchSize = getTranslationBatchSize(profile);
                                const taskBatch = queue.slice(nextIndex, nextIndex + batchSize);
                                nextIndex += taskBatch.length;
                                await processTranslateTaskBatch(taskBatch);
                            }
                        })());
                    }
                });

                await Promise.all(workers);
            }

            if (activeProfiles.length === 1) {
                const concurrency = parseInt(document.getElementById('translateConcurrency').value) || 5;
                const batchSize = getTranslationBatchSize(activeProfiles[0]);
                const taskBatches = [];
                for (let i = 0; i < translationTasks.length; i += batchSize) {
                    taskBatches.push(translationTasks.slice(i, i + batchSize));
                }

                for (let i = 0; i < taskBatches.length; i += concurrency) {
                    throwIfTranslationCancelled(runId);
                    await Promise.all(taskBatches.slice(i, i + concurrency).map(processTranslateTaskBatch));
                }
            } else {
                await runTranslateQueues();
            }
            throwIfTranslationCancelled(runId);

            clearTranslationProgress();
            translatedWorkbook = buildTranslationWorkbook();
            translatedData = translatedDataLocal;

            progressSection.style.display = 'none';
            downloadSection.style.display = 'block';
            translationRunReport.successCount = successCount;
            translationRunReport.failCount = failCount;
            const latestStatusByTask = new Map();
            (translationRunReport.entries || []).forEach(entry => {
                if (entry.taskKey) latestStatusByTask.set(entry.taskKey, entry.status);
            });
            failedTranslationTasks = translationTasks.filter(task => latestStatusByTask.get(task.taskKey) === 'failed');
            document.getElementById('translatedCount').textContent = translateCount;
            updateTranslationRunActions();

            const statusTitle = retryTasks ? '失败翻译补跑完成！' : '翻译完成！';
            setStatus('success', statusTitle, `本次成功 ${runSuccessCount} 个，失败 ${runFailCount} 个；累计成功 ${successCount} 个，失败 ${failCount} 个`, function() {
                document.getElementById('translate-tool').scrollIntoView({ behavior: 'smooth' });
            });

        } catch (error) {
            if (isTranslationCancelled || error.name === 'AbortError' || error.message === 'TRANSLATION_CANCELLED') {
                console.log('Translate cancelled');
                setStatus('warning', '翻译任务已取消', '已停止后续请求。现在可以重新选择模型、调整配置，或上传新的文件。');
            } else {
                console.error('Translate error:', error);
                translatedWorkbook = buildTranslationWorkbook();
                updateTranslationRunActions();
                setStatus('error', '翻译失败', error.message);
            }
            progressSection.style.display = 'none';
        } finally {
            if (currentTranslateAbortController === runController) {
                currentTranslateAbortController = null;
            }
            if (activeTranslateRunId === runId) {
                activeTranslateRunId = null;
            }
            isPaused = false;
            pauseBtn.style.display = 'inline-flex';
            resumeBtn.style.display = 'none';
            downloadProgressBtn.style.display = 'none';
            updateTranslationRunActions();
        }
    }

    function addTranslationItem(list, original, translated, row, col, profile = null) {
        const item = document.createElement('div');
        item.className = 'translation-item';

        const truncatedOriginal = original.length > 50 ? original.substring(0, 50) + '...' : original;
        const truncatedTranslated = translated.length > 50 ? translated.substring(0, 50) + '...' : translated;
        const modelLabel = profile ? getApiProfileLabel(profile) : '';

        item.innerHTML = `
            <div class="translation-row-info">行 ${row + 1}, 列 ${col + 1}${modelLabel ? ` · ${escapeHtml(modelLabel)}` : ''}</div>
            <div class="translation-content">
                <div class="translation-original">${escapeHtml(truncatedOriginal)}</div>
                <div class="translation-arrow">→</div>
                <div class="translation-result ${isTranslateFailureText(translated) ? 'error' : ''}">${escapeHtml(truncatedTranslated)}</div>
            </div>
        `;

        list.insertBefore(item, list.firstChild);

        if (list.children.length > 100) {
            list.removeChild(list.lastChild);
        }
    }

    function updateTranslateProgress(current, total, percent) {
        document.getElementById('translateProgressText').textContent = `${current} / ${total}`;
        document.getElementById('translateProgressPercent').textContent = `${percent}%`;
        document.getElementById('translateProgressFill').style.width = `${percent}%`;
    }

    function downloadTranslated() {
        const workbook = translatedWorkbook || buildTranslationWorkbook();
        if (!workbook) {
            alert('没有可下载的翻译结果');
            return;
        }

        translatedWorkbook = workbook;
        downloadWorkbookFile(workbook, `${originalFileName}_translated.xlsx`);
    }

    function resetTranslateTool() {
        sheetData = null;
        originalFileName = '';
        translatedData = null;
        translatedDataLocal = null;
        translatedWorkbook = null;
        translationRunReport = null;
        failedTranslationTasks = [];
        pendingRetryTranslationTasks = null;
        translateSources = [];
        selectedTranslateSourceIds = new Set();
        selectedColumns = [];
        successCount = 0;
        failCount = 0;

        fileInput.value = '';

        document.getElementById('translateTotalRows').textContent = '-';
        document.getElementById('translateTotalCols').textContent = '-';
        document.getElementById('translateProgressFill').style.width = '0%';
        document.getElementById('translateProgressInfo').textContent = '';

        fileInfo.style.display = 'none';
        columnSelectSection.style.display = 'none';
        if (translateSheetSelectPanel) translateSheetSelectPanel.style.display = 'none';
        progressSection.style.display = 'none';
        downloadSection.style.display = 'none';
        updateTranslationRunActions();
    }

    function isSpecialCode(text) {
        const specialPatterns = [
            /^<color=.*?>.*?<\/color>$/i,
            /^<outline.*?>.*?<\/outline>$/i,
            /^<b>.*?<\/b>$/i,
            /^<i>.*?<\/i>$/i,
            /^(图|技能|物品|任务|成就)等[一二三四五六七八九十\d]+$/i,
            /^[A-Z]+$/i
        ];
        return specialPatterns.some(pattern => pattern.test(text.trim()));
    }

    function getYoudaoLanguageCode(lang) {
        const map = {
            'zh-CN': 'zh-CHS',
            'zh-TW': 'zh-CHT',
            en: 'en',
            ja: 'ja',
            ko: 'ko',
            fr: 'fr',
            de: 'de',
            es: 'es',
            pt: 'pt',
            ru: 'ru',
            th: 'th',
            vi: 'vi',
            id: 'id'
        };
        return map[lang] || lang || 'auto';
    }

    function getYoudaoHandleOption(model) {
        if (model === 'youdao-ziyue-lite-1.5b') return '3';
        return '0';
    }

    function truncateYoudaoSignText(text) {
        const value = String(text || '');
        if (value.length <= 20) return value;
        return `${value.slice(0, 10)}${value.length}${value.slice(-10)}`;
    }

    async function sha256Hex(text) {
        if (!window.crypto?.subtle) {
            throw new Error('当前运行环境不支持 SHA-256 签名，无法调用有道翻译接口');
        }

        const data = new TextEncoder().encode(text);
        const digest = await window.crypto.subtle.digest('SHA-256', data);
        return [...new Uint8Array(digest)]
            .map(byte => byte.toString(16).padStart(2, '0'))
            .join('');
    }

    function buildYoudaoPrompt(rules) {
        const cleanRules = String(rules || '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 900);
        const prefix = '请按游戏本地化标准翻译，保留占位符、数字、换行、颜色标签和格式标记，译文自然、简洁、符合目标语言习惯。';
        return cleanRules ? `${prefix} 项目规则：${cleanRules}`.slice(0, 1200) : prefix;
    }

    function parseYoudaoStreamResponse(text) {
        const lines = String(text || '').split(/\r?\n/);
        let fullResult = '';
        let incrementalResult = '';
        let errorMessage = '';

        lines.forEach(line => {
            const trimmed = line.trim();
            if (!trimmed || trimmed === 'data: [DONE]') return;

            const payload = trimmed.startsWith('data:')
                ? trimmed.replace(/^data:\s*/, '')
                : trimmed;

            try {
                const data = JSON.parse(payload);
                if (data.code && data.code !== '0') {
                    errorMessage = data.message || `有道翻译错误：${data.code}`;
                }
                if (data.errorCode && data.errorCode !== '0') {
                    errorMessage = data.errorMsg || data.message || errorMessage || `有道翻译错误：${data.errorCode}`;
                }
                if (data.success === false) {
                    errorMessage = data.msg || data.message || errorMessage || '有道翻译返回失败';
                }
                if (data.successful === false) {
                    errorMessage = data.message || errorMessage || '有道翻译返回失败';
                }

                const resultData = data.data && typeof data.data === 'object' ? data.data : data;
                if (resultData.transFull) {
                    fullResult = String(resultData.transFull);
                }
                if (resultData.transIncre) {
                    incrementalResult += String(resultData.transIncre);
                }
                if (Array.isArray(resultData.translation) && resultData.translation[0]) {
                    fullResult = String(resultData.translation[0]);
                }
            } catch {
                // Ignore non-JSON stream keepalive lines.
            }
        });

        const result = (fullResult || incrementalResult).trim();
        if (result) return result;
        throw new Error(errorMessage || '有道翻译未返回译文');
    }

    async function translateWithYoudaoLlm(text, sourceLang, targetLang, rules, profile, signal = null) {
        const appKey = String(profile.apiKey || '').trim();
        const appSecret = String(profile.apiSecret || '').trim();
        const salt = `${Date.now()}${Math.random().toString(16).slice(2)}`;
        const curtime = Math.floor(Date.now() / 1000).toString();
        const sign = await sha256Hex(`${appKey}${truncateYoudaoSignText(text)}${salt}${curtime}${appSecret}`);
        const endpoint = getApiBaseUrl(profile.provider, profile.baseUrl);

        const body = new URLSearchParams({
            i: text,
            from: getYoudaoLanguageCode(sourceLang),
            to: getYoudaoLanguageCode(targetLang),
            appKey,
            salt,
            sign,
            signType: 'v3',
            curtime,
            handleOption: getYoudaoHandleOption(profile.model),
            streamType: 'full',
            prompt: buildYoudaoPrompt(rules)
        });

        const response = await fetchWithTranslateAbort(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
            },
            body
        }, signal);

        if (!response.ok) {
            throw new Error(`Youdao API error: ${response.status}`);
        }

        return parseYoudaoStreamResponse(await response.text());
    }

    async function fetchWithTranslateAbort(url, options, signal) {
        if (signal?.aborted) {
            throw new Error('TRANSLATION_CANCELLED');
        }
        return fetch(url, {
            ...options,
            signal
        });
    }

    function getTranslationMaxTokens(text, targetLang) {
        const texts = Array.isArray(text) ? text : [text];
        const length = texts.reduce((total, item) => total + String(item || '').trim().length, 0);
        const multiplier = targetLang === 'en' ? 2.5 : 2;
        const estimated = Math.ceil(length * multiplier) + texts.length * 10 + 48;
        const upperLimit = texts.length > 1 ? 4096 : 512;
        return Math.max(64, Math.min(upperLimit, estimated));
    }

    function cleanTranslationResponse(text) {
        let value = String(text || '').trim();
        value = value.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
        value = value.replace(/^```(?:\w+)?\s*|\s*```$/g, '').trim();
        value = value.replace(/^(翻译结果|译文|translation|translated text)\s*[:：]\s*/i, '').trim();
        value = value.replace(/^["'""']+|["'""']+$/g, '').trim();
        return value;
    }

    function makeTranslateFailureText(text) {
        return `[翻译失败] ${text}`;
    }

    function isTranslateFailureText(text) {
        return String(text || '').startsWith('[翻译失败]');
    }

    function getTranslationBatchSize(profile) {
        if (profile?.provider === 'youdaoTranslate') return 1;
        return 20;
    }

    function parseBatchTranslationResponse(text, expectedCount) {
        const cleaned = cleanTranslationResponse(text);
        const jsonText = cleaned.includes('[')
            ? cleaned.slice(cleaned.indexOf('['), cleaned.lastIndexOf(']') + 1)
            : cleaned;
        const data = JSON.parse(jsonText);
        if (!Array.isArray(data) || data.length !== expectedCount) {
            throw new Error('批量翻译返回数量不一致');
        }

        return data.map(item => {
            if (typeof item === 'string') return cleanTranslationResponse(item);
            if (item && typeof item === 'object') {
                return cleanTranslationResponse(item.translation || item.text || item.result || '');
            }
            return '';
        });
    }

    function buildBatchTranslatePromptParts(texts, sourceLang, targetLang, rules, glossaryTerms = []) {
        const langNames = {
            'en': 'English',
            'ja': 'Japanese',
            'ko': 'Korean',
            'zh-TW': 'Traditional Chinese',
            'fr': 'French',
            'de': 'German',
            'es': 'Spanish',
            'pt': 'Portuguese',
            'ru': 'Russian',
            'th': 'Thai',
            'vi': 'Vietnamese',
            'id': 'Indonesian'
        };
        const compactRules = String(rules || '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 700);
        const payload = texts.map((text, index) => ({ id: index + 1, text }));
        const glossarySection = buildTranslateGlossaryPromptSection(glossaryTerms, targetLang);
        const systemPrompt = `你是批量游戏本地化翻译引擎。将 texts 中的游戏文本逐条翻译成${langNames[targetLang] || targetLang}。
只返回 JSON 字符串数组，数组长度必须等于 texts 数量，顺序必须一致。不要解释，不要输出思考过程，不要 Markdown。
要求：完整翻译；保留 %s/%d、\\n、数字、HTML/颜色/outline 标签；语言自然简洁。
项目规则：${compactRules || '按通用游戏本地化规范执行'}${glossarySection}`;
        const userPrompt = `texts:
${JSON.stringify(payload)}`;

        return {
            systemPrompt,
            userPrompt,
            cacheKey: makePromptCacheKey('translate', `${sourceLang}:${targetLang}:${systemPrompt}`)
        };
    }

    function buildBatchTranslatePrompt(texts, sourceLang, targetLang, rules, glossaryTerms = []) {
        const { systemPrompt, userPrompt } = buildBatchTranslatePromptParts(texts, sourceLang, targetLang, rules, glossaryTerms);
        return `${systemPrompt}\n\n${userPrompt}`;
    }

    async function translateBatchWithRetry(tasks, sourceLang, targetLang, rules, profile, signal, retries = 2, glossaryTerms = []) {
        if (!tasks || tasks.length <= 1 || profile.provider === 'youdaoTranslate') return null;

        const apiConfig = profile || getApiConfig();
        const model = apiConfig.model || document.getElementById('aiModel').value;
        const texts = tasks.map(task => task.text);

        for (let attempt = 0; attempt < retries; attempt++) {
            try {
                await waitForNetwork(signal);
                if (signal?.aborted) {
                    throw new Error('TRANSLATION_CANCELLED');
                }
                const batchGlossary = getRelevantTranslateGlossaryTerms(texts, glossaryTerms, targetLang);
                tasks.forEach(task => { task.glossaryTerms = getRelevantTranslateGlossaryTerms(task.text, glossaryTerms, targetLang); });
                const promptParts = buildBatchTranslatePromptParts(texts, sourceLang, targetLang, rules, batchGlossary);
                const content = await requestModelContent(
                    apiConfig,
                    {
                        model,
                        messages: [
                            {
                                role: 'system',
                                content: promptParts.systemPrompt,
                                cacheControl: true
                            },
                            { role: 'user', content: promptParts.userPrompt }
                        ],
                        prompt_cache_key: promptParts.cacheKey,
                        temperature: 0.1,
                        max_tokens: getTranslationMaxTokens(texts, targetLang)
                    },
                    signal,
                    API_REQUEST_TIMEOUT_MS
                );
                const translations = parseBatchTranslationResponse(content, tasks.length);
                if (translations.every(Boolean)) return translations;
                throw new Error('批量翻译返回空译文');
            } catch (error) {
                if (signal?.aborted || error.name === 'AbortError' || error.message === 'TRANSLATION_CANCELLED') {
                    throw error;
                }
                console.warn(`Batch translate attempt ${attempt + 1} failed:`, error);
                if (attempt === retries - 1) return null;
                await new Promise(resolve => setTimeout(resolve, 700 * (attempt + 1)));
            }
        }

        return null;
    }

    async function translateTextWithRetry(text, sourceLang, targetLang, rules, profile = null, retries = 3, signal = null, glossaryTerms = []) {
        const apiConfig = profile || getApiConfig();
        const model = apiConfig.model || document.getElementById('aiModel').value;

        if (!apiConfig.apiKey) {
            throw new Error(`${apiConfig.name || getPlatformName(apiConfig.provider)} 未添加 API Key`);
        }

        console.log(`🤖 正在使用翻译通道: ${apiConfig.name || getPlatformName(apiConfig.provider)} / ${model}`);

        for (let attempt = 0; attempt < retries; attempt++) {
            try {
                await waitForNetwork(signal);
                if (signal?.aborted) {
                    throw new Error('TRANSLATION_CANCELLED');
                }

                if (apiConfig.provider === 'youdaoTranslate') {
                    return await translateWithYoudaoLlm(text, sourceLang, targetLang, `${rules || ""}
${buildTranslateGlossaryPromptSection(glossaryTerms, targetLang)}`, apiConfig, signal);
                }

                const prompt = buildTranslatePrompt(text, sourceLang, targetLang, rules, glossaryTerms);
                const content = await requestModelContent(
                    apiConfig,
                    {
                        model: model,
                        messages: [
                            {
                                role: 'system',
                                content: '你是游戏本地化翻译引擎。只输出最终译文，不输出解释、推理、分析、Markdown、JSON 或原文。'
                            },
                            { role: 'user', content: prompt }
                        ],
                        temperature: 0.1,
                        max_tokens: getTranslationMaxTokens(text, targetLang)
                    },
                    signal,
                    API_REQUEST_TIMEOUT_MS
                );
                let translated = cleanTranslationResponse(content);
                return translated;

            } catch (error) {
                if (signal?.aborted || error.name === 'AbortError' || error.message === 'TRANSLATION_CANCELLED') {
                    throw error;
                }
                console.error(`Translate attempt ${attempt + 1} failed:`, error);
                if (attempt === retries - 1) {
                    return makeTranslateFailureText(text);
                }
                await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
            }
        }
        return makeTranslateFailureText(text);
    }

    function buildTranslatePrompt(text, sourceLang, targetLang, rules, glossaryTerms = []) {
        const langNames = {
            'en': 'English',
            'ja': 'Japanese',
            'ko': 'Korean',
            'zh-TW': 'Traditional Chinese',
            'fr': 'French',
            'de': 'German',
            'es': 'Spanish',
            'pt': 'Portuguese',
            'ru': 'Russian',
            'th': 'Thai',
            'vi': 'Vietnamese',
            'id': 'Indonesian'
        };

        const compactRules = String(rules || '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 700);

        const glossarySection = buildTranslateGlossaryPromptSection(glossaryTerms, targetLang);

        return `将下面游戏文本翻译成${langNames[targetLang] || targetLang}。只返回译文。

要求：完整翻译；保留 %s/%d、\\n、数字、HTML/颜色/outline 标签；语言自然简洁；不要解释，不要输出思考过程。

项目规则：${compactRules || '按通用游戏本地化规范执行'}${glossarySection}

待翻译文本：
${text}`;
    }
}

function initConvertTool() {
    const uploadArea = document.getElementById('convertUploadArea');
    const fileInput = document.getElementById('convertFileInput');
    const fileInfo = document.getElementById('convertFileInfo');
    const convertBtn = document.getElementById('convertBtn');
    const downloadBtn = document.getElementById('convertDownloadBtn');
    const resetBtn = document.getElementById('convertResetBtn');
    const downloadSection = document.getElementById('convertDownloadSection');

    let sheetData = null;
    let originalFileName = '';

    fileInput.addEventListener('click', (e) => e.stopPropagation());
    uploadArea.addEventListener('click', () => fileInput.click());
    bindUploadDrop(uploadArea, fileInput, handleConvertFile);

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleConvertFile(e.target.files[0]);
        }
    });

    convertBtn.addEventListener('click', startConvert);
    downloadBtn.addEventListener('click', downloadConverted);
    resetBtn.addEventListener('click', resetConvertTool);

    async function handleConvertFile(file) {
        originalFileName = file.name.replace(/\.(csv|xlsx|xls)$/i, '');
        const extension = file.name.split('.').pop().toLowerCase();

        document.getElementById('convertFileName').textContent = file.name;
        document.getElementById('convertFileSize').textContent = formatFileSize(file.size);

        if (extension === 'csv') {
            const { text, encoding } = await readCSVWithEncoding(file);
            document.getElementById('convertFileEncoding').textContent = encoding;

            const result = XLSX.read(text, { type: 'string', cellDates: true });
            const sheetName = result.SheetNames[0];
            sheetData = XLSX.utils.sheet_to_json(result.Sheets[sheetName], { header: 1 });
        } else {
            document.getElementById('convertFileEncoding').textContent = 'N/A (Excel)';
            const arrayBuffer = await file.arrayBuffer();
            const result = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
            const sheetName = result.SheetNames[0];
            sheetData = XLSX.utils.sheet_to_json(result.Sheets[sheetName], { header: 1 });
        }

        document.getElementById('convertTotalRows').textContent = sheetData.length;
        document.getElementById('convertTotalCols').textContent = sheetData[0] ? sheetData[0].length : 0;

        fileInfo.style.display = 'block';
        downloadSection.style.display = 'none';
    }

    function startConvert() {
        const outputFormat = document.getElementById('outputFormat').value;
        const delimiter = document.getElementById('delimiter').value;
        const newlineInput = document.getElementById('newline').value;

        let newline = newlineInput;
        if (newlineInput === '\\n') {
            newline = '\n';
        } else if (newlineInput === '\\r\\n') {
            newline = '\r\n';
        } else if (newlineInput === '\\r') {
            newline = '\r';
        }

        hideStatus();
        setStatus('processing', '正在转换文件...', `目标格式: ${getFormatName(outputFormat)}`);

        try {
            const csvContent = convertToFormat(sheetData, delimiter, newline);
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });

            const fileName = `${originalFileName}_converted.csv`;
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            document.getElementById('convertOutputFormat').textContent = getFormatName(outputFormat);
            downloadSection.style.display = 'block';

            setStatus('success', '转换完成！', `已转换为 ${getFormatName(outputFormat)}`);

        } catch (error) {
            console.error('Convert error:', error);
            setStatus('error', '转换失败', error.message);
        }
    }

    function convertToFormat(data, delimiter, newline) {
        const rows = data.map(row => {
            return row.map(cell => {
                if (cell === null || cell === undefined) return '';
                const str = String(cell);
                if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                    return '"' + str.replace(/"/g, '""') + '"';
                }
                return str;
            }).join(delimiter);
        });

        return rows.join(newline);
    }

    function getFormatName(format) {
        const names = {
            'utf8': 'UTF-8（无 BOM）',
            'utf8-bom': 'UTF-8（带 BOM）',
            'gbk': 'GBK',
            'gb2312': 'GB2312',
            'utf16': 'UTF-16 LE'
        };
        return names[format] || format;
    }

    function downloadConverted() {
        alert('文件已下载');
    }

    function resetConvertTool() {
        sheetData = null;
        originalFileName = '';
        fileInput.value = '';

        document.getElementById('convertTotalRows').textContent = '-';
        document.getElementById('convertTotalCols').textContent = '-';
        document.getElementById('outputFormat').value = 'utf8';
        document.getElementById('delimiter').value = ',';
        document.getElementById('newline').value = '\n';

        fileInfo.style.display = 'none';
        downloadSection.style.display = 'none';
        hideStatus();
    }
}

function initGlossaryOrganizeTool() {
    const uploadArea = document.getElementById('organizeGlossaryUploadArea');
    const fileInput = document.getElementById('organizeGlossaryInput');
    const uploadStatus = document.getElementById('organizeGlossaryUploadStatus');
    const columnPanel = document.getElementById('organizeGlossaryColumnPanel');
    const sheetPanel = document.getElementById('organizeGlossarySheetPanel');
    const sheetList = document.getElementById('organizeGlossarySheetList');
    const sheetCount = document.getElementById('organizeGlossarySheetCount');
    const sourceSelect = document.getElementById('organizeSourceColumn');
    const targetSelect = document.getElementById('organizeTargetColumn');
    const typeSelect = document.getElementById('organizeTypeColumn');
    const idSelect = document.getElementById('organizeIdColumn');
    const organizeBtn = document.getElementById('organizeGlossaryBtn');
    const progressPanel = document.getElementById('organizeGlossaryProgress');
    const progressFill = document.getElementById('organizeGlossaryProgressFill');
    const progressText = document.getElementById('organizeGlossaryProgressText');
    const progressPercent = document.getElementById('organizeGlossaryProgressPercent');
    const progressInfo = document.getElementById('organizeGlossaryProgressInfo');
    const pauseBtn = document.getElementById('organizeGlossaryPauseBtn');
    const resumeBtn = document.getElementById('organizeGlossaryResumeBtn');
    const cancelBtn = document.getElementById('organizeGlossaryCancelBtn');
    const resultsPanel = document.getElementById('organizeGlossaryResults');
    const resultBody = document.getElementById('organizeGlossaryBody');
    const summaryText = document.getElementById('organizeGlossarySummary');
    const downloadBtn = document.getElementById('organizeGlossaryDownloadBtn');
    const saveBtn = document.getElementById('organizeGlossarySaveBtn');
    const resetBtn = document.getElementById('organizeGlossaryResetBtn');
    const categoriesInput = document.getElementById('organizeGlossaryCategories');
    const synonymsInput = document.getElementById('organizeGlossarySynonyms');
    const modelSelect = document.getElementById('organizeGlossaryModel');
    const referenceList = document.getElementById('organizeGlossaryReferenceList');
    const hasHeaderInput = document.getElementById('organizeGlossaryHasHeader');

    if (!uploadArea || !fileInput) return;

    let sources = [];
    let selectedSourceIds = new Set();
    let selectedReferenceIds = new Set();
    let combinedRows = [];
    let organizedTerms = [];
    let workbookName = 'organized_glossary';
    let organizerTaskState = null;
    let organizerTaskController = null;
    let organizerResumeResolvers = [];

    uploadArea.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', event => {
        if (event.target.files.length > 0) {
            void handleFiles([...event.target.files]);
        }
    });
    bindUploadDrop(uploadArea, fileInput, (file, files = []) => handleFiles(files.length > 0 ? files : [file]));
    organizeBtn?.addEventListener('click', () => void organizeGlossary());
    pauseBtn?.addEventListener('click', pauseOrganizerTask);
    resumeBtn?.addEventListener('click', resumeOrganizerTask);
    cancelBtn?.addEventListener('click', cancelOrganizerTask);
    downloadBtn?.addEventListener('click', downloadOrganizedGlossary);
    saveBtn?.addEventListener('click', saveOrganizedGlossary);
    resetBtn?.addEventListener('click', resetOrganizer);
    hasHeaderInput?.addEventListener('change', () => {
        rebuildCombinedRows();
        renderSheetList();
        renderColumnSelects();
    });
    document.addEventListener('nexus:glossary-library-updated', renderReferenceGlossaryList);
    renderReferenceGlossaryList();
    updateOrganizerTaskButtons();

    function makeSourceId(fileName, sheetName, index) {
        return `organize_${makeStableId(`${fileName}:${sheetName}:${index}`)}`;
    }

    function createOrganizerAbortError() {
        return new DOMException('Glossary organizer task cancelled', 'AbortError');
    }

    function isOrganizerAbortError(error) {
        return error?.name === 'AbortError' || error?.message === 'ORGANIZER_TASK_CANCELLED';
    }

    function updateOrganizerTaskButtons() {
        const isRunning = Boolean(organizerTaskState?.running);
        const isPaused = Boolean(organizerTaskState?.paused);

        if (organizeBtn) {
            organizeBtn.disabled = isRunning;
            organizeBtn.classList.toggle('disabled', isRunning);
        }
        if (pauseBtn) {
            pauseBtn.style.display = isRunning && !isPaused ? 'inline-flex' : 'none';
            pauseBtn.disabled = !isRunning || Boolean(organizerTaskState?.cancelled);
        }
        if (resumeBtn) {
            resumeBtn.style.display = isRunning && isPaused ? 'inline-flex' : 'none';
            resumeBtn.disabled = !isRunning || Boolean(organizerTaskState?.cancelled);
        }
        if (cancelBtn) {
            cancelBtn.style.display = isRunning ? 'inline-flex' : 'none';
            cancelBtn.disabled = !isRunning || Boolean(organizerTaskState?.cancelled);
        }
    }

    function flushOrganizerResumeWaiters() {
        const resolvers = organizerResumeResolvers;
        organizerResumeResolvers = [];
        resolvers.forEach(resolve => resolve());
    }

    function beginOrganizerTask() {
        if (organizerTaskController) {
            organizerTaskController.abort();
        }
        organizerTaskController = new AbortController();
        organizerTaskState = {
            running: true,
            paused: false,
            cancelled: false,
            startedAt: Date.now(),
            signal: organizerTaskController.signal
        };
        updateOrganizerTaskButtons();
        return organizerTaskState;
    }

    function finishOrganizerTask(taskState = organizerTaskState) {
        if (taskState && organizerTaskState === taskState) {
            organizerTaskState.running = false;
            organizerTaskState.paused = false;
            organizerTaskState = null;
            organizerTaskController = null;
        }
        flushOrganizerResumeWaiters();
        updateOrganizerTaskButtons();
    }

    function pauseOrganizerTask() {
        if (!organizerTaskState?.running || organizerTaskState.paused) return;
        organizerTaskState.paused = true;
        updateOrganizerTaskButtons();
        if (progressInfo) {
            progressInfo.textContent = '已暂停：当前请求如果已发出，会等它返回；暂停期间不会发起下一批。';
        }
        setStatus('warning', '术语整理已暂停', '当前已发出的请求会继续等待返回，暂停期间不会发起新的批次。');
    }

    function resumeOrganizerTask() {
        if (!organizerTaskState?.running || !organizerTaskState.paused) return;
        organizerTaskState.paused = false;
        updateOrganizerTaskButtons();
        setStatus('processing', '术语整理继续运行', '正在继续整理后续批次。');
        flushOrganizerResumeWaiters();
    }

    function cancelOrganizerTask(options = {}) {
        if (!organizerTaskState?.running) return;
        const shouldCancel = options.skipConfirm || confirm('确定取消当前术语整理任务吗？已完成的批次会保留，可下载当前整理结果；未开始的批次不会继续消耗 API 额度。');
        if (!shouldCancel) return;

        organizerTaskState.cancelled = true;
        organizerTaskState.paused = false;
        if (organizerTaskController) {
            organizerTaskController.abort();
        }
        flushOrganizerResumeWaiters();
        updateOrganizerTaskButtons();
        if (progressInfo) {
            progressInfo.textContent = '正在取消任务，已停止后续批次。';
        }
        if (!options.silent) {
            setStatus('warning', '正在取消术语整理', '已停止后续批次；正在中断或等待当前请求结束。');
        }
    }

    function assertOrganizerTaskActive(taskState = organizerTaskState) {
        if (taskState?.cancelled || taskState?.signal?.aborted) {
            throw createOrganizerAbortError();
        }
    }

    async function waitOrganizerIfPaused(taskState = organizerTaskState) {
        while (taskState?.running && taskState.paused && !taskState.cancelled) {
            await new Promise(resolve => {
                organizerResumeResolvers.push(resolve);
            });
        }
        assertOrganizerTaskActive(taskState);
    }

    function hasLikelyReviewWorkbookSource() {
        const selectedNames = getSelectedSources().map(source => String(source.sheetName || '').trim());
        return selectedNames.includes('修正后数据') ||
            selectedNames.includes('原始数据') ||
            selectedNames.includes('修改明细');
    }

    function shouldConfirmLargeOrganizerRun(rawTerms) {
        if (rawTerms.length <= 3000 && !hasLikelyReviewWorkbookSource()) return true;

        const selectedSummary = getSelectedSources()
            .map(source => `${source.sheetName || 'Sheet1'}（${Math.max(0, (source.rows?.length || 0) - getSourceHeaderInfo(source).dataStart)} 行）`)
            .join('、');
        return confirm(
            `当前将整理 ${rawTerms.length} 条记录，且所选工作表包含：${selectedSummary || '未识别'}。\n\n` +
            '如果这是“术语提取返稿”并且你想按颜色标记/备注过滤，请使用「导入人工审核返稿」，不要用这里的“开始整理术语”。\n\n' +
            '继续术语整理会调用 AI，可能明显消耗 token。确定继续吗？'
        );
    }

    async function handleFiles(files) {
        const fileList = [...(files || [])].filter(Boolean);
        if (!fileList.length) return;

        sources = [];
        let index = 0;
        for (const file of fileList) {
            const parsed = await readSpreadsheetSheets(file);
            parsed.sheets.forEach(sheet => {
                if (!sheet.rows?.length) return;
                sources.push({
                    id: makeSourceId(file.name, sheet.sheetName, index),
                    fileName: file.name,
                    sheetName: sheet.sheetName || 'Sheet1',
                    rows: sheet.rows
                });
                index++;
            });
        }

        selectedSourceIds = new Set(sources.map(source => source.id));
        if (hasHeaderInput && sources.length > 0) {
            const firstRow = sources.find(source => source.rows?.length)?.rows?.[0] || [];
            hasHeaderInput.checked = sourceLooksLikeHeader(firstRow);
        }
        workbookName = fileList.length === 1
            ? fileList[0].name.replace(/\.(csv|xlsx|xls)$/i, '')
            : `术语整理_${fileList.length}个文件`;
        rebuildCombinedRows();
        renderSheetList();
        renderColumnSelects();
        organizedTerms = [];
        resultsPanel.style.display = 'none';
        columnPanel.style.display = 'block';
        uploadStatus.textContent = `${fileList.length} 个文件 / ${sources.length} 个工作表已载入`;
        uploadStatus.className = 'upload-status success';
    }

    function getSelectedSources() {
        return sources.filter(source => selectedSourceIds.has(source.id));
    }

    function sourceLooksLikeHeader(row) {
        return (row || []).some(cell => {
            const text = String(cell || '').trim().toLowerCase();
            return text.includes('术语') ||
                text.includes('原文') ||
                text.includes('源文') ||
                text.includes('中文') ||
                text.includes('译文') ||
                text.includes('翻译') ||
                text.includes('类型') ||
                text.includes('分类') ||
                text.includes('term') ||
                text.includes('source') ||
                text.includes('target') ||
                text.includes('translation') ||
                text.includes('category');
        });
    }

    function getSourceHeaderInfo(source) {
        const rows = source.rows || [];
        const firstRow = Array.isArray(rows[0]) ? rows[0] : [];
        const hasHeader = hasHeaderInput ? hasHeaderInput.checked : sourceLooksLikeHeader(firstRow);
        const width = Math.max(0, ...rows.map(row => row?.length || 0));
        return {
            hasHeader,
            header: hasHeader
                ? [...firstRow]
                : Array.from({ length: width }, (_, index) => `列${index + 1}`),
            dataStart: hasHeader ? 1 : 0
        };
    }

    function rebuildCombinedRows() {
        const selected = getSelectedSources();
        const firstSource = selected.find(source => source.rows?.length);
        const headerInfo = firstSource ? getSourceHeaderInfo(firstSource) : { header: [] };
        const header = headerInfo.header || [];
        combinedRows = [header];
        selected.forEach(source => {
            const info = getSourceHeaderInfo(source);
            source.rows.slice(info.dataStart).forEach((row, rowOffset) => {
                combinedRows.push({
                    source,
                    originalRowNumber: rowOffset + info.dataStart + 1,
                    cells: Array.isArray(row) ? row : []
                });
            });
        });
    }

    function renderSheetList() {
        if (!sheetPanel || !sheetList || !sheetCount) return;
        const show = sources.length > 1;
        sheetPanel.style.display = show ? 'block' : 'none';
        sheetList.innerHTML = '';
        sheetCount.textContent = `${getSelectedSources().length} / ${sources.length}`;
        if (!show) return;

        sources.forEach(source => {
            const info = getSourceHeaderInfo(source);
            const rows = Math.max(0, (source.rows?.length || 0) - info.dataStart);
            const cols = source.rows?.[0]?.length || 0;
            const label = document.createElement('label');
            label.className = 'resource-check-item';
            label.innerHTML = `
                <input type="checkbox" value="${source.id}" ${selectedSourceIds.has(source.id) ? 'checked' : ''}>
                <span class="resource-main">
                    <span class="resource-title">${escapeHtml(source.fileName)} / ${escapeHtml(source.sheetName)}</span>
                    <span class="resource-meta">${rows} 行 · ${cols} 列</span>
                </span>
            `;
            const checkbox = label.querySelector('input');
            checkbox.addEventListener('change', () => {
                if (checkbox.checked) selectedSourceIds.add(source.id);
                else selectedSourceIds.delete(source.id);
                rebuildCombinedRows();
                renderSheetList();
                renderColumnSelects();
            });
            sheetList.appendChild(label);
        });
    }

    function inferColumns() {
        const header = combinedRows[0] || [];
        const normalized = header.map(cell => String(cell || '').toLowerCase());
        const find = (keys, used = new Set()) => normalized.findIndex((name, index) =>
            !used.has(index) && keys.some(key => name.includes(key))
        );
        const sourceIndex = find(['原文', '源文', '术语', '中文', 'source', 'term', 'chinese']);
        const used = new Set([sourceIndex].filter(index => index >= 0));
        const targetIndex = find(['整理后译文', '指定译文', '译文', '英文', 'english', 'target', 'translation'], used);
        used.add(targetIndex);
        const typeIndex = find(['类型', '分类', '类别', 'type', 'category'], used);
        used.add(typeIndex);
        const idIndex = find(['定位id', '定位key', 'id', 'key', '编号', 'string'], used);
        return {
            sourceIndex: sourceIndex >= 0 ? sourceIndex : 0,
            targetIndex: targetIndex >= 0 ? targetIndex : 1,
            typeIndex,
            idIndex
        };
    }

    function renderColumnSelects() {
        const header = combinedRows[0] || [];
        const inferred = inferColumns();
        const options = ['<option value="-1">不使用</option>']
            .concat(header.map((cell, index) => `<option value="${index}">${index + 1}. ${escapeHtml(cell || `列${index + 1}`)}</option>`))
            .join('');
        [sourceSelect, targetSelect, typeSelect, idSelect].forEach(select => {
            select.innerHTML = options;
        });
        sourceSelect.value = String(inferred.sourceIndex);
        targetSelect.value = String(inferred.targetIndex);
        typeSelect.value = String(inferred.typeIndex);
        idSelect.value = String(inferred.idIndex);
    }

    function getOrganizerGlossaryOriginLabel(origin) {
        if (origin === 'extracted') return '提取生成';
        if (origin === 'organized') return '整理生成';
        if (origin === 'uploaded') return '上传记录';
        return '术语库';
    }

    function renderReferenceGlossaryList() {
        if (!referenceList) return;
        const library = loadGlossaryLibrary();
        const availableIds = new Set(library.map(entry => entry.id));
        selectedReferenceIds = new Set([...selectedReferenceIds].filter(id => availableIds.has(id)));
        referenceList.innerHTML = '';

        if (library.length === 0) {
            referenceList.innerHTML = '<div class="resource-empty">暂无可参考术语库。整理完成后可以保存到术语库，后续整理、翻译、检测都会复用。</div>';
            return;
        }

        library.forEach(entry => {
            const entryTerms = normalizeGlossaryTerms(entry.terms);
            const label = document.createElement('label');
            label.className = 'resource-check-item';
            label.innerHTML = `
                <input type="checkbox" value="${entry.id}" ${selectedReferenceIds.has(entry.id) ? 'checked' : ''}>
                <span class="resource-main">
                    <span class="resource-title">${escapeHtml(entry.name || entry.sourceFileName || '未命名术语库')}</span>
                    <span class="resource-meta">${entryTerms.length} 条术语 · ${getOrganizerGlossaryOriginLabel(entry.origin)}${entry.sourceFileName ? ` · ${escapeHtml(entry.sourceFileName)}` : ''}</span>
                </span>
            `;
            const checkbox = label.querySelector('input');
            checkbox.addEventListener('change', () => {
                if (checkbox.checked) selectedReferenceIds.add(entry.id);
                else selectedReferenceIds.delete(entry.id);
            });
            referenceList.appendChild(label);
        });
    }

    function getReferenceGlossaryTerms() {
        const library = loadGlossaryLibrary();
        return library
            .filter(entry => selectedReferenceIds.has(entry.id))
            .flatMap(entry => normalizeGlossaryTerms(entry.terms))
            .slice(0, 1200);
    }

    function buildReferenceExamples(terms, sourceTerms) {
        if (!terms.length) return [];
        const sourceSet = new Set(sourceTerms.map(term => String(term.source || '').toLowerCase()));
        const exact = [];
        const categoryExamples = [];

        terms.forEach(term => {
            const item = {
                source: term.source,
                target: getGlossaryEffectiveTarget(term),
                organizedType: getGlossaryOrganizedType(term),
                secondaryType: term.secondaryType || ''
            };
            if (sourceSet.has(String(term.source || '').toLowerCase())) {
                exact.push(item);
            } else if (categoryExamples.length < 80) {
                categoryExamples.push(item);
            }
        });

        return exact.slice(0, 120).concat(categoryExamples).slice(0, 160);
    }

    function parseCategoryList() {
        return String(categoriesInput.value || '')
            .split(/\r?\n/)
            .map(item => item.trim())
            .filter(Boolean);
    }

    function parseSynonymMap() {
        const map = new Map();
        String(synonymsInput.value || '').split(/\r?\n/).forEach(line => {
            const [left, right] = line.split('=>').map(part => String(part || '').trim());
            if (!left || !right) return;
            left.split(/[\/,，、]/).map(item => item.trim()).filter(Boolean).forEach(alias => {
                map.set(alias.toLowerCase(), right);
            });
        });
        return map;
    }

    function normalizeTypeBySynonyms(type, categories, synonymMap) {
        const raw = String(type || '').trim();
        if (!raw) return '';
        const direct = categories.find(category => category.toLowerCase() === raw.toLowerCase());
        if (direct) return direct;
        return synonymMap.get(raw.toLowerCase()) || raw;
    }

    function collectTermsFromRows() {
        const sourceIndex = Number(sourceSelect.value);
        const targetIndex = Number(targetSelect.value);
        const typeIndex = Number(typeSelect.value);
        const idIndex = Number(idSelect.value);
        const categories = parseCategoryList();
        const synonymMap = parseSynonymMap();

        return combinedRows.slice(1).map((record, index) => {
            const row = record.cells || [];
            const source = sourceIndex >= 0 ? String(row[sourceIndex] || '').trim() : '';
            const target = targetIndex >= 0 ? String(row[targetIndex] || '').trim() : '';
            const originalType = typeIndex >= 0 ? String(row[typeIndex] || '').trim() : '';
            const referenceId = idIndex >= 0 ? String(row[idIndex] || '').trim() : '';
            return {
                source,
                target,
                translation: target,
                originalType,
                type: normalizeTypeBySynonyms(originalType, categories, synonymMap),
                referenceId,
                referenceRows: String(record.originalRowNumber || index + 2),
                sourceFileName: record.source?.fileName || '',
                sheetName: record.source?.sheetName || '',
                count: 1,
                confidence: 0,
                note: '',
                qualityStatus: '',
                qualityIssues: '',
                qualitySuggestion: ''
            };
        }).filter(term => term.source);
    }

    function mergeDuplicateTerms(terms) {
        const map = new Map();
        terms.forEach(term => {
            const key = `${term.source.toLowerCase()}|${String(term.target || '').toLowerCase()}`;
            if (!map.has(key)) {
                map.set(key, { ...term, duplicateCount: 1 });
                return;
            }
            const existing = map.get(key);
            existing.duplicateCount++;
            existing.count = Number(existing.count || 1) + Number(term.count || 1);
            existing.referenceId = [existing.referenceId, term.referenceId].filter(Boolean).join('; ');
            existing.referenceRows = [existing.referenceRows, term.referenceRows].filter(Boolean).join('; ');
            existing.mergeNote = `已合并 ${existing.duplicateCount} 条重复术语`;
            existing.originalType = [...new Set([existing.originalType, term.originalType].filter(Boolean))].join('; ');
        });
        return [...map.values()];
    }

    function fallbackClassifyTerm(term, categories, synonymMap) {
        const text = `${term.source} ${term.target} ${term.originalType}`.toLowerCase();
        const fromSynonym = normalizeTypeBySynonyms(term.originalType, categories, synonymMap);
        if (fromSynonym && categories.includes(fromSynonym)) return fromSynonym;
        const rules = [
            [/skill|attack|damage|buff|debuff|战斗|技能|伤害|攻击/, '技能/战斗'],
            [/equip|gear|weapon|armor|item|道具|装备|武器|护甲|物品/, '道具/装备'],
            [/town|city|building|castle|map|地点|建筑|城|地图/, '建筑/地点'],
            [/quest|story|dialog|任务|剧情|章节/, '任务/剧情'],
            [/ui|button|menu|system|界面|系统|按钮|菜单/, '系统/UI'],
            [/gold|coin|gem|resource|货币|资源|金币|钻石/, '货币/资源'],
            [/hp|atk|def|level|属性|数值|等级|防御|攻击/, '数值/属性']
        ];
        return rules.find(([regex, category]) => regex.test(text) && categories.includes(category))?.[1] ||
            categories.find(category => category.includes('其他')) ||
            categories[0] ||
            '其他/待确认';
    }

    function localQualityCheck(term) {
        const issues = [];
        if (!term.target) issues.push('缺少指定译文');
        if (term.target && /[^\x00-\x7F]/.test(term.target)) issues.push('译文含非英文字符，需确认');
        if (/^\d+$/.test(term.source)) issues.push('原文术语是纯数字，需确认是否应纳入术语库');
        if (term.source.length > 30) issues.push('原文术语较长，可能是短句而非术语');
        return {
            qualityStatus: issues.length ? '需确认' : '通过',
            qualityIssues: issues.join('；'),
            qualitySuggestion: issues.length ? '建议人工复核该术语是否应作为固定术语' : ''
        };
    }

    function parseOrganizerJson(text) {
        const raw = String(text || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
        try {
            return JSON.parse(raw);
        } catch {
            const match = raw.match(/\[[\s\S]*\]/);
            if (match) return JSON.parse(match[0]);
            throw new Error('无法解析 AI 术语整理结果');
        }
    }

    function buildOrganizerPrompt(terms, categories, referenceExamples = []) {
        return `你是游戏本地化术语库整理专家。请整理这些已有术语。
要求：
1. 不要新增不存在的术语。
2. 从给定分类中选择最合适的 organizedType。
3. secondaryType 可更细，例如 武器/防具/建筑/资源/按钮/属性。
4. 检查译文是否符合游戏行业常用表达，发现拼写、不自然、数字/符号风险要写 qualityIssues 和 qualitySuggestion。
5. 如参考术语库里已有同一原文或明显同类术语，优先沿用其整理后译文和标准分类。
6. confidence 0-100。
7. 只返回 JSON 数组，不要解释。

可用分类：
${categories.join('\n')}

参考术语库样例：
${JSON.stringify(referenceExamples)}

输入术语：
${JSON.stringify(terms.map((term, index) => ({
    id: index,
    source: term.source,
    target: term.target,
    originalType: term.originalType,
    referenceId: term.referenceId
})))}

返回字段：
[{ "id":0, "organizedType":"", "secondaryType":"", "confidence":90, "categoryReason":"", "qualityStatus":"通过|需确认|有问题", "qualityIssues":"", "qualitySuggestion":"", "finalTranslation":"" }]`;
    }

    async function organizeGlossary() {
        if (organizerTaskState?.running) {
            setStatus('warning', '术语整理正在运行', '请先暂停、继续或取消当前任务。');
            return;
        }

        const rawTerms = mergeDuplicateTerms(collectTermsFromRows());
        if (!rawTerms.length) {
            alert('没有可整理的术语');
            return;
        }
        if (!getApiConfig().apiKey) {
            alert('请先配置 API Key');
            revealApiConfigPanel();
            return;
        }
        if (!shouldConfirmLargeOrganizerRun(rawTerms)) {
            setStatus('warning', '已取消术语整理', '建议只勾选“术语表”工作表，或改用“导入人工审核返稿”处理带颜色标记的返稿。');
            return;
        }

        const categories = parseCategoryList();
        const synonymMap = parseSynonymMap();
        const apiConfig = getApiConfig();
        const model = modelSelect.value === CUSTOM_MODEL_OPTION
            ? apiConfig.model
            : (modelSelect.value || apiConfig.model);
        const referenceTerms = getReferenceGlossaryTerms();
        const referenceExamples = buildReferenceExamples(referenceTerms, rawTerms);
        const taskState = beginOrganizerTask();
        organizedTerms = [];
        progressPanel.style.display = 'block';
        resultsPanel.style.display = 'none';
        progressFill.style.width = '0%';
        progressText.textContent = `0 / ${rawTerms.length}`;
        progressPercent.textContent = '0%';

        const chunkSize = 80;
        const totalChunks = Math.ceil(rawTerms.length / chunkSize);

        try {
            for (let i = 0; i < rawTerms.length; i += chunkSize) {
                await waitOrganizerIfPaused(taskState);
                assertOrganizerTaskActive(taskState);

                const chunk = rawTerms.slice(i, i + chunkSize);
                const chunkNumber = Math.floor(i / chunkSize) + 1;
                const progress = Math.round((i / rawTerms.length) * 100);
                progressFill.style.width = `${progress}%`;
                progressText.textContent = `${i} / ${rawTerms.length}`;
                progressPercent.textContent = `${progress}%`;
                progressInfo.textContent = `正在整理第 ${chunkNumber} / ${totalChunks} 批，已完成 ${i} 条`;

                try {
                    const content = await requestModelContent(apiConfig, {
                        model,
                        messages: [
                            { role: 'system', content: '你是游戏本地化术语标准化整理专家，只返回 JSON。' },
                            { role: 'user', content: buildOrganizerPrompt(chunk, categories, referenceExamples) }
                        ],
                        temperature: 0.1,
                        max_tokens: 4096
                    }, taskState.signal);
                    assertOrganizerTaskActive(taskState);

                    const aiRows = parseOrganizerJson(content);
                    const aiById = new Map(aiRows.map(item => [Number(item.id), item]));
                    chunk.forEach((term, index) => {
                        const ai = aiById.get(index) || {};
                        const localQa = localQualityCheck(term);
                        const organizedType = ai.organizedType || fallbackClassifyTerm(term, categories, synonymMap);
                        organizedTerms.push({
                            ...term,
                            type: organizedType,
                            organizedType,
                            secondaryType: ai.secondaryType || '',
                            confidence: Number(ai.confidence || term.confidence || 0),
                            categoryReason: ai.categoryReason || '按术语文本、译文和原始类型综合判断',
                            finalTranslation: ai.finalTranslation || term.finalTranslation || term.target || '',
                            qualityStatus: ai.qualityStatus || localQa.qualityStatus,
                            qualityIssues: ai.qualityIssues || localQa.qualityIssues,
                            qualitySuggestion: ai.qualitySuggestion || localQa.qualitySuggestion,
                            extractionSource: 'organizer-ai'
                        });
                    });
                } catch (error) {
                    if (isOrganizerAbortError(error) || taskState.cancelled || taskState.signal?.aborted) {
                        throw createOrganizerAbortError();
                    }

                    chunk.forEach(term => {
                        const localQa = localQualityCheck(term);
                        const organizedType = fallbackClassifyTerm(term, categories, synonymMap);
                        organizedTerms.push({
                            ...term,
                            type: organizedType,
                            organizedType,
                            secondaryType: '',
                            confidence: 50,
                            categoryReason: `AI整理失败，已使用本地规则：${error.message}`,
                            finalTranslation: term.finalTranslation || term.target || '',
                            qualityStatus: localQa.qualityStatus,
                            qualityIssues: localQa.qualityIssues,
                            qualitySuggestion: localQa.qualitySuggestion,
                            extractionSource: 'organizer-local-fallback'
                        });
                    });
                }

                const completed = Math.min(i + chunk.length, rawTerms.length);
                const completedProgress = Math.round((completed / rawTerms.length) * 100);
                progressFill.style.width = `${completedProgress}%`;
                progressText.textContent = `${completed} / ${rawTerms.length}`;
                progressPercent.textContent = `${completedProgress}%`;
                progressInfo.textContent = `已完成第 ${chunkNumber} / ${totalChunks} 批`;
            }

            progressFill.style.width = '100%';
            progressText.textContent = `${rawTerms.length} / ${rawTerms.length}`;
            progressPercent.textContent = '100%';
            progressInfo.textContent = '整理完成';
            renderResults();
            setStatus('success', '术语整理完成', `共整理 ${organizedTerms.length} 条术语`);
        } catch (error) {
            if (isOrganizerAbortError(error) || taskState.cancelled || taskState.signal?.aborted) {
                const completed = organizedTerms.length;
                const progress = rawTerms.length > 0 ? Math.round((completed / rawTerms.length) * 100) : 0;
                progressFill.style.width = `${progress}%`;
                progressText.textContent = `${completed} / ${rawTerms.length}`;
                progressPercent.textContent = `${progress}%`;
                progressInfo.textContent = completed > 0
                    ? `任务已取消，已保留 ${completed} 条整理结果，可下载当前结果。`
                    : '任务已取消，尚无可下载的整理结果。';
                if (completed > 0) {
                    renderResults();
                }
                setStatus('warning', '术语整理已取消', completed > 0
                    ? `已保留 ${completed} 条整理结果，可下载当前结果。`
                    : '未产生整理结果，未继续消耗后续批次。');
            } else {
                console.error('Glossary organizer failed:', error);
                if (organizedTerms.length > 0) {
                    renderResults();
                }
                setStatus('error', '术语整理失败', `${error.message || '请检查 API 通道或上传数据'}；已保留 ${organizedTerms.length} 条结果。`);
            }
        } finally {
            finishOrganizerTask(taskState);
        }
    }

    function renderResults() {
        resultBody.innerHTML = '';
        organizedTerms.slice(0, 300).forEach(term => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${escapeHtml(term.referenceId || '')}</td>
                <td>${escapeHtml(term.source || '')}</td>
                <td>${escapeHtml(term.finalTranslation || term.target || '')}</td>
                <td>${escapeHtml(term.originalType || '')}</td>
                <td>${escapeHtml(term.organizedType || term.type || '')}</td>
                <td>${escapeHtml(term.secondaryType || '')}</td>
                <td>${escapeHtml(term.qualityStatus || '')}</td>
                <td>${escapeHtml(term.categoryReason || '')}</td>
            `;
            resultBody.appendChild(tr);
        });
        const issueCount = organizedTerms.filter(term => term.qualityStatus && term.qualityStatus !== '通过').length;
        const categoryCount = new Set(organizedTerms.map(term => term.organizedType || term.type).filter(Boolean)).size;
        summaryText.textContent = `共 ${organizedTerms.length} 条，${categoryCount} 个分类，${issueCount} 条需确认；表格预览前 300 条。`;
        resultsPanel.style.display = 'block';
    }

    function buildOrganizedRows() {
        return [[
            '定位ID/Key',
            '来源文件',
            '工作表',
            '原始行号',
            '原文术语（中文）',
            '指定译文（英文）',
            '整理后译文（可直接使用）',
            '原始类型',
            '整理后类型',
            '二级类型',
            '置信度',
            '术语质量状态',
            '术语问题',
            '修正建议',
            '分类理由',
            '合并说明'
        ], ...organizedTerms.map(term => [
            term.referenceId || '',
            term.sourceFileName || '',
            term.sheetName || '',
            term.referenceRows || '',
            term.source || '',
            term.target || '',
            term.finalTranslation || term.target || '',
            term.originalType || '',
            term.organizedType || term.type || '',
            term.secondaryType || '',
            term.confidence || '',
            term.qualityStatus || '',
            term.qualityIssues || '',
            term.qualitySuggestion || '',
            term.categoryReason || '',
            term.mergeNote || ''
        ])];
    }

    function buildSummaryRows() {
        const map = new Map();
        organizedTerms.forEach(term => {
            const type = term.organizedType || term.type || '未分类';
            map.set(type, (map.get(type) || 0) + 1);
        });
        return [['整理后类型', '数量'], ...[...map.entries()].sort((a, b) => b[1] - a[1])];
    }

    function buildIssueRows() {
        return [['原文术语', '整理后类型', '质量状态', '问题', '建议'], ...organizedTerms
            .filter(term => term.qualityStatus && term.qualityStatus !== '通过')
            .map(term => [term.source, term.organizedType || term.type, term.qualityStatus, term.qualityIssues, term.qualitySuggestion])];
    }

    function buildOrganizedWorkbook() {
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(buildOrganizedRows()), '整理后术语表');
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(buildSummaryRows()), '分类汇总');
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(buildIssueRows()), '待人工确认');
        return workbook;
    }

    function downloadOrganizedGlossary() {
        if (!organizedTerms.length) {
            alert('暂无整理结果');
            return;
        }
        downloadWorkbookFile(buildOrganizedWorkbook(), `${workbookName}_organized_glossary.xlsx`);
    }

    function saveOrganizedGlossary() {
        if (!organizedTerms.length) {
            alert('暂无整理结果');
            return;
        }
        const entry = saveGlossaryEntry({
            name: `${workbookName} 整理后术语表`,
            sourceFileName: workbookName,
            terms: organizedTerms,
            origin: 'organized'
        });
        if (entry) setStatus('success', '已保存到术语库', `${entry.name}，共 ${entry.terms.length} 条`);
    }

    function resetOrganizer() {
        cancelOrganizerTask({ silent: true, skipConfirm: true });
        sources = [];
        selectedSourceIds = new Set();
        selectedReferenceIds = new Set();
        combinedRows = [];
        organizedTerms = [];
        fileInput.value = '';
        uploadStatus.textContent = '';
        columnPanel.style.display = 'none';
        progressPanel.style.display = 'none';
        resultsPanel.style.display = 'none';
        updateOrganizerTaskButtons();
        renderReferenceGlossaryList();
    }
}

function initL10nCheckTool() {
    const uploadArea = document.getElementById('l10nUploadArea');
    const fileInput = document.getElementById('l10nFileInput');
    const fileInfo = document.getElementById('l10nFileInfo');
    const columnSelectSection = document.getElementById('l10nColumnSelect');
    const checkBtn = document.getElementById('l10nCheckBtn');
    const downloadBtn = document.getElementById('l10nDownloadBtn');
    const downloadGlossaryBtn = document.getElementById('l10nDownloadGlossaryBtn');
    const generateFixesBtn = document.getElementById('l10nGenerateFixesBtn');
    const exportTermReviewBtn = document.getElementById('l10nExportTermReviewBtn');
    const importTermReviewInput = document.getElementById('l10nImportTermReviewInput');
    const generateReviewedGlossaryBtn = document.getElementById('l10nGenerateReviewedGlossaryBtn');
    const termReviewPanel = document.getElementById('l10nTermReviewPanel');
    const termReviewCount = document.getElementById('l10nTermReviewCount');
    const termReviewSummary = document.getElementById('l10nTermReviewSummary');
    const termReviewBody = document.getElementById('l10nTermReviewBody');
    const termReviewBulkAction = document.getElementById('l10nTermReviewBulkAction');
    const applyTermReviewBulkBtn = document.getElementById('l10nApplyTermReviewBulkBtn');
    const applyTermReviewBulkAllBtn = document.getElementById('l10nApplyTermReviewBulkAllBtn');
    const resetBtn = document.getElementById('l10nResetBtn');
    const confirmColumnBtn = document.getElementById('l10nConfirmColumnBtn');
    const progressSection = document.getElementById('l10nProgressSection');
    const resultsSection = document.getElementById('l10nResults');
    const pauseBtn = document.getElementById('l10nPauseBtn');
    const resumeBtn = document.getElementById('l10nResumeBtn');
    const downloadProgressBtn = document.getElementById('l10nDownloadProgressBtn');
    const retryFailedBatchesBtn = document.getElementById('l10nRetryFailedBatchesBtn');
    const retryFailedBatchesResultBtn = document.getElementById('l10nRetryFailedBatchesResultBtn');
    const cancelBtn = document.getElementById('l10nCancelBtn');
    const projectSelect = document.getElementById('l10nProjectSelect');
    const glossaryList = document.getElementById('l10nGlossaryList');
    const profileList = document.getElementById('l10nProfileList');
    const checkModeSelect = document.getElementById('l10nCheckMode');
    const modeExplainer = document.getElementById('l10nModeExplainer');
    const autoSaveInput = document.getElementById('l10nAutoSave');
    const historyImportArea = document.getElementById('l10nHistoryImportArea');
    const historyImportInput = document.getElementById('l10nHistoryImportInput');
    const historyImportStatus = document.getElementById('l10nHistoryImportStatus');
    const clearHistoryBtn = document.getElementById('l10nClearHistoryBtn');
    const appendModelsBtn = document.getElementById('l10nAppendModelsBtn');
    const channelStatusPanel = document.getElementById('l10nChannelStatusPanel');
    const channelStatusGrid = document.getElementById('l10nChannelStatusGrid');
    const sheetSelectPanel = document.getElementById('l10nSheetSelectPanel');
    const sheetSelectList = document.getElementById('l10nSheetSelectList');
    const sheetSelectCount = document.getElementById('l10nSheetSelectCount');

    let sheetData = null;
    let l10nSources = [];
    let selectedSourceIds = new Set();
    let originalFileName = '';
    let sourceColumn = null;
    let targetColumn = null;
    let checkResults = [];
    let realtimeCheckResults = [];
    let glossaryData = [];
    let selectedGlossaryIds = new Set();
    let selectedProfileIds = new Set();
    let l10nProjects = [];
    let isPaused = false;
    let resumeResolvers = [];
    let isCheckCancelled = false;
    let activeCheckRunId = null;
    let currentCheckAbortController = null;
    let isGeneratingL10nFixes = false;
    let isRetryingInterruptedCheck = false;
    let importedHistoryState = createEmptyHistoryImportState();
    let channelProgressState = new Map();
    let l10nTermReviewState = [];

    const L10N_PROGRESS_KEY = 'l10n_check_progress';
    const L10N_AUTO_SAVE_KEY = 'nexus_l10n_auto_save_enabled';
    const L10N_HISTORY_VERSION = 'nexus-l10n-history-v1';
    const L10N_STATUS_PASS = '通过';
    const L10N_STATUS_ISSUE = '异常问题';
    const L10N_STATUS_DISAGREE = '复核分歧';
    const L10N_STATUS_SKIPPED = '未检测';
    const L10N_RULE_ENGINE_VERSION = 'hidden-rules-v3';
    const L10N_CHECK_CACHE_KEY = 'nexus_l10n_check_cache_v2';
    const L10N_CHECK_CACHE_VERSION = 2;
    const L10N_CHECK_CACHE_LIMIT = 3000;
    const L10N_FIX_BATCH_SIZE = 12;
    const L10N_FIX_RETRY_DELAYS = [4000, 12000];
    const L10N_ADAPTIVE_SUCCESS_TO_INCREASE = 10;
    const L10N_ADAPTIVE_COOLDOWN_MS = 180000;
    const L10N_SEVERITY_RANK = {
        '阻断': 4,
        '严重': 3,
        '一般': 2,
        '提示': 1,
        '': 0
    };
    const L10N_MODE_CONFIG = {
        economy: {
            label: '省钱模式',
            batchSize: 24,
            summary: '批量检测 + 单模型；本地规则先检查，AI 一次处理多行',
            description: '本地规则先检查，再由一个通道批量检测全部文本。输入规则只发送一次一批，token 消耗最低。'
        },
        balanced: {
            label: '均衡模式',
            batchSize: 18,
            summary: '批量检测 + 异常复核；主通道全量检测，异常候选再复核',
            description: '每条文本先由默认 API 通道作为主通道批量检测；异常候选再交给其他通道复核。质量和成本最均衡，日常推荐。'
        },
        strict: {
            label: '严格模式',
            batchSize: 12,
            summary: '批量多模型全量复核；所有文本都经过每个勾选模型',
            description: '每条文本都经过已勾选的每个模型批量复核。可信度最高，但成本和耗时最高。'
        }
    };
    const L10N_LEGACY_MODE_MAP = {
        shard: 'economy',
        hybrid: 'balanced',
        review: 'strict'
    };
    const L10N_MODE_ORDER = ['balanced', 'economy', 'strict'];

    pauseBtn.addEventListener('click', pauseCheck);
    resumeBtn.addEventListener('click', resumeCheck);
    downloadProgressBtn.addEventListener('click', downloadCurrentCheckProgress);
    retryFailedBatchesBtn?.addEventListener('click', retryInterruptedCheck);
    retryFailedBatchesResultBtn?.addEventListener('click', retryInterruptedCheck);
    cancelBtn.addEventListener('click', cancelCheckTask);
    appendModelsBtn?.addEventListener('click', startCheck);
    checkModeSelect.addEventListener('change', renderCheckModeExplainer);
    checkModeSelect.addEventListener('change', renderHistoryImportSummary);
    projectSelect.addEventListener('change', renderHistoryImportSummary);
    historyImportInput.addEventListener('click', (e) => e.stopPropagation());
    historyImportArea.addEventListener('click', (e) => {
        e.preventDefault();
        historyImportInput.click();
    });
    bindUploadDrop(historyImportArea, historyImportInput, handleHistoryImportFile);
    historyImportInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleHistoryImportFile(e.target.files[0]);
        }
    });
    clearHistoryBtn.addEventListener('click', clearImportedHistoryResults);
    document.addEventListener('nexus:glossary-library-updated', renderL10nGlossaryList);
    document.addEventListener('nexus:api-profiles-updated', renderL10nProfileList);
    document.addEventListener('nexus:projects-updated', loadL10nProjects);
    initAutoSavePreference();
    loadL10nProjects();
    renderL10nGlossaryList();
    renderL10nProfileList();
    renderCheckModeExplainer();
    renderHistoryImportSummary();

    function initAutoSavePreference() {
        if (!autoSaveInput) return;
        autoSaveInput.checked = localStorage.getItem(L10N_AUTO_SAVE_KEY) !== 'false';
        autoSaveInput.addEventListener('change', () => {
            localStorage.setItem(L10N_AUTO_SAVE_KEY, autoSaveInput.checked ? 'true' : 'false');
        });
    }

    function isL10nAutoSaveEnabled() {
        return autoSaveInput ? autoSaveInput.checked : localStorage.getItem(L10N_AUTO_SAVE_KEY) !== 'false';
    }

    function isDesktopAutoSaveAvailable() {
        return Boolean(window.__TAURI__?.core?.invoke);
    }

    function getL10nReportBaseName() {
        return (originalFileName || 'l10n_check')
            .replace(/\.(csv|xlsx|xls)$/i, '')
            .trim() || 'l10n_check';
    }

    function getL10nTimestamp() {
        const now = new Date();
        const pad = value => String(value).padStart(2, '0');
        return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    }

    function makeL10nSourceId(fileName, sheetName, index) {
        return `src_${index}_${makeStableId(`${fileName}:${sheetName}`)}`;
    }

    function getSelectedL10nSources() {
        return l10nSources.filter(source => selectedSourceIds.has(source.id));
    }

    function rebuildCombinedSheetData() {
        const selectedSources = getSelectedL10nSources();
        if (selectedSources.length === 0) {
            sheetData = null;
            return;
        }

        const firstRows = selectedSources[0].rows || [];
        const header = Array.isArray(firstRows[0]) ? [...firstRows[0]] : [];
        sheetData = [header];
        selectedSources.forEach(source => {
            const rows = Array.isArray(source.rows) ? source.rows.slice(1) : [];
            rows.forEach((row, rowOffset) => {
                sheetData.push(Array.isArray(row) ? [...row] : []);
                source.rowMap.set(sheetData.length - 1, rowOffset + 1);
            });
        });
    }

    function findL10nSourceForRow(rowIndex) {
        return l10nSources.find(source => source.rowMap?.has(rowIndex)) || null;
    }

    function getOriginalRowIndex(rowIndex) {
        const source = findL10nSourceForRow(rowIndex);
        return source?.rowMap?.get(rowIndex) ?? rowIndex;
    }

    function getOriginalRowNumber(rowIndex) {
        return getOriginalRowIndex(rowIndex) + 1;
    }

    function getDisplaySourceName(source) {
        if (!source) return '';
        return source.sheetName && source.sheetName !== 'CSV'
            ? `${source.fileName} / ${source.sheetName}`
            : source.fileName;
    }

    function makeL10nAutoSaveFileName(kind) {
        const kindLabels = {
            final: '最终报告',
            partial: '阶段结果',
            error: '异常中断',
            cancelled: '取消前结果'
        };
        return `${getL10nReportBaseName()}_本地化检测_${kindLabels[kind] || '阶段结果'}_${getL10nTimestamp()}.csv`;
    }

    function rowsToCsvContent(rows) {
        const ws = XLSX.utils.aoa_to_sheet(rows);
        const csvContent = XLSX.utils.sheet_to_csv(ws);
        return `\uFEFF${csvContent}`;
    }

    async function saveCsvRowsToDownloads(rows, fileName) {
        const invoke = window.__TAURI__?.core?.invoke;
        if (!invoke) return '';

        const response = await invoke('save_report_to_downloads', {
            filename: fileName,
            content: rowsToCsvContent(rows)
        });

        return String(response?.path || '');
    }

    async function autoSaveL10nReport(kind, results = null, options = {}) {
        const { force = false, fallbackDownload = false, showStatus = false } = options;
        if (!force && !isL10nAutoSaveEnabled()) return '';

        const resultList = Array.isArray(results)
            ? results
            : (checkResults.length > 0 ? checkResults : realtimeCheckResults);
        if (!resultList || resultList.length === 0) return '';

        const rows = kind === 'final' ? buildOriginalFileReportRows() : buildWindowReportRows(resultList);
        const fileName = makeL10nAutoSaveFileName(kind);

        try {
            const savedPath = await saveCsvRowsToDownloads(rows, fileName);
            if (savedPath) {
                if (showStatus) {
                    setStatus('success', '检测结果已自动保存', `保存路径：${savedPath}`);
                }
                return savedPath;
            }

            if (fallbackDownload || (kind === 'final' && !isDesktopAutoSaveAvailable())) {
                const xlsxName = fileName.replace(/\.csv$/i, '.xlsx');
                downloadXlsxRows(rows, xlsxName);
                return xlsxName;
            }
        } catch (error) {
            console.warn('L10n auto save failed:', error);
            if (showStatus) {
                setStatus('warning', '自动保存失败', String(error?.message || error));
            }
        }

        return '';
    }

    function pauseCheck() {
        isPaused = true;
        pauseBtn.style.display = 'none';
        resumeBtn.style.display = 'inline-flex';
        downloadProgressBtn.style.display = 'inline-flex';
        markUnfinishedChannels('paused', '用户已暂停，等待继续');
        const progressResults = checkResults.length > 0 ? checkResults : realtimeCheckResults;
        if (progressResults.length > 0) {
            saveL10nProgress({
                fileName: originalFileName,
                currentRow: Math.max(1, ...progressResults.map(result => Number.isInteger(result.rowIndex) ? result.rowIndex : 1)),
                checkResults,
                realtimeCheckResults,
                glossaryData,
                checkedCount: progressResults.length,
                selectedProfileIds: [...selectedProfileIds]
            });
        }
        setStatus('warning', '检测已暂停', '点击"继续"按钮恢复检测');
        void autoSaveL10nReport('partial', progressResults, { showStatus: isDesktopAutoSaveAvailable() });
    }

    function resumeCheck() {
        if (!ensureL10nProfilesConfigured('继续本地化检测')) {
            return;
        }

        isPaused = false;
        pauseBtn.style.display = 'inline-flex';
        resumeBtn.style.display = 'none';
        downloadProgressBtn.style.display = 'none';
        channelProgressState.forEach((state, key) => {
            if (state.status === 'paused') {
                channelProgressState.set(key, {
                    ...state,
                    status: state.completed >= state.total ? 'done' : 'waiting',
                    message: state.completed >= state.total ? '已完成' : '等待继续检测',
                    updatedAt: Date.now()
                });
            }
        });
        renderChannelProgress();
        hideStatus();
        resolveResumeWaiters();
    }

    function waitForResume() {
        if (!isPaused) return Promise.resolve();
        return new Promise(resolve => {
            resumeResolvers.push(resolve);
        });
    }

    function resolveResumeWaiters() {
        const waiters = resumeResolvers;
        resumeResolvers = [];
        waiters.forEach(resolve => resolve());
    }

    function throwIfCheckCancelled(runId) {
        if (isCheckCancelled || activeCheckRunId !== runId) {
            throw new Error('L10N_CHECK_CANCELLED');
        }
    }

    function resetL10nProgressControls() {
        isPaused = false;
        pauseBtn.style.display = 'inline-flex';
        resumeBtn.style.display = 'none';
        downloadProgressBtn.style.display = 'none';
        if (retryFailedBatchesBtn) retryFailedBatchesBtn.style.display = 'none';
        if (retryFailedBatchesResultBtn) retryFailedBatchesResultBtn.style.display = 'none';
        cancelBtn.style.display = 'inline-flex';
    }

    function showL10nStoppedControls(canDownload = false, canRetry = false) {
        isPaused = false;
        pauseBtn.style.display = 'none';
        resumeBtn.style.display = 'none';
        downloadProgressBtn.style.display = canDownload ? 'inline-flex' : 'none';
        if (retryFailedBatchesBtn) {
            retryFailedBatchesBtn.style.display = canRetry ? 'inline-flex' : 'none';
            retryFailedBatchesBtn.disabled = !canRetry;
            retryFailedBatchesBtn.textContent = '继续检测未完成部分';
        }
        if (retryFailedBatchesResultBtn) {
            retryFailedBatchesResultBtn.style.display = canRetry ? 'inline-flex' : 'none';
            retryFailedBatchesResultBtn.disabled = !canRetry;
            retryFailedBatchesResultBtn.textContent = '继续检测未完成部分';
        }
        cancelBtn.style.display = 'inline-flex';
    }

    function showL10nFailurePanel(title, message, options = {}) {
        const { canRetry = false } = options;
        const checkList = document.getElementById('l10nCheckList');
        progressSection.style.display = 'block';
        updateProgress(0, 0, 0);
        document.getElementById('l10nProgressInfo').textContent = message || title;
        showL10nStoppedControls(checkResults.length > 0 || realtimeCheckResults.length > 0, canRetry);

        if (checkList) {
            checkList.innerHTML = `
                <div class="check-list-empty error-state">
                    <strong>${escapeHtml(title)}</strong>
                    <span>${escapeHtml(message || '请检查 API Key、Base URL、模型权限或账户余额后重新开始。')}</span>
                </div>
            `;
        }
    }

    function promoteRealtimeResultsForRetry() {
        if (realtimeCheckResults.length === 0) return;
        const normalizedRealtime = normalizeSavedCheckResults(realtimeCheckResults);
        if (getSelectedCheckMode() === 'strict') {
            checkResults = normalizeSavedCheckResults([...checkResults, ...normalizedRealtime]);
            realtimeCheckResults = [...checkResults];
            return;
        }
        if (checkResults.length === 0) {
            checkResults = normalizedRealtime;
        }
    }

    async function retryInterruptedCheck() {
        if (isRetryingInterruptedCheck) return;
        if (activeCheckRunId || currentCheckAbortController) {
            setStatus('warning', '检测仍在运行', '请等待当前请求结束，或先暂停/取消后再继续。');
            return;
        }
        if (!sheetData || sourceColumn === null || targetColumn === null) {
            setStatus('error', '无法继续检测', '当前文件或列选择信息不完整，请重新导入文件后再开始。');
            return;
        }
        if (!ensureL10nProfilesConfigured('继续检测未完成部分')) {
            return;
        }

        isRetryingInterruptedCheck = true;
        if (retryFailedBatchesBtn) {
            retryFailedBatchesBtn.disabled = true;
            retryFailedBatchesBtn.textContent = '正在继续...';
        }
        if (retryFailedBatchesResultBtn) {
            retryFailedBatchesResultBtn.disabled = true;
            retryFailedBatchesResultBtn.textContent = '正在继续...';
        }
        promoteRealtimeResultsForRetry();
        progressSection.style.display = 'none';
        setStatus('processing', '正在继续检测', '会复用已完成结果，只补跑还没有完成的行或模型。');
        try {
            await startCheck({ skipSavedProgressPrompt: true });
        } finally {
            isRetryingInterruptedCheck = false;
        }
    }

    function getFriendlyApiErrorMessage(error, profile) {
        const message = String(error?.message || '接口返回异常').replace(/\s+/g, ' ').trim();
        const profileLabel = profile?.name || (profile?.provider ? getPlatformName(profile.provider) : '模型通道');
        if (isTemporaryL10nApiError(error)) {
            return `${profileLabel}临时繁忙或限流：${message}。这通常不是 Key 填错，建议稍后点击“继续检测未完成部分”补跑。`;
        }
        if (error?.isTimeout || error?.name === 'ApiTimeoutError' || /超时|timeout/i.test(message)) {
            return `${profileLabel}响应超时：${message}。建议先降低该通道并发，或稍后重试；已产生的结果可以下载后导入继续。`;
        }
        if (error?.isRateLimited) {
            const retryText = error.retryAfterMs > 0
                ? `接口建议等待 ${Math.ceil(error.retryAfterMs / 1000)} 秒后重试`
                : '建议降低并发或稍后重试';
            return `${profileLabel}触发额度/频率限制：${message}。${retryText}。`;
        }

        return message;
    }

    async function cancelCheckTask(options = {}) {
        const { silent = false, skipConfirm = false } = options;
        const hasRunningTask = Boolean(activeCheckRunId || currentCheckAbortController);

        if (!silent && hasRunningTask && !skipConfirm) {
            const shouldCancel = confirm('确定取消并删除当前本地化检测任务吗？已产生的检测进度会清空，但不会影响原文件。');
            if (!shouldCancel) return;
        }

        const progressResults = checkResults.length > 0 ? checkResults : realtimeCheckResults;
        let savedPath = '';
        if (!silent && progressResults.length > 0) {
            if (isL10nAutoSaveEnabled()) {
                savedPath = await autoSaveL10nReport('cancelled', progressResults, { force: true });
            } else {
                const shouldSave = confirm('自动保存未开启。是否先保存当前检测结果，再取消任务？');
                if (shouldSave) {
                    savedPath = await autoSaveL10nReport('cancelled', progressResults, {
                        force: true,
                        fallbackDownload: true
                    });
                }
            }
        }

        isCheckCancelled = true;
        activeCheckRunId = null;

        if (currentCheckAbortController) {
            currentCheckAbortController.abort();
            currentCheckAbortController = null;
        }
        resolveResumeWaiters();

        resetL10nProgressControls();
        progressSection.style.display = 'none';
        resultsSection.style.display = 'none';
        clearL10nProgress();
        checkResults = [];
        realtimeCheckResults = [];
        glossaryData = [];
        channelProgressState = new Map();
        renderChannelProgress();

        const checkList = document.getElementById('l10nCheckList');
        if (checkList) {
            checkList.innerHTML = '<div class="check-list-empty">等待第一条检测结果...</div>';
        }
        updateProgress(0, 0, 0);
        const progressInfo = document.getElementById('l10nProgressInfo');
        if (progressInfo) {
            progressInfo.textContent = '';
        }

        if (!silent) {
            const savedText = savedPath ? `已保存当前结果：${savedPath}。` : '';
            setStatus('warning', '检测任务已取消', `${savedText}已停止后续请求并删除当前检测进度。现在可以重新上传文件、选择模型或重新开始检测。`);
        }
    }

    function classifyIssueCategory(text) {
        const value = String(text || '').toLowerCase();

        if (value.includes('术语') || value.includes('term') || value.includes('glossary')) {
            return '术语表限制';
        }

        if (value.includes('项目') ||
            value.includes('规则') ||
            value.includes('占位符') ||
            value.includes('placeholder') ||
            value.includes('%s') ||
            value.includes('%d') ||
            value.includes('<color') ||
            value.includes('\\n') ||
            value.includes('字数') ||
            value.includes('长度')) {
            return '游戏项目翻译要求';
        }

        if (value.includes('拼写') ||
            value.includes('病句') ||
            value.includes('语法') ||
            value.includes('grammar') ||
            value.includes('spelling') ||
            value.includes('typo') ||
            value.includes('tense') ||
            value.includes('plural')) {
            return '病句/拼写错误';
        }

        if (value.includes('漏译') ||
            value.includes('误译') ||
            value.includes('直译') ||
            value.includes('语气') ||
            value.includes('风格') ||
            value.includes('game') ||
            value.includes('localization')) {
            return '游戏翻译基本规范';
        }

        return '其他';
    }

    function normalizeIssue(issue) {
        const issueText = issue?.issue ?? issue?.problem ?? issue?.description ?? issue?.summary ?? '';
        const corrected = issue?.corrected ?? issue?.suggestion ?? issue?.revision ?? issue?.fix ?? '';
        const rawReason = issue?.reason ?? issue?.explanation ?? issue?.why ?? '';
        const category = issue?.category ?? issue?.type ?? classifyIssueCategory(`${issueText} ${rawReason}`);
        const reason = rawReason || issueText || '检测到异常，但模型未给出详细原因';
        const severity = normalizeIssueSeverity(issue?.severity ?? issue?.level ?? issue?.priority, category, issueText, reason);
        const ruleId = String(issue?.ruleId || issue?.rule || '').trim();
        const detectionSource = String(issue?.detectionSource || issue?.source || issue?.detector || (ruleId ? '本地规则' : 'AI')).trim();
        const evidence = String(issue?.evidence || issue?.example || '').trim();

        return {
            issue: String(issueText || category).trim(),
            corrected: String(corrected || '').trim(),
            category: String(category || '其他').trim(),
            reason: String(reason).trim(),
            severity,
            ruleId,
            evidence,
            detectionSource
        };
    }

    function normalizeIssueSeverity(value, category = '', issue = '', reason = '') {
        const raw = String(value || '').trim().toLowerCase();
        if (['blocker', 'blocking', 'fatal', 'stop', '阻断'].includes(raw)) return '阻断';
        if (['critical', 'severe', 'high', '严重'].includes(raw)) return '严重';
        if (['major', 'medium', 'normal', '一般'].includes(raw)) return '一般';
        if (['minor', 'low', 'hint', 'info', '提示'].includes(raw)) return '提示';

        const text = `${category} ${issue} ${reason}`.toLowerCase();
        if (text.includes('空') || text.includes('占位符') || text.includes('placeholder') || text.includes('格式标记') || text.includes('标签')) {
            return '阻断';
        }
        if (text.includes('术语') || text.includes('数字') || text.includes('漏译') || text.includes('误译')) {
            return '严重';
        }
        if (text.includes('拼写') || text.includes('语法') || text.includes('病句') || text.includes('残留中文')) {
            return '一般';
        }
        return '一般';
    }

    function normalizeIssues(result) {
        if (result?.ok === true || result?.pass === true || result?.status === true) return [];
        const issues = Array.isArray(result?.issues)
            ? result.issues
            : (result?.issue || result?.reason || result?.corrected || result?.category ? [result] : []);
        return issues
            .map(normalizeIssue)
            .filter(issue => issue.issue || issue.corrected || issue.reason);
    }

    function normalizeTerminologyReviewItem(item = {}) {
        const source = String(item.source || item.term || item.sourceTerm || '').trim();
        const currentTarget = String(item.currentTarget || item.existingTarget || item.glossaryTarget || item.target || '').trim();
        const suggestedTarget = String(item.suggestedTarget || item.recommendedTarget || item.recommendation || item.corrected || '').trim();
        const actualTarget = String(item.actualTarget || item.observedTarget || item.translationInText || '').trim();
        const action = String(item.action || item.decision || '').trim();
        const reason = String(item.reason || item.note || item.issue || '').trim();
        const type = String(item.type || item.category || '').trim();
        if (!source) return null;
        return { source, currentTarget, suggestedTarget, actualTarget, action, reason, type };
    }

    function summarizeIssues(issues, field) {
        const values = issues
            .map(issue => issue[field])
            .filter(Boolean);

        return [...new Set(values)].join('；');
    }

    function summarizeIssueReasons(issues) {
        return issues.map(issue => {
            const category = issue.category || classifyIssueCategory(`${issue.issue} ${issue.reason}`);
            const reason = issue.reason || issue.issue || '未说明具体原因';
            return `${category}：${reason}`;
        }).join('；');
    }

    function summarizeIssueTypes(issues) {
        return [...new Set((issues || [])
            .map(issue => issue.category || classifyIssueCategory(`${issue.issue} ${issue.reason}`))
            .filter(Boolean))]
            .join('；');
    }

    function getHighestIssueSeverity(issues) {
        return (issues || []).reduce((highest, issue) => {
            const severity = normalizeIssueSeverity(issue.severity, issue.category, issue.issue, issue.reason);
            return L10N_SEVERITY_RANK[severity] > L10N_SEVERITY_RANK[highest] ? severity : highest;
        }, '');
    }

    function summarizeIssueSources(issues) {
        return [...new Set((issues || [])
            .map(issue => issue.detectionSource)
            .filter(Boolean))]
            .join('；');
    }

    function summarizeIssueEvidence(issues) {
        return [...new Set((issues || [])
            .map(issue => issue.evidence)
            .filter(Boolean))]
            .join('；');
    }

    function summarizeIssueRuleIds(issues) {
        return [...new Set((issues || [])
            .map(issue => issue.ruleId)
            .filter(Boolean))]
            .join('；');
    }

    function mergeTerminologyReviewItems(items = []) {
        const map = new Map();
        (items || []).forEach(item => {
            const normalized = normalizeTerminologyReviewItem(item);
            if (!normalized) return;
            const key = `${normalized.source.toLowerCase()}|${normalized.currentTarget.toLowerCase()}|${normalized.suggestedTarget.toLowerCase()}`;
            if (!map.has(key)) {
                map.set(key, normalized);
            } else {
                const existing = map.get(key);
                existing.reason = [existing.reason, normalized.reason].filter(Boolean).join('；');
                existing.type = existing.type || normalized.type;
                existing.action = existing.action || normalized.action;
                existing.actualTarget = existing.actualTarget || normalized.actualTarget;
            }
        });
        return [...map.values()];
    }

    function normalizeCheckResultEntry(entry) {
        const issues = Array.isArray(entry?.issues)
            ? entry.issues.map(normalizeIssue)
            : (entry?.issue || entry?.reason || entry?.corrected ? [normalizeIssue(entry)] : []);
        const hasIssue = entry?.status === L10N_STATUS_ISSUE ||
            (!entry?.status && issues.length > 0);
        const issueType = entry?.issueType || summarizeIssueTypes(issues);
        const severity = entry?.severity || getHighestIssueSeverity(issues);

        return {
            rowIndex: Number.isInteger(entry?.rowIndex) ? entry.rowIndex : null,
            source: String(entry?.source ?? ''),
            target: String(entry?.target ?? ''),
            originalReferences: normalizeOriginalReferences(entry?.originalReferences),
            profileId: entry?.profileId || '',
            profileName: entry?.profileName || '',
            provider: entry?.provider || '',
            model: entry?.model || '',
            modelLabel: entry?.modelLabel || entry?.detectedBy || entry?.profileName || entry?.model || '',
            status: hasIssue ? L10N_STATUS_ISSUE : (entry?.status || L10N_STATUS_PASS),
            issue: entry?.issue || summarizeIssues(issues, 'issue'),
            corrected: entry?.corrected || summarizeIssues(issues, 'corrected'),
            reason: entry?.reason || summarizeIssueReasons(issues),
            issueType,
            severity,
            detectionSource: entry?.detectionSource || summarizeIssueSources(issues),
            evidence: entry?.evidence || summarizeIssueEvidence(issues),
            ruleIds: entry?.ruleIds || summarizeIssueRuleIds(issues),
            fullFixedTranslation: String(entry?.fullFixedTranslation || entry?.finalFixedTranslation || entry?.finalTranslation || ''),
            fullFixedReason: String(entry?.fullFixedReason || entry?.fixReason || ''),
            fullFixedConfidence: String(entry?.fullFixedConfidence || entry?.confidence || ''),
            fullFixedStatus: String(entry?.fullFixedStatus || entry?.fixStatus || ''),
            fullFixedError: String(entry?.fullFixedError || ''),
            issues,
            terminologyReview: mergeTerminologyReviewItems(entry?.terminologyReview || []),
            reviews: Array.isArray(entry?.reviews) ? entry.reviews : [],
            issueVotes: Number(entry?.issueVotes || 0),
            reviewTotal: Number(entry?.reviewTotal || 0),
            expectedReviewProfiles: Array.isArray(entry?.expectedReviewProfiles) ? entry.expectedReviewProfiles : []
        };
    }

    function normalizeSavedCheckResults(results) {
        return (Array.isArray(results) ? results : []).map(normalizeCheckResultEntry);
    }

    function createCheckResultEntry(task, result, profile) {
        const normalizedResult = result || {
            issues: [{
                category: '其他',
                issue: '检测失败',
                corrected: '',
                reason: 'API 请求失败或返回为空，当前行无法确认是否通过'
            }]
        };
        const issues = normalizeIssues(normalizedResult);
        const hasIssues = issues.length > 0;
        const activeProfile = profile || task.profile || null;

        return {
            rowIndex: task.rowIndex,
            source: task.sourceText,
            target: task.targetText,
            originalReferences: normalizeOriginalReferences(task.originalReferences),
            profileId: activeProfile?.id || task.profileId || '',
            profileName: activeProfile?.name || task.profileName || '',
            provider: activeProfile?.provider || task.provider || '',
            model: activeProfile?.model || task.model || '',
            modelLabel: getApiProfileLabel(activeProfile || task),
            status: hasIssues ? L10N_STATUS_ISSUE : L10N_STATUS_PASS,
            issue: hasIssues ? summarizeIssues(issues, 'issue') : '',
            corrected: hasIssues ? summarizeIssues(issues, 'corrected') : '',
            reason: hasIssues ? summarizeIssueReasons(issues) : '',
            issueType: hasIssues ? summarizeIssueTypes(issues) : '',
            severity: hasIssues ? getHighestIssueSeverity(issues) : '',
            detectionSource: hasIssues ? summarizeIssueSources(issues) : '',
            evidence: hasIssues ? summarizeIssueEvidence(issues) : '',
            ruleIds: hasIssues ? summarizeIssueRuleIds(issues) : '',
            fullFixedTranslation: '',
            fullFixedReason: '',
            fullFixedConfidence: '',
            fullFixedStatus: '',
            fullFixedError: '',
            issues,
            terminologyReview: mergeTerminologyReviewItems(normalizedResult.terminologyReview || [])
        };
    }

    function createModelReview(profile, result) {
        const normalizedResult = result || {
            issues: [{
                category: '其他',
                issue: '模型检测失败',
                corrected: '',
                reason: `${profile.name} API 请求失败或返回为空`
            }]
        };
        const issues = normalizeIssues(normalizedResult);
        const hasIssues = issues.length > 0;

        return {
            profileId: profile.id,
            profileName: profile.name,
            provider: profile.provider,
            model: profile.model,
            modelLabel: getApiProfileLabel(profile),
            status: hasIssues ? L10N_STATUS_ISSUE : L10N_STATUS_PASS,
            issue: hasIssues ? summarizeIssues(issues, 'issue') : '',
            corrected: hasIssues ? summarizeIssues(issues, 'corrected') : '',
            reason: hasIssues ? summarizeIssueReasons(issues) : '通过',
            issueType: hasIssues ? summarizeIssueTypes(issues) : '',
            severity: hasIssues ? getHighestIssueSeverity(issues) : '',
            detectionSource: hasIssues ? summarizeIssueSources(issues) : '',
            evidence: hasIssues ? summarizeIssueEvidence(issues) : '',
            ruleIds: hasIssues ? summarizeIssueRuleIds(issues) : '',
            fullFixedTranslation: '',
            fullFixedReason: '',
            fullFixedConfidence: '',
            fullFixedStatus: '',
            fullFixedError: '',
            issues
        };
    }

    function createModelReviewFromEntry(entry) {
        return {
            profileId: entry.profileId || '',
            profileName: entry.profileName || '',
            provider: entry.provider || '',
            model: entry.model || '',
            modelLabel: entry.modelLabel || '',
            status: entry.status || L10N_STATUS_PASS,
            issue: entry.issue || '',
            corrected: entry.corrected || '',
            reason: entry.reason || (entry.status === L10N_STATUS_PASS ? '通过' : ''),
            issueType: entry.issueType || '',
            severity: entry.severity || '',
            detectionSource: entry.detectionSource || '',
            evidence: entry.evidence || '',
            ruleIds: entry.ruleIds || '',
            issues: Array.isArray(entry.issues) ? entry.issues : [],
            terminologyReview: mergeTerminologyReviewItems(entry.terminologyReview || []),
            historyReused: Boolean(entry.historyReused),
            historyMatchType: entry.historyMatchType || '',
            historyFileName: entry.historyFileName || ''
        };
    }

    function summarizeReviewDetails(reviews) {
        return reviews.map(review => {
            const resultText = review.status === L10N_STATUS_ISSUE
                ? `异常：${review.reason || review.issue || '未说明原因'}`
                : '通过';
            return `${review.profileName || review.modelLabel}：${resultText}`;
        }).join('；');
    }

    function createReviewedCheckResultEntry(task, reviews, mode, expectedProfiles = []) {
        const issueReviews = reviews.filter(review => review.status === L10N_STATUS_ISSUE);
        const issueVotes = issueReviews.length;
        const requiredVotes = reviews.length <= 1 ? 1 : 2;
        const hasConsensusIssue = issueVotes >= requiredVotes;
        const hasDisagreement = issueVotes > 0 && !hasConsensusIssue;
        const modelLabelPrefix = mode === 'hybrid' ? '异常复核' : '多模型复核';
        const status = hasConsensusIssue
            ? L10N_STATUS_ISSUE
            : (hasDisagreement ? L10N_STATUS_DISAGREE : L10N_STATUS_PASS);
        const reviewReason = summarizeReviewDetails(reviews);
        const corrected = [...new Set(issueReviews.map(review => review.corrected).filter(Boolean))].join('；');
        const issues = issueReviews.flatMap(review => review.issues || []);
        const terminologyReview = mergeTerminologyReviewItems(reviews.flatMap(review => review.terminologyReview || []));

        return {
            rowIndex: task.rowIndex,
            source: task.sourceText,
            target: task.targetText,
            originalReferences: normalizeOriginalReferences(task.originalReferences),
            profileId: '',
            profileName: modelLabelPrefix,
            provider: '',
            model: '',
            modelLabel: `${modelLabelPrefix}：${reviews.map(review => review.profileName || review.modelLabel).join('、')}`,
            status,
            issue: hasConsensusIssue
                ? `已有 ${issueVotes}/${reviews.length} 个模型判断异常`
                : (hasDisagreement ? `仅 ${issueVotes}/${reviews.length} 个模型判断异常，建议人工复核` : ''),
            corrected,
            reason: status === L10N_STATUS_PASS
                ? '通过'
                : `复核投票 ${issueVotes}/${reviews.length}；${reviewReason}`,
            issueType: status === L10N_STATUS_PASS ? '' : summarizeIssueTypes(issues),
            severity: status === L10N_STATUS_PASS ? '' : getHighestIssueSeverity(issues),
            detectionSource: status === L10N_STATUS_PASS ? '' : summarizeIssueSources(issues),
            evidence: status === L10N_STATUS_PASS ? '' : summarizeIssueEvidence(issues),
            ruleIds: status === L10N_STATUS_PASS ? '' : summarizeIssueRuleIds(issues),
            fullFixedTranslation: '',
            fullFixedReason: '',
            fullFixedConfidence: '',
            fullFixedStatus: '',
            fullFixedError: '',
            issues,
            terminologyReview,
            reviews,
            issueVotes,
            reviewTotal: reviews.length,
            expectedReviewProfiles: buildExpectedReportProfilesFromProfiles(expectedProfiles)
        };
    }

    function getIssueResultCount(results = checkResults) {
        return results.filter(result => result.status === L10N_STATUS_ISSUE).length;
    }

    function getSortedCheckResults(results = checkResults) {
        return [...results].sort((a, b) => {
            const left = Number.isInteger(a.rowIndex) ? a.rowIndex : Number.MAX_SAFE_INTEGER;
            const right = Number.isInteger(b.rowIndex) ? b.rowIndex : Number.MAX_SAFE_INTEGER;
            return left - right;
        });
    }

    function normalizeOriginalReferences(references) {
        if (!references || typeof references !== 'object' || Array.isArray(references)) return {};
        return Object.entries(references).reduce((map, [key, value]) => {
            const label = String(key || '').trim();
            if (!label) return map;
            map[label] = value === undefined || value === null ? '' : value;
            return map;
        }, {});
    }

    function normalizeReferenceHeader(header) {
        return String(header ?? '').trim();
    }

    function getReferenceHeaderLabel(header, index) {
        return normalizeReferenceHeader(header) || `原始列${index + 1}`;
    }

    function isLikelyReferenceHeader(header) {
        const raw = normalizeReferenceHeader(header);
        if (!raw) return false;
        const normalized = raw.toLowerCase().replace(/\s+/g, '');

        return /^(id|uid|uuid|guid|key|code)$/i.test(raw) ||
            /(^|[\s_-])(id|key|code)([\s_-]|$)/i.test(raw) ||
            /(string|text|message|entry|resource|row|line)[\s_-]*id/i.test(raw) ||
            /(文案|文本|字符串|条目|资源|行|配置).{0,4}id/i.test(raw) ||
            /编号|序号|唯一标识|标识符|标识码|键名|键值|配置键|代码|代号/.test(raw) ||
            /^(stringid|textid|messageid|entryid|resourceid|rowid|lineid)$/i.test(normalized);
    }

    function isLikelyReferenceColumnByValues(colIndex) {
        if (!sheetData || sheetData.length <= 3) return false;
        const sampleRows = sheetData.slice(1, Math.min(sheetData.length, 101));
        const values = sampleRows
            .map(row => row?.[colIndex])
            .filter(value => value !== undefined && value !== null && String(value).trim())
            .map(value => String(value).trim());

        if (values.length < 3) return false;
        const uniqueRatio = new Set(values).size / values.length;
        const averageLength = values.reduce((sum, value) => sum + value.length, 0) / values.length;
        const idLikeCount = values.filter(value => /^[A-Za-z0-9_.:-]{1,40}$/.test(value)).length;
        const sentenceLikeCount = values.filter(value =>
            /[\u4e00-\u9fa5]{6,}/.test(value) || /[A-Za-z]{12,}\s+[A-Za-z]{3,}/.test(value)
        ).length;

        return uniqueRatio >= 0.85 &&
            averageLength <= 32 &&
            idLikeCount / values.length >= 0.7 &&
            sentenceLikeCount / values.length <= 0.2;
    }

    function getL10nReferenceColumns() {
        if (!sheetData || !Array.isArray(sheetData[0])) return [];
        const headers = sheetData[0];
        const isDataColumn = index => index !== sourceColumn && index !== targetColumn;
        const explicitColumns = headers
            .map((header, index) => ({
                index,
                label: getReferenceHeaderLabel(header, index)
            }))
            .filter(column => isDataColumn(column.index) && isLikelyReferenceHeader(headers[column.index]));

        if (explicitColumns.length > 0) {
            return explicitColumns.slice(0, 4);
        }

        return headers
            .map((header, index) => ({
                index,
                label: getReferenceHeaderLabel(header, index)
            }))
            .filter(column => isDataColumn(column.index) && isLikelyReferenceColumnByValues(column.index))
            .slice(0, 2);
    }

    function buildOriginalReferenceMap(row, referenceColumns = getL10nReferenceColumns()) {
        if (!row || referenceColumns.length === 0) return {};
        return referenceColumns.reduce((references, column) => {
            const value = row[column.index];
            references[column.label] = value === undefined || value === null ? '' : value;
            return references;
        }, {});
    }

    function buildSourceMetadataReferences(rowIndex) {
        const source = findL10nSourceForRow(rowIndex);
        if (!source) return {};
        return {
            '来源文件': source.fileName,
            '工作表': source.sheetName || '',
            '原始行号': getOriginalRowNumber(rowIndex)
        };
    }

    function getReportReferenceHeaders(results = []) {
        const headers = [];
        const addHeader = header => {
            const label = normalizeReferenceHeader(header);
            if (label && !headers.includes(label)) headers.push(label);
        };

        if (l10nSources.length > 1) {
            ['来源文件', '工作表', '原始行号'].forEach(addHeader);
        }
        getL10nReferenceColumns().forEach(column => addHeader(column.label));
        (results || []).forEach(result => {
            Object.keys(normalizeOriginalReferences(result?.originalReferences)).forEach(addHeader);
        });

        return headers;
    }

    function getReportReferenceCells(result, referenceHeaders = []) {
        if (referenceHeaders.length === 0) return [];

        const references = normalizeOriginalReferences(result?.originalReferences);
        const row = Number.isInteger(result?.rowIndex) && sheetData ? sheetData[result.rowIndex] : null;
        const columnsByLabel = new Map(getL10nReferenceColumns().map(column => [column.label, column.index]));

        return referenceHeaders.map(header => {
            if (Object.prototype.hasOwnProperty.call(references, header)) {
                return references[header];
            }

            const columnIndex = columnsByLabel.get(header);
            if (row && Number.isInteger(columnIndex)) {
                const value = row[columnIndex];
                return value === undefined || value === null ? '' : value;
            }

            return '';
        });
    }

    function getCheckStatusClass(status) {
        if (status === L10N_STATUS_ISSUE) return 'issue';
        if (status === L10N_STATUS_DISAGREE) return 'warning';
        return 'pass';
    }

    function getChannelProfileKey(profile) {
        return profile?.id || `${profile?.provider || ''}:${profile?.model || ''}:${profile?.name || ''}`;
    }

    function getChannelStatusLabel(status) {
        const labels = {
            waiting: '等待',
            running: '检测中',
            paused: '暂停',
            done: '完成',
            failed: '已停止'
        };
        return labels[status] || '等待';
    }

    function initChannelProgress(profiles, jobsByProfile = null) {
        channelProgressState = new Map();
        profiles.forEach(profile => {
            const key = getChannelProfileKey(profile);
            const total = Array.isArray(jobsByProfile?.get(profile.id))
                ? jobsByProfile.get(profile.id).length
                : 0;
            channelProgressState.set(key, {
                profile,
                completed: 0,
                total,
                status: total > 0 ? 'waiting' : 'done',
                message: total > 0 ? '等待开始检测' : '当前模式无需该通道处理',
                updatedAt: Date.now()
            });
        });
        renderChannelProgress();
    }

    function updateChannelProgress(profile, updates = {}) {
        if (!profile) return;
        const key = getChannelProfileKey(profile);
        const previous = channelProgressState.get(key) || {
            profile,
            completed: 0,
            total: 0,
            status: 'waiting',
            message: ''
        };
        channelProgressState.set(key, {
            ...previous,
            ...updates,
            profile,
            updatedAt: Date.now()
        });
        renderChannelProgress();
    }

    function markUnfinishedChannels(status = 'failed', message = '任务已停止，未完成后续检测') {
        channelProgressState.forEach((state, key) => {
            if (state.total > 0 && state.completed < state.total && !['failed', 'done'].includes(state.status)) {
                channelProgressState.set(key, {
                    ...state,
                    status,
                    message,
                    updatedAt: Date.now()
                });
            }
        });
        renderChannelProgress();
    }

    function getChannelStatusSummary() {
        return [...channelProgressState.values()].map(state => {
            const label = getChannelStatusLabel(state.status);
            const message = state.message ? `：${state.message}` : '';
            return `${state.profile?.name || state.profile?.model || '通道'} ${state.completed}/${state.total} ${label}${message}`;
        }).join('；');
    }

    function renderChannelProgress() {
        if (!channelStatusPanel || !channelStatusGrid) return;
        const states = [...channelProgressState.values()];
        if (states.length === 0) {
            channelStatusPanel.style.display = 'none';
            channelStatusGrid.innerHTML = '';
            return;
        }

        channelStatusPanel.style.display = 'block';
        channelStatusGrid.innerHTML = states.map(state => {
            const total = Math.max(0, Number(state.total || 0));
            const completed = Math.max(0, Number(state.completed || 0));
            const percent = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 100;
            const label = getChannelStatusLabel(state.status);
            const modelText = getModelDisplayName(state.profile?.provider, state.profile?.model);
            return `
                <div class="channel-status-card ${escapeAttribute(state.status || 'waiting')}">
                    <div class="channel-status-top">
                        <span class="channel-status-name" title="${escapeAttribute(getApiProfileLabel(state.profile))}">${escapeHtml(state.profile?.name || getPlatformName(state.profile?.provider))}</span>
                        <span class="channel-status-badge">${escapeHtml(label)}</span>
                    </div>
                    <div class="channel-status-meter">
                        <div class="channel-status-fill" style="width: ${percent}%"></div>
                    </div>
                    <div class="channel-status-meta">
                        <span>${completed} / ${total}</span>
                        <span>${percent}%</span>
                    </div>
                    <div class="channel-status-message">${escapeHtml(modelText)}${state.message ? ` · ${escapeHtml(state.message)}` : ''}</div>
                </div>
            `;
        }).join('');
    }

    function getSelectedCheckMode() {
        const rawMode = document.getElementById('l10nCheckMode')?.value || 'balanced';
        return L10N_LEGACY_MODE_MAP[rawMode] || rawMode || 'balanced';
    }

    function getSelectedCheckModeConfig() {
        const mode = getSelectedCheckMode();
        return L10N_MODE_CONFIG[mode] || L10N_MODE_CONFIG.balanced;
    }

    function renderCheckModeExplainer() {
        if (!modeExplainer) return;

        const selectedMode = getSelectedCheckMode();
        const orderedModes = [
            selectedMode,
            ...L10N_MODE_ORDER.filter(mode => mode !== selectedMode)
        ];

        modeExplainer.innerHTML = orderedModes.map(mode => {
            const config = L10N_MODE_CONFIG[mode];
            const isActive = mode === selectedMode;
            return `
                <button class="mode-card ${isActive ? 'active' : ''}" data-mode="${mode}" type="button" aria-pressed="${isActive ? 'true' : 'false'}">
                    <strong>${escapeHtml(config.label)}${isActive ? ' · 当前选择' : ''}</strong>
                    <span>${escapeHtml(config.description)}</span>
                </button>
            `;
        }).join('');

        modeExplainer.querySelectorAll('.mode-card[data-mode]').forEach(card => {
            card.addEventListener('click', () => {
                const mode = card.dataset.mode;
                if (!L10N_MODE_CONFIG[mode]) return;
                if (checkModeSelect) {
                    checkModeSelect.value = mode;
                    checkModeSelect.dispatchEvent(new Event('change'));
                }
            });
        });
    }

    function createEmptyHistoryImportState() {
        return {
            fileName: '',
            importedAt: 0,
            entries: [],
            byResultFingerprint: new Map(),
            byContentModel: new Map(),
            byPair: new Map()
        };
    }

    function normalizeFingerprintText(value) {
        return String(value ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
    }

    function getHistoryPairKey(source, target) {
        return makeStableId(`${normalizeFingerprintText(source)}\u0000${normalizeFingerprintText(target)}`);
    }

    function getProjectFingerprint(project) {
        return makeStableId(JSON.stringify({
            id: project?.id || '',
            name: project?.name || '',
            rules: normalizeFingerprintText(project?.rules || '')
        }));
    }

    function getRelevantGlossarySignature(source, target, glossaryTerms, task = null) {
        const relevantTerms = getRelevantGlossaryTerms(source, target, glossaryTerms, task)
            .map(term => ({
                source: normalizeFingerprintText(term.source).toLowerCase(),
                target: normalizeFingerprintText(getGlossaryEffectiveTarget(term)).toLowerCase(),
                type: normalizeFingerprintText(term.type).toLowerCase()
            }))
            .sort((a, b) => `${a.source}|${a.target}|${a.type}`.localeCompare(`${b.source}|${b.target}|${b.type}`));

        return makeStableId(JSON.stringify(relevantTerms));
    }

    function getRowContentFingerprint(task, project, glossaryTerms) {
        return makeStableId(JSON.stringify({
            version: L10N_HISTORY_VERSION,
            ruleEngine: L10N_RULE_ENGINE_VERSION,
            source: normalizeFingerprintText(task.sourceText),
            target: normalizeFingerprintText(task.targetText),
            project: getProjectFingerprint(project),
            glossary: getRelevantGlossarySignature(task.sourceText, task.targetText, glossaryTerms, task)
        }));
    }

    function getProfileModelFingerprint(profile) {
        const provider = normalizeFingerprintText(profile?.provider || '');
        const model = normalizeFingerprintText(profile?.model || '');
        if (!provider || !model) return '';

        return makeStableId(JSON.stringify({ provider, model }));
    }

    function getHistoryMetadata(task, project, glossaryTerms, profile) {
        const contentFingerprint = getRowContentFingerprint(task, project, glossaryTerms);
        const modelFingerprint = getProfileModelFingerprint(profile);
        const resultFingerprint = modelFingerprint
            ? makeStableId(JSON.stringify({
                version: L10N_HISTORY_VERSION,
                ruleEngine: L10N_RULE_ENGINE_VERSION,
                contentFingerprint,
                modelFingerprint
            }))
            : '';

        return {
            contentFingerprint,
            modelFingerprint,
            resultFingerprint,
            projectFingerprint: getProjectFingerprint(project),
            glossaryFingerprint: getRelevantGlossarySignature(task.sourceText, task.targetText, glossaryTerms, task)
        };
    }

    function normalizeHistoryHeader(value) {
        return String(value || '').trim().toLowerCase().replace(/\s+/g, '');
    }

    function findHistoryColumn(headers, aliases) {
        const normalizedAliases = aliases.map(normalizeHistoryHeader);
        const normalizedHeaders = headers.map(normalizeHistoryHeader);

        for (const alias of normalizedAliases) {
            const exactIndex = normalizedHeaders.findIndex(header => header === alias);
            if (exactIndex >= 0) return exactIndex;

            const partialIndex = normalizedHeaders.findIndex(header => header.includes(alias));
            if (partialIndex >= 0) return partialIndex;
        }

        return -1;
    }

    async function readTableRowsFromFile(file) {
        const extension = file.name.split('.').pop().toLowerCase();

        if (extension === 'csv') {
            const { text } = await readCSVWithEncoding(file);
            const result = XLSX.read(text, { type: 'string', cellDates: true });
            const sheetName = result.SheetNames[0];
            return XLSX.utils.sheet_to_json(result.Sheets[sheetName], { header: 1 });
        }

        const arrayBuffer = await file.arrayBuffer();
        const result = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
        const sheetName = result.SheetNames[0];
        return XLSX.utils.sheet_to_json(result.Sheets[sheetName], { header: 1 });
    }

    function getHistoryCell(row, index) {
        if (index < 0 || row[index] === undefined || row[index] === null) return '';
        return String(row[index]).trim();
    }

    function normalizeHistoryStatus(value, issues) {
        const text = String(value || '').trim();
        if (text.includes(L10N_STATUS_DISAGREE) || text.includes('分歧')) return L10N_STATUS_DISAGREE;
        if (text.includes(L10N_STATUS_ISSUE) || text.includes('异常') || text.includes('问题') || issues.length > 0) return L10N_STATUS_ISSUE;
        if (text.includes(L10N_STATUS_SKIPPED) || text.includes('未检测')) return L10N_STATUS_SKIPPED;
        return L10N_STATUS_PASS;
    }

    function isHistoryIssueStatus(value) {
        const text = String(value || '').trim();
        return text.includes(L10N_STATUS_DISAGREE) ||
            text.includes('分歧') ||
            text.includes(L10N_STATUS_ISSUE) ||
            text.includes('异常') ||
            text.includes('问题') ||
            text.includes('术语表限制') ||
            text.includes('游戏项目') ||
            text.includes('游戏翻译') ||
            text.includes('病句') ||
            text.includes('拼写');
    }

    function parseHistoryReviewPayload(value, baseEntry) {
        if (!value) return [];

        try {
            const parsed = JSON.parse(String(value));
            const reviews = Array.isArray(parsed)
                ? parsed
                : (Array.isArray(parsed?.reviews) ? parsed.reviews : []);

            return reviews.map(review => normalizeImportedHistoryEntry({
                ...baseEntry,
                ...review,
                source: baseEntry.source,
                target: baseEntry.target,
                rowIndex: baseEntry.rowIndex
            })).filter(Boolean);
        } catch {
            return [];
        }
    }

    function normalizeImportedHistoryEntry(entry) {
        const source = normalizeFingerprintText(entry?.source);
        const target = normalizeFingerprintText(entry?.target);
        if (!source || !target) return null;

        const rawStatus = entry?.status || '';
        const shouldBuildIssue = isHistoryIssueStatus(rawStatus) ||
            (!rawStatus && (entry?.issue || entry?.reason || entry?.corrected));
        const issues = Array.isArray(entry?.issues) && entry.issues.length > 0
            ? normalizeIssues(entry)
            : (shouldBuildIssue ? [normalizeIssue(entry)] : []);
        const status = normalizeHistoryStatus(entry?.status, issues);
        const provider = normalizeFingerprintText(entry?.provider);
        const model = normalizeFingerprintText(entry?.model);
        const modelFingerprint = normalizeFingerprintText(entry?.modelFingerprint) ||
            (provider && model ? makeStableId(JSON.stringify({ provider, model })) : '');
        const rowIndex = Number(entry?.rowIndex);

        return {
            source,
            target,
            rowIndex: Number.isFinite(rowIndex) ? rowIndex : null,
            provider,
            model,
            profileId: normalizeFingerprintText(entry?.profileId),
            profileName: normalizeFingerprintText(entry?.profileName || entry?.channel),
            modelLabel: normalizeFingerprintText(entry?.modelLabel || entry?.detectedBy),
            status,
            issue: normalizeFingerprintText(entry?.issue || summarizeIssues(issues, 'issue')),
            corrected: normalizeFingerprintText(entry?.corrected || summarizeIssues(issues, 'corrected')),
            reason: normalizeFingerprintText(entry?.reason || summarizeIssueReasons(issues)),
            issueType: normalizeFingerprintText(entry?.issueType || summarizeIssueTypes(issues)),
            severity: normalizeFingerprintText(entry?.severity || getHighestIssueSeverity(issues)),
            detectionSource: normalizeFingerprintText(entry?.detectionSource || summarizeIssueSources(issues)),
            evidence: normalizeFingerprintText(entry?.evidence || summarizeIssueEvidence(issues)),
            ruleIds: normalizeFingerprintText(entry?.ruleIds || summarizeIssueRuleIds(issues)),
            fullFixedTranslation: normalizeFingerprintText(entry?.fullFixedTranslation),
            fullFixedReason: normalizeFingerprintText(entry?.fullFixedReason),
            fullFixedConfidence: normalizeFingerprintText(entry?.fullFixedConfidence),
            fullFixedStatus: normalizeFingerprintText(entry?.fullFixedStatus),
            fullFixedError: normalizeFingerprintText(entry?.fullFixedError),
            issues,
            contentFingerprint: normalizeFingerprintText(entry?.contentFingerprint),
            modelFingerprint,
            resultFingerprint: normalizeFingerprintText(entry?.resultFingerprint),
            projectFingerprint: normalizeFingerprintText(entry?.projectFingerprint),
            glossaryFingerprint: normalizeFingerprintText(entry?.glossaryFingerprint),
            historyVersion: normalizeFingerprintText(entry?.historyVersion)
        };
    }

    function parseHistoryRows(rows) {
        if (!rows || rows.length < 2) return [];

        const headers = (rows[0] || []).map(header => String(header || '').trim());
        const indexes = {
            source: findHistoryColumn(headers, ['检测原文', '原文', 'source']),
            target: findHistoryColumn(headers, ['检测译文', '译文', 'target']),
            modelLabel: findHistoryColumn(headers, ['检测模型', '模型', 'detected model']),
            status: findHistoryColumn(headers, ['检测结果', '问题类型', '状态', 'status', 'result']),
            issueType: findHistoryColumn(headers, ['问题类型', 'issue type', 'issuetype', 'category']),
            severity: findHistoryColumn(headers, ['严重程度', 'severity', 'level']),
            corrected: findHistoryColumn(headers, ['修改为', '建议修改', 'corrected', 'suggestion']),
            reason: findHistoryColumn(headers, ['问题原因', '问题描述', 'reason', 'description']),
            fullFixedTranslation: findHistoryColumn(headers, ['完整修正译文', '完整修正版译文', 'final translation', 'finaltranslation', 'fullfixedtranslation']),
            fullFixedReason: findHistoryColumn(headers, ['完整修正说明', '修正说明', 'fix reason', 'fixreason', 'fullfixedreason']),
            fullFixedConfidence: findHistoryColumn(headers, ['修正置信度', '置信度', 'fix confidence', 'confidence', 'fullfixedconfidence']),
            fullFixedStatus: findHistoryColumn(headers, ['修正状态', 'fix status', 'fixstatus', 'fullfixedstatus']),
            detectionSource: findHistoryColumn(headers, ['检测来源', '来源', 'detection source', 'detectionsource']),
            evidence: findHistoryColumn(headers, ['问题证据', '证据', 'evidence']),
            ruleIds: findHistoryColumn(headers, ['命中规则', '规则ID', 'rule ids', 'ruleids']),
            provider: findHistoryColumn(headers, ['API平台', '平台', 'provider']),
            model: findHistoryColumn(headers, ['模型ID', 'model id', 'modelid']),
            profileName: findHistoryColumn(headers, ['检测通道', '通道', 'profile', 'channel']),
            rowIndex: findHistoryColumn(headers, ['原始行号', '行号', 'rowindex']),
            contentFingerprint: findHistoryColumn(headers, ['内容指纹', 'contentfingerprint']),
            modelFingerprint: findHistoryColumn(headers, ['模型指纹', 'modelfingerprint']),
            resultFingerprint: findHistoryColumn(headers, ['复用指纹', '结果指纹', 'resultfingerprint']),
            projectFingerprint: findHistoryColumn(headers, ['项目指纹', 'projectfingerprint']),
            glossaryFingerprint: findHistoryColumn(headers, ['术语表指纹', 'glossaryfingerprint']),
            historyVersion: findHistoryColumn(headers, ['检测版本', 'historyversion']),
            reviewsJson: findHistoryColumn(headers, ['模型明细JSON', '复核明细JSON', '可复用模型结果JSON', 'reviewsjson'])
        };

        if (indexes.source < 0 || indexes.target < 0) return [];

        const entries = [];
        rows.slice(1).forEach(row => {
            const baseEntry = {
                source: getHistoryCell(row, indexes.source),
                target: getHistoryCell(row, indexes.target),
                modelLabel: getHistoryCell(row, indexes.modelLabel),
                status: getHistoryCell(row, indexes.status),
                issueType: getHistoryCell(row, indexes.issueType),
                severity: getHistoryCell(row, indexes.severity),
                corrected: getHistoryCell(row, indexes.corrected),
                reason: getHistoryCell(row, indexes.reason),
                fullFixedTranslation: getHistoryCell(row, indexes.fullFixedTranslation),
                fullFixedReason: getHistoryCell(row, indexes.fullFixedReason),
                fullFixedConfidence: getHistoryCell(row, indexes.fullFixedConfidence),
                fullFixedStatus: getHistoryCell(row, indexes.fullFixedStatus),
                detectionSource: getHistoryCell(row, indexes.detectionSource),
                evidence: getHistoryCell(row, indexes.evidence),
                ruleIds: getHistoryCell(row, indexes.ruleIds),
                issue: getHistoryCell(row, indexes.status),
                provider: getHistoryCell(row, indexes.provider),
                model: getHistoryCell(row, indexes.model),
                profileName: getHistoryCell(row, indexes.profileName),
                rowIndex: Number(getHistoryCell(row, indexes.rowIndex)),
                contentFingerprint: getHistoryCell(row, indexes.contentFingerprint),
                modelFingerprint: getHistoryCell(row, indexes.modelFingerprint),
                resultFingerprint: getHistoryCell(row, indexes.resultFingerprint),
                projectFingerprint: getHistoryCell(row, indexes.projectFingerprint),
                glossaryFingerprint: getHistoryCell(row, indexes.glossaryFingerprint),
                historyVersion: getHistoryCell(row, indexes.historyVersion)
            };

            const expandedReviews = parseHistoryReviewPayload(getHistoryCell(row, indexes.reviewsJson), baseEntry);
            if (expandedReviews.length > 0) {
                entries.push(...expandedReviews);
                return;
            }

            const normalized = normalizeImportedHistoryEntry(baseEntry);
            if (normalized) {
                entries.push(normalized);
            }
        });

        return entries;
    }

    function addHistoryIndexEntry(map, key, entry) {
        if (!key) return;
        if (!map.has(key)) {
            map.set(key, []);
        }
        map.get(key).push(entry);
    }

    function buildHistoryImportState(entries, fileName) {
        const state = createEmptyHistoryImportState();
        state.fileName = fileName;
        state.importedAt = Date.now();
        state.entries = entries.filter(entry => entry.status !== L10N_STATUS_SKIPPED);

        state.entries.forEach(entry => {
            addHistoryIndexEntry(state.byResultFingerprint, entry.resultFingerprint, entry);
            if (entry.contentFingerprint && entry.modelFingerprint) {
                addHistoryIndexEntry(state.byContentModel, `${entry.contentFingerprint}|${entry.modelFingerprint}`, entry);
            }
            addHistoryIndexEntry(state.byPair, getHistoryPairKey(entry.source, entry.target), entry);
        });

        return state;
    }

    function doesHistoryEntryMatchProfile(entry, profile) {
        const profileModelFingerprint = getProfileModelFingerprint(profile);
        if (entry.modelFingerprint && profileModelFingerprint) {
            return entry.modelFingerprint === profileModelFingerprint;
        }

        const provider = normalizeFingerprintText(profile?.provider).toLowerCase();
        const model = normalizeFingerprintText(profile?.model).toLowerCase();
        if (entry.provider && entry.model) {
            return entry.provider.toLowerCase() === provider && entry.model.toLowerCase() === model;
        }

        const label = `${entry.modelLabel || ''} ${entry.profileName || ''} ${entry.provider || ''} ${entry.model || ''}`.toLowerCase();
        if (!entry.provider && !entry.model && !entry.modelFingerprint &&
            (label.includes('多模型复核') || label.includes('异常复核') || label.includes('复核：') || label.includes('、'))) {
            return false;
        }
        const profileName = normalizeFingerprintText(profile?.name).toLowerCase();
        const providerName = getPlatformName(profile?.provider).toLowerCase();

        if (model && label.includes(model)) return true;
        if (profileName && label.includes(profileName)) return true;
        return Boolean(providerName && model && label.includes(providerName) && label.includes(model));
    }

    function findImportedHistoryMatch(task, profile, project, glossaryTerms) {
        if (!importedHistoryState.entries.length) return null;

        const metadata = getHistoryMetadata(task, project, glossaryTerms, profile);
        const resultMatches = importedHistoryState.byResultFingerprint.get(metadata.resultFingerprint) || [];
        const resultMatch = resultMatches.find(entry => doesHistoryEntryMatchProfile(entry, profile));
        if (resultMatch) {
            return { entry: resultMatch, matchType: 'strong', metadata };
        }

        const contentMatches = importedHistoryState.byContentModel.get(`${metadata.contentFingerprint}|${metadata.modelFingerprint}`) || [];
        const contentMatch = contentMatches.find(entry => doesHistoryEntryMatchProfile(entry, profile));
        if (contentMatch) {
            return { entry: contentMatch, matchType: 'strong', metadata };
        }

        const pairMatches = importedHistoryState.byPair.get(getHistoryPairKey(task.sourceText, task.targetText)) || [];
        const legacyMatch = pairMatches.find(entry =>
            !entry.contentFingerprint &&
            doesHistoryEntryMatchProfile(entry, profile)
        );
        if (legacyMatch) {
            return { entry: legacyMatch, matchType: 'legacy', metadata };
        }

        return null;
    }

    function createHistoryResultIssues(entry) {
        if (entry.issues?.length > 0) return entry.issues;
        if (entry.status !== L10N_STATUS_ISSUE && entry.status !== L10N_STATUS_DISAGREE) return [];

        return [normalizeIssue({
            category: classifyIssueCategory(`${entry.issue} ${entry.reason}`),
            issue: entry.issue || entry.status,
            corrected: entry.corrected || '',
            reason: entry.reason || '来自导入的历史检测结果',
            severity: entry.severity,
            detectionSource: entry.detectionSource || '历史结果',
            evidence: entry.evidence,
            ruleId: entry.ruleIds
        })];
    }

    function createHistoryCheckResultEntry(task, historyEntry, profile, matchType) {
        const issues = createHistoryResultIssues(historyEntry);
        const status = issues.length > 0
            ? L10N_STATUS_ISSUE
            : (historyEntry.status === L10N_STATUS_DISAGREE ? L10N_STATUS_DISAGREE : L10N_STATUS_PASS);
        const suffix = matchType === 'legacy' ? ' · 历史复用（弱匹配）' : ' · 历史复用';

        return {
            rowIndex: task.rowIndex,
            source: task.sourceText,
            target: task.targetText,
            profileId: profile.id,
            profileName: profile.name,
            provider: profile.provider,
            model: profile.model,
            modelLabel: `${getApiProfileLabel(profile)}${suffix}`,
            status,
            issue: issues.length > 0 ? summarizeIssues(issues, 'issue') : '',
            corrected: historyEntry.corrected || (issues.length > 0 ? summarizeIssues(issues, 'corrected') : ''),
            reason: historyEntry.reason || (issues.length > 0 ? summarizeIssueReasons(issues) : '历史检测结果为通过'),
            issueType: historyEntry.issueType || summarizeIssueTypes(issues),
            severity: historyEntry.severity || getHighestIssueSeverity(issues),
            detectionSource: historyEntry.detectionSource || (issues.length > 0 ? summarizeIssueSources(issues) : '历史结果'),
            evidence: historyEntry.evidence || summarizeIssueEvidence(issues),
            ruleIds: historyEntry.ruleIds || summarizeIssueRuleIds(issues),
            fullFixedTranslation: historyEntry.fullFixedTranslation || '',
            fullFixedReason: historyEntry.fullFixedReason || '',
            fullFixedConfidence: historyEntry.fullFixedConfidence || '',
            fullFixedStatus: historyEntry.fullFixedStatus || '',
            fullFixedError: historyEntry.fullFixedError || '',
            issues,
            historyReused: true,
            historyMatchType: matchType,
            historyFileName: importedHistoryState.fileName
        };
    }

    async function handleHistoryImportFile(file) {
        try {
            const rows = await readTableRowsFromFile(file);
            const entries = parseHistoryRows(rows);
            importedHistoryState = buildHistoryImportState(entries, file.name);
            historyImportInput.value = '';
            clearHistoryBtn.style.display = importedHistoryState.entries.length > 0 ? 'inline-flex' : 'none';
            renderHistoryImportSummary();

            if (importedHistoryState.entries.length === 0) {
                setStatus('warning', '未找到可复用的历史检测结果', '请确认上传的是本工具下载的检测报告，且包含检测原文、检测译文和检测模型等列。');
            } else {
                setStatus('success', '已导入历史检测结果', `读取到 ${importedHistoryState.entries.length} 条模型级检测结果，开始检测时会优先复用。`);
            }
        } catch (error) {
            console.error('History import error:', error);
            setStatus('error', '历史检测结果导入失败', error.message || '无法读取该文件');
        }
    }

    function clearImportedHistoryResults() {
        importedHistoryState = createEmptyHistoryImportState();
        historyImportInput.value = '';
        clearHistoryBtn.style.display = 'none';
        renderHistoryImportSummary();
    }

    function buildCurrentCheckTasks(completedRows = new Set()) {
        const tasks = [];
        if (!sheetData || sourceColumn === null || targetColumn === null) return tasks;
        const referenceColumns = getL10nReferenceColumns();

        for (let i = 1; i < sheetData.length; i++) {
            if (completedRows.has(i)) continue;

            const row = sheetData[i];
            const sourceText = row[sourceColumn] === undefined || row[sourceColumn] === null ? '' : String(row[sourceColumn]);
            const targetText = row[targetColumn] === undefined || row[targetColumn] === null ? '' : String(row[targetColumn]);

            if (sourceText && targetText &&
                typeof sourceText === 'string' && sourceText.trim() &&
                typeof targetText === 'string' && targetText.trim()) {
                const sourceMeta = buildSourceMetadataReferences(i);
                tasks.push({
                    rowIndex: i,
                    sourceText,
                    targetText,
                    sourceFileName: findL10nSourceForRow(i)?.fileName || '',
                    sheetName: findL10nSourceForRow(i)?.sheetName || '',
                    originalRowNumber: getOriginalRowNumber(i),
                    originalReferences: {
                        ...sourceMeta,
                        ...buildOriginalReferenceMap(row, referenceColumns)
                    }
                });
            }
        }

        return tasks;
    }

    function getTaskByRowIndex(rowIndex) {
        return buildCurrentCheckTasks(new Set()).find(task => task.rowIndex === rowIndex) || null;
    }

    function normalizeReviewIdentityKey(value) {
        return String(value || '').trim().toLowerCase();
    }

    function getProfileReviewKey(profile) {
        const provider = normalizeReviewIdentityKey(profile?.provider);
        const model = normalizeReviewIdentityKey(profile?.model);
        if (provider || model) return `${provider}:${model}`;
        return normalizeReviewIdentityKey(profile?.id || profile?.name || profile?.modelLabel);
    }

    function getReviewProfileKey(review) {
        const provider = normalizeReviewIdentityKey(review?.provider);
        const model = normalizeReviewIdentityKey(review?.model);
        if (provider || model) return `${provider}:${model}`;
        return normalizeReviewIdentityKey(review?.profileId || review?.profileName || review?.modelLabel);
    }

    function mergeModelReviews(existingReviews = [], newReviews = []) {
        const merged = [];
        const indexByKey = new Map();
        [...existingReviews, ...newReviews].forEach(review => {
            if (!review) return;
            const key = getReviewProfileKey(review);
            if (!key) {
                merged.push(review);
                return;
            }
            if (indexByKey.has(key)) {
                merged[indexByKey.get(key)] = review;
            } else {
                indexByKey.set(key, merged.length);
                merged.push(review);
            }
        });
        return merged;
    }

    function getExistingStrictReviewState(results = checkResults) {
        const state = new Map();
        (results || []).forEach(result => {
            if (!Number.isInteger(result?.rowIndex)) return;
            const task = getTaskByRowIndex(result.rowIndex);
            if (!task) return;
            const existingReviews = Array.isArray(result.reviews) && result.reviews.length > 0
                ? result.reviews.map(createModelReviewFromStoredReview)
                : (result.provider === 'local' || result.detectionSource === '本地规则' ? [] : [createModelReviewFromEntry(result)]);
            const current = state.get(result.rowIndex);
            state.set(result.rowIndex, {
                task,
                reviews: mergeModelReviews(current?.reviews || [], existingReviews),
                previousResult: current?.previousResult || result
            });
        });
        return state;
    }

    function hasReusableStrictReviewState(results = checkResults) {
        return (results || []).some(result => {
            if (!Number.isInteger(result?.rowIndex)) return false;
            if (Array.isArray(result.reviews) && result.reviews.length > 0) return true;
            return Boolean(result.provider && result.model && result.profileId);
        });
    }

    function createModelReviewFromStoredReview(review) {
        return {
            profileId: review.profileId || '',
            profileName: review.profileName || '',
            provider: review.provider || '',
            model: review.model || '',
            modelLabel: review.modelLabel || '',
            status: review.status || L10N_STATUS_PASS,
            issue: review.issue || '',
            corrected: review.corrected || '',
            reason: review.reason || (review.status === L10N_STATUS_PASS ? '通过' : ''),
            issueType: review.issueType || '',
            severity: review.severity || '',
            detectionSource: review.detectionSource || '',
            evidence: review.evidence || '',
            ruleIds: review.ruleIds || '',
            issues: Array.isArray(review.issues) ? review.issues : [],
            terminologyReview: mergeTerminologyReviewItems(review.terminologyReview || []),
            historyReused: Boolean(review.historyReused),
            historyMatchType: review.historyMatchType || '',
            historyFileName: review.historyFileName || ''
        };
    }

    function getMissingStrictProfilesForRow(rowState, profiles) {
        const completedKeys = new Set((rowState?.reviews || []).map(getReviewProfileKey).filter(Boolean));
        return profiles.filter(profile => !completedKeys.has(getProfileReviewKey(profile)));
    }

    function getStrictAppendSummary(rowStates, profiles) {
        let reusableRows = 0;
        let missingChecks = 0;
        const pendingProfileKeys = new Set();
        rowStates.forEach(rowState => {
            const missing = getMissingStrictProfilesForRow(rowState, profiles);
            if (missing.length < profiles.length) reusableRows++;
            missingChecks += missing.length;
            missing.forEach(profile => pendingProfileKeys.add(getProfileReviewKey(profile)));
        });
        const pendingProfiles = profiles.filter(profile => pendingProfileKeys.has(getProfileReviewKey(profile)));
        return { reusableRows, missingChecks, pendingProfiles };
    }

    function carryForwardFullFixIfStillValid(nextResult, previousResult) {
        if (!previousResult?.fullFixedTranslation) return nextResult;
        const beforeIssue = previousResult.status === L10N_STATUS_ISSUE;
        const afterIssue = nextResult.status === L10N_STATUS_ISSUE;
        if (!beforeIssue || !afterIssue) return nextResult;
        return {
            ...nextResult,
            fullFixedTranslation: previousResult.fullFixedTranslation || '',
            fullFixedReason: previousResult.fullFixedReason || '',
            fullFixedConfidence: previousResult.fullFixedConfidence || '',
            fullFixedStatus: previousResult.fullFixedStatus || '',
            fullFixedError: previousResult.fullFixedError || ''
        };
    }

    function renderHistoryImportSummary() {
        if (!historyImportStatus) return;

        if (!importedHistoryState.entries.length) {
            historyImportStatus.className = 'history-import-status';
            historyImportStatus.textContent = '未导入历史检测结果；导入后会优先复用已检测过的模型结果，减少重复 token 消耗。';
            return;
        }

        const activeProject = getSelectedL10nProject();
        const activeGlossaryTerms = getSelectedGlossaryTerms();
        const activeProfiles = getSelectedL10nProfiles();
        const tasks = buildCurrentCheckTasks();

        if (tasks.length === 0 || activeProfiles.length === 0) {
            historyImportStatus.className = 'history-import-status ready';
            historyImportStatus.textContent = `已导入 ${importedHistoryState.entries.length} 条模型级历史结果（${importedHistoryState.fileName}）。上传检测文件、确认原文/译文列并勾选通道后，会显示可复用数量。`;
            return;
        }

        let reusableCount = 0;
        let strongCount = 0;
        let legacyCount = 0;
        const reusableRows = new Set();
        const coveredModels = new Map();

        tasks.forEach(task => {
            activeProfiles.forEach(profile => {
                const match = findImportedHistoryMatch(task, profile, activeProject, activeGlossaryTerms);
                if (!match) return;

                reusableCount++;
                reusableRows.add(task.rowIndex);
                if (match.matchType === 'legacy') {
                    legacyCount++;
                } else {
                    strongCount++;
                }
                coveredModels.set(getApiProfileLabel(profile), true);
            });
        });

        const modelText = [...coveredModels.keys()].slice(0, 4).join('、') || '暂无';
        const moreText = coveredModels.size > 4 ? ` 等 ${coveredModels.size} 个模型` : '';
        const unavailableRows = Math.max(0, tasks.length - reusableRows.size);
        const unavailableSamples = tasks
            .filter(task => !reusableRows.has(task.rowIndex))
            .slice(0, 6)
            .map(task => task.rowIndex + 1);
        const unavailableDetail = unavailableSamples.length > 0
            ? `，例如行 ${unavailableSamples.join('、')}${unavailableRows > unavailableSamples.length ? ' 等' : ''}`
            : '';
        const weakText = legacyCount > 0
            ? `；其中 ${legacyCount} 次为旧报告弱匹配，建议确认文件确实来自同一批原文译文`
            : '';

        historyImportStatus.className = `history-import-status ${legacyCount > 0 ? 'warning' : 'ready'}`;
        historyImportStatus.textContent =
            `已导入 ${importedHistoryState.entries.length} 条历史结果；当前文件可复用 ${reusableCount} 次模型检测，覆盖 ${reusableRows.size}/${tasks.length} 行，覆盖 ${modelText}${moreText}；无法复用 ${unavailableRows} 行${unavailableDetail}。强匹配 ${strongCount} 次${weakText}。`;
    }

    function chooseBalancedPrimaryProfile(activeProfiles, tasks, project, glossaryTerms) {
        if (!activeProfiles.length) return null;
        const activeProfile = getActiveApiProfile();
        const selectedDefaultProfile = activeProfile
            ? activeProfiles.find(profile => profile.id === activeProfile.id)
            : null;
        if (selectedDefaultProfile) return selectedDefaultProfile;

        if (!importedHistoryState.entries.length || !tasks.length) return activeProfiles[0];

        const scoredProfiles = activeProfiles.map(profile => {
            const reusableCount = tasks.reduce((count, task) => {
                return count + (findImportedHistoryMatch(task, profile, project, glossaryTerms) ? 1 : 0);
            }, 0);
            return { profile, reusableCount };
        }).sort((a, b) => b.reusableCount - a.reusableCount);

        return scoredProfiles[0]?.reusableCount > 0 ? scoredProfiles[0].profile : activeProfiles[0];
    }

    function chunkArray(items, size) {
        const chunks = [];
        for (let i = 0; i < items.length; i += size) {
            chunks.push(items.slice(i, i + size));
        }
        return chunks;
    }

    function loadL10nCheckCache() {
        const stored = localStorage.getItem(L10N_CHECK_CACHE_KEY);
        if (!stored) return {};

        try {
            const parsed = JSON.parse(stored);
            return parsed && parsed.version === L10N_CHECK_CACHE_VERSION && parsed.entries
                ? parsed.entries
                : {};
        } catch {
            return {};
        }
    }

    function saveL10nCheckCache(entries) {
        const sortedEntries = Object.entries(entries || {})
            .sort((a, b) => Number(b[1]?.timestamp || 0) - Number(a[1]?.timestamp || 0))
            .slice(0, L10N_CHECK_CACHE_LIMIT);

        localStorage.setItem(L10N_CHECK_CACHE_KEY, JSON.stringify({
            version: L10N_CHECK_CACHE_VERSION,
            updatedAt: Date.now(),
            entries: Object.fromEntries(sortedEntries)
        }));
    }

    function getCheckCacheKey(task, project, relevantTerms, profile) {
        const glossarySignature = relevantTerms
            .map(term => [term.source, getGlossaryEffectiveTarget(term), term.type].join('='))
            .sort()
            .join('|');
        return makeStableId(JSON.stringify({
            source: task.sourceText,
            target: task.targetText,
            projectId: project?.id || '',
            projectName: project?.name || '',
            projectRules: project?.rules || '',
            glossary: glossarySignature,
            ruleEngine: L10N_RULE_ENGINE_VERSION,
            provider: profile?.provider || '',
            model: profile?.model || ''
        }));
    }

    function extractProtectedTokens(text) {
        const value = String(text || '');
        const matches = value.match(/(%\d*\$?[sdif]|%\{[^}]+\}|%[sdif]|\\n|\n|\{[A-Za-z0-9_]+\}|<[^>]+>|\[[A-Z0-9_]+\]|\$[A-Z0-9_]+)/g);
        return matches ? [...new Set(matches)] : [];
    }

    function escapeRegExpLiteral(value) {
        return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function extractNumbers(text) {
        const matches = String(text || '').match(/\d+(?:[.,]\d+)?%?/g);
        return matches ? [...new Set(matches.map(value => value.replace(/,/g, '')))] : [];
    }

    function normalizeNumericToken(value) {
        const text = String(value || '').replace(/,/g, '').trim();
        if (!text) return '';
        const numeric = Number(text.replace(/%$/, ''));
        if (!Number.isFinite(numeric)) return text;
        const normalized = Number.isInteger(numeric) ? String(numeric) : String(numeric).replace(/\.0+$/, '');
        return text.endsWith('%') ? `${normalized}%` : normalized;
    }

    function getRomanNumeralValue(value) {
        const text = String(value || '').trim().toUpperCase();
        if (!/^(?=[MDCLXVI])M{0,4}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/.test(text)) return null;
        const map = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
        let total = 0;
        for (let index = 0; index < text.length; index++) {
            const current = map[text[index]];
            const next = map[text[index + 1]] || 0;
            total += current < next ? -current : current;
        }
        return total > 0 ? total : null;
    }

    function extractRomanNumeralNumbers(text) {
        const matches = String(text || '').match(/\b[IVXLCDM]{1,8}\b/gi) || [];
        return matches
            .map(getRomanNumeralValue)
            .filter(value => Number.isFinite(value))
            .map(value => String(value));
    }

    function getEnglishMonthAliases(month) {
        const aliases = {
            1: ['jan', 'january'],
            2: ['feb', 'february'],
            3: ['mar', 'march'],
            4: ['apr', 'april'],
            5: ['may'],
            6: ['jun', 'june'],
            7: ['jul', 'july'],
            8: ['aug', 'august'],
            9: ['sep', 'sept', 'september'],
            10: ['oct', 'october'],
            11: ['nov', 'november'],
            12: ['dec', 'december']
        };
        return aliases[month] || [];
    }

    function hasEquivalentLocalizedDate(source, target, number) {
        const sourceText = String(source || '');
        const targetText = String(target || '').toLowerCase();
        const value = Number(number);
        if (!Number.isFinite(value)) return false;

        const monthDayMatches = [...sourceText.matchAll(/(\d{1,2})\s*月\s*(\d{1,2})\s*日/g)];
        for (const match of monthDayMatches) {
            const month = Number(match[1]);
            const day = Number(match[2]);
            if (![month, day].includes(value)) continue;
            const monthPattern = getEnglishMonthAliases(month).join('|');
            if (!monthPattern) continue;
            const dayPattern = String(day).padStart(2, '0').replace(/^0/, '0?');
            const datePatterns = [
                new RegExp(`\\b${dayPattern}\\s*[-/ ]\\s*(?:${monthPattern})\\b`, 'i'),
                new RegExp(`\\b(?:${monthPattern})\\s*[-/ ]\\s*${dayPattern}\\b`, 'i')
            ];
            if (datePatterns.some(pattern => pattern.test(targetText))) return true;
        }

        return false;
    }

    function hasEquivalentLocalizedTime(source, target, number) {
        const sourceText = String(source || '');
        const targetText = String(target || '').toLowerCase();
        const value = Number(number);
        if (!Number.isFinite(value)) return false;

        const timeMatches = [
            ...sourceText.matchAll(/(\d{1,2})\s*[:：]\s*(\d{2})/g),
            ...sourceText.matchAll(/(\d{1,2})\s*点(?:\s*(\d{1,2})\s*分?)?/g)
        ];

        for (const match of timeMatches) {
            const hour24 = Number(match[1]);
            const minute = Number(match[2] || 0);
            if (![hour24, minute].includes(value)) continue;
            const hour12 = hour24 % 12 || 12;
            const meridiem = hour24 >= 12 ? 'pm' : 'am';
            const minutePattern = String(minute).padStart(2, '0');
            const timePatterns = [
                new RegExp(`\\b${hour12}\\s*[:：]\\s*${minutePattern}\\s*${meridiem}\\b`, 'i'),
                new RegExp(`\\b${hour12}\\s*${meridiem}\\b`, 'i'),
                new RegExp(`\\b${String(hour24).padStart(2, '0').replace(/^0/, '0?')}\\s*[:：]\\s*${minutePattern}\\b`, 'i')
            ];
            if (timePatterns.some(pattern => pattern.test(targetText))) return true;
        }

        return false;
    }

    function hasEquivalentLocalizedDiscount(source, target, number) {
        const sourceText = String(source || '');
        const targetText = String(target || '').toLowerCase();
        const value = Number(String(number).replace(/%$/, ''));
        if (!Number.isFinite(value)) return false;

        const discountMatches = [...sourceText.matchAll(/(\d+(?:\.\d+)?)\s*折/g)];
        for (const match of discountMatches) {
            const fold = Number(match[1]);
            if (!Number.isFinite(fold) || fold <= 0 || fold >= 10) continue;
            if (value !== fold) continue;
            const offPercent = Math.round((10 - fold) * 10 * 100) / 100;
            const keepPercent = Math.round(fold * 10 * 100) / 100;
            const offPattern = new RegExp(`\\b${String(offPercent).replace(/\.0+$/, '')}\\s*%?\\s*off\\b`, 'i');
            const keepPattern = new RegExp(`\\b${String(keepPercent).replace(/\.0+$/, '')}\\s*%\\b`, 'i');
            if (offPattern.test(targetText) || keepPattern.test(targetText)) return true;
        }

        return false;
    }

    function hasEquivalentLocalizedNumber(source, target, number) {
        const normalizedNumber = normalizeNumericToken(number);
        if (!normalizedNumber) return false;
        const targetNumbers = new Set(extractNumbers(target).map(normalizeNumericToken));
        if (targetNumbers.has(normalizedNumber)) return true;
        const targetRomanNumbers = new Set(extractRomanNumeralNumbers(target));
        if (targetRomanNumbers.has(normalizedNumber.replace(/%$/, ''))) return true;
        return hasEquivalentLocalizedDiscount(source, target, normalizedNumber) ||
            hasEquivalentLocalizedDate(source, target, normalizedNumber) ||
            hasEquivalentLocalizedTime(source, target, normalizedNumber);
    }

    function buildHiddenRuleIssue(ruleId, category, issue, reason, options = {}) {
        return normalizeIssue({
            ruleId,
            category,
            issue,
            corrected: options.corrected || '',
            reason,
            severity: options.severity || '一般',
            evidence: options.evidence || '',
            detectionSource: '本地规则'
        });
    }

    function shouldResolveByLocalRules(localIssues = []) {
        return (localIssues || []).some(issue => {
            const severity = normalizeIssueSeverity(issue.severity, issue.category, issue.issue, issue.reason);
            return severity === '阻断' || severity === '严重';
        });
    }

    function createLocalRuleCheckResultEntry(task, localIssues) {
        const issues = (localIssues || []).map(normalizeIssue);
        return normalizeCheckResultEntry({
            rowIndex: task.rowIndex,
            source: task.sourceText,
            target: task.targetText,
            originalReferences: normalizeOriginalReferences(task.originalReferences),
            profileId: 'hidden-rule-engine-v2',
            profileName: '隐藏规则引擎 V2',
            provider: 'local',
            model: L10N_RULE_ENGINE_VERSION,
            modelLabel: '隐藏规则引擎 V2',
            status: issues.length > 0 ? L10N_STATUS_ISSUE : L10N_STATUS_PASS,
            issue: summarizeIssues(issues, 'issue'),
            corrected: summarizeIssues(issues, 'corrected'),
            reason: summarizeIssueReasons(issues),
            issueType: summarizeIssueTypes(issues),
            severity: getHighestIssueSeverity(issues),
            detectionSource: '本地规则',
            evidence: summarizeIssueEvidence(issues),
            ruleIds: summarizeIssueRuleIds(issues),
            issues
        });
    }

    function buildLocalRuleIssues(task, glossaryTerms) {
        const issues = [];
        const source = String(task.sourceText || '');
        const target = String(task.targetText || '');
        const trimmedSource = source.trim();
        const trimmedTarget = target.trim();

        if (trimmedSource && !trimmedTarget) {
            issues.push(buildHiddenRuleIssue(
                'target_empty',
                '游戏项目翻译要求',
                '译文为空',
                '原文存在内容，但译文为空，无法进入 AI 语义检测',
                { severity: '阻断', evidence: trimmedSource.slice(0, 80) }
            ));
            return issues;
        }

        const sourceTokens = extractProtectedTokens(source);
        const targetTokens = new Set(extractProtectedTokens(target));
        const missingTokens = sourceTokens.filter(token => !targetTokens.has(token));

        if (missingTokens.length > 0) {
            issues.push(buildHiddenRuleIssue(
                'placeholder_missing',
                '游戏项目翻译要求',
                '占位符或格式标记缺失',
                `译文缺少原文中的格式标记：${missingTokens.join('、')}`,
                { severity: '阻断', evidence: missingTokens.join('、') }
            ));
        }

        const sourceNumbers = extractNumbers(source);
        const missingNumbers = sourceNumbers.filter(number => !hasEquivalentLocalizedNumber(source, target, number));
        if (missingNumbers.length > 0) {
            issues.push(buildHiddenRuleIssue(
                'number_mismatch',
                '游戏翻译基本规范',
                '数字信息不一致',
                `译文缺少或改写了原文数字：${missingNumbers.join('、')}`,
                { severity: '严重', evidence: missingNumbers.join('、') }
            ));
        }

        const relevantTerms = getRelevantGlossaryTerms(source, target, glossaryTerms, task);
        relevantTerms.forEach(term => {
            const expectedTarget = getGlossaryEffectiveTarget(term);
            if (!expectedTarget) return;
            const sourceMatches = source.toLowerCase().includes(term.source.toLowerCase());
            const targetMatches = target.toLowerCase().includes(expectedTarget.toLowerCase());
            if (sourceMatches && !targetMatches) {
                issues.push(buildHiddenRuleIssue(
                    'glossary_term_mismatch',
                    '术语表限制',
                    `术语“${term.source}”未使用指定译法`,
                    `术语表要求“${term.source}”译为“${expectedTarget}”，当前译文未命中该译法`,
                    { severity: '严重', corrected: expectedTarget, evidence: `${term.source} -> ${expectedTarget}` }
                ));
            }
        });

        if (hasCjkText(source) && trimmedTarget && source.trim() === target.trim()) {
            issues.push(buildHiddenRuleIssue(
                'untranslated_same_as_source',
                '游戏翻译基本规范',
                '译文疑似未翻译',
                '译文与中文原文完全一致，疑似没有翻译',
                { severity: '严重', evidence: trimmedTarget.slice(0, 80) }
            ));
        } else if (/[\u4e00-\u9fa5]/.test(target)) {
            issues.push(buildHiddenRuleIssue(
                'target_contains_cjk',
                '游戏翻译基本规范',
                '译文中残留中文',
                '目标译文中仍包含中文字符，需要确认是否漏译或是否为保留专名',
                { severity: '一般', evidence: (target.match(/[\u4e00-\u9fa5]+/g) || []).slice(0, 5).join('、') }
            ));
        }

        return issues;
    }

    function mergeCheckIssues(localIssues, aiResult) {
        const merged = [...(localIssues || []), ...normalizeIssues(aiResult)];
        const seen = new Set();
        const issues = merged.filter(issue => {
            const key = `${issue.ruleId}|${issue.category}|${issue.issue}|${issue.corrected}|${issue.reason}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
        return { issues };
    }

    function estimateTokenSaving(modeConfig, totalRows, activeProfiles) {
        const profileCount = Math.max(1, activeProfiles.length);
        const batchSize = modeConfig.batchSize || 12;
        const batches = Math.ceil(totalRows / batchSize);
        if (modeConfig === L10N_MODE_CONFIG.strict) {
            return `${totalRows * profileCount} 次单行请求压缩为约 ${batches * profileCount} 次批量请求`;
        }
        if (modeConfig === L10N_MODE_CONFIG.balanced) {
            return `${totalRows} 次主检测压缩为约 ${batches} 次批量请求，只有异常候选才追加复核`;
        }
        return `${totalRows} 次单行请求压缩为约 ${batches} 次批量请求`;
    }

    async function downloadCurrentCheckProgress() {
        let resultsToDownload = checkResults.length > 0 ? checkResults : realtimeCheckResults;

        if (resultsToDownload.length === 0) {
            const saved = loadL10nProgress();
            if (saved) {
                checkResults = normalizeSavedCheckResults(saved.checkResults || saved.results);
                realtimeCheckResults = normalizeSavedCheckResults(saved.realtimeCheckResults || saved.liveResults || []);
                resultsToDownload = checkResults.length > 0 ? checkResults : realtimeCheckResults;
                originalFileName = originalFileName || saved.fileName || 'l10n_check';
            }
        }

        if (resultsToDownload.length === 0) {
            setStatus('warning', '没有可下载的检测结果', '当前任务还没有产生检测结果，请等待第一批结果出现后再下载。');
            return;
        }

        downloadCsvRows(
            buildWindowReportRows(resultsToDownload),
            `${getL10nReportBaseName()}_本地化检测_当前结果.csv`
        );
        setStatus('success', '当前检测结果已下载', `已导出 ${resultsToDownload.length} 条实时检测结果`);
    }

    async function readL10nSourcesFromFile(file, startIndex = 0) {
        const extension = file.name.split('.').pop().toLowerCase();

        if (extension === 'csv') {
            const { text } = await readCSVWithEncoding(file);
            const result = XLSX.read(text, { type: 'string', cellDates: true });
            const sheetName = result.SheetNames[0];
            const rows = XLSX.utils.sheet_to_json(result.Sheets[sheetName], { header: 1 });
            return [{
                id: makeL10nSourceId(file.name, 'CSV', startIndex),
                fileName: file.name,
                sheetName: 'CSV',
                rows,
                rowMap: new Map()
            }];
        }

        const arrayBuffer = await file.arrayBuffer();
        const result = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
        return result.SheetNames.map((sheetName, index) => ({
            id: makeL10nSourceId(file.name, sheetName, startIndex + index),
            fileName: file.name,
            sheetName,
            rows: XLSX.utils.sheet_to_json(result.Sheets[sheetName], { header: 1 }),
            rowMap: new Map()
        })).filter(source => source.rows.length > 0);
    }

    async function handleL10nFile(file) {
        return handleL10nFiles([file]);
    }

    async function handleL10nFiles(files) {
        const fileList = [...(files || [])].filter(Boolean);
        if (fileList.length === 0) return;
        if (activeCheckRunId || progressSection.style.display !== 'none') {
            cancelCheckTask({ silent: true, skipConfirm: true });
        }

        const sourceGroups = [];
        let sourceIndex = 0;
        for (const file of fileList) {
            const sources = await readL10nSourcesFromFile(file, sourceIndex);
            sourceGroups.push(...sources);
            sourceIndex += sources.length;
        }
        l10nSources = sourceGroups;
        selectedSourceIds = new Set(l10nSources.map(source => source.id));
        rebuildCombinedSheetData();
        originalFileName = fileList.length === 1
            ? fileList[0].name.replace(/\.(csv|xlsx|xls)$/i, '')
            : `批量检测_${fileList.length}个文件`;

        document.getElementById('l10nFileName').textContent = fileList.length === 1
            ? fileList[0].name
            : `${fileList.length} 个文件 / ${l10nSources.length} 个工作表`;

        document.getElementById('l10nTotalRows').textContent = Math.max(0, (sheetData?.length || 1) - 1);
        document.getElementById('l10nTotalCols').textContent = sheetData?.[0] ? sheetData[0].length : 0;

        sourceColumn = null;
        targetColumn = null;
        renderSheetSelectList();
        renderColumnLists();

        fileInfo.style.display = 'block';
        columnSelectSection.style.display = 'block';
        progressSection.style.display = 'none';
        resultsSection.style.display = 'none';
        checkResults = [];
        realtimeCheckResults = [];
        glossaryData = [];
        clearL10nProgress();
        renderHistoryImportSummary();
    }

    function loadL10nProjects() {
        l10nProjects = loadTranslationProjectsFromStorage();
        projectSelect.innerHTML = '';

        if (l10nProjects.length === 0) {
            projectSelect.innerHTML = '<option value="">请先在文本翻译中创建游戏项目</option>';
            return;
        }

        l10nProjects.forEach(project => {
            const option = document.createElement('option');
            option.value = project.id;
            option.textContent = project.id === getDefaultTranslationProjectId()
                ? `${project.name}（默认）`
                : project.name;
            projectSelect.appendChild(option);
        });
        const preferredProject = getPreferredTranslationProject(l10nProjects);
        if (preferredProject) {
            projectSelect.value = preferredProject.id;
        }
        renderHistoryImportSummary();
    }

    function getSelectedL10nProject() {
        return l10nProjects.find(project => project.id === projectSelect.value) || l10nProjects[0] || null;
    }

    function renderL10nGlossaryList() {
        const library = loadGlossaryLibrary();
        const availableIds = new Set(library.map(entry => entry.id));
        selectedGlossaryIds = new Set([...selectedGlossaryIds].filter(id => availableIds.has(id)));
        glossaryList.innerHTML = '';

        if (library.length === 0) {
            glossaryList.innerHTML = '<div class="resource-empty">暂无可用术语表。请先到“术语表”功能中上传已有术语表，或从文件中提取术语表。</div>';
            return;
        }

        library.forEach(entry => {
            const entryTerms = normalizeGlossaryTerms(entry.terms);
            const label = document.createElement('label');
            label.className = 'resource-check-item';
            label.innerHTML = `
                <input type="checkbox" value="${entry.id}" ${selectedGlossaryIds.has(entry.id) ? 'checked' : ''}>
                <span class="resource-main">
                    <span class="resource-title">${escapeHtml(entry.name)}</span>
                    <span class="resource-meta">${entryTerms.length} 条术语 · ${getGlossaryOriginDisplayLabel(entry.origin)}${entry.sourceFileName ? ` · ${escapeHtml(entry.sourceFileName)}` : ''}</span>
                </span>
            `;

            const checkbox = label.querySelector('input');
            checkbox.addEventListener('change', () => {
                if (checkbox.checked) {
                    selectedGlossaryIds.add(entry.id);
                } else {
                    selectedGlossaryIds.delete(entry.id);
                }
                renderHistoryImportSummary();
            });

            glossaryList.appendChild(label);
        });
    }

    function getSelectedGlossaryTerms() {
        const library = loadGlossaryLibrary();
        return library
            .filter(entry => selectedGlossaryIds.has(entry.id))
            .flatMap(entry => normalizeGlossaryTerms(entry.terms));
    }

    function renderL10nProfileList() {
        selectedProfileIds = renderApiProfileChecklist(
            profileList,
            selectedProfileIds,
            (nextIds) => {
                selectedProfileIds = nextIds;
                renderHistoryImportSummary();
            },
            '暂无可用于本地化检测的 API 通道。请先在顶部“API 配置”中保存 DeepSeek、Gemini、通义千问等检测通道。'
        );
        renderHistoryImportSummary();
    }

    function getSelectedL10nProfiles() {
        return getUsableApiProfiles().filter(profile =>
            selectedProfileIds.has(profile.id) &&
            profile.apiKey
        );
    }

    function ensureL10nProfilesConfigured(featureName) {
        const profiles = getSelectedL10nProfiles();
        if (profiles.length > 0) return true;

        setStatus(
            'error',
            '未选择可用检测通道',
            `${featureName} 需要先在顶部 API 配置中保存可用通道，并在本地化检测里至少勾选一个通道。`,
            revealApiConfigPanel,
            '去配置'
        );
        revealApiConfigPanel();
        return false;
    }

    function detectLanguage(text) {
        if (!text || typeof text !== 'string') return 'unknown';

        const chineseRegex = /[\u4e00-\u9fa5]/g;
        const englishRegex = /[a-zA-Z]/g;
        const japaneseRegex = /[\u3040-\u309f\u30a0-\u30ff]/g;
        const koreanRegex = /[\uac00-\ud7af]/g;

        const chineseMatches = text.match(chineseRegex);
        const englishMatches = text.match(englishRegex);
        const japaneseMatches = text.match(japaneseRegex);
        const koreanMatches = text.match(koreanRegex);

        const chineseCount = chineseMatches ? chineseMatches.length : 0;
        const englishCount = englishMatches ? englishMatches.length : 0;
        const japaneseCount = japaneseMatches ? japaneseMatches.length : 0;
        const koreanCount = koreanMatches ? koreanMatches.length : 0;

        const total = chineseCount + englishCount + japaneseCount + koreanCount;

        if (total === 0) return 'unknown';

        if (chineseCount / total > 0.3) return 'chinese';
        if (japaneseCount / total > 0.3) return 'japanese';
        if (koreanCount / total > 0.3) return 'korean';
        if (englishCount / total > 0.3) return 'english';

        return 'unknown';
    }

    function detectColumnLanguage(colIndex) {
        if (sheetData.length <= 1) return 'unknown';

        const sampleRows = sheetData.slice(1, Math.min(11, sheetData.length));
        const languages = [];

        for (const row of sampleRows) {
            const cell = row[colIndex];
            if (cell && typeof cell === 'string' && cell.trim()) {
                languages.push(detectLanguage(cell));
            }
        }

        if (languages.length === 0) return 'unknown';

        const languageCounts = {};
        for (const lang of languages) {
            languageCounts[lang] = (languageCounts[lang] || 0) + 1;
        }

        let maxLang = 'unknown';
        let maxCount = 0;
        for (const [lang, count] of Object.entries(languageCounts)) {
            if (count > maxCount) {
                maxCount = count;
                maxLang = lang;
            }
        }

        return maxLang;
    }

    function renderSheetSelectList() {
        if (!sheetSelectPanel || !sheetSelectList || !sheetSelectCount) return;
        const showPanel = l10nSources.length > 1;
        sheetSelectPanel.style.display = showPanel ? 'block' : 'none';
        sheetSelectList.innerHTML = '';

        if (!showPanel) {
            sheetSelectCount.textContent = `${l10nSources.length} 个`;
            return;
        }

        const selectedCount = getSelectedL10nSources().length;
        sheetSelectCount.textContent = `${selectedCount} / ${l10nSources.length}`;
        l10nSources.forEach(source => {
            const rowCount = Math.max(0, source.rows.length - 1);
            const colCount = source.rows[0]?.length || 0;
            const label = document.createElement('label');
            label.className = 'resource-check-item';
            label.innerHTML = `
                <input type="checkbox" value="${source.id}" ${selectedSourceIds.has(source.id) ? 'checked' : ''}>
                <span class="resource-main">
                    <span class="resource-title">${escapeHtml(getDisplaySourceName(source))}</span>
                    <span class="resource-meta">${rowCount} 行 · ${colCount} 列</span>
                </span>
            `;

            const checkbox = label.querySelector('input');
            checkbox.addEventListener('change', () => {
                if (checkbox.checked) {
                    selectedSourceIds.add(source.id);
                } else {
                    selectedSourceIds.delete(source.id);
                }
                rebuildCombinedSheetData();
                sourceColumn = null;
                targetColumn = null;
                renderSheetSelectList();
                renderColumnLists();
                document.getElementById('l10nTotalRows').textContent = Math.max(0, (sheetData?.length || 1) - 1);
                document.getElementById('l10nTotalCols').textContent = sheetData?.[0] ? sheetData[0].length : 0;
                renderHistoryImportSummary();
            });

            sheetSelectList.appendChild(label);
        });
    }

    function renderColumnLists() {
        const sourceColumnList = document.getElementById('l10nSourceColumnList');
        const targetColumnList = document.getElementById('l10nTargetColumnList');
        sourceColumnList.innerHTML = '';
        targetColumnList.innerHTML = '';

        if (!sheetData || sheetData.length === 0 || !sheetData[0]) {
            const hint = '<p class="column-hint">无法读取列信息</p>';
            sourceColumnList.innerHTML = hint;
            targetColumnList.innerHTML = hint;
            return;
        }

        const headers = sheetData[0];
        const columnLanguages = [];

        headers.forEach((header, index) => {
            const lang = detectColumnLanguage(index);
            columnLanguages.push(lang);
        });

        if (sourceColumn === null || targetColumn === null) {
            let chineseCol = null;
            let otherCol = null;

            for (let i = 0; i < columnLanguages.length; i++) {
                if (columnLanguages[i] === 'chinese' && chineseCol === null) {
                    chineseCol = i;
                } else if (columnLanguages[i] !== 'chinese' && columnLanguages[i] !== 'unknown' && otherCol === null) {
                    otherCol = i;
                }
            }

            if (chineseCol !== null) {
                sourceColumn = chineseCol;
            }
            if (otherCol !== null) {
                targetColumn = otherCol;
            }
        }

        const languageNames = {
            'chinese': '中文',
            'english': '英文',
            'japanese': '日文',
            'korean': '韩文',
            'unknown': '未知'
        };

        headers.forEach((header, index) => {
            const isSourceSelected = sourceColumn === index;
            const isTargetSelected = targetColumn === index;
            const lang = columnLanguages[index];
            const langName = languageNames[lang] || '未知';

            const sourceDiv = document.createElement('div');
            sourceDiv.className = `column-item ${isSourceSelected ? 'selected' : ''}`;
            sourceDiv.innerHTML = `
                <span class="column-index">列 ${index + 1}</span>
                <span class="column-name">${header || '(空列名)'}</span>
                <span class="column-lang">${langName}</span>
                <span class="column-preview">${getColumnPreview(index)}</span>
            `;
            sourceDiv.addEventListener('click', () => selectSourceColumn(index));
            sourceColumnList.appendChild(sourceDiv);

            const targetDiv = document.createElement('div');
            targetDiv.className = `column-item ${isTargetSelected ? 'selected' : ''}`;
            targetDiv.innerHTML = `
                <span class="column-index">列 ${index + 1}</span>
                <span class="column-name">${header || '(空列名)'}</span>
                <span class="column-lang">${langName}</span>
                <span class="column-preview">${getColumnPreview(index)}</span>
            `;
            targetDiv.addEventListener('click', () => selectTargetColumn(index));
            targetColumnList.appendChild(targetDiv);
        });
    }

    function getColumnPreview(colIndex) {
        if (sheetData.length <= 1) return '无数据';
        const previewRows = sheetData.slice(1, 4);
        const values = previewRows.map(row => {
            const val = row[colIndex];
            if (val === undefined || val === null) return '';
            const str = String(val);
            return str.length > 15 ? str.substring(0, 15) + '...' : str;
        }).filter(v => v);
        return values.join(' | ') || '无数据';
    }

    function selectSourceColumn(index) {
        sourceColumn = index;
        renderColumnLists();
    }

    function selectTargetColumn(index) {
        targetColumn = index;
        renderColumnLists();
    }

    function confirmColumnSelection() {
        if (sourceColumn === null) {
            alert('请选择原文列');
            return;
        }
        if (targetColumn === null) {
            alert('请选择译文列');
            return;
        }
        if (sourceColumn === targetColumn) {
            alert('原文列和译文列不能相同');
            return;
        }
        columnSelectSection.style.display = 'none';
    }

    async function validateL10nProfileConnection(profile, signal) {
        const apiConfig = profile || getApiConfig();
        const model = apiConfig.model || getDefaultModelForProvider(apiConfig.provider);
        const baseUrl = getApiBaseUrl(apiConfig.provider, apiConfig.baseUrl);
        const maxAttempts = apiConfig.provider === 'youdao' ? 3 : 2;

        if (!apiConfig.apiKey) {
            throw new Error('未填写 API Key');
        }
        if (!model) {
            throw new Error('未选择模型');
        }

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            try {
                await requestModelContent(
                    apiConfig,
                    {
                        model,
                        messages: [{ role: 'user', content: '不要推理，不要解释，请只回复 OK。' }],
                        temperature: 0,
                        max_tokens: getPreflightMaxTokens(apiConfig, model, attempt)
                    },
                    signal,
                    API_PREFLIGHT_TIMEOUT_MS,
                    { reasoningEffort: 'minimal' }
                );
                return;
            } catch (error) {
                if (error.name === 'AbortError' || signal?.aborted) throw error;
                const canRetry = (error.isOutputTruncated || error.isRateLimited || /qps|频率|限流|411|rate.?limit|quota/i.test(error.message || '')) &&
                    attempt < maxAttempts - 1;
                if (canRetry) {
                    const retryDelay = error.retryAfterMs > 0
                        ? Math.min(error.retryAfterMs, 8000)
                        : (error.isOutputTruncated ? 500 : 1800 * (attempt + 1));
                    await delayWithSignal(retryDelay, signal);
                    continue;
                }

                const prefix = error.status || error.payload ? '请求失败' : '无法连接接口';
                throw new Error(`${prefix}：${getFriendlyApiErrorMessage(error, apiConfig)}`);
            }
        }
    }

    async function preflightL10nProfiles(profiles, signal) {
        const failures = [];

        for (let index = 0; index < profiles.length; index++) {
            const profile = profiles[index];
            try {
                updateChannelProgress(profile, {
                    status: 'running',
                    message: '正在验证 Key、Base URL 和模型权限'
                });
                await validateL10nProfileConnection(profile, signal);
                updateChannelProgress(profile, {
                    status: 'waiting',
                    message: '预检通过，等待检测'
                });
            } catch (error) {
                if (error.name === 'AbortError' || signal?.aborted) throw error;
                updateChannelProgress(profile, {
                    status: 'failed',
                    message: error.message || '预检失败'
                });
                failures.push({
                    profile,
                    message: error.message || '未知错误'
                });
            }
            if (index < profiles.length - 1) {
                await delayWithSignal(profile.provider === profiles[index + 1]?.provider ? 1200 : 500, signal);
            }
        }

        if (failures.length > 0) {
            const detail = failures
                .map(item => `${getApiProfileLabel(item.profile)}：${item.message}`)
                .join('；');
            throw new Error(`以下检测通道不可用，任务已停止：${detail}`);
        }
    }

    async function startCheck(options = {}) {
        const skipSavedProgressPrompt = Boolean(options?.skipSavedProgressPrompt);
        if (activeCheckRunId && progressSection.style.display !== 'none') {
            setStatus('warning', '已有检测任务正在运行', '请先点击“取消任务”停止当前任务，或点击“暂停”保存当前进度。');
            return;
        }

        const activeProject = getSelectedL10nProject();
        const activeGlossaryTerms = getSelectedGlossaryTerms();
        let activeProfiles = getSelectedL10nProfiles();

        if (!sheetData) {
            alert('请先上传需要检测的文件');
            return;
        }

        if (sourceColumn === null || targetColumn === null) {
            alert('请先确认原文列和译文列');
            return;
        }

        if (!activeProject) {
            alert('请先选择游戏项目');
            return;
        }

        if (!ensureL10nProfilesConfigured('本地化检测')) {
            clearL10nProgress();
            progressSection.style.display = 'none';
            resultsSection.style.display = 'none';
            return;
        }

        progressSection.style.display = 'block';
        hideStatus();

        const checkList = document.getElementById('l10nCheckList');
        checkList.innerHTML = '<div class="check-list-empty">等待第一条检测结果...</div>';

        const totalRows = sheetData.length - 1;

        const previousStrictResults = getSelectedCheckMode() === 'strict'
            ? normalizeSavedCheckResults(checkResults)
            : [];
        const shouldAppendStrictResults = hasReusableStrictReviewState(previousStrictResults);
        const previousStrictRowIndexes = new Set(previousStrictResults
            .filter(result => Number.isInteger(result.rowIndex))
            .map(result => result.rowIndex));
        checkResults = shouldAppendStrictResults ? previousStrictResults : [];
        realtimeCheckResults = shouldAppendStrictResults ? [...previousStrictResults] : [];
        glossaryData = shouldAppendStrictResults ? [...glossaryData] : [];
        let checkedCount = 0;

        const savedProgress = l10nSources.length > 1 ? null : loadL10nProgress();
        if (!shouldAppendStrictResults && savedProgress && savedProgress.fileName === originalFileName && !skipSavedProgressPrompt) {
            const shouldResume = confirm(`检测到未完成的任务，已检测 ${savedProgress.checkedCount} 条文本。是否继续？`);
            if (shouldResume) {
                checkResults = normalizeSavedCheckResults(savedProgress.checkResults || savedProgress.results);
                realtimeCheckResults = normalizeSavedCheckResults(savedProgress.realtimeCheckResults || savedProgress.liveResults || []);
                if (realtimeCheckResults.length === 0 && checkResults.length > 0) {
                    realtimeCheckResults = [...checkResults];
                }
                glossaryData = savedProgress.glossaryData || [];
                if (Array.isArray(savedProgress.selectedProfileIds)) {
                    selectedProfileIds = new Set(savedProgress.selectedProfileIds);
                    renderL10nProfileList();
                }
                checkedCount = checkResults.length || savedProgress.checkedCount;
            } else {
                clearL10nProgress();
            }
        } else if (!shouldAppendStrictResults && savedProgress && savedProgress.fileName === originalFileName && skipSavedProgressPrompt) {
            checkResults = normalizeSavedCheckResults(savedProgress.checkResults || savedProgress.results);
            realtimeCheckResults = normalizeSavedCheckResults(savedProgress.realtimeCheckResults || savedProgress.liveResults || []);
            if (realtimeCheckResults.length === 0 && checkResults.length > 0) {
                realtimeCheckResults = [...checkResults];
            }
            glossaryData = savedProgress.glossaryData || glossaryData;
            checkedCount = checkResults.length || savedProgress.checkedCount;
        }

        activeProfiles = getSelectedL10nProfiles();
        if (activeProfiles.length === 0) {
            setStatus('error', '未选择可用检测通道', '请在本地化检测中勾选至少一个已保存且可用的 API 通道');
            progressSection.style.display = 'none';
            resultsSection.style.display = 'none';
            return;
        }

        isCheckCancelled = false;
        resetL10nProgressControls();
        const runId = `l10n_${Date.now().toString(36)}`;
        const runController = new AbortController();
        const runSignal = runController.signal;
        activeCheckRunId = runId;
        currentCheckAbortController = runController;

        const profileSummary = activeProfiles.map(profile => profile.name).join('、');
        const checkMode = getSelectedCheckMode();
        const modeConfig = getSelectedCheckModeConfig();
        setStatus(
            'processing',
            '正在检查 API 通道...',
            `${activeProfiles.length} 个通道参与${profileSummary ? `（${profileSummary}）` : ''}，会先确认 Key、Base URL 和模型能正常请求`
        );
        initChannelProgress(activeProfiles);

        let keepFailurePanel = false;
        let keepFailureCanRetry = false;

        try {
            const checkCache = loadL10nCheckCache();
            const completedRows = getSelectedCheckMode() === 'strict'
                ? new Set()
                : new Set(checkResults
                .filter(result => Number.isInteger(result.rowIndex))
                .map(result => result.rowIndex));
            let completedCount = getSelectedCheckMode() === 'strict' ? 0 : checkResults.length;
            checkedCount = getSelectedCheckMode() === 'strict' ? 0 : checkResults.length;
            let liveIssueCount = getIssueResultCount();
            let checkTasks = buildCurrentCheckTasks(completedRows);
            const aiCheckTasks = [];
            const localResolvedEntries = [];

            checkTasks.forEach(task => {
                if (checkMode === 'strict' && shouldAppendStrictResults && previousStrictRowIndexes.has(task.rowIndex)) {
                    return;
                }
                const localIssues = buildLocalRuleIssues(task, activeGlossaryTerms);
                task.localRuleIssues = localIssues;
                if (shouldResolveByLocalRules(localIssues)) {
                    localResolvedEntries.push(createLocalRuleCheckResultEntry(task, localIssues));
                } else {
                    aiCheckTasks.push(task);
                }
            });
            checkTasks = aiCheckTasks;

            if (localResolvedEntries.length > 0) {
                localResolvedEntries.forEach(entry => {
                    checkResults.push(entry);
                    realtimeCheckResults.push(entry);
                    addToGlossary(entry.source, entry.target);
                    addCheckItem(checkList, entry);
                    checkedCount++;
                    completedCount++;
                });
                liveIssueCount = getIssueResultCount();
                setStatus(
                    'processing',
                    '本地规则已先完成一部分检测',
                    `隐藏规则引擎 V2 已直接标记 ${localResolvedEntries.length} 条确定性问题，剩余 ${checkTasks.length} 条交给 AI 检测`
                );
            }

            let totalTasks = checkMode === 'strict' && shouldAppendStrictResults
                ? completedCount
                : checkMode === 'strict'
                ? completedCount + (checkTasks.length * activeProfiles.length)
                : completedCount + checkTasks.length;

            if (totalTasks === 0 && !(checkMode === 'strict' && shouldAppendStrictResults)) {
                updateProgress(checkedCount, checkedCount, 100);
                const summary = displayResults(checkedCount, activeGlossaryTerms, activeProfiles);
                const savedPath = await autoSaveL10nReport('final', checkResults);
                if (savedPath) {
                    setStatus(
                        'success',
                        '检测完成并已自动保存',
                        `异常 ${summary.issueCount} 行，生成 ${glossaryData.length} 条术语；保存路径：${savedPath}`,
                        function() {
                            document.getElementById('l10n-check-tool').scrollIntoView({ behavior: 'smooth' });
                        }
                    );
                }
                return;
            }

            updateProgress(
                completedCount,
                totalTasks,
                totalTasks > 0 ? Math.round((completedCount / totalTasks) * 100) : 100
            );
            document.getElementById('l10nProgressInfo').textContent =
                `${modeConfig.label}已启用：${estimateTokenSaving(modeConfig, checkTasks.length, activeProfiles)}`;

            if (checkMode !== 'strict') {
                await preflightL10nProfiles(activeProfiles, runSignal);
                throwIfCheckCancelled(runId);
            }
            setStatus(
                'processing',
                '正在检测文本...',
                `${modeConfig.label}：${modeConfig.summary}；${activeProfiles.length} 个通道参与${profileSummary ? `（${profileSummary}）` : ''}`
            );

            function updateCheckProgress(profile) {
                const progress = Math.round((completedCount / totalTasks) * 100);
                updateProgress(completedCount, totalTasks, progress);
                const issueCount = Math.max(getIssueResultCount(), liveIssueCount);
                document.getElementById('l10nProgressInfo').textContent =
                    `正在检测... (已完成 ${completedCount}/${totalTasks} 次模型检测，异常 ${issueCount} 行，通道 ${profile.name})`;
            }

            function addRealtimeCheckItem(result, countIssue = false) {
                if (countIssue && result.status === L10N_STATUS_ISSUE) {
                    liveIssueCount++;
                }
                realtimeCheckResults.push(normalizeCheckResultEntry(result));
                addCheckItem(checkList, result);
            }

            async function processProfileBatch(batch, profile) {
                throwIfCheckCancelled(runId);
                while (isPaused && !isCheckCancelled) {
                    await waitForResume();
                }
                throwIfCheckCancelled(runId);

                await waitForNetwork(runSignal);
                throwIfCheckCancelled(runId);

                const startedAt = Date.now();
                const progressInfo = document.getElementById('l10nProgressInfo');
                const waitNoticeTimer = setInterval(() => {
                    if (isCheckCancelled || activeCheckRunId !== runId || !progressInfo) return;
                    const waitedMs = Date.now() - startedAt;
                    progressInfo.textContent =
                        `正在等待 ${profile.name} 返回... 已等待 ${formatDurationSeconds(waitedMs)}。单批请求超过 ${formatDurationSeconds(API_REQUEST_TIMEOUT_MS)} 仍无响应时，会停止当前任务并保留已完成结果。`;
                }, 15000);

                try {
                    return await processCheckBatchWithCache(batch, profile, activeProject, activeGlossaryTerms, checkCache, runSignal);
                } finally {
                    clearInterval(waitNoticeTimer);
                }
            }

            function getPendingCountForToleratedFailures(failures = []) {
                const seenProfiles = new Set();
                return failures.reduce((sum, failure) => {
                    const key = getChannelProfileKey(failure.profile);
                    if (!key || seenProfiles.has(key)) return sum;
                    seenProfiles.add(key);
                    const state = channelProgressState.get(key);
                    return sum + Math.max(0, Number(state?.total || 0) - Number(state?.completed || 0));
                }, 0);
            }

            function formatToleratedProfileFailures(failures = []) {
                return failures.map(({ profile, error }) =>
                    `${profile.name || getPlatformName(profile.provider)}：${getFriendlyApiErrorMessage(error, profile)}`
                ).join('；');
            }

            async function runProfileBatchQueues(jobsByProfile, onBatchDone, options = {}) {
                const { continueOnProfileError = false } = options;
                const toleratedFailures = [];
                const failedProfileKeys = new Set();
                const profileRunners = activeProfiles.map(profile => {
                    const queue = jobsByProfile.get(profile.id) || [];
                    const batches = chunkArray(queue, modeConfig.batchSize);
                    let nextIndex = 0;
                    let activeCount = 0;
                    let settled = false;
                    let resolveRunner = null;
                    let rejectRunner = null;
                    const maxConcurrency = Math.max(1, Math.min(getProfileConcurrency(profile), batches.length || 1));
                    const adaptive = {
                        current: 1,
                        max: maxConcurrency,
                        stableSuccesses: 0,
                        cooldownUntil: 0,
                        lastReason: maxConcurrency > 1 ? '低并发起步' : ''
                    };
                    const existingState = channelProgressState.get(getChannelProfileKey(profile));
                    const profileKey = getChannelProfileKey(profile);

                    function formatAdaptiveMessage(baseMessage = '') {
                        const adaptiveText = adaptive.max > 1
                            ? `自动并发 ${adaptive.current}/${adaptive.max}${adaptive.lastReason ? `，${adaptive.lastReason}` : ''}`
                            : '自动并发 1/1';
                        return baseMessage ? `${baseMessage}；${adaptiveText}` : adaptiveText;
                    }

                    function maybeIncreaseAdaptiveConcurrency() {
                        if (adaptive.current >= adaptive.max) return;
                        if (Date.now() < adaptive.cooldownUntil) return;
                        if (adaptive.stableSuccesses < L10N_ADAPTIVE_SUCCESS_TO_INCREASE) return;
                        adaptive.current++;
                        adaptive.stableSuccesses = 0;
                        adaptive.lastReason = '连续稳定，谨慎提速';
                        updateChannelProgress(profile, {
                            status: 'running',
                            message: formatAdaptiveMessage('通道稳定，已小幅恢复并发')
                        });
                    }

                    function reduceAdaptiveConcurrency(error) {
                        if (!isTemporaryL10nApiError(error) && !error?.isTimeout && !/超时|timeout/i.test(error?.message || '')) {
                            return;
                        }
                        adaptive.current = 1;
                        adaptive.stableSuccesses = 0;
                        adaptive.cooldownUntil = Date.now() + L10N_ADAPTIVE_COOLDOWN_MS;
                        adaptive.lastReason = '通道繁忙，已自动降速保护';
                    }

                    function finishIfDone() {
                        if (settled) return true;
                        if (activeCount === 0 && (nextIndex >= batches.length || (continueOnProfileError && failedProfileKeys.has(profileKey)))) {
                            settled = true;
                            resolveRunner?.();
                            return true;
                        }
                        return false;
                    }

                    function scheduleMore() {
                        if (settled) return;
                        if (continueOnProfileError && failedProfileKeys.has(profileKey)) {
                            finishIfDone();
                            return;
                        }
                        while (activeCount < adaptive.current && nextIndex < batches.length) {
                            const batch = batches[nextIndex++];
                            activeCount++;
                            void processBatch(batch);
                        }
                        finishIfDone();
                    }

                    async function processBatch(batch) {
                        try {
                            throwIfCheckCancelled(runId);
                            updateChannelProgress(profile, {
                                status: 'running',
                                message: formatAdaptiveMessage(`正在检测第 ${batch[0]?.rowIndex + 1 || '-'} 行附近，批量 ${batch.length} 条`)
                            });
                            const entries = await processProfileBatch(batch, profile);
                            throwIfCheckCancelled(runId);
                            await onBatchDone(entries, batch, profile);
                            adaptive.stableSuccesses++;
                            maybeIncreaseAdaptiveConcurrency();
                            const state = channelProgressState.get(getChannelProfileKey(profile));
                            const completed = Number(state?.completed || 0) + entries.length;
                            const total = Number(state?.total || queue.length);
                            const profileAlreadyFailed = continueOnProfileError && failedProfileKeys.has(profileKey);
                            updateChannelProgress(profile, {
                                completed,
                                total,
                                status: profileAlreadyFailed ? 'failed' : (completed >= total ? 'done' : 'running'),
                                message: profileAlreadyFailed
                                    ? (state?.message || '该通道部分批次失败，剩余复核已跳过')
                                    : (completed >= total ? '已完成该通道检测' : formatAdaptiveMessage(`已完成 ${completed}/${total}`))
                            });
                        } catch (error) {
                            const isAbortOrCancel = error.name === 'AbortError' || error.message === 'L10N_CHECK_CANCELLED' || isCheckCancelled;
                            if (isAbortOrCancel) {
                                updateChannelProgress(profile, {
                                    status: 'paused',
                                    message: '任务已暂停或取消'
                                });
                            } else {
                                reduceAdaptiveConcurrency(error);
                                updateChannelProgress(profile, {
                                    status: 'failed',
                                    message: formatAdaptiveMessage(getFriendlyApiErrorMessage(error, profile))
                                });
                            }
                            if (continueOnProfileError && !isAbortOrCancel) {
                                if (!failedProfileKeys.has(profileKey)) {
                                    failedProfileKeys.add(profileKey);
                                    toleratedFailures.push({ profile, error });
                                }
                                return;
                            }
                            settled = true;
                            rejectRunner?.(error);
                            return;
                        } finally {
                            activeCount = Math.max(0, activeCount - 1);
                            scheduleMore();
                        }
                    }

                    if (queue.length > 0) {
                        updateChannelProgress(profile, {
                            total: Math.max(Number(existingState?.total || 0), Number(existingState?.completed || 0) + queue.length),
                            status: 'waiting',
                            message: formatAdaptiveMessage(`已排队 ${queue.length} 条，批次 ${batches.length} 个`)
                        });
                    } else if (existingState && existingState.total === 0) {
                        updateChannelProgress(profile, {
                            status: 'done',
                            message: '当前阶段无需该通道处理'
                        });
                    }

                    return new Promise((resolve, reject) => {
                        resolveRunner = resolve;
                        rejectRunner = reject;
                        if (batches.length === 0) {
                            settled = true;
                            resolve();
                            return;
                        }
                        scheduleMore();
                    });
                });

                await Promise.all(profileRunners);
                return toleratedFailures;
            }

            async function saveCurrentProgress(task = null) {
                saveL10nProgress({
                    fileName: originalFileName,
                    currentRow: task?.rowIndex || Math.max(1, ...checkResults.map(result => Number.isInteger(result.rowIndex) ? result.rowIndex : 1)),
                    checkResults: checkResults,
                    realtimeCheckResults: realtimeCheckResults,
                    glossaryData: glossaryData,
                    checkedCount: checkedCount,
                    selectedProfileIds: [...selectedProfileIds]
                });
            }

            if (checkMode === 'economy') {
                checkTasks.forEach((task, index) => {
                    const profile = activeProfiles[index % activeProfiles.length];
                    task.profile = profile;
                    task.profileId = profile.id;
                    task.profileName = profile.name;
                    task.provider = profile.provider;
                    task.model = profile.model;
                });

                const tasksByProfile = new Map(activeProfiles.map(profile => [profile.id, []]));
                checkTasks.forEach(task => {
                    tasksByProfile.get(task.profileId)?.push(task);
                });

                await runProfileBatchQueues(tasksByProfile, async (entries, batch, profile) => {
                    entries.forEach(checkEntry => {
                        checkResults.push(checkEntry);
                        addToGlossary(checkEntry.source, checkEntry.target);
                        checkedCount++;
                        completedCount++;
                        addRealtimeCheckItem(checkEntry);
                    });

                    updateCheckProgress(profile);

                    if (completedCount % 24 === 0) {
                        await saveCurrentProgress(batch[batch.length - 1]);
                    }
                });
            } else if (checkMode === 'strict') {
                const strictLocalResults = checkResults.filter(result =>
                    result?.provider === 'local' || result?.detectionSource === '本地规则'
                );
                const strictLocalRowIndexes = new Set(strictLocalResults
                    .filter(result => Number.isInteger(result.rowIndex))
                    .map(result => result.rowIndex));
                const allStrictTasks = buildCurrentCheckTasks(strictLocalRowIndexes);
                const reviewsByRow = getExistingStrictReviewState(checkResults);
                strictLocalRowIndexes.forEach(rowIndex => reviewsByRow.delete(rowIndex));
                allStrictTasks.forEach(task => {
                    if (!reviewsByRow.has(task.rowIndex)) {
                        reviewsByRow.set(task.rowIndex, { task, reviews: [] });
                    }
                });
                const jobsByProfile = new Map(activeProfiles.map(profile => [profile.id, []]));
                reviewsByRow.forEach(rowState => {
                    getMissingStrictProfilesForRow(rowState, activeProfiles).forEach(profile => {
                        rowState.task.profile = profile;
                        jobsByProfile.get(profile.id)?.push(rowState.task);
                    });
                });
                const appendSummary = getStrictAppendSummary(reviewsByRow, activeProfiles);
                totalTasks = completedCount + appendSummary.missingChecks;
                if (appendSummary.reusableRows > 0) {
                    document.getElementById('l10nProgressInfo').textContent =
                        `严格模式追加检测：已复用 ${appendSummary.reusableRows} 行已有模型结果，待补齐 ${appendSummary.missingChecks} 次模型检测。`;
                }
                updateProgress(completedCount, totalTasks, totalTasks > 0 ? Math.round((completedCount / totalTasks) * 100) : 100);

                if (appendSummary.missingChecks > 0) {
                    await preflightL10nProfiles(appendSummary.pendingProfiles, runSignal);
                    throwIfCheckCancelled(runId);
                    await runProfileBatchQueues(jobsByProfile, async (entries, batch, profile) => {
                        entries.forEach(entry => {
                            const rowState = reviewsByRow.get(entry.rowIndex);
                            if (rowState) {
                                rowState.reviews = mergeModelReviews(rowState.reviews, [createModelReviewFromEntry(entry)]);
                            }
                            addRealtimeCheckItem(entry, true);
                            completedCount++;
                        });
                        updateCheckProgress(profile);
                    });
                }

                throwIfCheckCancelled(runId);
                checkResults = [];
                checkedCount = 0;
                strictLocalResults
                    .sort((a, b) => a.rowIndex - b.rowIndex)
                    .forEach(result => {
                        checkResults.push(result);
                        addToGlossary(result.source, result.target);
                        checkedCount++;
                        addCheckItem(checkList, result);
                    });
                [...reviewsByRow.values()]
                    .sort((a, b) => a.task.rowIndex - b.task.rowIndex)
                    .forEach(({ task, reviews, previousResult }) => {
                        if (!reviews.length) return;
                        let checkEntry = createReviewedCheckResultEntry(task, reviews, 'review', activeProfiles);
                        checkEntry = carryForwardFullFixIfStillValid(checkEntry, previousResult);
                        checkResults.push(checkEntry);
                        addToGlossary(task.sourceText, task.targetText);
                        checkedCount++;
                        addCheckItem(checkList, checkEntry);
                    });
            } else {
                const primaryProfile = chooseBalancedPrimaryProfile(activeProfiles, checkTasks, activeProject, activeGlossaryTerms);
                const secondaryProfiles = activeProfiles.filter(profile => profile.id !== primaryProfile.id);
                const reviewsByRow = new Map(checkTasks.map(task => [task.rowIndex, { task, reviews: [] }]));
                const primaryJobs = new Map(activeProfiles.map(profile => [profile.id, []]));
                primaryJobs.set(primaryProfile.id, checkTasks);
                document.getElementById('l10nProgressInfo').textContent =
                    `均衡模式主通道：${primaryProfile.name}。先全量检测，异常候选再交给其他通道复核。`;

                await runProfileBatchQueues(primaryJobs, async (entries, batch, profile) => {
                    entries.forEach(entry => {
                        reviewsByRow.get(entry.rowIndex)?.reviews.push(createModelReviewFromEntry(entry));
                        addRealtimeCheckItem(entry, true);
                        completedCount++;
                    });
                    updateCheckProgress(profile);
                });

                const abnormalTasks = [...reviewsByRow.values()]
                    .filter(item => item.reviews.some(review => review.status === L10N_STATUS_ISSUE))
                    .map(item => item.task);
                const abnormalRowIndexes = new Set(abnormalTasks.map(task => task.rowIndex));
                const hybridExtraJobs = new Map(activeProfiles.map(profile => [profile.id, []]));
                abnormalTasks.forEach(task => {
                    secondaryProfiles.forEach(profile => {
                        hybridExtraJobs.get(profile.id)?.push(task);
                    });
                });

                const extraJobCount = abnormalTasks.length * secondaryProfiles.length;
                if (extraJobCount > 0) {
                    totalTasks = completedCount + extraJobCount;
                    document.getElementById('l10nProgressInfo').textContent =
                        `初检完成，正在复核 ${abnormalTasks.length} 条异常候选...`;
                    const originalTotalText = document.getElementById('l10nProgressText');
                    const toleratedFailures = await runProfileBatchQueues(hybridExtraJobs, async (entries, batch, profile) => {
                        entries.forEach(entry => {
                            reviewsByRow.get(entry.rowIndex)?.reviews.push(createModelReviewFromEntry(entry));
                            addRealtimeCheckItem(entry, true);
                            completedCount++;
                        });
                        const progress = Math.round((completedCount / totalTasks) * 100);
                        updateProgress(completedCount, totalTasks, progress);
                        originalTotalText.textContent = `${completedCount} / ${totalTasks}`;
                        document.getElementById('l10nProgressInfo').textContent =
                            `正在复核异常候选... (已完成 ${completedCount}/${totalTasks} 次模型检测，通道 ${profile.name})`;
                    }, { continueOnProfileError: true });

                    if (toleratedFailures.length > 0) {
                        const skippedCount = getPendingCountForToleratedFailures(toleratedFailures);
                        completedCount = Math.min(totalTasks, completedCount + skippedCount);
                        const progress = Math.round((completedCount / totalTasks) * 100);
                        updateProgress(completedCount, totalTasks, progress);
                        originalTotalText.textContent = `${completedCount} / ${totalTasks}`;
                        document.getElementById('l10nProgressInfo').textContent =
                            `部分复核通道超时或失败，已跳过 ${skippedCount} 次复核并继续汇总：${formatToleratedProfileFailures(toleratedFailures)}`;
                        await saveCurrentProgress(abnormalTasks[abnormalTasks.length - 1]);
                    }
                }

                throwIfCheckCancelled(runId);
                [...reviewsByRow.values()]
                    .sort((a, b) => a.task.rowIndex - b.task.rowIndex)
                    .forEach(({ task, reviews }) => {
                        const expectedProfiles = abnormalRowIndexes.has(task.rowIndex)
                            ? activeProfiles
                            : [primaryProfile];
                        const checkEntry = createReviewedCheckResultEntry(task, reviews, 'hybrid', expectedProfiles);
                        checkResults.push(checkEntry);
                        addToGlossary(task.sourceText, task.targetText);
                        checkedCount++;
                        addCheckItem(checkList, checkEntry);
                    });
            }

            clearL10nProgress();
            const summary = displayResults(checkedCount, activeGlossaryTerms, activeProfiles);
            const savedPath = await autoSaveL10nReport('final', checkResults);
            if (savedPath) {
                setStatus(
                    'success',
                    '检测完成并已自动保存',
                    `异常 ${summary.issueCount} 行，生成 ${glossaryData.length} 条术语；保存路径：${savedPath}`,
                    function() {
                        document.getElementById('l10n-check-tool').scrollIntoView({ behavior: 'smooth' });
                    }
                );
            }

        } catch (error) {
            if (error.name === 'AbortError' || error.message === 'L10N_CHECK_CANCELLED' || isCheckCancelled) {
                console.log('L10n check cancelled');
                markUnfinishedChannels('paused', '任务已取消或暂停，未完成后续检测');
                if (activeCheckRunId === runId) {
                    setStatus('warning', '检测任务已取消', '已停止后续请求。现在可以重新上传文件、选择模型或重新开始检测。');
                }
            } else {
                console.error('L10n check error:', error);
                markUnfinishedChannels('failed', error.message || '任务异常停止');
                let savedPath = '';
                if (checkResults.length > 0 || realtimeCheckResults.length > 0) {
                    const progressResults = checkResults.length > 0 ? checkResults : realtimeCheckResults;
                    saveL10nProgress({
                        fileName: originalFileName,
                        currentRow: Math.max(1, ...progressResults.map(result => Number.isInteger(result.rowIndex) ? result.rowIndex : 1)),
                        checkResults: checkResults,
                        realtimeCheckResults: realtimeCheckResults,
                        glossaryData: glossaryData,
                        checkedCount: checkedCount,
                        selectedProfileIds: [...selectedProfileIds]
                    });
                    savedPath = await autoSaveL10nReport('error', progressResults);
                }
                const isTemporaryChannelError = isTemporaryL10nApiError(error) || error?.isTimeout || /超时|timeout/i.test(error?.message || '');
                if (isTemporaryChannelError) {
                    promoteRealtimeResultsForRetry();
                }
                const hasRetryableProgress = isTemporaryChannelError && (checkResults.length > 0 || realtimeCheckResults.length > 0);
                const isChannelError = error.message &&
                    (error.message.includes('检测通道不可用') || error.message.includes('API 请求失败') || error.message.includes('超时'));
                const shouldShowRecoverableFailure = isChannelError || hasRetryableProgress;
                keepFailurePanel = shouldShowRecoverableFailure;
                keepFailureCanRetry = hasRetryableProgress;
                const savedText = savedPath ? `；已自动保存当前结果：${savedPath}` : '';
                const userErrorTitle = isTemporaryChannelError ? '模型临时繁忙，任务已保留' : (isChannelError ? '检测通道不可用' : '检测失败');
                const userErrorDetail = isTemporaryChannelError
                    ? `${getFriendlyApiErrorMessage(error, null)}${savedText}`
                    : `${error.message || '请检查 API Key、Base URL、模型权限或账户余额'}${savedText}`;
                setStatus(
                    isTemporaryChannelError ? 'warning' : 'error',
                    userErrorTitle,
                    userErrorDetail,
                    isChannelError && !isTemporaryChannelError ? revealApiConfigPanel : null,
                    isChannelError && !isTemporaryChannelError ? '去检查 API 配置' : ''
                );
                if (shouldShowRecoverableFailure) {
                    showL10nFailurePanel(userErrorTitle, userErrorDetail, { canRetry: hasRetryableProgress });
                }
            }
            if (!keepFailurePanel) {
                progressSection.style.display = 'none';
            }
        } finally {
            if (currentCheckAbortController === runController) {
                currentCheckAbortController = null;
            }
            if (activeCheckRunId === runId) {
                activeCheckRunId = null;
                isCheckCancelled = false;
                if (keepFailurePanel) {
                    const canDownload = checkResults.length > 0 || realtimeCheckResults.length > 0;
                    showL10nStoppedControls(canDownload, keepFailureCanRetry);
                } else {
                    resetL10nProgressControls();
                }
            }
        }
    }

    function addCheckItem(list, result) {
        const hasIssues = result.status === L10N_STATUS_ISSUE;
        const item = document.createElement('div');
        item.className = `check-item ${hasIssues ? 'has-issues' : 'passed'}`;
        list.querySelector('.check-list-empty')?.remove();

        const truncatedSource = result.source.length > 80 ? result.source.substring(0, 80) + '...' : result.source;
        const truncatedTarget = result.target.length > 80 ? result.target.substring(0, 80) + '...' : result.target;
        const corrected = result.corrected || '无需修改';
        const reason = result.reason || (result.status === L10N_STATUS_PASS ? '通过' : '');
        const modelLabel = result.modelLabel || result.profileName || result.model || '未记录';
        const issueType = result.issueType || (hasIssues ? classifyIssueCategory(`${result.issue} ${result.reason}`) : '-');
        const severity = result.severity || (hasIssues ? '一般' : '-');
        const severityClass = getSeverityClass(severity);

        item.innerHTML = `
            <div class="check-row-info">行 ${result.rowIndex + 1}</div>
            <div class="check-content">
                <div class="check-field">
                    <span class="check-label">检测原文</span>
                    <span class="check-value">${escapeHtml(truncatedSource)}</span>
                </div>
                <div class="check-field">
                    <span class="check-label">检测译文</span>
                    <span class="check-value">${escapeHtml(truncatedTarget)}</span>
                </div>
                <div class="check-field">
                    <span class="check-label">检测模型</span>
                    <span class="check-value">${escapeHtml(modelLabel)}</span>
                </div>
                <div class="check-field compact">
                    <span class="check-label">检测结果</span>
                    <span class="check-status ${hasIssues ? 'error' : (result.status === L10N_STATUS_DISAGREE ? 'warning' : 'success')}">${escapeHtml(result.status)}</span>
                </div>
                <div class="check-field compact">
                    <span class="check-label">问题类型</span>
                    <span class="check-value">${escapeHtml(issueType)}</span>
                </div>
                <div class="check-field compact">
                    <span class="check-label">严重程度</span>
                    <span class="severity-tag ${severityClass}">${escapeHtml(severity)}</span>
                </div>
                <div class="check-field">
                    <span class="check-label">修改为</span>
                    <span class="check-value">${escapeHtml(corrected)}</span>
                </div>
                <div class="check-field">
                    <span class="check-label">问题原因</span>
                    <span class="check-value">${escapeHtml(reason)}</span>
                </div>
            </div>
        `;

        list.insertBefore(item, list.firstChild);

        if (list.children.length > 100) {
            list.removeChild(list.lastChild);
        }
    }

    function getSeverityClass(severity) {
        if (severity === '阻断') return 'blocker';
        if (severity === '严重') return 'critical';
        if (severity === '一般') return 'normal';
        if (severity === '提示') return 'hint';
        return 'none';
    }

    function guessTermType(text) {
        const lowerText = text.toLowerCase();

        if (lowerText.includes('按钮') || lowerText.includes('button') || lowerText.includes('btn')) {
            return 'UI控件';
        } else if (lowerText.includes('任务') || lowerText.includes('quest') || lowerText.includes('mission')) {
            return '任务系统';
        } else if (lowerText.includes('道具') || lowerText.includes('物品') || lowerText.includes('item') || lowerText.includes('equipment')) {
            return '道具装备';
        } else if (lowerText.includes('角色') || lowerText.includes('npc') || lowerText.includes('character')) {
            return '角色NPC';
        } else if (lowerText.includes('技能') || lowerText.includes('skill') || lowerText.includes('spell')) {
            return '技能法术';
        } else if (lowerText.includes('系统') || lowerText.includes('system') || lowerText.includes('error') || lowerText.includes('warning')) {
            return '系统提示';
        } else if (lowerText.includes('剧情') || lowerText.includes('story') || lowerText.includes('dialog') || lowerText.includes('conversation')) {
            return '剧情对白';
        } else {
            return '其他';
        }
    }

    function addToGlossary(source, target) {
        const cleanSource = source.trim();
        const cleanTarget = target.trim();

        const exists = glossaryData.find(g =>
            g.source.toLowerCase() === cleanSource.toLowerCase() &&
            g.target.toLowerCase() === cleanTarget.toLowerCase()
        );

        if (!exists) {
            glossaryData.push({
                source: cleanSource,
                target: cleanTarget,
                type: guessTermType(cleanSource)
            });
        }
    }

    function extractJsonFromText(content) {
        const text = String(content || '').trim()
            .replace(/^```(?:json)?/i, '')
            .replace(/```$/i, '')
            .trim();

        try {
            return JSON.parse(text);
        } catch {
            const objectMatch = text.match(/\{[\s\S]*\}/);
            if (objectMatch) {
                try {
                    return JSON.parse(objectMatch[0]);
                } catch {
                    // Try an array payload below.
                }
            }
            const arrayMatch = text.match(/\[[\s\S]*\]/);
            if (arrayMatch) {
                return JSON.parse(arrayMatch[0]);
            }
            throw new Error('无法解析模型返回的 JSON');
        }
    }

    function getRelevantGlossaryTermsForBatch(tasks, glossaryTerms) {
        const termMap = new Map();
        tasks.forEach(task => {
            getRelevantGlossaryTerms(task.sourceText, task.targetText, glossaryTerms, task).forEach(term => {
                const key = `${term.source}|${getGlossaryEffectiveTarget(term)}|${term.type}`;
                if (!termMap.has(key)) {
                    termMap.set(key, term);
                }
            });
        });
        return [...termMap.values()].slice(0, 100);
    }

    function buildBatchGlossaryPromptSection(terms) {
        if (!terms || terms.length === 0) return '本批次原文未命中已勾选术语表中的中文术语。';

        return terms.map(term => {
            const targetText = getGlossaryEffectiveTarget(term) || '未填写固定译法';
            const typeText = term.type ? `，类型：${term.type}` : '';
            return `- 中文原文术语「${term.source}」必须译为英文「${targetText}」${typeText}`;
        }).join('\n');
    }

    function buildBatchCheckPromptParts(tasks, project, glossaryTerms) {
        const projectRules = project && project.rules ? project.rules : '未配置项目规则，请按通用游戏本地化质量标准检测。';
        const relevantTerms = getRelevantGlossaryTermsForBatch(tasks, glossaryTerms);
        const rows = tasks.map(task => ({
            id: task.rowIndex,
            source: task.sourceText,
            target: task.targetText
        }));

        const systemPrompt = `你是游戏本地化质检专家。请批量检测原文和译文，必须严格按项目规则、术语表和基础本地化规范判断。

项目：${project ? project.name : '未选择项目'}

项目规则：
${projectRules}

检测标准：
- 准确性：无漏译、误译、过度发挥
- 语法和拼写：英文语法、拼写、时态、单复数、介词搭配正确
- 本地化表达：自然、符合游戏语境，避免中式英语和生硬直译
- 项目规则：占位符、换行、数字、大小写、标点、长度和风格符合要求
- 术语一致：只有当“原文 source”中出现术语表里的中文术语时，才检查译文 target 是否使用对应英文指定译法；不要把译文里的英文或数字反向当作术语命中
- 本地确定性规则已经先检查空译文、占位符、数字和明确术语错误；你重点判断语义、漏译、多译、上下文、语法和风格问题
- 只有明确质量问题才判异常，不要为了风格偏好强行报错
- 通过的行必须极简返回，不要输出 reason、category、corrected、explanation 等字段，避免浪费 token

术语表复核候选：
- 检测时除了判定译文是否异常，还要顺手观察“术语表本身是否需要人工确认”。
- 如果原文中出现明显应固定的游戏术语，但当前术语表没有收录，可以在 terminologyReview 里提出 add-term 候选。
- 如果术语表已有译法，但实际译文看起来比术语表译法更自然/更符合上下文，或术语表译法疑似过时/错误，可以在 terminologyReview 里提出 update-translation 候选。
- terminologyReview 只写短术语或专名，不要写整句；如果只是普通句子问题，放到 issues，不要放到 terminologyReview。

只返回 JSON，不要解释。通过行只返回 {"id": 行id, "ok": true}；异常行才返回 issues；有术语表候选时可额外返回 terminologyReview。格式：
{
  "results": [
    { "id": 1, "ok": true },
    {
      "id": 2,
      "ok": false,
      "terminologyReview": [
        {
          "source": "中文术语",
          "currentTarget": "术语表当前译法；缺失则空",
          "suggestedTarget": "建议译法",
          "actualTarget": "本句实际译法",
          "action": "update-translation|add-term|keep-existing|sentence-exception|pending",
          "reason": "为什么需要人工确认",
          "type": "角色/NPC|道具|系统/UI|玩法|活动|其他"
        }
      ],
      "issues": [
        {
          "category": "术语表限制|游戏项目翻译要求|游戏翻译基本规范|病句/拼写错误|其他",
          "severity": "阻断|严重|一般|提示",
          "issue": "异常问题简述",
          "corrected": "建议修改；无需改写则空字符串",
          "reason": "为什么异常，明确说明依据",
          "evidence": "触发判断的原文/译文片段，可为空"
        }
      ]
    }
  ]
}

没有问题且没有术语候选的行不要写原因，只能返回 {"id": 行id, "ok": true}。`;
        const userPrompt = `相关术语表（方向固定为：中文原文术语 -> 英文指定译法）：
${buildBatchGlossaryPromptSection(relevantTerms)}

待检测文本 JSON：
${JSON.stringify(rows)}

请只返回 JSON，不要解释。`;

        return {
            systemPrompt,
            userPrompt,
            cacheKey: makePromptCacheKey('l10n_check', `${project?.id || project?.name || 'none'}:${projectRules}`)
        };
    }

    function buildBatchCheckPrompt(tasks, project, glossaryTerms) {
        const { systemPrompt, userPrompt } = buildBatchCheckPromptParts(tasks, project, glossaryTerms);
        return `${systemPrompt}\n\n${userPrompt}`;
    }

    function parseBatchResults(content, tasks) {
        const parsed = extractJsonFromText(content);
        const rows = Array.isArray(parsed)
            ? parsed
            : (Array.isArray(parsed?.results) ? parsed.results : []);
        const resultMap = new Map();

        rows.forEach(row => {
            const id = Number(row?.id ?? row?.row ?? row?.rowIndex);
            if (!Number.isFinite(id)) return;
            resultMap.set(id, {
                issues: normalizeIssues(row),
                terminologyReview: mergeTerminologyReviewItems(row?.terminologyReview || row?.termsReview || row?.termReview || [])
            });
        });

        tasks.forEach(task => {
            if (!resultMap.has(task.rowIndex)) {
                resultMap.set(task.rowIndex, null);
            }
        });

        return resultMap;
    }

    function isTemporaryL10nApiError(error) {
        const text = `${error?.message || ''} ${error?.rawText || ''} ${JSON.stringify(error?.payload || '')}`;
        return error?.status === 429 ||
            error?.status === 500 ||
            error?.status === 502 ||
            error?.status === 503 ||
            error?.isTemporary ||
            error?.isRateLimited ||
            error?.isEmptyEndTurn ||
            /接口返回为空|empty response|finish_reason:\s*end_turn|stop_reason:\s*end_turn/i.test(text) ||
            /UNAVAILABLE|high demand|temporar|try again|overloaded|rate.?limit|quota/i.test(text);
    }

    function getL10nResultStableId(result) {
        return Number.isInteger(result?.rowIndex) ? result.rowIndex : makeStableId(`${result?.source || ''}\n${result?.target || ''}`);
    }

    function getIssueSummaryForFix(result) {
        const issues = Array.isArray(result?.issues) && result.issues.length > 0
            ? result.issues
            : [result];
        return issues.map(issue => ({
            type: issue.issueType || issue.category || result.issueType || '',
            severity: issue.severity || result.severity || '',
            issue: issue.issue || result.issue || '',
            suggestedPatch: issue.corrected || result.corrected || '',
            reason: issue.reason || result.reason || '',
            evidence: issue.evidence || result.evidence || '',
            ruleId: issue.ruleId || issue.ruleIds || result.ruleIds || ''
        })).filter(issue => issue.issue || issue.reason || issue.suggestedPatch);
    }

    function buildFullFixTasks(results = checkResults) {
        return getSortedCheckResults(results)
            .filter(result => result.status === L10N_STATUS_ISSUE)
            .filter(result => String(result.target || '').trim())
            .filter(result => !String(result.fullFixedTranslation || '').trim())
            .map(result => ({
                id: getL10nResultStableId(result),
                rowIndex: result.rowIndex,
                sourceText: result.source,
                targetText: result.target,
                issueType: result.issueType || '',
                severity: result.severity || '',
                suggestedPatch: result.corrected || '',
                reason: result.reason || '',
                issues: getIssueSummaryForFix(result)
            }));
    }

    function buildFullFixPromptParts(tasks, project, glossaryTerms) {
        const projectRules = String(project?.rules || '按通用游戏本地化质量标准修正。')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 1800);
        const relevantTerms = getRelevantGlossaryTermsForBatch(
            tasks.map(task => ({
                rowIndex: task.rowIndex,
                sourceText: task.sourceText,
                targetText: task.targetText
            })),
            glossaryTerms
        ).slice(0, 80);
        const compactTasks = tasks.map(task => ({
            id: task.id,
            rowIndex: task.rowIndex,
            sourceText: task.sourceText,
            currentTranslation: task.targetText,
            issueType: task.issueType,
            severity: task.severity,
            suggestedPatch: task.suggestedPatch,
            reason: task.reason,
            issues: task.issues.slice(0, 8)
        }));
        const systemPrompt = `你是游戏本地化译文修正专家。请根据检测问题生成“完整修正译文”，不是局部替换词。

规则：
1. 输出完整英文译文，可直接替换当前译文。
2. 不要机械套用 suggestedPatch 或术语表；必须结合原文、当前译文、问题原因、语法、词性、大小写和游戏上下文判断。
3. 术语表是重要约束，但普通动词或普通名词进入长句时，可以按英文语法调整大小写、词形和表达方式；专有名词、UI名、系统名、建筑名、道具名通常保留指定大小写。
4. 如果术语与上下文明显冲突，优先给出自然且忠实的译文，并在 reason 中说明。
5. 必须保留变量、占位符、HTML/富文本标签、换行符、数字、百分号和原译文中的关键格式。
6. 不确定时保守处理：finalTranslation 可等于当前译文，confidence 设为 low，并说明需要人工复核。
7. 只返回合法 JSON，不要 Markdown。`;
        const userPrompt = `项目规则：
${projectRules}

相关术语表（方向固定：中文原文术语 -> 英文指定译法）：
${buildBatchGlossaryPromptSection(relevantTerms)}

需要生成完整修正译文的行：
${JSON.stringify(compactTasks)}

返回 JSON：
{
  "rows": [
    {
      "id": "输入id",
      "rowIndex": 1,
      "finalTranslation": "完整修正后的英文译文",
      "confidence": "high|medium|low",
      "appliedTerminology": "yes|no|partial",
      "reason": "简短说明修正了什么；如果没有采用 suggestedPatch 或术语，请说明原因"
    }
  ]
}`;
        return {
            systemPrompt,
            userPrompt,
            cacheKey: makePromptCacheKey('l10n_full_fix_v1', `${project?.id || project?.name || 'none'}:${projectRules}`)
        };
    }

    function parseFullFixResult(content) {
        const parsed = extractJsonFromText(content);
        const rows = Array.isArray(parsed)
            ? parsed
            : (Array.isArray(parsed?.rows)
                ? parsed.rows
                : (Array.isArray(parsed?.results) ? parsed.results : []));

        return rows.map(row => ({
            id: row?.id ?? row?.rowIndex ?? row?.row,
            rowIndex: Number(row?.rowIndex ?? row?.row),
            finalTranslation: String(row?.finalTranslation ?? row?.finalTarget ?? row?.fixedTranslation ?? row?.corrected ?? row?.translation ?? '').trim(),
            confidence: String(row?.confidence ?? row?.certainty ?? '').trim(),
            appliedTerminology: String(row?.appliedTerminology ?? row?.termApplied ?? row?.terminology ?? '').trim(),
            reason: String(row?.reason ?? row?.note ?? row?.explanation ?? '').trim()
        })).filter(row => row.finalTranslation);
    }

    async function runFullFixBatch(tasks, apiConfig, model, project, glossaryTerms, batchLabel) {
        let lastError = null;
        for (let attempt = 0; attempt <= L10N_FIX_RETRY_DELAYS.length; attempt++) {
            try {
                const promptParts = buildFullFixPromptParts(tasks, project, glossaryTerms);
                const content = await requestModelContent(
                    apiConfig,
                    {
                        model,
                        messages: [
                            { role: 'system', content: promptParts.systemPrompt, cacheControl: true },
                            { role: 'user', content: promptParts.userPrompt }
                        ],
                        prompt_cache_key: promptParts.cacheKey,
                        temperature: 0.1,
                        max_tokens: getChatOutputMaxTokens(apiConfig, model, tasks.length)
                    },
                    null,
                    API_REQUEST_TIMEOUT_MS,
                    { reasoningEffort: 'low' }
                );
                return parseFullFixResult(content);
            } catch (error) {
                lastError = error;
                if (attempt >= L10N_FIX_RETRY_DELAYS.length || !isTemporaryL10nApiError(error)) {
                    throw error;
                }

                const retryAfter = Number(error.retryAfterMs || 0);
                const waitMs = Math.max(L10N_FIX_RETRY_DELAYS[attempt], retryAfter);
                setStatus(
                    'processing',
                    `AI 修正通道繁忙，等待重试... (${batchLabel})`,
                    `第 ${attempt + 1} 次重试将在 ${Math.ceil(waitMs / 1000)} 秒后进行，已生成的完整修正译文会保留`
                );
                await new Promise(resolve => setTimeout(resolve, waitMs));
            }
        }
        throw lastError;
    }

    async function checkTextBatch(tasks, project, glossaryTerms = [], profile = null, signal = null) {
        if (tasks.length === 0) return new Map();

        const apiConfig = profile || getApiConfig();
        const model = apiConfig.model || getDefaultModelForProvider(apiConfig.provider);
        const baseUrl = getApiBaseUrl(apiConfig.provider, apiConfig.baseUrl);
        const maxRetries = 3;

        if (!apiConfig.apiKey) {
            throw new Error(`${apiConfig.name || getPlatformName(apiConfig.provider)} 未添加 API Key`);
        }

        console.log(`🤖 批量检测: ${apiConfig.name || getPlatformName(apiConfig.provider)} / ${model} / ${tasks.length} 行`);

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                const promptParts = buildBatchCheckPromptParts(tasks, project, glossaryTerms);
                const content = await requestModelContent(
                    apiConfig,
                    {
                        model: model,
                        messages: [
                            {
                                role: 'system',
                                content: promptParts.systemPrompt,
                                cacheControl: true
                            },
                            { role: 'user', content: promptParts.userPrompt }
                        ],
                        prompt_cache_key: promptParts.cacheKey,
                        temperature: 0.15,
                        max_tokens: getChatOutputMaxTokens(apiConfig, model, tasks.length)
                    },
                    signal,
                    API_REQUEST_TIMEOUT_MS,
                    { reasoningEffort: 'low' }
                );
                return parseBatchResults(content, tasks);
            } catch (error) {
                if (error.name === 'AbortError' || signal?.aborted) {
                    throw error;
                }
                console.warn(`批量检测失败，重试 ${attempt + 1}/${maxRetries}:`, error);
                if (error.isOutputTruncated && tasks.length > 1) {
                    const midpoint = Math.ceil(tasks.length / 2);
                    const leftResults = await checkTextBatch(tasks.slice(0, midpoint), project, glossaryTerms, profile, signal);
                    const rightResults = await checkTextBatch(tasks.slice(midpoint), project, glossaryTerms, profile, signal);
                    return new Map([...leftResults, ...rightResults]);
                }
                if (attempt === maxRetries - 1) {
                    const profileName = apiConfig.name || getPlatformName(apiConfig.provider);
                    const wrappedError = new Error(`${profileName} API 请求失败：${error.message || '接口返回异常'}`);
                    Object.assign(wrappedError, {
                        status: error.status,
                        payload: error.payload,
                        rawText: error.rawText,
                        retryAfterMs: error.retryAfterMs,
                        isRateLimited: error.isRateLimited,
                        isTemporary: error.isTemporary,
                        isTimeout: error.isTimeout,
                        isOutputTruncated: error.isOutputTruncated,
                        isEmptyEndTurn: error.isEmptyEndTurn,
                        cause: error
                    });
                    throw wrappedError;
                }
                const retryDelay = error.retryAfterMs > 0
                    ? Math.min(error.retryAfterMs, 60000)
                    : 1000 * (attempt + 1);
                await delayWithSignal(retryDelay, signal);
            }
        }

        return new Map(tasks.map(task => [task.rowIndex, null]));
    }

    function findCheckResultForFix(task) {
        return checkResults.find(result => {
            if (Number.isInteger(task.rowIndex) && result.rowIndex === task.rowIndex) return true;
            return getL10nResultStableId(result) === task.id;
        });
    }

    function applyFullFixRows(tasks, rows) {
        const rowById = new Map();
        rows.forEach(row => {
            rowById.set(String(row.id), row);
            if (Number.isFinite(row.rowIndex)) rowById.set(String(row.rowIndex), row);
        });

        let appliedCount = 0;
        tasks.forEach(task => {
            const result = findCheckResultForFix(task);
            if (!result) return;
            const row = rowById.get(String(task.id)) || rowById.get(String(task.rowIndex));
            if (!row?.finalTranslation) return;

            result.fullFixedTranslation = row.finalTranslation;
            result.fullFixedConfidence = row.confidence || 'medium';
            result.fullFixedReason = row.reason || '';
            result.fullFixedStatus = row.appliedTerminology ? `术语处理：${row.appliedTerminology}` : '已生成';
            result.fullFixedError = '';
            appliedCount++;
        });
        return appliedCount;
    }

    function markFullFixBatchFailed(tasks, error) {
        const message = error?.message || 'AI 修正失败';
        tasks.forEach(task => {
            const result = findCheckResultForFix(task);
            if (!result) return;
            result.fullFixedStatus = '生成失败';
            result.fullFixedError = message;
        });
    }

    async function generateFullFixTranslations() {
        if (isGeneratingL10nFixes) {
            setStatus('warning', '完整修正译文正在生成', '请等待当前批次完成后再操作');
            return;
        }
        if (!ensureL10nProfilesConfigured('生成完整修正译文')) return;

        const issueCount = getIssueResultCount();
        if (issueCount === 0) {
            setStatus('success', '没有需要修正的异常行', '当前检测结果没有异常问题');
            return;
        }

        const tasks = buildFullFixTasks();
        if (tasks.length === 0) {
            setStatus('success', '完整修正译文已生成', '异常行里没有剩余待生成的完整修正译文');
            displayResults(checkResults.length, getSelectedGlossaryTerms(), getSelectedL10nProfiles());
            return;
        }

        const confirmed = confirm(`将为 ${tasks.length} 条异常行生成完整修正译文，会额外消耗 API 额度。已生成过的行会跳过。是否继续？`);
        if (!confirmed) return;

        const activeProfiles = getSelectedL10nProfiles();
        const apiConfig = activeProfiles[0] || getApiConfig();
        const model = apiConfig.model || getDefaultModelForProvider(apiConfig.provider);
        const activeProject = getSelectedL10nProject();
        const activeGlossaryTerms = getSelectedGlossaryTerms();
        const chunks = chunkArray(tasks, L10N_FIX_BATCH_SIZE);
        let generatedCount = 0;
        const failedBatches = [];

        isGeneratingL10nFixes = true;
        if (generateFixesBtn) {
            generateFixesBtn.disabled = true;
            generateFixesBtn.textContent = '生成中...';
        }

        try {
            for (let index = 0; index < chunks.length; index++) {
                const chunk = chunks[index];
                setStatus(
                    'processing',
                    `正在生成完整修正译文... (${index + 1}/${chunks.length})`,
                    `本批 ${chunk.length} 行；模型会结合上下文判断术语，不做机械替换`
                );

                try {
                    const rows = await runFullFixBatch(
                        chunk,
                        apiConfig,
                        model,
                        activeProject,
                        activeGlossaryTerms,
                        `${index + 1}/${chunks.length}`
                    );
                    const applied = applyFullFixRows(chunk, rows);
                    generatedCount += applied;
                } catch (error) {
                    markFullFixBatchFailed(chunk, error);
                    failedBatches.push({
                        index,
                        rowStart: chunk[0]?.rowIndex,
                        rowEnd: chunk[chunk.length - 1]?.rowIndex,
                        message: error.message || 'AI 修正失败'
                    });
                    console.warn('Full fix batch failed:', index + 1, error);
                }
            }

            displayResults(checkResults.length, activeGlossaryTerms, activeProfiles);
            if (failedBatches.length > 0) {
                setStatus(
                    generatedCount > 0 ? 'warning' : 'error',
                    '完整修正译文部分生成失败',
                    `本次生成 ${generatedCount} 条，失败批次 ${failedBatches.length} 个。再次点击“生成完整修正译文”会只跑未成功的异常行。`
                );
            } else {
                setStatus('success', '完整修正译文生成完成', `本次生成 ${generatedCount} 条；下载检测报告会包含“完整修正译文”列`);
            }
        } catch (error) {
            setStatus('error', '完整修正译文生成失败', error.message || '请检查 API 通道');
        } finally {
            isGeneratingL10nFixes = false;
            if (generateFixesBtn) {
                generateFixesBtn.disabled = false;
                generateFixesBtn.textContent = '生成完整修正译文';
            }
        }
    }

    async function processCheckBatchWithCache(tasks, profile, project, glossaryTerms, cacheEntries, signal = null) {
        const entries = [];
        const missingTasks = [];
        const taskMeta = new Map();

        tasks.forEach(task => {
            const relevantTerms = getRelevantGlossaryTerms(task.sourceText, task.targetText, glossaryTerms, task);
            const localIssues = Array.isArray(task.localRuleIssues)
                ? task.localRuleIssues
                : buildLocalRuleIssues(task, glossaryTerms);
            const cacheKey = getCheckCacheKey(task, project, relevantTerms, profile);
            const cached = cacheEntries[cacheKey];
            taskMeta.set(task.rowIndex, { relevantTerms, localIssues, cacheKey });

            const historyMatch = findImportedHistoryMatch(task, profile, project, glossaryTerms);
            if (historyMatch) {
                const historyEntry = createHistoryCheckResultEntry(task, historyMatch.entry, profile, historyMatch.matchType);
                const mergedResult = mergeCheckIssues(localIssues, historyEntry);
                entries.push({
                    ...historyEntry,
                    ...createCheckResultEntry(task, mergedResult, profile),
                    modelLabel: historyEntry.modelLabel,
                    historyReused: true,
                    historyMatchType: historyMatch.matchType,
                    historyFileName: historyEntry.historyFileName
                });
            } else if (cached?.result) {
                const mergedResult = mergeCheckIssues(localIssues, cached.result);
                entries.push(createCheckResultEntry(task, mergedResult, profile));
                cacheEntries[cacheKey] = {
                    ...cached,
                    timestamp: Date.now()
                };
            } else {
                missingTasks.push(task);
            }
        });

        if (missingTasks.length > 0) {
            const batchResults = await checkTextBatch(missingTasks, project, glossaryTerms, profile, signal);
            missingTasks.forEach(task => {
                const meta = taskMeta.get(task.rowIndex);
                const aiResult = batchResults.get(task.rowIndex);
                const normalizedAiResult = aiResult || {
                    issues: [{
                        category: '其他',
                        issue: '检测失败',
                        corrected: '',
                        reason: 'API 请求失败或返回为空，当前行无法确认是否通过'
                    }]
                };
                if (aiResult) {
                    cacheEntries[meta.cacheKey] = {
                        result: normalizedAiResult,
                        timestamp: Date.now()
                    };
                }

                const mergedResult = mergeCheckIssues(meta.localIssues, normalizedAiResult);
                entries.push(createCheckResultEntry(task, mergedResult, profile));
            });
            saveL10nCheckCache(cacheEntries);
        }

        return entries.sort((a, b) => a.rowIndex - b.rowIndex);
    }

    async function checkTextPair(sourceText, targetText, project, glossaryTerms = [], profile = null) {
        const apiConfig = profile || getApiConfig();
        const model = apiConfig.model || getDefaultModelForProvider(apiConfig.provider);
        const baseUrl = getApiBaseUrl(apiConfig.provider, apiConfig.baseUrl);
        const maxRetries = 3;

        if (!apiConfig.apiKey) {
            throw new Error(`${apiConfig.name || getPlatformName(apiConfig.provider)} 未添加 API Key`);
        }

        console.log(`🤖 正在使用检测通道: ${apiConfig.name || getPlatformName(apiConfig.provider)} / ${model}`);

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                const prompt = buildCheckPrompt(sourceText, targetText, project, glossaryTerms);
                const content = await requestModelContent(apiConfig, {
                    model: model,
                    messages: [{ role: 'user', content: prompt }],
                    temperature: 0.2
                });

                try {
                    return JSON.parse(content);
                } catch {
                    return parseResults(content);
                }
            } catch (error) {
                if (attempt === maxRetries - 1) {
                    return null;
                }
                await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
            }
        }
    }

    function getRelevantGlossaryTerms(source, target, glossaryTerms, task = null) {
        if (!glossaryTerms || glossaryTerms.length === 0) return [];

        const sourceText = String(source || '').toLowerCase();
        const relevantTerms = glossaryTerms.filter(term => {
            const sourceTerm = String(term.source || '').toLowerCase();
            if (!sourceTerm) return false;
            if (!hasCjkText(sourceTerm) || isIdLikeGlossaryValue(sourceTerm)) return false;
            if (!glossaryTermAppliesToTask(term, task)) return false;

            return sourceText.includes(sourceTerm);
        });

        return relevantTerms.slice(0, 80);
    }

    function buildGlossaryPromptSection(source, target, glossaryTerms, task = null) {
        const terms = getRelevantGlossaryTerms(source, target, glossaryTerms, task);
        if (terms.length === 0) return '';

        const rows = terms.map(term => {
            const targetText = getGlossaryEffectiveTarget(term) || '未填写固定译法';
            const typeText = term.type ? `，类型：${term.type}` : '';
            return `- 中文原文术语「${term.source}」必须译为英文「${targetText}」${typeText}`;
        }).join('\n');

        return `\n术语表要求（必须遵守）：\n1. 术语方向固定为“中文原文术语 -> 英文指定译法”。\n2. 只有原文中出现下列中文术语时，才要求译文使用对应英文译法。\n3. 不要把译文里的英文、数字或 ID 反向当作术语命中。\n4. 发现术语不一致时，必须在 issues 中明确指出“术语表不一致”。\n\n术语表：\n${rows}\n`;
    }

    function buildCheckPrompt(source, target, project, glossaryTerms = []) {
        const projectRules = project && project.rules ? project.rules : '未配置项目规则，请按通用游戏本地化质量标准检测。';
        const glossarySection = buildGlossaryPromptSection(source, target, glossaryTerms);

        return `你是游戏本地化专家，请对比检测以下原文和译文的质量：

游戏项目：
${project ? project.name : '未选择项目'}

项目翻译标准（必须作为检测依据）：
${projectRules}

检测要求：
1. 译文准确性：检查译文是否准确传达原文含义，没有漏译、误译
2. 译文语法：检查译文中的语法错误、拼写错误、单复数、时态、介词搭配、句式语病
3. 译文流畅度：检查译文是否符合目标语言表达习惯，避免生硬直译
4. 术语一致性：检查是否符合已勾选术语表；同时观察术语表是否可能缺少关键术语，或已有译法是否疑似不如实际译文合理
5. 风格一致性：检查译文风格是否符合项目翻译标准
6. 统一规范：英文大小写、标点、空格标准化
7. 避免中式英语、直译感、歧义句
8. 禁止网络俚语、低俗用词，符合 App Store/Google Play 审核规范
9. 使用美式英语，不用英式拼写
10. 如果译文可接受，不要为了风格偏好强行判为异常；只有明确违反规则或存在质量问题时才输出 issue
${glossarySection}

原文：
${source}

译文：
${target}

请以 JSON 格式输出检测结果，包含 issues 数组，每个 issue 包含：
- category: 问题归因分类，只能从「术语表限制」「游戏项目翻译要求」「游戏翻译基本规范」「病句/拼写错误」「其他」中选择
- severity: 严重程度，只能从「阻断」「严重」「一般」「提示」中选择
- issue: 异常问题的简短结论
- corrected: 建议修改成什么；如果不需要提供改写，填空字符串
- reason: 为什么判定异常，必须明确说明是不符合术语表限制、项目翻译要求、游戏翻译基本规范，还是存在病句/拼写错误等
- evidence: 触发判断的原文或译文片段；没有则填空字符串

如果发现术语表需要人工确认，可额外输出 terminologyReview 数组。它用于生成“术语确认表”，不是普通译文问题列表。每项包含：
- source: 中文原文术语，只能是短术语/专名，不要写整句
- currentTarget: 术语表当前译法；如果术语表缺失则空
- suggestedTarget: 建议采用的译法
- actualTarget: 当前句子里的实际译法
- action: update-translation|add-term|keep-existing|sentence-exception|pending
- reason: 为什么需要人工确认
- type: 术语类型

如果没有问题，请输出：{"issues": []}`;
    }

    function parseResults(content) {
        const issues = [];
        const lines = content.split('\n');
        let pendingIssue = null;

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            if (trimmed.includes('问题：') || trimmed.includes('issue:')) {
                pendingIssue = {
                    issue: trimmed.replace(/.*(?:问题：|issue:)/i, '').trim(),
                    corrected: '',
                    reason: '',
                    category: '',
                    severity: '',
                    evidence: ''
                };
                issues.push(pendingIssue);
            } else if (pendingIssue && (trimmed.includes('分类：') || trimmed.includes('category:'))) {
                pendingIssue.category = trimmed.replace(/.*(?:分类：|category:)/i, '').trim();
            } else if (pendingIssue && (trimmed.includes('严重程度：') || trimmed.includes('severity:'))) {
                pendingIssue.severity = trimmed.replace(/.*(?:严重程度：|severity:)/i, '').trim();
            } else if (pendingIssue && (trimmed.includes('修改：') || trimmed.includes('修改为：') || trimmed.includes('corrected:'))) {
                pendingIssue.corrected = trimmed.replace(/.*(?:修改：|修改为：|corrected:)/i, '').trim();
            } else if (pendingIssue && (trimmed.includes('原因：') || trimmed.includes('reason:'))) {
                pendingIssue.reason = trimmed.replace(/.*(?:原因：|reason:)/i, '').trim();
            } else if (pendingIssue && (trimmed.includes('证据：') || trimmed.includes('evidence:'))) {
                pendingIssue.evidence = trimmed.replace(/.*(?:证据：|evidence:)/i, '').trim();
            }
        }

        return { issues };
    }

    function displayResults(checkedCount, activeGlossaryTerms = [], activeProfiles = []) {
        progressSection.style.display = 'none';
        resultsSection.style.display = 'block';

        const issueCount = getIssueResultCount();
        const passCount = checkedCount - issueCount;
        const passRate = checkedCount > 0 ? Math.round((passCount / checkedCount) * 100) : 0;

        document.getElementById('l10nTotalChecked').textContent = checkedCount;
        document.getElementById('l10nTotalIssues').textContent = issueCount;
        document.getElementById('l10nPassRate').textContent = `${passRate}%`;

        const tbody = document.getElementById('l10nResultsBody');
        tbody.innerHTML = '';

        if (checkResults.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 20px;">暂无检测结果</td></tr>';
        } else {
            const fragment = document.createDocumentFragment();
            const truncateCell = (value, max = 220) => {
                const text = String(value || '');
                return text.length > max ? `${text.slice(0, max)}...` : text;
            };
            getSortedCheckResults().forEach((result) => {
                const hasIssues = result.status === L10N_STATUS_ISSUE;
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${escapeHtml(truncateCell(result.source))}</td>
                    <td>${escapeHtml(truncateCell(result.target))}</td>
                    <td>${escapeHtml(truncateCell(result.modelLabel || result.profileName || result.model || '未记录', 160))}</td>
                    <td><span class="status-tag ${getCheckStatusClass(result.status)}">${escapeHtml(result.status)}</span></td>
                    <td>${escapeHtml(truncateCell(result.issueType || (hasIssues ? classifyIssueCategory(`${result.issue} ${result.reason}`) : '-'), 120))}</td>
                    <td><span class="severity-tag ${getSeverityClass(result.severity || (hasIssues ? '一般' : '-'))}">${escapeHtml(result.severity || (hasIssues ? '一般' : '-'))}</span></td>
                    <td>${escapeHtml(truncateCell(result.corrected || '无需修改'))}</td>
                    <td>${escapeHtml(truncateCell(result.fullFixedTranslation || (result.fullFixedError ? `生成失败：${result.fullFixedError}` : '')))}</td>
                    <td>${escapeHtml(truncateCell(result.reason || (result.status === L10N_STATUS_PASS ? '通过' : ''), 260))}</td>
                `;
                fragment.appendChild(tr);
            });
            tbody.appendChild(fragment);
        }

        const glossaryText = activeGlossaryTerms.length > 0 ? `，已按 ${activeGlossaryTerms.length} 条术语检测` : '';
        const profileText = activeProfiles.length > 0 ? `，使用 ${activeProfiles.length} 个检测通道` : '';
        setStatus('success', '检测完成！', `异常 ${issueCount} 行，生成 ${glossaryData.length} 条术语${glossaryText}${profileText}`, function() {
            document.getElementById('l10n-check-tool').scrollIntoView({ behavior: 'smooth' });
        });

        return {
            issueCount,
            passRate,
            glossaryText,
            profileText
        };
    }

    function updateProgress(current, total, percent) {
        document.getElementById('l10nProgressText').textContent = `${current} / ${total}`;
        document.getElementById('l10nProgressPercent').textContent = `${percent}%`;
        document.getElementById('l10nProgressFill').style.width = `${percent}%`;
    }

    const L10N_REPORT_META_HEADERS = [
        '原始行号',
        '检测版本',
        '检测模式',
        'API平台',
        '模型ID',
        '检测通道',
        '内容指纹',
        '项目指纹',
        '术语表指纹',
        '模型指纹',
        '复用指纹',
        '模型明细JSON'
    ];
    const L10N_REPORT_COMPLETENESS_HEADERS = [
        '任务完整性',
        '已完成模型数',
        '缺失模型',
        '通道状态'
    ];

    function uniqueJoined(values) {
        return [...new Set(values.filter(Boolean))].join('、');
    }

    function getReusableReviewSource(result) {
        return Array.isArray(result?.reviews) && result.reviews.length > 0
            ? result.reviews
            : [result];
    }

    function getReportProfileIdentity(profile) {
        return profile?.id || `${profile?.provider || ''}:${profile?.model || ''}`;
    }

    function buildExpectedReportProfilesFromProfiles(profiles = []) {
        return (profiles || [])
            .filter(Boolean)
            .map(profile => ({
                key: getReportProfileIdentity(profile),
                label: getApiProfileLabel(profile)
            }))
            .filter(profile => profile.key && profile.key !== ':');
    }

    function getExpectedReportProfiles() {
        const profiles = getSelectedL10nProfiles();
        if (getSelectedCheckMode() !== 'strict' || profiles.length <= 1) return [];
        return buildExpectedReportProfilesFromProfiles(profiles);
    }

    function buildResultGroupMap(results = []) {
        const groups = new Map();
        (results || []).forEach(result => {
            if (!Number.isInteger(result?.rowIndex)) return;
            if (!groups.has(result.rowIndex)) groups.set(result.rowIndex, []);
            groups.get(result.rowIndex).push(result);
        });
        return groups;
    }

    function getResultCompletedProfileKeys(result, rowGroup = []) {
        const keys = new Set();
        const source = rowGroup.length > 0 ? rowGroup : [result];
        source.forEach(item => {
            getReusableReviewSource(item).forEach(review => {
                const key = getReportProfileIdentity(review);
                if (key && key !== ':') keys.add(key);
            });
        });
        return keys;
    }

    function buildReportCompletenessCells(result, rowGroup = []) {
        if (!result || result.status === L10N_STATUS_SKIPPED) {
            return ['未检测', 0, '', getChannelStatusSummary()];
        }
        if (result.provider === 'local' || result.detectionSource === '本地规则') {
            return ['本地规则完成', 1, '', getChannelStatusSummary()];
        }

        const expected = Array.isArray(result.expectedReviewProfiles) && result.expectedReviewProfiles.length > 0
            ? result.expectedReviewProfiles
            : getExpectedReportProfiles();
        const completedKeys = getResultCompletedProfileKeys(result, rowGroup);
        if (expected.length === 0) {
            const reviewCount = getReusableReviewSource(result).length;
            return ['按当前模式记录', reviewCount, '', getChannelStatusSummary()];
        }

        const missing = expected.filter(profile => !completedKeys.has(profile.key));
        return [
            missing.length === 0 ? '完整' : '部分结果',
            completedKeys.size,
            missing.map(profile => profile.label).join('、'),
            getChannelStatusSummary()
        ];
    }

    function buildReusableReviewPayload(result, project, glossaryTerms) {
        if (!result || !Number.isInteger(result.rowIndex)) return [];

        const task = {
            rowIndex: result.rowIndex,
            sourceText: result.source,
            targetText: result.target
        };

        return getReusableReviewSource(result).map(review => {
            const profileLike = {
                id: review.profileId || result.profileId || '',
                name: review.profileName || result.profileName || '',
                provider: review.provider || result.provider || '',
                model: review.model || result.model || '',
                modelLabel: review.modelLabel || result.modelLabel || ''
            };
            const metadata = getHistoryMetadata(task, project, glossaryTerms, profileLike);
            const issues = Array.isArray(review?.issues) && review.issues.length > 0
                ? normalizeIssues(review)
                : (isHistoryIssueStatus(review?.status) || review?.issue ? [normalizeIssue(review)] : []);

            return {
                profileId: profileLike.id,
                profileName: profileLike.name,
                provider: profileLike.provider,
                model: profileLike.model,
                modelLabel: profileLike.modelLabel || getApiProfileLabel(profileLike),
                status: review.status || (issues.length > 0 ? L10N_STATUS_ISSUE : L10N_STATUS_PASS),
                issue: review.issue || summarizeIssues(issues, 'issue'),
                corrected: review.corrected || summarizeIssues(issues, 'corrected'),
                reason: review.reason || summarizeIssueReasons(issues),
                issueType: review.issueType || summarizeIssueTypes(issues),
                severity: review.severity || getHighestIssueSeverity(issues),
                detectionSource: review.detectionSource || summarizeIssueSources(issues),
                evidence: review.evidence || summarizeIssueEvidence(issues),
                ruleIds: review.ruleIds || summarizeIssueRuleIds(issues),
                issues,
                contentFingerprint: metadata.contentFingerprint,
                projectFingerprint: metadata.projectFingerprint,
                glossaryFingerprint: metadata.glossaryFingerprint,
                modelFingerprint: metadata.modelFingerprint,
                resultFingerprint: metadata.resultFingerprint,
                historyVersion: L10N_HISTORY_VERSION,
                historyReused: Boolean(review.historyReused),
                historyMatchType: review.historyMatchType || ''
            };
        }).filter(entry => entry.provider && entry.model);
    }

    function buildReportMetadataCells(result, project, glossaryTerms) {
        if (!result || !Number.isInteger(result.rowIndex) || result.status === L10N_STATUS_SKIPPED) {
            return L10N_REPORT_META_HEADERS.map(() => '');
        }

        const reviews = buildReusableReviewPayload(result, project, glossaryTerms);
        const firstReview = reviews[0] || {};
        const task = {
            rowIndex: result.rowIndex,
            sourceText: result.source,
            targetText: result.target
        };
        const fallbackMetadata = getHistoryMetadata(task, project, glossaryTerms, result);

        return [
            result.rowIndex + 1,
            L10N_HISTORY_VERSION,
            getSelectedCheckMode(),
            uniqueJoined(reviews.map(review => review.provider)) || result.provider || '',
            uniqueJoined(reviews.map(review => review.model)) || result.model || '',
            uniqueJoined(reviews.map(review => review.profileName)) || result.profileName || '',
            firstReview.contentFingerprint || fallbackMetadata.contentFingerprint,
            firstReview.projectFingerprint || fallbackMetadata.projectFingerprint,
            firstReview.glossaryFingerprint || fallbackMetadata.glossaryFingerprint,
            reviews.length === 1 ? firstReview.modelFingerprint : uniqueJoined(reviews.map(review => review.modelFingerprint)),
            reviews.length === 1 ? firstReview.resultFingerprint : '',
            JSON.stringify(reviews)
        ];
    }

    function buildReportMetadataCellsCompact(result, project, glossaryTerms) {
        return buildReportMetadataCells(result, project, glossaryTerms)
            .map((value, index) => index === L10N_REPORT_META_HEADERS.length - 1 ? '' : value);
    }

    function getReportEntryForRow(rowIndex, row, resultByRow) {
        const existing = resultByRow.get(rowIndex);
        if (existing) return existing;

        const source = row?.[sourceColumn] === undefined || row?.[sourceColumn] === null ? '' : String(row[sourceColumn]);
        const target = row?.[targetColumn] === undefined || row?.[targetColumn] === null ? '' : String(row[targetColumn]);
        const reason = source.trim() && target.trim() ? '尚未检测或检测被中断' : '原文或译文为空，未纳入检测';

            return {
                rowIndex,
                source,
                target,
                originalReferences: {
                    ...buildSourceMetadataReferences(rowIndex),
                    ...buildOriginalReferenceMap(row)
                },
                modelLabel: '',
                status: L10N_STATUS_SKIPPED,
                corrected: '',
            reason
        };
    }

    function buildWindowReportRows(results = checkResults) {
        const activeProject = getSelectedL10nProject();
        const activeGlossaryTerms = getSelectedGlossaryTerms();
        const rowGroups = buildResultGroupMap(results);
        const referenceHeaders = getReportReferenceHeaders(results);
        return [
            [...referenceHeaders, '检测原文', '检测译文', '检测模型', '检测结果', '问题类型', '严重程度', '修改为', '完整修正译文', '完整修正说明', '修正置信度', '修正状态', '问题原因', '检测来源', ...L10N_REPORT_COMPLETENESS_HEADERS, ...L10N_REPORT_META_HEADERS],
            ...getSortedCheckResults(results).map(result => [
                ...getReportReferenceCells(result, referenceHeaders),
                result.source,
                result.target,
                result.modelLabel || result.profileName || result.model || '',
                result.status,
                result.issueType || '',
                result.severity || '',
                result.corrected || (result.status === L10N_STATUS_PASS ? '无需修改' : ''),
                result.fullFixedTranslation || '',
                result.fullFixedReason || result.fullFixedError || '',
                result.fullFixedConfidence || '',
                result.fullFixedStatus || (result.fullFixedError ? '生成失败' : ''),
                result.reason || (result.status === L10N_STATUS_PASS ? '通过' : ''),
                result.detectionSource || (result.status === L10N_STATUS_PASS ? '' : 'AI'),
                ...buildReportCompletenessCells(result, rowGroups.get(result.rowIndex) || []),
                ...buildReportMetadataCellsCompact(result, activeProject, activeGlossaryTerms)
            ])
        ];
    }

    function buildOriginalFileReportRows() {
        if (l10nSources.length > 1) {
            return buildWindowReportRows();
        }
        if (!sheetData || sheetData.length === 0) {
            return buildWindowReportRows();
        }

        const resultByRow = new Map(checkResults
            .filter(result => Number.isInteger(result.rowIndex))
            .map(result => [result.rowIndex, result]));
        const activeProject = getSelectedL10nProject();
        const activeGlossaryTerms = getSelectedGlossaryTerms();

        return sheetData.map((row, index) => {
            const baseRow = Array.isArray(row) ? [...row] : [];

            if (index === 0) {
                return [
                    ...baseRow,
                    '检测原文',
                    '检测译文',
                    '检测模型',
                    '检测结果',
                    '问题类型',
                    '严重程度',
                    '修改为',
                    '完整修正译文',
                    '完整修正说明',
                    '修正置信度',
                    '修正状态',
                    '问题原因',
                    '检测来源',
                    ...L10N_REPORT_COMPLETENESS_HEADERS,
                    ...L10N_REPORT_META_HEADERS
                ];
            }

            const result = getReportEntryForRow(index, row, resultByRow);
            return [
                ...baseRow,
                result.source,
                result.target,
                result.modelLabel || result.profileName || result.model || '',
                result.status,
                result.issueType || '',
                result.severity || '',
                result.corrected || (result.status === L10N_STATUS_PASS ? '无需修改' : ''),
                result.fullFixedTranslation || '',
                result.fullFixedReason || result.fullFixedError || '',
                result.fullFixedConfidence || '',
                result.fullFixedStatus || (result.fullFixedError ? '生成失败' : ''),
                result.reason || (result.status === L10N_STATUS_PASS ? '通过' : ''),
                result.detectionSource || (result.status === L10N_STATUS_PASS ? '' : 'AI'),
                ...buildReportCompletenessCells(result, [result]),
                ...buildReportMetadataCellsCompact(result, activeProject, activeGlossaryTerms)
            ];
        });
    }

    function downloadCsvRows(rows, fileName) {
        const utf8Bytes = new TextEncoder().encode(rowsToCsvContent(rows));
        const blob = new Blob([utf8Bytes], { type: 'text/csv;charset=utf-8' });

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function downloadXlsxRows(rows, fileName, sheetName = '检测报告') {
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), sheetName);
        downloadWorkbookFile(workbook, fileName);
    }

    function downloadL10nReport(fileName) {
        const baseName = fileName.replace(/\.(csv|xlsx)$/i, '');
        downloadXlsxRows(buildOriginalFileReportRows(), `${baseName}.xlsx`);
    }

    function downloadReport() {
        if (checkResults.length === 0) {
            alert('没有检测结果可下载');
            return;
        }

        downloadL10nReport(`${getL10nReportBaseName()}_本地化检测_完整报告.xlsx`);
    }

    function downloadGlossary() {
        if (glossaryData.length === 0) {
            alert('没有术语可下载');
            return;
        }

        const headers = ['原文', '译文', '类型'];
        const rows = glossaryData.map(g => [g.source, g.target, g.type]);
        rows.unshift(headers);

        const csvContent = rows.map(row => row.map(cell => {
            if (cell === null || cell === undefined) return '';
            const str = String(cell);
            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                return '"' + str.replace(/"/g, '""') + '"';
            }
            return str;
        }).join(',')).join('\n');

        const utf8Bytes = new TextEncoder().encode(csvContent);
        const blob = new Blob([utf8Bytes], { type: 'text/csv;charset=utf-8' });

        const fileName = `${originalFileName}_glossary.csv`;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function isTerminologyIssueText(text) {
        return /术语|术语表|term|terminology|glossary/i.test(String(text || ''));
    }

    function isLikelySentenceText(text) {
        const value = String(text || '').trim();
        if (!value) return false;
        return value.length > 24 || /[。！？.!?；;]/.test(value) || /\s+\S+\s+\S+/.test(value);
    }

    function findGlossaryTermForIssue(result, issue) {
        const evidence = String(issue?.evidence || '').trim();
        const corrected = String(issue?.corrected || '').trim();
        const issueText = `${issue?.issue || ''} ${issue?.reason || ''} ${evidence}`;
        const arrowMatch = evidence.match(/(.+?)\s*(?:->|=>|→|译为|应译为)\s*(.+)/);
        if (arrowMatch) {
            return {
                source: arrowMatch[1].replace(/[“”"']/g, '').trim(),
                target: arrowMatch[2].replace(/[“”"']/g, '').trim() || corrected
            };
        }

        const quotedSource = issueText.match(/术语[“"「『]?([^”"」』]+)[”"」』]?/);
        if (quotedSource) {
            return {
                source: quotedSource[1].trim(),
                target: corrected
            };
        }

        const activeTerms = getSelectedGlossaryTerms();
        const matched = activeTerms.find(term => {
            const source = String(term.source || '').trim();
            if (!source) return false;
            return String(result?.source || '').includes(source) || issueText.includes(source);
        });
        if (matched) {
            return {
                source: matched.source,
                target: getGlossaryEffectiveTarget(matched) || corrected
            };
        }

        return null;
    }

    function getTermReviewItemsFromResult(result) {
        const explicitItems = mergeTerminologyReviewItems(result?.terminologyReview || [])
            .filter(item => item.source && !isLikelySentenceText(item.source))
            .map(item => ({
                result,
                issue: {
                    category: item.type || '术语表复核',
                    severity: '提示',
                    reason: item.reason || '检测模型建议人工确认该术语',
                    issue: item.reason || '术语表候选',
                    corrected: item.suggestedTarget || item.currentTarget || ''
                },
                termSource: item.source,
                termTarget: item.currentTarget || item.suggestedTarget || '',
                suggestedTarget: item.suggestedTarget || item.currentTarget || '',
                actualTarget: item.actualTarget || result.target || '',
                action: item.action || 'pending'
            }));
        const issues = Array.isArray(result?.issues) && result.issues.length > 0
            ? result.issues
            : normalizeIssues(result);
        const issueItems = issues
            .filter(issue => isTerminologyIssueText(`${issue.category} ${issue.issue} ${issue.reason} ${issue.evidence}`))
            .map(issue => {
                const term = findGlossaryTermForIssue(result, issue);
                if (!term?.source || isLikelySentenceText(term.source)) return null;
                const target = term.target || issue.corrected || '';
                return {
                    result,
                    issue,
                    termSource: term.source,
                    termTarget: target,
                    suggestedTarget: target,
                    actualTarget: result.target || '',
                    action: 'update-translation'
                };
            })
            .filter(Boolean);
        return [...explicitItems, ...issueItems];
    }

    function createTermReviewRowsFromResults() {
        const rows = [];
        const seen = new Set();
        getSortedCheckResults().forEach(result => {
            getTermReviewItemsFromResult(result).forEach((item, index) => {
                const key = `${item.termSource.toLowerCase()}|${String(item.suggestedTarget || item.termTarget || '').toLowerCase()}|${result.rowIndex}`;
                if (seen.has(key)) return;
                seen.add(key);
                rows.push({
                    id: `term_review_${result.rowIndex}_${index}_${makeStableId(item.termSource)}`,
                    rowIndex: result.rowIndex,
                    source: item.termSource,
                    currentTarget: item.termTarget || '',
                    suggestedTarget: item.suggestedTarget || item.termTarget || item.issue.corrected || '',
                    actualTarget: item.actualTarget || result.target || '',
                    issueType: item.issue.category || result.issueType || '术语表限制',
                    severity: item.issue.severity || result.severity || '',
                    reason: item.issue.reason || result.reason || item.issue.issue || '',
                    modelLabel: result.modelLabel || result.profileName || result.model || '',
                    decision: item.action || 'pending',
                    finalTarget: item.suggestedTarget || item.termTarget || item.issue.corrected || '',
                    note: ''
                });
            });
        });
        return rows;
    }

    function getTermReviewDecisionLabel(decision) {
        const labels = {
            'keep-existing': '保留原译文',
            'update-translation': '采用修正译文',
            'add-term': '新增为术语',
            'sentence-exception': '仅本句例外',
            ignore: '不处理',
            pending: '待确认'
        };
        return labels[decision] || '待确认';
    }

    function renderL10nTermReviewPanel() {
        if (!termReviewPanel || !termReviewBody) return;
        if (l10nTermReviewState.length === 0) {
            termReviewPanel.style.display = 'none';
            return;
        }

        termReviewPanel.style.display = 'block';
        if (termReviewCount) termReviewCount.textContent = String(l10nTermReviewState.length);
        if (termReviewSummary) {
            const pendingCount = l10nTermReviewState.filter(item => item.decision === 'pending').length;
            termReviewSummary.textContent = `共 ${l10nTermReviewState.length} 条需复核，待确认 ${pendingCount} 条。`;
        }

        termReviewBody.innerHTML = l10nTermReviewState.map(item => `
            <tr data-id="${escapeAttribute(item.id)}">
                <td>${escapeHtml(item.issueType || '检测问题')}</td>
                <td>${escapeHtml(item.source)}</td>
                <td>${escapeHtml(item.currentTarget)}</td>
                <td>${escapeHtml(item.actualTarget || item.suggestedTarget)}</td>
                <td>${Number.isInteger(item.rowIndex) ? item.rowIndex + 1 : ''}</td>
                <td>${escapeHtml(item.reason)}</td>
                <td>
                    <select data-field="decision">
                        ${['keep-existing', 'update-translation', 'add-term', 'sentence-exception', 'ignore', 'pending'].map(value =>
                            `<option value="${value}" ${item.decision === value ? 'selected' : ''}>${getTermReviewDecisionLabel(value)}</option>`
                        ).join('')}
                    </select>
                </td>
                <td><input type="text" data-field="finalTarget" value="${escapeAttribute(item.finalTarget || '')}"></td>
                <td><input type="text" data-field="note" value="${escapeAttribute(item.note || '')}"></td>
            </tr>
        `).join('');
    }

    function syncTermReviewStateFromPanel() {
        if (!termReviewBody) return;
        termReviewBody.querySelectorAll('tr[data-id]').forEach(row => {
            const item = l10nTermReviewState.find(entry => entry.id === row.dataset.id);
            if (!item) return;
            row.querySelectorAll('[data-field]').forEach(input => {
                item[input.dataset.field] = input.value;
            });
        });
    }

    function exportTermReviewTable() {
        if (checkResults.length === 0) {
            alert('请先完成检测，再导出术语确认表');
            return;
        }

        l10nTermReviewState = createTermReviewRowsFromResults();
        if (l10nTermReviewState.length === 0) {
            setStatus('success', '无需术语复核', '当前检测结果没有异常或分歧行。');
            return;
        }
        renderL10nTermReviewPanel();

        const rows = [[
            '定位行号',
            '原文术语',
            '术语表译法',
            '实际译文',
            '问题类型',
            '严重程度',
            '检测说明',
            '检测模型',
            '最终处理',
            '指定译文',
            '确认备注'
        ], ...l10nTermReviewState.map(item => [
            Number.isInteger(item.rowIndex) ? item.rowIndex + 1 : '',
            item.source,
            item.currentTarget,
            item.actualTarget || '',
            item.issueType,
            item.severity,
            item.reason,
            item.modelLabel,
            getTermReviewDecisionLabel(item.decision),
            item.finalTarget,
            item.note
        ])];
        downloadXlsxRows(rows, `${getL10nReportBaseName()}_术语复核确认表.xlsx`, '术语复核');
        setStatus('success', '术语确认表已导出', `已导出 ${l10nTermReviewState.length} 条待确认项。`);
    }

    async function importTermReviewTable(file) {
        if (!file) return;
        try {
            const { rows } = await readSpreadsheetRows(file);
            if (!rows || rows.length < 2) {
                throw new Error('确认表为空');
            }
            const headers = (rows[0] || []).map(header => normalizeHeaderText(header));
            const find = names => headers.findIndex(header => names.some(name => header.includes(normalizeHeaderText(name))));
            const indexes = {
                rowNumber: find(['定位行号', '行号', 'row']),
                source: find(['原文术语', '原文', 'source']),
                currentTarget: find(['术语表译法', '当前译文', '原译文', 'target']),
                suggestedTarget: find(['实际译文', '建议译文', '修正译文']),
                issueType: find(['问题类型']),
                severity: find(['严重程度']),
                reason: find(['检测说明', '问题原因']),
                modelLabel: find(['检测模型']),
                decision: find(['最终处理', '人工处理状态', '状态']),
                finalTarget: find(['指定译文', '最终译文']),
                note: find(['确认备注', '备注'])
            };
            l10nTermReviewState = rows.slice(1).map((row, index) => {
                const rowNumber = Number(row[indexes.rowNumber]);
                const decisionText = indexes.decision >= 0 ? String(row[indexes.decision] || '') : '';
                const decision = /保留/.test(decisionText)
                    ? 'keep-existing'
                    : (/新增/.test(decisionText) ? 'add-term'
                        : (/例外/.test(decisionText) ? 'sentence-exception'
                            : (/不处理|不采用|忽略/.test(decisionText) ? 'ignore'
                                : (/待/.test(decisionText) ? 'pending' : 'update-translation'))));
                return {
                    id: `term_review_import_${index}`,
                    rowIndex: Number.isFinite(rowNumber) ? rowNumber - 1 : index + 1,
                    source: indexes.source >= 0 ? String(row[indexes.source] || '') : '',
                    currentTarget: indexes.currentTarget >= 0 ? String(row[indexes.currentTarget] || '') : '',
                    suggestedTarget: indexes.suggestedTarget >= 0 ? String(row[indexes.suggestedTarget] || '') : '',
                    actualTarget: indexes.suggestedTarget >= 0 ? String(row[indexes.suggestedTarget] || '') : '',
                    issueType: indexes.issueType >= 0 ? String(row[indexes.issueType] || '') : '',
                    severity: indexes.severity >= 0 ? String(row[indexes.severity] || '') : '',
                    reason: indexes.reason >= 0 ? String(row[indexes.reason] || '') : '',
                    modelLabel: indexes.modelLabel >= 0 ? String(row[indexes.modelLabel] || '') : '',
                    decision,
                    finalTarget: indexes.finalTarget >= 0 ? String(row[indexes.finalTarget] || '') : '',
                    note: indexes.note >= 0 ? String(row[indexes.note] || '') : ''
                };
            }).filter(item => item.source || item.currentTarget || item.finalTarget);
            renderL10nTermReviewPanel();
            setStatus('success', '确认结果已导入', `已导入 ${l10nTermReviewState.length} 条术语复核结果。`);
        } catch (error) {
            setStatus('error', '确认结果导入失败', error.message || '无法读取确认表');
        } finally {
            if (importTermReviewInput) importTermReviewInput.value = '';
        }
    }

    function applyTermReviewBulk(all = false) {
        if (!termReviewBulkAction?.value) {
            alert('请先选择批量处理方式');
            return;
        }
        syncTermReviewStateFromPanel();
        l10nTermReviewState.forEach(item => {
            if (all || item.decision === 'pending') {
                item.decision = termReviewBulkAction.value;
                if (!item.finalTarget && item.suggestedTarget) item.finalTarget = item.suggestedTarget;
            }
        });
        renderL10nTermReviewPanel();
    }

    function generateReviewedGlossary() {
        syncTermReviewStateFromPanel();
        if (l10nTermReviewState.length === 0) {
            l10nTermReviewState = createTermReviewRowsFromResults();
        }
        const finalTerms = l10nTermReviewState
            .filter(item => ['update-translation', 'add-term'].includes(item.decision))
            .map(item => ({
                source: item.source,
                target: item.finalTarget || item.suggestedTarget || item.currentTarget,
                type: item.issueType || '本地化复核',
                note: item.note || item.reason || '',
                referenceRows: Number.isInteger(item.rowIndex) ? String(item.rowIndex + 1) : ''
            }))
            .filter(term => term.source && term.target);
        if (finalTerms.length === 0) {
            alert('没有可生成的新术语，请先在术语复核表中选择“采用修正译文”或“新增为术语”。');
            return;
        }
        const entry = saveGlossaryEntry({
            name: `${getL10nReportBaseName()}_检测复核术语表`,
            sourceFileName: originalFileName,
            terms: finalTerms,
            origin: 'reviewed'
        });
        if (!entry) {
            alert('新版术语表生成失败，请检查术语内容');
            return;
        }
        downloadXlsxRows(buildReviewGlossaryRows(entry.terms), `${getL10nReportBaseName()}_术语复核_新版术语表.xlsx`, '新版术语表');
        document.dispatchEvent(new CustomEvent('nexus:glossary-library-updated'));
        setStatus('success', '新版术语表已生成', `已保存 ${entry.terms.length} 条到术语库，并已下载备份。`);
    }

    function saveL10nProgress(data) {
        try {
            localStorage.setItem(L10N_PROGRESS_KEY, JSON.stringify({
                ...data,
                timestamp: Date.now()
            }));
        } catch (error) {
            console.warn('L10n progress save skipped:', error);
            setStatus(
                'warning',
                '本地缓存空间不足',
                '当前结果仍在页面中，请直接下载检测报告；工具已跳过缓存保存，避免页面继续卡死。'
            );
        }
    }

    function loadL10nProgress() {
        const stored = localStorage.getItem(L10N_PROGRESS_KEY);
        if (!stored) return null;

        try {
            const progress = JSON.parse(stored);
            const age = Date.now() - progress.timestamp;
            if (age > 24 * 60 * 60 * 1000) {
                clearL10nProgress();
                return null;
            }
            return progress;
        } catch {
            return null;
        }
    }

    function clearL10nProgress() {
        localStorage.removeItem(L10N_PROGRESS_KEY);
    }

    function resetTool() {
        if (activeCheckRunId || progressSection.style.display !== 'none') {
            cancelCheckTask({ silent: true, skipConfirm: true });
        }

        sheetData = null;
        originalFileName = '';
        sourceColumn = null;
        targetColumn = null;
        checkResults = [];
        realtimeCheckResults = [];
        glossaryData = [];
        channelProgressState = new Map();
        renderChannelProgress();
        selectedGlossaryIds.clear();

        fileInput.value = '';
        if (projectSelect.options.length > 0) {
            projectSelect.selectedIndex = 0;
        }
        renderL10nGlossaryList();
        renderSheetSelectList();

        fileInfo.style.display = 'none';
        columnSelectSection.style.display = 'none';
        progressSection.style.display = 'none';
        resultsSection.style.display = 'none';
        hideStatus();
        clearL10nProgress();
    }

    function bindL10nResultActions() {
        fileInput?.addEventListener('click', (e) => e.stopPropagation());
        uploadArea?.addEventListener('click', () => fileInput?.click());
        bindUploadDrop(uploadArea, fileInput, (file, files = []) => handleL10nFiles(files.length > 0 ? files : [file]));

        fileInput?.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                handleL10nFiles([...e.target.files]);
            }
        });

        confirmColumnBtn?.addEventListener('click', confirmColumnSelection);
        checkBtn?.addEventListener('click', startCheck);
        downloadBtn?.addEventListener('click', downloadReport);
        downloadGlossaryBtn?.addEventListener('click', downloadGlossary);
        generateFixesBtn?.addEventListener('click', generateFullFixTranslations);
        exportTermReviewBtn?.addEventListener('click', exportTermReviewTable);
        importTermReviewInput?.addEventListener('change', (event) => {
            if (event.target.files.length > 0) {
                void importTermReviewTable(event.target.files[0]);
            }
        });
        generateReviewedGlossaryBtn?.addEventListener('click', generateReviewedGlossary);
        applyTermReviewBulkBtn?.addEventListener('click', () => applyTermReviewBulk(false));
        applyTermReviewBulkAllBtn?.addEventListener('click', () => applyTermReviewBulk(true));
        resetBtn?.addEventListener('click', resetTool);
    }

    bindL10nResultActions();
}

function initGlossaryTool() {
    const extractArea = document.getElementById('glossaryExtractArea');
    const extractInput = document.getElementById('glossaryExtractInput');
    const uploadArea = document.getElementById('glossaryUploadArea');
    const uploadInput = document.getElementById('glossaryUploadInput');
    const infoPanel = document.getElementById('glossaryInfo');
    const termsSection = document.getElementById('glossaryTerms');
    const progressSection = document.getElementById('glossaryProgressSection');
    const downloadBtn = document.getElementById('glossaryDownloadBtn');
    const downloadPatchedSourceBtn = document.getElementById('downloadPatchedSourceBtn');
    const aiPolishMatchedRowsBtn = document.getElementById('aiPolishMatchedRowsBtn');
    const downloadPolishReportBtn = document.getElementById('downloadPolishReportBtn');
    const retryFailedGlossaryBatchesBtn = document.getElementById('retryFailedGlossaryBatchesBtn');
    const glossaryPauseBtn = document.getElementById('glossaryPauseBtn');
    const glossaryResumeBtn = document.getElementById('glossaryResumeBtn');
    const glossaryCancelBtn = document.getElementById('glossaryCancelBtn');
    const resetBtn = document.getElementById('glossaryResetBtn');
    const glossaryMode = document.getElementById('glossaryMode');
    const glossaryModelRow = document.getElementById('glossaryModelRow');
    const glossarySpeedRow = document.getElementById('glossarySpeedRow');
    const glossaryModeCards = document.querySelectorAll('.glossary-mode-card[data-glossary-mode]');
    const glossarySpeedMode = document.getElementById('glossarySpeedMode');
    const glossarySpeedHint = document.getElementById('glossarySpeedHint');
    const extractTermsBtn = document.getElementById('extractTermsBtn');
    const extractUploadStatus = document.getElementById('extractUploadStatus');
    const uploadGlossaryStatus = document.getElementById('uploadGlossaryStatus');
    const restoreTermsInput = document.getElementById('glossaryRestoreTermsInput');
    const restoreReportInput = document.getElementById('glossaryRestoreReportInput');
    const restoreSourceInput = document.getElementById('glossaryRestoreSourceInput');
    const restoreTermsName = document.getElementById('glossaryRestoreTermsName');
    const restoreReportName = document.getElementById('glossaryRestoreReportName');
    const restoreSourceName = document.getElementById('glossaryRestoreSourceName');
    const restoreCount = document.getElementById('glossaryRestoreCount');
    const restoreStatus = document.getElementById('glossaryRestoreStatus');
    const restoreGlossaryRunBtn = document.getElementById('restoreGlossaryRunBtn');
    const restorePolishRunBtn = document.getElementById('restorePolishRunBtn');
    const clearGlossaryRestoreBtn = document.getElementById('clearGlossaryRestoreBtn');
    const reviewInput = document.getElementById('glossaryReviewInput');
    const reviewName = document.getElementById('glossaryReviewName');
    const reviewCount = document.getElementById('glossaryReviewCount');
    const reviewStatus = document.getElementById('glossaryReviewStatus');
    const reviewSummary = document.getElementById('glossaryReviewSummary');
    const reviewMode = document.getElementById('glossaryReviewMode');
    const reviewAiAssist = document.getElementById('glossaryReviewAiAssist');
    const reviewReportBtn = document.getElementById('glossaryReviewReportBtn');
    const reviewDownloadBtn = document.getElementById('glossaryReviewDownloadBtn');
    const clearReviewBtn = document.getElementById('clearGlossaryReviewBtn');
    const libraryList = document.getElementById('glossaryLibraryList');
    const libraryCount = document.getElementById('glossaryLibraryCount');

    let terms = [];
    let sourceFileName = '';
    let currentGlossaryName = '';
    let currentGlossaryId = '';
    let extractFile = null;
    let currentGlossaryOrigin = 'uploaded';
    let sourceWorkbookContext = null;
    let polishedRowPatches = new Map();
    let currentGlossaryRunMeta = null;
    let currentPolishRunMeta = null;
    let glossaryRestoreFiles = {
        terms: null,
        report: null,
        source: null
    };
    let glossaryTaskController = null;
    let glossaryTaskState = null;
    let glossaryResumeResolvers = [];
    let glossaryReviewFile = null;
    let glossaryReviewResult = null;
    const GLOSSARY_AI_CHUNK_MAX_CHARS = 9000;
    const GLOSSARY_AI_CHUNK_MAX_ROWS = 90;
    const GLOSSARY_AI_MAX_TOKENS = 4096;
    const GLOSSARY_SPEED_PRESETS = {
        stable: {
            label: '稳定档',
            maxRows: 90,
            maxChars: 9000,
            concurrency: 1,
            maxTokens: 4096,
            retryDelays: [5000, 15000],
            recoveryRetryDelays: [8000],
            settleDelayMs: 150
        },
        balanced: {
            label: '均衡档',
            maxRows: 150,
            maxChars: 15000,
            concurrency: 2,
            maxTokens: 6144,
            retryDelays: [4000, 12000],
            recoveryRetryDelays: [5000],
            settleDelayMs: 80
        },
        fast: {
            label: '快速档',
            maxRows: 240,
            maxChars: 26000,
            concurrency: 2,
            maxTokens: 8192,
            retryDelays: [3000, 9000],
            recoveryRetryDelays: [3000],
            settleDelayMs: 0
        },
        turbo: {
            label: '极速档',
            maxRows: 360,
            maxChars: 42000,
            concurrency: 4,
            maxTokens: 12288,
            retryDelays: [2500, 8000],
            recoveryRetryDelays: [3000],
            settleDelayMs: 0
        }
    };
    const GLOSSARY_POLISH_CHUNK_SIZE = 15;
    const GLOSSARY_POLISH_MAX_TOKENS = 4096;

    function isGeminiGlossaryModel(apiConfig, model) {
        const text = `${apiConfig?.provider || ''} ${model || ''}`.toLowerCase();
        return text.includes('gemini');
    }

    function isFastGlossaryModel(apiConfig, model) {
        const text = `${apiConfig?.provider || ''} ${model || ''}`.toLowerCase();
        return isGeminiGlossaryModel(apiConfig, model) ||
            /flash|lite|haiku|mini|turbo|mimo|qwen.*flash|doubao.*lite|deepseek.*flash/.test(text);
    }

    function isHeavyGlossaryModel(apiConfig, model) {
        const text = `${apiConfig?.provider || ''} ${model || ''}`.toLowerCase();
        return /opus|reasoner|thinking|pro|preview|max|gpt-5\.5|gpt-5\.4(?!-mini)/.test(text);
    }

    function getGlossarySelectedModel() {
        const apiConfig = getApiConfig();
        return apiConfig?.model || document.getElementById('glossaryModel')?.value || '';
    }

    function getGlossaryAutoPresetKey(apiConfig, model) {
        const text = String(model || '').toLowerCase();
        if (isGeminiGlossaryModel(apiConfig, model) && /flash|lite/.test(text)) return 'fast';
        if (isFastGlossaryModel(apiConfig, model)) return 'fast';
        if (isHeavyGlossaryModel(apiConfig, model)) return 'stable';
        return 'balanced';
    }

    function clampGlossaryNumber(value, min, max, fallback) {
        const number = Number(value);
        if (!Number.isFinite(number)) return fallback;
        return Math.max(min, Math.min(max, number));
    }

    function getGlossarySpeedSettings(apiConfig, model, requestedMode = glossarySpeedMode?.value || 'auto') {
        const presetKey = requestedMode === 'auto'
            ? getGlossaryAutoPresetKey(apiConfig, model)
            : (GLOSSARY_SPEED_PRESETS[requestedMode] ? requestedMode : 'balanced');
        const preset = GLOSSARY_SPEED_PRESETS[presetKey] || GLOSSARY_SPEED_PRESETS.balanced;
        const profileConcurrency = clampGlossaryNumber(apiConfig?.concurrency, 1, 10, preset.concurrency);
        const geminiFlashLite = isGeminiGlossaryModel(apiConfig, model) && /flash.*lite|lite.*flash|flash-lite/i.test(String(model || ''));
        const allowTurboConcurrency = presetKey === 'turbo' && geminiFlashLite;
        const concurrencyCap = allowTurboConcurrency ? Math.max(profileConcurrency, preset.concurrency) : profileConcurrency;
        const concurrency = clampGlossaryNumber(Math.min(preset.concurrency, concurrencyCap), 1, 6, 1);

        return {
            ...preset,
            mode: requestedMode,
            resolvedMode: presetKey,
            concurrency,
            maxRows: clampGlossaryNumber(preset.maxRows, GLOSSARY_AI_CHUNK_MAX_ROWS, 500, GLOSSARY_AI_CHUNK_MAX_ROWS),
            maxChars: clampGlossaryNumber(preset.maxChars, GLOSSARY_AI_CHUNK_MAX_CHARS, 60000, GLOSSARY_AI_CHUNK_MAX_CHARS),
            maxTokens: clampGlossaryNumber(preset.maxTokens, GLOSSARY_AI_MAX_TOKENS, 16384, GLOSSARY_AI_MAX_TOKENS)
        };
    }

    function updateGlossarySpeedHint() {
        if (!glossarySpeedHint) return;
        const apiConfig = getApiConfig();
        const model = getGlossarySelectedModel();
        const settings = getGlossarySpeedSettings(apiConfig, model, glossarySpeedMode?.value || 'auto');
        const recommendation = isGeminiGlossaryModel(apiConfig, model) && /flash|lite/i.test(model)
            ? 'Gemini Flash-Lite/Flash 可优先用快速或极速'
            : (isHeavyGlossaryModel(apiConfig, model)
                ? 'Claude Opus、Pro、Reasoner 建议用稳定或均衡'
                : '通用模型建议先用均衡，稳定后再提速');
        glossarySpeedHint.textContent = `${recommendation}。当前：${settings.label}，约每批 ${settings.maxRows} 行，并发 ${settings.concurrency}，输出上限 ${settings.maxTokens} tokens；若 429/503 增多就降一档。`;
    }

    function syncGlossaryModeVisibility() {
        const selectedMode = glossaryMode?.value || 'ai';
        glossaryModeCards.forEach(card => {
            const isActive = card.dataset.glossaryMode === selectedMode;
            card.classList.toggle('active', isActive);
            card.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });

        if (selectedMode === 'ai') {
            glossaryModelRow.style.display = 'flex';
            if (glossarySpeedRow) glossarySpeedRow.style.display = 'flex';
        } else {
            glossaryModelRow.style.display = 'none';
            if (glossarySpeedRow) glossarySpeedRow.style.display = 'none';
        }
        updateGlossarySpeedHint();
    }

    glossaryModeCards.forEach(card => {
        const selectModeFromCard = () => {
            const mode = card.dataset.glossaryMode;
            if (!mode || !glossaryMode) return;
            glossaryMode.value = mode;
            glossaryMode.dispatchEvent(new Event('change'));
        };

        card.addEventListener('click', selectModeFromCard);
        card.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            selectModeFromCard();
        });
    });
    glossaryMode.addEventListener('change', syncGlossaryModeVisibility);
    glossarySpeedMode?.addEventListener('change', updateGlossarySpeedHint);
    document.getElementById('glossaryModel')?.addEventListener('change', updateGlossarySpeedHint);
    document.addEventListener('nexus:api-profiles-updated', updateGlossarySpeedHint);

    syncGlossaryModeVisibility();

    function isGlossaryAbortError(error) {
        return error?.name === 'AbortError' || error?.message === 'GLOSSARY_TASK_CANCELLED';
    }

    function createGlossaryAbortError() {
        return new DOMException('Glossary task cancelled', 'AbortError');
    }

    function updateGlossaryTaskButtons() {
        const isRunning = Boolean(glossaryTaskState?.running);
        const isPaused = Boolean(glossaryTaskState?.paused);
        if (glossaryPauseBtn) {
            glossaryPauseBtn.style.display = isRunning && !isPaused ? 'inline-flex' : 'none';
            glossaryPauseBtn.disabled = !isRunning || Boolean(glossaryTaskState?.cancelled);
        }
        if (glossaryResumeBtn) {
            glossaryResumeBtn.style.display = isRunning && isPaused ? 'inline-flex' : 'none';
            glossaryResumeBtn.disabled = !isRunning || Boolean(glossaryTaskState?.cancelled);
        }
        if (glossaryCancelBtn) {
            glossaryCancelBtn.style.display = isRunning ? 'inline-flex' : 'none';
            glossaryCancelBtn.disabled = !isRunning || Boolean(glossaryTaskState?.cancelled);
        }
        updateGlossaryRestoreState();
    }

    function beginGlossaryTask(kind, label) {
        if (glossaryTaskController) {
            glossaryTaskController.abort();
        }
        glossaryTaskController = new AbortController();
        glossaryTaskState = {
            kind,
            label,
            running: true,
            paused: false,
            cancelled: false,
            startedAt: Date.now(),
            signal: glossaryTaskController.signal
        };
        updateGlossaryTaskButtons();
        return glossaryTaskState;
    }

    function finishGlossaryTask(taskState = glossaryTaskState) {
        if (taskState && glossaryTaskState === taskState) {
            glossaryTaskState.running = false;
            glossaryTaskState.paused = false;
            glossaryTaskState = null;
            glossaryTaskController = null;
        }
        flushGlossaryResumeWaiters();
        updateGlossaryTaskButtons();
    }

    function flushGlossaryResumeWaiters() {
        const resolvers = glossaryResumeResolvers;
        glossaryResumeResolvers = [];
        resolvers.forEach(resolve => resolve());
    }

    function pauseGlossaryTask() {
        if (!glossaryTaskState?.running || glossaryTaskState.paused) return;
        glossaryTaskState.paused = true;
        updateGlossaryTaskButtons();
        setStatus('warning', '术语任务已暂停', '当前已发出的请求会继续等返回，暂停期间不会发起新的批次');
    }

    function resumeGlossaryTask() {
        if (!glossaryTaskState?.running || !glossaryTaskState.paused) return;
        glossaryTaskState.paused = false;
        updateGlossaryTaskButtons();
        setStatus('processing', '术语任务继续运行', '正在继续处理后续批次');
        flushGlossaryResumeWaiters();
    }

    function cancelGlossaryTask(options = {}) {
        if (!glossaryTaskState?.running) return;
        const shouldCancel = options.skipConfirm || confirm('确定取消当前术语任务吗？已完成的批次会尽量保留，未开始的批次不会继续消耗 API 额度。');
        if (!shouldCancel) return;

        glossaryTaskState.cancelled = true;
        glossaryTaskState.paused = false;
        if (glossaryTaskController) {
            glossaryTaskController.abort();
        }
        flushGlossaryResumeWaiters();
        updateGlossaryTaskButtons();
        if (!options.silent) {
            setStatus('warning', '正在取消术语任务', '已停止后续批次；正在中断或等待当前请求结束');
        }
    }

    function assertGlossaryTaskActive(taskState = glossaryTaskState) {
        if (taskState?.cancelled || taskState?.signal?.aborted) {
            throw createGlossaryAbortError();
        }
    }

    async function waitGlossaryIfPaused(taskState = glossaryTaskState) {
        while (taskState?.running && taskState.paused && !taskState.cancelled) {
            await new Promise(resolve => {
                glossaryResumeResolvers.push(resolve);
            });
        }
        assertGlossaryTaskActive(taskState);
    }

    const rulesHeader = document.getElementById('rulesHeader');
    const rulesContent = document.getElementById('rulesContent');
    const formatHeader = document.getElementById('formatHeader');
    const formatContent = document.getElementById('formatContent');

    rulesHeader.addEventListener('click', () => {
        const isExpanded = rulesContent.style.display === 'block';
        rulesContent.style.display = isExpanded ? 'none' : 'block';
        rulesHeader.querySelector('.collapse-icon').classList.toggle('expanded');
    });

    formatHeader.addEventListener('click', () => {
        const isExpanded = formatContent.style.display === 'block';
        formatContent.style.display = isExpanded ? 'none' : 'block';
        formatHeader.querySelector('.collapse-icon').classList.toggle('expanded');
    });

    bindUploadDrop(extractArea, extractInput, handleExtractFileSelect);

    extractInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleExtractFileSelect(e.target.files[0]);
        }
    });

    bindUploadDrop(uploadArea, uploadInput, handleUploadFileSelect);

    uploadInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleUploadFileSelect(e.target.files[0]);
        }
    });

    restoreTermsInput?.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleGlossaryRestoreFileSelect('terms', e.target.files[0]);
        }
    });

    restoreReportInput?.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleGlossaryRestoreFileSelect('report', e.target.files[0]);
        }
    });

    restoreSourceInput?.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleGlossaryRestoreFileSelect('source', e.target.files[0]);
        }
    });

    reviewInput?.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            importGlossaryReview(e.target.files[0]).catch(error => {
                console.error('Review import failed:', error);
            });
        }
    });

    extractTermsBtn.addEventListener('click', () => {
        if (extractFile) {
            if (glossaryMode.value === 'ai' && !ensureApiKeyConfigured('AI 智能提取术语表')) {
                progressSection.style.display = 'none';
                return;
            }

            extractTermsBtn.disabled = true;
            extractTermsBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle class="spin" cx="12" cy="12" r="10" stroke-linecap="round"/></svg> 提取中...';
            extractTerms(extractFile);
        }
    });

    downloadBtn.addEventListener('click', downloadGlossary);
    downloadPatchedSourceBtn?.addEventListener('click', downloadPatchedSourceFile);
    aiPolishMatchedRowsBtn?.addEventListener('click', polishMatchedRowsWithAI);
    downloadPolishReportBtn?.addEventListener('click', downloadPolishRunReport);
    retryFailedGlossaryBatchesBtn?.addEventListener('click', retryFailedGlossaryBatches);
    restoreGlossaryRunBtn?.addEventListener('click', restoreGlossaryRunFromFiles);
    restorePolishRunBtn?.addEventListener('click', restorePolishRunFromFiles);
    clearGlossaryRestoreBtn?.addEventListener('click', clearGlossaryRestoreFiles);
    reviewReportBtn?.addEventListener('click', downloadGlossaryReviewReport);
    reviewDownloadBtn?.addEventListener('click', downloadFinalGlossaryFromReview);
    clearReviewBtn?.addEventListener('click', clearGlossaryReviewState);
    glossaryPauseBtn?.addEventListener('click', pauseGlossaryTask);
    glossaryResumeBtn?.addEventListener('click', resumeGlossaryTask);
    glossaryCancelBtn?.addEventListener('click', cancelGlossaryTask);
    resetBtn.addEventListener('click', resetTool);
    document.addEventListener('nexus:glossary-library-updated', renderGlossaryLibrary);
    renderGlossaryLibrary();

    function getGlossaryOriginLabel(origin) {
        return getGlossaryOriginDisplayLabel(origin);
    }

    function formatGlossaryTime(timestamp) {
        if (!timestamp) return '未知时间';

        const date = new Date(timestamp);
        if (Number.isNaN(date.getTime())) return '未知时间';

        return date.toLocaleString('zh-CN', {
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    function getGlossaryFileBaseName(entry) {
        return (entry.sourceFileName || entry.name || '术语表').replace(/\.(csv|xlsx|xls)$/i, '');
    }

    function updateGlossaryRestoreState() {
        const selected = ['terms', 'report', 'source'].filter(key => glossaryRestoreFiles[key]).length;
        if (restoreCount) restoreCount.textContent = `${selected} / 3`;
        if (restoreTermsName) restoreTermsName.textContent = glossaryRestoreFiles.terms?.name || '未选择';
        if (restoreReportName) restoreReportName.textContent = glossaryRestoreFiles.report?.name || '未选择';
        if (restoreSourceName) restoreSourceName.textContent = glossaryRestoreFiles.source?.name || '未选择';
        if (restoreGlossaryRunBtn) restoreGlossaryRunBtn.disabled = selected < 3 || Boolean(glossaryTaskState?.running);
        if (restorePolishRunBtn) restorePolishRunBtn.disabled = selected < 3 || Boolean(glossaryTaskState?.running);
    }

    function updateGlossaryReviewState() {
        const hasReview = Boolean(glossaryReviewFile && glossaryReviewResult);
        if (reviewCount) {
            reviewCount.textContent = hasReview
                ? `${glossaryReviewResult.markerRows || 0} / ${glossaryReviewResult.totalRows || 0}`
                : '0 / 0';
        }
        if (reviewName) reviewName.textContent = glossaryReviewFile?.name || '未选择';
        if (reviewSummary) {
            reviewSummary.textContent = hasReview
                ? `最终 ${glossaryReviewResult.finalTermCount || glossaryReviewResult.keepCount || 0} 条，不采用 ${glossaryReviewResult.removedTermCount || glossaryReviewResult.ignoreCount || 0} 条`
                : '等待上传返稿';
        }
        if (reviewReportBtn) reviewReportBtn.disabled = !hasReview;
        if (reviewDownloadBtn) reviewDownloadBtn.disabled = !hasReview;
    }

    function clearGlossaryReviewState() {
        glossaryReviewFile = null;
        glossaryReviewResult = null;
        if (reviewInput) reviewInput.value = '';
        if (reviewStatus) {
            reviewStatus.textContent = '上传策划返稿后，工具会识别背景色、文字颜色、备注或状态列，并生成审核后的最终术语表。';
            reviewStatus.className = 'upload-status info';
        }
        updateGlossaryReviewState();
    }

    function normalizeReviewEditableTerm(term, origin = '') {
        const source = String(term.term || term.source || '').trim();
        const target = String(term.translation || term.target || '').trim();
        if (!source) return null;
        return {
            ...term,
            term: source,
            translation: target,
            type: String(term.type || guessTermType(source) || '游戏术语').trim(),
            count: Number(term.count || 1),
            confidence: Number(term.confidence || 0),
            note: String(term.note || term.reason || '').trim(),
            extractionSource: String(term.extractionSource || origin || '').trim(),
            extractionBatch: String(term.extractionBatch || '').trim(),
            referenceId: String(term.referenceId || '').trim(),
            referenceRows: String(term.referenceRows || '').trim(),
            originalTranslation: String(term.originalTranslation || '').trim(),
            finalTranslation: String(term.finalTranslation || target || term.originalTranslation || '').trim(),
            qualityStatus: String(term.qualityStatus || '').trim(),
            qualityIssues: String(term.qualityIssues || '').trim(),
            qualitySuggestion: String(term.qualitySuggestion || '').trim()
        };
    }

    function getCurrentReviewSourceTerms() {
        return (terms || [])
            .map(term => normalizeReviewEditableTerm(term, currentGlossaryOrigin || 'current'))
            .filter(Boolean);
    }

    function readReviewGlossarySheetTerms(workbook) {
        const sheetName = findOptionalWorksheetByName(workbook.SheetNames || [], ['术语表', '最终术语表', '整理后术语表', 'glossary']);
        if (!sheetName || !workbook.Sheets?.[sheetName]) {
            return { sheetName: '', terms: [] };
        }

        const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '' });
        const parsedTerms = mapParsedGlossaryTermsToEditable(parseGlossaryTableRows(rows), 'review-glossary');
        return {
            sheetName,
            terms: parsedTerms.map(term => normalizeReviewEditableTerm(term, 'review-glossary')).filter(Boolean)
        };
    }

    function getReviewTermUniqueKey(term, index = 0) {
        return normalizeTermKey([
            term.term || term.source,
            term.translation || term.target,
            term.referenceId,
            term.referenceRows
        ].filter(Boolean).join('|')) || `term-${index}`;
    }

    function extractReviewNumbers(value) {
        const numbers = [];
        splitReferenceList(value).forEach(item => {
            const matches = String(item || '').match(/\d+/g) || [];
            matches.forEach(match => {
                const number = Number(match);
                if (Number.isFinite(number)) numbers.push(number);
            });
        });
        return numbers;
    }

    function getReviewIdSet(value) {
        return new Set(splitReferenceList(value).map(item => normalizeTermKey(item)).filter(Boolean));
    }

    function normalizeReviewReferenceToken(value) {
        return normalizeTermKey(value);
    }

    function getReviewEntryRowNumbers(entry) {
        return new Set(extractReviewNumbers(`${entry?.rowNumber || ''};${entry?.excelRowNumber || ''}`));
    }

    function getReviewEntryIds(entry) {
        return getReviewIdSet(entry?.referenceId || '');
    }

    function pruneReviewReferenceList(value, removeSet) {
        if (!removeSet || removeSet.size === 0) return String(value || '').trim();
        const kept = splitReferenceList(value)
            .filter(item => !removeSet.has(normalizeReviewReferenceToken(item)) && !removeSet.has(normalizeReviewReferenceToken(item.replace(/^行/, ''))));
        return kept.join('; ');
    }

    function pruneReviewTermScope(term, entry) {
        const rowRemoveSet = new Set();
        getReviewEntryRowNumbers(entry).forEach(row => {
            rowRemoveSet.add(normalizeReviewReferenceToken(row));
            rowRemoveSet.add(normalizeReviewReferenceToken(`行${row}`));
        });
        const idRemoveSet = getReviewEntryIds(entry);

        const originalRows = splitReferenceList(term.referenceRows);
        const originalIds = splitReferenceList(term.referenceId);
        const nextRows = pruneReviewReferenceList(term.referenceRows, rowRemoveSet, '行');
        const nextIds = pruneReviewReferenceList(term.referenceId, idRemoveSet);
        const hadScopedRows = originalRows.length > 0;
        const hadScopedIds = originalIds.length > 0;
        const removedRows = hadScopedRows && nextRows !== String(term.referenceRows || '').trim();
        const removedIds = hadScopedIds && nextIds !== String(term.referenceId || '').trim();
        const hasRemainingRows = splitReferenceList(nextRows).length > 0;
        const hasRemainingIds = splitReferenceList(nextIds).length > 0;

        if ((hadScopedRows || hadScopedIds) && (removedRows || removedIds) && (hasRemainingRows || hasRemainingIds)) {
            return {
                action: 'pruned',
                term: {
                    ...term,
                    referenceRows: nextRows,
                    referenceId: nextIds,
                    note: [term.note, `人工审核排除：${entry.rowNumber || entry.referenceId || '标记行'}`].filter(Boolean).join('；')
                }
            };
        }

        return {
            action: 'remove',
            term
        };
    }

    function getReviewCell(row, index) {
        return index >= 0 && row[index] !== undefined ? String(row[index]).trim() : '';
    }

    function inferReviewDecision(row, columnIndexes, hasMarker, markerSource = '', markerSemantic = null) {
        const statusDecision = normalizeReviewDecisionText(getReviewCell(row, columnIndexes.statusIndex));
        if (statusDecision) {
            return { decision: statusDecision, reviewSource: '状态列' };
        }

        const note = getReviewCell(row, columnIndexes.noteIndex);
        const noteDecision = normalizeReviewDecisionText(note);
        if (noteDecision) {
            return { decision: noteDecision, reviewSource: '备注列' };
        }

        if (hasMarker) {
            const mode = reviewMode?.value || 'planner';
            if (mode === 'planner') {
                if (markerSemantic?.hasGreen && !markerSemantic?.hasRed) {
                    return {
                        decision: 'keep',
                        reviewSource: markerSource || '绿色文字/颜色标记'
                    };
                }
                if (markerSemantic?.hasRed) {
                    if (reviewTextNeedsAiDecision(note)) {
                        return {
                            decision: 'ai-review',
                            reviewSource: markerSource || '红色文字/颜色标记'
                        };
                    }
                    return {
                        decision: 'ignore',
                        reviewSource: markerSource || '红色文字/颜色标记'
                    };
                }
            }
            return {
                decision: mode === 'keep' ? 'keep' : 'ignore',
                reviewSource: markerSource || '颜色标记'
            };
        }

        return { decision: '', reviewSource: '' };
    }

    function findMatchingReviewTerms(entry, sourceTerms) {
        const entryRows = new Set(extractReviewNumbers(`${entry.rowNumber || ''};${entry.excelRowNumber || ''}`));
        const entryIds = getReviewIdSet(entry.referenceId);
        const sourceTextKey = normalizeTermKey(entry.sourceText);
        const termHintKey = normalizeTermKey(entry.termText);
        const entryTranslationKey = normalizeTermKey(`${entry.originalTranslation || ''} ${entry.finalTranslation || ''}`);

        return (sourceTerms || []).map((term, index) => {
            const termText = term.term || term.source || '';
            const termKey = normalizeTermKey(termText);
            if (!termKey) return null;

            const termRows = extractReviewNumbers(term.referenceRows);
            const termIds = getReviewIdSet(term.referenceId);
            const rowMatch = termRows.some(row => entryRows.has(row));
            const idMatch = [...termIds].some(id => entryIds.has(id));
            const termMatch = Boolean(
                (sourceTextKey && sourceTextKey.includes(termKey)) ||
                (termHintKey && (termHintKey === termKey || termHintKey.includes(termKey) || termKey.includes(termHintKey)))
            );
            const translationKey = normalizeTermKey(term.finalTranslation || term.translation || term.originalTranslation || '');
            const translationMatch = Boolean(translationKey && entryTranslationKey.includes(translationKey));

            let matchReason = '';
            if (idMatch && (termMatch || rowMatch || !sourceTextKey)) {
                matchReason = 'ID匹配';
            } else if (rowMatch && (termMatch || translationMatch || !sourceTextKey)) {
                matchReason = '行号匹配';
            } else if (termMatch) {
                matchReason = '原文命中';
            }

            if (!matchReason) return null;
            return {
                term,
                index,
                key: getReviewTermUniqueKey(term, index),
                matchReason
            };
        }).filter(Boolean);
    }

    function buildFallbackReviewTerms(entries) {
        return (entries || []).map(entry => {
            const source = String(entry.termText || entry.sourceText || '').trim();
            if (!source) return null;
            return normalizeReviewEditableTerm({
                term: source,
                translation: entry.finalTranslation || entry.originalTranslation || '',
                finalTranslation: entry.finalTranslation || entry.originalTranslation || '',
                originalTranslation: entry.originalTranslation || '',
                type: '人工审核导入',
                count: 1,
                confidence: 0,
                note: entry.note || '',
                extractionSource: 'review-import',
                referenceId: entry.referenceId || '',
                referenceRows: entry.rowNumber || (entry.excelRowNumber ? `行${entry.excelRowNumber}` : '')
            }, 'review-import');
        }).filter(Boolean);
    }

    function normalizeAiReviewDecision(value) {
        const decision = String(value || '').trim().toLowerCase();
        if (['keep', 'accept', 'apply', 'use'].includes(decision)) return 'keep';
        if (['ignore', 'reject', 'skip', 'remove'].includes(decision)) return 'ignore';
        if (['revise', 'modify', 'change'].includes(decision)) return 'revise';
        return '';
    }

    function applyReviewEntryToTerm(term, entry, reviewReason = '') {
        const revisedTranslation = String(entry.aiFinalTranslation || entry.finalTranslation || '').trim();
        if (!revisedTranslation) return term;
        const currentFinal = String(term.finalTranslation || term.translation || term.target || '').trim();
        if (revisedTranslation === currentFinal) return term;
        return {
            ...term,
            translation: revisedTranslation,
            finalTranslation: revisedTranslation,
            note: [term.note, reviewReason || entry.aiReason || entry.note ? `人工返稿修正：${reviewReason || entry.aiReason || entry.note}` : '人工返稿修正'].filter(Boolean).join('；'),
            reviewDecision: entry.decision || 'keep'
        };
    }

    async function resolveGlossaryReviewEntriesWithAi(entries) {
        const pendingEntries = (entries || []).filter(entry => entry.decision === 'ai-review');
        if (!pendingEntries.length) {
            return { resolved: 0, skipped: 0, failed: 0 };
        }

        if (!reviewAiAssist?.checked) {
            pendingEntries.forEach(entry => {
                entry.aiReason = 'AI 辅助未开启，保留为待人工确认';
            });
            return { resolved: 0, skipped: pendingEntries.length, failed: 0 };
        }

        const apiConfig = getApiConfig();
        if (!apiConfig?.apiKey) {
            pendingEntries.forEach(entry => {
                entry.aiReason = '未配置 API Key，保留为待人工确认';
            });
            return { resolved: 0, skipped: pendingEntries.length, failed: 0 };
        }

        let resolved = 0;
        let failed = 0;
        const model = apiConfig.model || getDefaultModelForProvider(apiConfig.provider);
        for (let start = 0; start < pendingEntries.length; start += 12) {
            const batch = pendingEntries.slice(start, start + 12);
            if (reviewStatus) {
                reviewStatus.textContent = `正在小批量理解红色复杂备注 ${Math.min(start + batch.length, pendingEntries.length)} / ${pendingEntries.length} ...`;
                reviewStatus.className = 'upload-status info';
            }
            const payload = batch.map(entry => ({
                excelRowNumber: entry.excelRowNumber,
                referenceId: entry.referenceId,
                rowNumber: entry.rowNumber,
                sourceText: entry.sourceText,
                termText: entry.termText,
                originalTranslation: entry.originalTranslation,
                aiSuggestedTranslation: entry.finalTranslation,
                status: entry.statusText,
                note: entry.note,
                rowText: entry.rowText
            }));
            const prompt = [
                '你是游戏本地化术语表审核助手。策划在返稿表里用红色文字写了对 AI 修改建议的人工判断。',
                '请只判断这些红色备注对应的处理结果，不要重新翻译整份表。',
                'decision 只能是 keep、ignore、revise：',
                '- keep：采用 AI 建议或保留该术语。',
                '- ignore：不采用这条 AI 修改建议，从最终术语表中排除这条建议。',
                '- revise：按策划备注修正，必须给 finalTranslation。',
                '如果备注说“改成/改为/用某某”，优先输出 revise 和明确译文。看不懂时用 keep，并在 reason 说明需要人工确认。',
                '只返回 JSON 数组，不要 Markdown。',
                JSON.stringify(payload)
            ].join('\n\n');

            try {
                const content = await requestModelContent(apiConfig, {
                    model,
                    messages: [{ role: 'user', content: prompt }],
                    temperature: 0.1,
                    max_tokens: 1800
                });
                const parsed = extractJsonFromText(content);
                const results = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.items) ? parsed.items : []);
                const resultMap = new Map(results.map(item => [Number(item.excelRowNumber), item]));
                batch.forEach(entry => {
                    const item = resultMap.get(Number(entry.excelRowNumber));
                    const decision = normalizeAiReviewDecision(item?.decision);
                    if (!decision) {
                        entry.decision = 'keep';
                        entry.aiReason = 'AI 未返回明确判断，已保留并标记人工复核';
                        resolved++;
                        return;
                    }
                    entry.decision = decision;
                    entry.aiFinalTranslation = String(item?.finalTranslation || item?.translation || '').trim();
                    entry.aiReason = String(item?.reason || '').trim();
                    entry.reviewSource = `${entry.reviewSource || '红色备注'} + AI理解`;
                    resolved++;
                });
            } catch (error) {
                console.warn('Failed to resolve glossary review notes with AI:', error);
                failed += batch.length;
                batch.forEach(entry => {
                    entry.decision = 'keep';
                    entry.aiReason = `AI 理解失败，已保留并标记人工复核：${error.message || error}`;
                });
            }
        }
        return { resolved, skipped: 0, failed };
    }

    function getGlossaryReviewSheetCandidates(workbook) {
        const preferredNames = ['修正后数据', '术语表', '审核结果', '修改明细', '原始数据', 'review', 'glossary'];
        const normalizedSheets = new Map(workbook.SheetNames.map(name => [normalizeHeaderText(name), name]));
        const preferred = preferredNames
            .map(name => normalizedSheets.get(normalizeHeaderText(name)))
            .filter(Boolean);
        return [...new Set([...preferred, ...workbook.SheetNames])];
    }

    async function analyzeGlossaryReviewSheet(file, workbook, sheetName) {
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) return null;

        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
        if (!rows.length) return null;

        const columnIndexes = inferReviewColumns(rows);
        const colorMap = await extractWorksheetColorMapFromFile(file, workbook, sheetName);
        const entries = [];
        let markerRows = 0;
        let fillMarkerRows = 0;
        let fontMarkerRows = 0;
        let mixedMarkerRows = 0;

        const headerRow = rows[0] || [];
        const dataRows = rows.slice(1);

        dataRows.forEach((row, offset) => {
            const excelRowNumber = offset + 2;
            const referenceId = getReviewCell(row, columnIndexes.idIndex);
            const rowNumber = getReviewCell(row, columnIndexes.rowIndex) || `行${excelRowNumber}`;
            const sourceText = getReviewCell(row, columnIndexes.sourceIndex) || getReviewCell(row, columnIndexes.termIndex);
            const termText = getReviewCell(row, columnIndexes.termIndex);
            const originalTranslation = getReviewCell(row, columnIndexes.originalTranslationIndex);
            const finalTranslation = getReviewCell(row, columnIndexes.finalTranslationIndex);
            const statusText = getReviewCell(row, columnIndexes.statusIndex);
            const note = getReviewCell(row, columnIndexes.noteIndex);

            const rowStyleMarker = colorMap.get(`__ROW_${offset + 1}`);
            const rowCellMarkers = Array.from({ length: Math.max(headerRow.length, row.length) }, (_, col) => {
                const addr = XLSX.utils.encode_cell({ r: offset + 1, c: col });
                return colorMap.get(addr) || null;
            }).filter(marker => marker && isReviewStyleMarker(marker));
            const rowMarker = mergeStyleMarkers(rowStyleMarker, ...rowCellMarkers) || null;
            const hasFillMarker = parseReviewMarkerColor(getMarkerFillColor(rowMarker));
            const hasFontMarker = parseReviewMarkerColor(getMarkerFontColor(rowMarker));
            const markerSource = getMarkerDisplaySource(rowMarker);
            const markerSemantic = getReviewMarkerSemantics(rowMarker);
            const rowColor = getReviewMarkerColor(rowMarker);
            const hasMarker = Boolean(rowMarker && (hasFillMarker || hasFontMarker));
            if (hasMarker) {
                markerRows++;
                if (hasFillMarker && hasFontMarker) mixedMarkerRows++;
                else if (hasFillMarker) fillMarkerRows++;
                else if (hasFontMarker) fontMarkerRows++;
            }

            const { decision, reviewSource } = inferReviewDecision(row, columnIndexes, hasMarker, markerSource, markerSemantic);
            const sourceKey = normalizeTermKey(sourceText || referenceId || rowNumber);
            entries.push({
                excelRowNumber,
                referenceId,
                rowNumber,
                sourceText,
                termText,
                originalTranslation,
                finalTranslation,
                statusText,
                note,
                rowText: row.map(cell => String(cell || '').trim()).filter(Boolean).join(' | '),
                hasMarker,
                rowColor,
                fillColor: getMarkerFillColor(rowMarker),
                fontColor: getMarkerFontColor(rowMarker),
                markerSemantics: markerSemantic.semanticList || [],
                markerSource,
                decision,
                reviewSource,
                sourceKey
            });
        });

        return {
            sheetName,
            entries,
            totalRows: dataRows.length,
            markerRows,
            fillMarkerRows,
            fontMarkerRows,
            mixedMarkerRows
        };
    }

    function chooseGlossaryReviewSheetAnalysis(analyses) {
        return analyses.filter(Boolean).reduce((best, item) => {
            if (!best) return item;
            if ((item.markerRows || 0) > (best.markerRows || 0)) return item;
            if ((item.markerRows || 0) === (best.markerRows || 0) && (item.totalRows || 0) > (best.totalRows || 0)) return item;
            return best;
        }, null);
    }

    async function analyzeGlossaryReviewFile(file) {
        const { workbook, fileName } = await readSpreadsheetWorkbook(file);
        const sheetName = findWorksheetByName(workbook.SheetNames, ['修正后数据', '审核结果', 'review']);
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) {
            throw new Error('未找到“修正后数据”或可用审核工作表');
        }

        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
        if (!rows.length) {
            throw new Error('审核工作表为空');
        }

        const columnIndexes = inferReviewColumns(rows);
        const colorMap = await extractWorksheetColorMapFromFile(file, workbook, sheetName);
        const entries = [];
        let markerRows = 0;
        let fillMarkerRows = 0;
        let fontMarkerRows = 0;
        let mixedMarkerRows = 0;

        const headerRow = rows[0] || [];
        const dataRows = rows.slice(1);

        dataRows.forEach((row, offset) => {
            const excelRowNumber = offset + 2;
            const referenceId = getReviewCell(row, columnIndexes.idIndex);
            const rowNumber = getReviewCell(row, columnIndexes.rowIndex) || `行${excelRowNumber}`;
            const sourceText = getReviewCell(row, columnIndexes.sourceIndex) || getReviewCell(row, columnIndexes.termIndex);
            const termText = getReviewCell(row, columnIndexes.termIndex);
            const originalTranslation = getReviewCell(row, columnIndexes.originalTranslationIndex);
            const finalTranslation = getReviewCell(row, columnIndexes.finalTranslationIndex);
            const statusText = getReviewCell(row, columnIndexes.statusIndex);
            const note = getReviewCell(row, columnIndexes.noteIndex);

            const rowStyleMarker = colorMap.get(`__ROW_${offset + 1}`);
            const rowCellMarkers = Array.from({ length: Math.max(headerRow.length, row.length) }, (_, col) => {
                const addr = XLSX.utils.encode_cell({ r: offset + 1, c: col });
                return colorMap.get(addr) || null;
            }).filter(marker => marker && isReviewStyleMarker(marker));
            const rowMarker = mergeStyleMarkers(rowStyleMarker, ...rowCellMarkers) || null;
            const hasFillMarker = parseReviewMarkerColor(getMarkerFillColor(rowMarker));
            const hasFontMarker = parseReviewMarkerColor(getMarkerFontColor(rowMarker));
            const markerSource = getMarkerDisplaySource(rowMarker);
            const markerSemantic = getReviewMarkerSemantics(rowMarker);
            const rowColor = getReviewMarkerColor(rowMarker);
            const hasMarker = Boolean(rowMarker && (hasFillMarker || hasFontMarker));
            if (hasMarker) {
                markerRows++;
                if (hasFillMarker && hasFontMarker) mixedMarkerRows++;
                else if (hasFillMarker) fillMarkerRows++;
                else if (hasFontMarker) fontMarkerRows++;
            }

            const { decision, reviewSource } = inferReviewDecision(row, columnIndexes, hasMarker, markerSource, markerSemantic);
            const sourceKey = normalizeTermKey(sourceText || referenceId || rowNumber);
            entries.push({
                excelRowNumber,
                referenceId,
                rowNumber,
                sourceText,
                termText,
                originalTranslation,
                finalTranslation,
                statusText,
                note,
                rowText: row.map(cell => String(cell || '').trim()).filter(Boolean).join(' | '),
                hasMarker,
                rowColor,
                fillColor: getMarkerFillColor(rowMarker),
                fontColor: getMarkerFontColor(rowMarker),
                markerSemantics: markerSemantic.semanticList || [],
                markerSource,
                decision,
                reviewSource,
                sourceKey
            });
        });

        const glossarySheet = readReviewGlossarySheetTerms(workbook);
        const currentSourceTerms = getCurrentReviewSourceTerms();
        let sourceTerms = glossarySheet.terms.length > 0 ? glossarySheet.terms : currentSourceTerms;
        let termSourceLabel = glossarySheet.terms.length > 0
            ? `返稿工作簿：${glossarySheet.sheetName}`
            : (currentSourceTerms.length > 0 ? '当前已打开术语表' : '返稿行兜底生成');

        if (sourceTerms.length === 0) {
            sourceTerms = buildFallbackReviewTerms(entries);
            termSourceLabel = '返稿行兜底生成';
        }

        const aiReviewStats = await resolveGlossaryReviewEntriesWithAi(entries);
        const removedTermMap = new Map();
        const prunedTermMap = new Map();
        const modifiedTermMap = new Map();
        const prunedReviewItems = [];
        const unmatchedEntries = [];
        entries.forEach(entry => {
            const matches = findMatchingReviewTerms(entry, sourceTerms);
            entry.matchedTerms = matches.map(match => match.term.term || match.term.source || '').filter(Boolean);
            if (entry.decision && matches.length === 0) {
                unmatchedEntries.push({
                    ...entry,
                    unmatchedReason: sourceTerms.length > 0 ? '审核标记未匹配到术语表条目' : '返稿中没有可用术语来源'
                });
            }

            if (entry.decision === 'keep' || entry.decision === 'revise') {
                matches.forEach(match => {
                    const currentTerm = modifiedTermMap.get(match.key) || match.term;
                    modifiedTermMap.set(match.key, applyReviewEntryToTerm(currentTerm, entry, match.matchReason));
                });
            }

            if (entry.decision !== 'ignore') return;
            matches.forEach(match => {
                const currentTerm = prunedTermMap.get(match.key) || match.term;
                const scoped = pruneReviewTermScope(currentTerm, entry);
                if (scoped.action === 'pruned') {
                    prunedTermMap.set(match.key, scoped.term);
                    prunedReviewItems.push({
                        term: match.term,
                        matchReason: `${match.matchReason}（仅排除该行/ID，其他行继续保留）`,
                        reviewSource: entry.reviewSource || '人工标记',
                        note: entry.note || '',
                        referenceId: entry.referenceId || '',
                        rowNumber: entry.rowNumber || ''
                    });
                    return;
                }

                prunedTermMap.delete(match.key);
                if (removedTermMap.has(match.key)) return;
                removedTermMap.set(match.key, {
                    term: scoped.term,
                    matchReason: match.matchReason,
                    reviewSource: entry.reviewSource || '人工标记',
                    note: entry.note || '',
                    referenceId: entry.referenceId || match.term.referenceId || '',
                    rowNumber: entry.rowNumber || match.term.referenceRows || ''
                });
            });
        });

        const finalTerms = sourceTerms
            .filter((term, index) => !removedTermMap.has(getReviewTermUniqueKey(term, index)))
            .map((term, index) => {
                const key = getReviewTermUniqueKey(term, index);
                return prunedTermMap.get(key) || modifiedTermMap.get(key) || term;
            });
        const removedTerms = [...removedTermMap.values()];
        const prunedTerms = [...prunedTermMap.values()];
        const modifiedTerms = [...modifiedTermMap.values()];
        const ignoredTerms = [...removedTerms, ...prunedReviewItems];
        const keepCount = finalTerms.length;
        const ignoreCount = ignoredTerms.length;
        const reviewResult = {
            sourceFileName: fileName,
            sheetName,
            glossarySheetName: glossarySheet.sheetName,
            termSourceLabel,
            totalRows: dataRows.length,
            markerRows,
            fillMarkerRows,
            fontMarkerRows,
            mixedMarkerRows,
            sourceTermCount: sourceTerms.length,
            finalTermCount: finalTerms.length,
            removedTermCount: removedTerms.length,
            prunedTermCount: prunedTerms.length,
            modifiedTermCount: modifiedTerms.length,
            unmatchedIgnoreCount: unmatchedEntries.length,
            aiReviewStats,
            keepCount,
            ignoreCount,
            statusCount: entries.filter(entry => entry.decision).length,
            entries,
            ignoredTerms,
            removedTerms,
            prunedTerms,
            modifiedTerms,
            unmatchedEntries,
            keptTerms: finalTerms.map(term => ({
                ...term,
                reviewDecision: 'keep'
            })),
            finalTerms: finalTerms.map(term => ({
                ...term,
                reviewDecision: 'keep'
            }))
        };

        return reviewResult;
    }

    async function analyzeGlossaryReviewFileAutoSheet(file) {
        const { workbook, fileName } = await readSpreadsheetWorkbook(file);
        const candidates = getGlossaryReviewSheetCandidates(workbook);
        const analyses = [];
        for (const sheetName of candidates) {
            const analysis = await analyzeGlossaryReviewSheet(file, workbook, sheetName);
            if (analysis) analyses.push(analysis);
        }
        const selectedAnalysis = chooseGlossaryReviewSheetAnalysis(analyses);
        if (!selectedAnalysis) {
            throw new Error('未找到可用的审核工作表');
        }

        const {
            sheetName,
            entries,
            totalRows,
            markerRows,
            fillMarkerRows,
            fontMarkerRows,
            mixedMarkerRows
        } = selectedAnalysis;
        const reviewSheetMarkerSummary = analyses.map(item => ({
            sheetName: item.sheetName,
            markerRows: item.markerRows || 0,
            totalRows: item.totalRows || 0
        }));

        const glossarySheet = readReviewGlossarySheetTerms(workbook);
        const currentSourceTerms = getCurrentReviewSourceTerms();
        let sourceTerms = glossarySheet.terms.length > 0 ? glossarySheet.terms : currentSourceTerms;
        let termSourceLabel = glossarySheet.terms.length > 0
            ? `返稿工作簿：${glossarySheet.sheetName}`
            : (currentSourceTerms.length > 0 ? '当前已打开术语表' : '返稿行兜底生成');

        if (sourceTerms.length === 0) {
            sourceTerms = buildFallbackReviewTerms(entries);
            termSourceLabel = '返稿行兜底生成';
        }

        const aiReviewStats = await resolveGlossaryReviewEntriesWithAi(entries);
        const removedTermMap = new Map();
        const prunedTermMap = new Map();
        const modifiedTermMap = new Map();
        const prunedReviewItems = [];
        const unmatchedEntries = [];
        entries.forEach(entry => {
            const matches = findMatchingReviewTerms(entry, sourceTerms);
            entry.matchedTerms = matches.map(match => match.term.term || match.term.source || '').filter(Boolean);
            if (entry.decision && matches.length === 0) {
                unmatchedEntries.push({
                    ...entry,
                    unmatchedReason: sourceTerms.length > 0 ? '审核标记未匹配到术语表条目' : '返稿中没有可用术语来源'
                });
            }

            if (entry.decision === 'keep' || entry.decision === 'revise') {
                matches.forEach(match => {
                    const currentTerm = modifiedTermMap.get(match.key) || match.term;
                    modifiedTermMap.set(match.key, applyReviewEntryToTerm(currentTerm, entry, match.matchReason));
                });
            }

            if (entry.decision !== 'ignore') return;
            matches.forEach(match => {
                const currentTerm = prunedTermMap.get(match.key) || match.term;
                const scoped = pruneReviewTermScope(currentTerm, entry);
                if (scoped.action === 'pruned') {
                    prunedTermMap.set(match.key, scoped.term);
                    prunedReviewItems.push({
                        term: match.term,
                        matchReason: `${match.matchReason}（仅排除该行/ID，其他行继续保留）`,
                        reviewSource: entry.reviewSource || '人工标记',
                        note: entry.note || '',
                        referenceId: entry.referenceId || '',
                        rowNumber: entry.rowNumber || ''
                    });
                    return;
                }

                prunedTermMap.delete(match.key);
                if (removedTermMap.has(match.key)) return;
                removedTermMap.set(match.key, {
                    term: scoped.term,
                    matchReason: match.matchReason,
                    reviewSource: entry.reviewSource || '人工标记',
                    note: entry.note || '',
                    referenceId: entry.referenceId || match.term.referenceId || '',
                    rowNumber: entry.rowNumber || match.term.referenceRows || ''
                });
            });
        });

        const finalTerms = sourceTerms
            .filter((term, index) => !removedTermMap.has(getReviewTermUniqueKey(term, index)))
            .map((term, index) => {
                const key = getReviewTermUniqueKey(term, index);
                return prunedTermMap.get(key) || modifiedTermMap.get(key) || term;
            });
        const removedTerms = [...removedTermMap.values()];
        const prunedTerms = [...prunedTermMap.values()];
        const modifiedTerms = [...modifiedTermMap.values()];
        const ignoredTerms = [...removedTerms, ...prunedReviewItems];
        const keepCount = finalTerms.length;
        const ignoreCount = ignoredTerms.length;

        return {
            sourceFileName: fileName,
            sheetName,
            glossarySheetName: glossarySheet.sheetName,
            termSourceLabel,
            totalRows,
            markerRows,
            fillMarkerRows,
            fontMarkerRows,
            mixedMarkerRows,
            reviewSheetMarkerSummary,
            sourceTermCount: sourceTerms.length,
            finalTermCount: finalTerms.length,
            removedTermCount: removedTerms.length,
            prunedTermCount: prunedTerms.length,
            modifiedTermCount: modifiedTerms.length,
            unmatchedIgnoreCount: unmatchedEntries.length,
            aiReviewStats,
            keepCount,
            ignoreCount,
            statusCount: entries.filter(entry => entry.decision).length,
            entries,
            ignoredTerms,
            removedTerms,
            prunedTerms,
            modifiedTerms,
            unmatchedEntries,
            keptTerms: finalTerms.map(term => ({
                ...term,
                reviewDecision: 'keep'
            })),
            finalTerms: finalTerms.map(term => ({
                ...term,
                reviewDecision: 'keep'
            }))
        };
    }

    async function importGlossaryReview(file) {
        glossaryReviewFile = file;
        if (reviewStatus) {
            reviewStatus.textContent = `正在分析 ${file.name} ...`;
            reviewStatus.className = 'upload-status info';
        }
        updateGlossaryReviewState();

            try {
                const result = await analyzeGlossaryReviewFileAutoSheet(file);
                glossaryReviewResult = result;
                if (reviewStatus) {
                const markerDetail = [
                    result.fillMarkerRows ? `背景色 ${result.fillMarkerRows}` : '',
                    result.fontMarkerRows ? `文字颜色 ${result.fontMarkerRows}` : '',
                    result.mixedMarkerRows ? `背景+文字 ${result.mixedMarkerRows}` : ''
                ].filter(Boolean).join('，');
                const aiDetail = result.aiReviewStats?.resolved
                    ? `，AI 已理解 ${result.aiReviewStats.resolved} 条红色复杂备注`
                    : (result.aiReviewStats?.skipped ? `，${result.aiReviewStats.skipped} 条红色复杂备注待人工确认` : '');
                reviewStatus.textContent = `已识别 ${result.markerRows} 条颜色标记行${markerDetail ? `（${markerDetail}）` : ''}，来源 ${result.termSourceLabel || '术语表'}，最终 ${result.finalTermCount} 条，不采用 ${result.removedTermCount} 条，修正 ${result.modifiedTermCount || 0} 条${result.unmatchedIgnoreCount ? `，${result.unmatchedIgnoreCount} 条需人工确认` : ''}${aiDetail}。`;
                const sheetDetail = result.sheetName ? `，标色表：${result.sheetName}` : '';
                reviewStatus.textContent = `已识别 ${result.markerRows} 条颜色标记行${markerDetail ? `（${markerDetail}）` : ''}${sheetDetail}，来源 ${result.termSourceLabel || '术语表'}，最终 ${result.finalTermCount} 条，不采用 ${result.removedTermCount} 条，修正 ${result.modifiedTermCount || 0} 条${result.unmatchedIgnoreCount ? `，${result.unmatchedIgnoreCount} 条需人工确认` : ''}${aiDetail}。`;
                reviewStatus.className = 'upload-status success';
            }
            updateGlossaryReviewState();
        } catch (error) {
            glossaryReviewResult = null;
            if (reviewStatus) {
                reviewStatus.textContent = error.message || '识别返稿失败';
                reviewStatus.className = 'upload-status error';
            }
            updateGlossaryReviewState();
            throw error;
        }
    }

    function downloadGlossaryReviewReport() {
        if (!glossaryReviewResult) {
            alert('请先导入策划返稿');
            return;
        }
        downloadWorkbookFile(buildReviewWorkbook(glossaryReviewResult), `${(glossaryReviewFile?.name || 'glossary_review').replace(/\.(xlsx|xls)$/i, '')}_review_report.xlsx`);
    }

    function downloadFinalGlossaryFromReview() {
        if (!glossaryReviewResult) {
            alert('请先导入策划返稿');
            return;
        }
        const finalTerms = buildFilteredGlossaryTermsFromReview(glossaryReviewResult);
        if (finalTerms.length === 0) {
            alert('没有可生成的最终术语表，请检查返稿里是否包含“术语表”分页，或先打开原术语表后再导入返稿。');
            return;
        }

        terms = finalTerms;
        sourceFileName = glossaryReviewResult.sourceFileName || glossaryReviewFile?.name || '人工审核术语表';
        currentGlossaryName = `${(glossaryReviewFile?.name || '人工审核术语表').replace(/\.(xlsx|xls)$/i, '')}_最终术语表`;
        currentGlossaryOrigin = 'reviewed';
        currentGlossaryRunMeta = null;
        currentPolishRunMeta = null;
        const savedEntry = saveGlossaryEntry({
            name: currentGlossaryName,
            sourceFileName,
            terms,
            origin: currentGlossaryOrigin,
            runMeta: {
                mode: 'review',
                sourceFileName,
                reviewSheetName: glossaryReviewResult.sheetName || '',
                glossarySheetName: glossaryReviewResult.glossarySheetName || '',
                sourceTermCount: glossaryReviewResult.sourceTermCount || 0,
                finalTermCount: glossaryReviewResult.finalTermCount || 0,
                removedTermCount: glossaryReviewResult.removedTermCount || 0,
                prunedTermCount: glossaryReviewResult.prunedTermCount || 0,
                unmatchedIgnoreCount: glossaryReviewResult.unmatchedIgnoreCount || 0,
                createdAt: new Date().toISOString()
            }
        });
        if (savedEntry) {
            currentGlossaryId = savedEntry.id;
            currentGlossaryName = savedEntry.name;
        }

        displayTerms();
        downloadWorkbookFile(buildReviewWorkbook(glossaryReviewResult), `${(glossaryReviewFile?.name || 'glossary_review').replace(/\.(xlsx|xls)$/i, '')}_final_glossary.xlsx`);
        setStatus('success', '最终术语表已生成', `已保存 ${finalTerms.length} 条到本地术语库，可在本地化检测中直接勾选使用`);
    }

    function handleGlossaryRestoreFileSelect(kind, file) {
        glossaryRestoreFiles[kind] = file;
        updateGlossaryRestoreState();
        if (restoreStatus) {
            restoreStatus.textContent = `已选择 ${file.name}。请确认三份文件属于同一次术语提取任务。`;
            restoreStatus.className = 'upload-status info';
        }
    }

    function clearGlossaryRestoreFiles() {
        glossaryRestoreFiles = { terms: null, report: null, source: null };
        if (restoreTermsInput) restoreTermsInput.value = '';
        if (restoreReportInput) restoreReportInput.value = '';
        if (restoreSourceInput) restoreSourceInput.value = '';
        updateGlossaryRestoreState();
        if (restoreStatus) {
            restoreStatus.textContent = '术语补跑请上传旧术语表、运行报告和原文件；AI润色续跑请上传旧术语表、AI润色报告和原文件。';
            restoreStatus.className = 'upload-status info';
        }
    }

    updateGlossaryRestoreState();

    function normalizeTermKey(term) {
        return String(term || '')
            .trim()
            .replace(/\s+/g, '')
            .replace(/[，。！？、；：“”"'（）()\[\]【】<>《》]/g, '')
            .toLowerCase();
    }

    function getTermOccurrenceCount(text, term) {
        const source = String(text || '');
        const value = String(term || '').trim();
        if (!source || !value) return 0;

        let count = 0;
        let index = 0;
        while ((index = source.indexOf(value, index)) >= 0) {
            count++;
            index += Math.max(1, value.length);
        }
        return count;
    }

    function cleanTermText(value) {
        return String(value || '')
            .replace(/\\n/g, ' ')
            .replace(/<[^>]+>/g, ' ')
            .replace(/%\w|\{[^}]+\}|\$\w+/g, ' ')
            .replace(/^[\s"'“”‘’【】\[\]（）()《》<>:：,，.。;；!?！？]+|[\s"'“”‘’【】\[\]（）()《》<>:：,，.。;；!?！？]+$/g, '')
            .trim();
    }

    function isLowValueTerm(term) {
        const value = cleanTermText(term);
        if (!value || value.length < 2 || value.length > 18) return true;
        if (!hasCjkText(value)) return true;
        if (/^[\d\s+\-*/.,%]+$/.test(value)) return true;
        if (/^\d/.test(value) || /\d$/.test(value)) return true;
        if (/第[\d一二三四五六七八九十百千万]+/.test(value)) return true;

        const stopWords = new Set([
            '当前', '已经', '可以', '不能', '需要', '是否', '如果', '然后', '继续', '开始', '结束', '完成',
            '成功', '失败', '错误', '提示', '点击', '选择', '输入', '返回', '获得', '领取', '使用', '消耗',
            '增加', '减少', '达到', '超过', '未开始', '不存在', '请稍后', '请联系', '服务器', '数据错误',
            '登录', '验证', '客服', '操作', '次数', '数量', '时间', '今日', '昨日', '本周', '全部'
        ]);
        if (stopWords.has(value)) return true;
        if (/^(请|已|未|在|到|从|向|为|将|可|不|无法|当前|本次|该|此)/.test(value) && value.length > 6) return true;
        return false;
    }

    function classifyProfessionalTerm(term, sourceText = '', targetText = '') {
        const value = String(term || '');
        const context = `${sourceText} ${targetText}`;
        const typeRules = [
            ['角色/NPC', /(领主|女巫|铁匠|酒保|佣兵|英雄|角色|NPC|哥布尔|怪物|Boss|首领|队伍|伙伴)/],
            ['地点/建筑', /(小镇|城堡|仓库|酒馆|商店|市场|兵营|铁匠铺|工坊|大厅|营地|矿洞|迷宫|副本|地图|区域|领地|建筑)/],
            ['道具/装备', /(装备|武器|护甲|头盔|戒指|项链|宝箱|奖励|碎片|材料|卡片|皮肤|道具|物品|钥匙|礼包|兑换码)/],
            ['资源/货币', /(金币|钻石|水晶|体力|能量|经验|声望|积分|货币|资源|余额|点数)/],
            ['技能/状态', /(技能|天赋|强化|升级|重置|增益|减益|眩晕|治疗|攻击|防御|暴击|闪避|复活|解锁)/],
            ['任务/活动', /(任务|活动|挑战|成就|主线|支线|章节|关卡|赛季|排行榜|竞技场|公会|探险)/],
            ['系统/UI', /(按钮|界面|面板|菜单|弹窗|设置|邮件|登录|验证|服务器|客服|错误|确认|取消|保存|下载)/]
        ];

        for (const [type, pattern] of typeRules) {
            if (pattern.test(value) || pattern.test(context)) return type;
        }
        return value.length <= 4 ? '游戏术语' : '专有名词';
    }

    function scoreTermCandidate(term, sourceText = '', targetText = '') {
        let score = 0;
        const value = cleanTermText(term);
        if (value.length >= 2 && value.length <= 6) score += 18;
        if (value.length > 6 && value.length <= 12) score += 10;
        if (/[【《「『\[]/.test(sourceText)) score += 8;
        if (targetText && hasLatinText(targetText)) score += 10;
        if (sourceText.trim() === value) score += 18;
        if (sourceText.includes(value)) score += 6;
        if (/(小镇|仓库|酒馆|兵营|铁匠|领主|女巫|佣兵|英雄|技能|装备|宝箱|碎片|奖励|兑换码|竞技场|迷宫|皮肤|公会|章节|关卡|任务)/.test(value)) score += 20;
        if (/(成功|失败|当前|已经|可以|不能|点击|选择|请|是否|如果|时候|之后)/.test(value)) score -= 14;
        if (value.length > 10 && !/[【《「『\[]/.test(sourceText)) score -= 12;
        return score;
    }

    function addGlossaryCandidate(map, rawTerm, record, options = {}) {
        const term = cleanTermText(rawTerm);
        if (isLowValueTerm(term)) return;

        const key = normalizeTermKey(term);
        if (!key) return;

        const sourceText = record?.sourceText || '';
        const targetText = record?.targetText || '';
        const type = options.type || classifyProfessionalTerm(term, sourceText, targetText);
        const score = (options.score || 0) + scoreTermCandidate(term, sourceText, targetText);
        const existing = map.get(key) || {
            term,
            type,
            count: 0,
            score: 0,
            targetCounts: new Map(),
            examples: []
        };

        existing.count += 1;
        existing.score += score;
        if (type && existing.type === '游戏术语') existing.type = type;

        const target = cleanTermText(options.target || (sourceText.trim() === term ? targetText : ''));
        if (target && hasLatinText(target) && target.length <= 80) {
            existing.targetCounts.set(target, (existing.targetCounts.get(target) || 0) + 1);
        }

        if (existing.examples.length < 3 && record) {
            existing.examples.push({
                rowNumber: record.rowNumber,
                source: sourceText,
                target: targetText
            });
        }

        map.set(key, existing);
    }

    function extractBracketedTerms(sourceText) {
        const matches = [];
        const pattern = /[【《「『\[]([^】》」』\]]{2,18})[】》」』\]]/g;
        let match;
        while ((match = pattern.exec(sourceText)) !== null) {
            if (hasCjkText(match[1])) matches.push(match[1]);
        }
        return matches;
    }

    function extractProfessionalTermsFromSource(sourceText) {
        const text = cleanTermText(sourceText);
        const terms = new Set(extractBracketedTerms(text));
        const importantPattern = /[\u4e00-\u9fff]{0,8}(?:小镇|城堡|仓库|酒馆|商店|市场|兵营|铁匠铺|工坊|大厅|营地|矿洞|迷宫|副本|地图|领地|建筑|领主|女巫|铁匠|酒保|佣兵|英雄|怪物|首领|技能|天赋|装备|武器|护甲|宝箱|奖励|碎片|材料|卡片|皮肤|道具|物品|钥匙|礼包|兑换码|金币|钻石|体力|能量|经验|任务|活动|挑战|竞技场|公会|章节|关卡)[\u4e00-\u9fff]{0,6}/g;
        let match;
        while ((match = importantPattern.exec(text)) !== null) {
            terms.add(match[0]);
        }

        text.split(/[，。！？、；：\s\\n]+/).forEach(segment => {
            const clean = cleanTermText(segment);
            if (clean.length >= 2 && clean.length <= 8 && hasCjkText(clean)) {
                terms.add(clean);
            }
        });

        return [...terms];
    }

    function inferLocalizationColumns(rows) {
        const firstRow = rows[0] || [];
        const headers = firstRow.map(cell => normalizeHeaderText(cell));
        const hasHeader = headers.some(header =>
            header === 'id' ||
            header.includes('原文') ||
            header.includes('中文') ||
            header.includes('简体') ||
            header.includes('译文') ||
            header.includes('英文') ||
            header.includes('english') ||
            header.includes('translation') ||
            header.includes('管理')
        );
        const sampleRows = (hasHeader ? rows.slice(1) : rows).slice(0, 300);
        const width = Math.max(0, ...rows.map(row => row.length || 0));
        const stats = Array.from({ length: width }, (_, index) => {
            const columnStats = getGlossaryColumnStats(sampleRows, index);
            const header = headers[index] || '';
            const nonEmpty = Math.max(1, columnStats.nonEmpty);
            const sourceHeaderBoost = /原文|中文|简体|source|zh|管理/.test(header) && !/英文|english|translation|译文/.test(header) ? 30 : 0;
            const targetHeaderBoost = /译文|英文|英语|english|translation|target|en/.test(header) ? 30 : 0;
            return {
                index,
                header,
                ...columnStats,
                sourceScore: sourceHeaderBoost + columnStats.cjk * 2 - columnStats.latin * 0.4 - columnStats.idLike * 4 + columnStats.nonEmpty / nonEmpty,
                targetScore: targetHeaderBoost + columnStats.latin * 2 - columnStats.cjk * 0.5 - columnStats.idLike * 5 + columnStats.nonEmpty / nonEmpty
            };
        });

        const sourceIndex = stats
            .filter(item => item.nonEmpty > 0 && item.idLike / Math.max(1, item.nonEmpty) < 0.7)
            .sort((a, b) => b.sourceScore - a.sourceScore)[0]?.index ?? 0;
        const targetIndex = stats
            .filter(item => item.nonEmpty > 0 && item.index !== sourceIndex && item.idLike / Math.max(1, item.nonEmpty) < 0.7)
            .sort((a, b) => b.targetScore - a.targetScore)[0]?.index ?? (sourceIndex === 0 ? 1 : 0);
        const idKeywords = ['id', 'string id', 'stringid', 'key', 'keys', '编号', '序号', '条目', '文本id', '文本 id', '资源id', '资源 id', '唯一标识', 'identifier'];
        const idIndex = stats.find(item => idKeywords.some(keyword => item.header === keyword || item.header.includes(keyword)))?.index ?? -1;
        const referenceIndexes = stats
            .filter(item => item.nonEmpty > 0 && item.index !== sourceIndex && item.index !== targetIndex)
            .filter(item => item.index === idIndex || item.idLike / Math.max(1, item.nonEmpty) >= 0.35 || idKeywords.some(keyword => item.header === keyword || item.header.includes(keyword)))
            .slice(0, 3)
            .map(item => item.index);

        return { hasHeader, sourceIndex, targetIndex, idIndex, referenceIndexes, headers };
    }

    function buildLocalizationRecords(rows) {
        if (!rows || rows.length === 0) return [];
        const columns = inferLocalizationColumns(rows);
        const dataRows = columns.hasHeader ? rows.slice(1) : rows;

        return dataRows.map((row, index) => {
            const sourceText = cleanTermText(row[columns.sourceIndex] ?? '');
            const targetText = cleanTermText(row[columns.targetIndex] ?? '');
            const id = columns.idIndex >= 0 ? cleanTermText(row[columns.idIndex] ?? '') : '';
            const referenceCells = (columns.referenceIndexes || []).map(columnIndex => {
                const header = columns.headers?.[columnIndex] || `列${columnIndex + 1}`;
                return {
                    header,
                    value: cleanTermText(row[columnIndex] ?? '')
                };
            }).filter(cell => cell.value);
            return {
                id,
                referenceId: id || `行${index + (columns.hasHeader ? 2 : 1)}`,
                referenceCells,
                rowNumber: index + (columns.hasHeader ? 2 : 1),
                sourceText,
                targetText
            };
        }).filter(record => record.sourceText && hasCjkText(record.sourceText));
    }

    function buildSourceWorkbookContext(rows, fileName) {
        const columns = inferLocalizationColumns(rows);
        const records = buildLocalizationRecords(rows);
        const recordByRowNumber = new Map(records.map(record => [record.rowNumber, record]));
        const recordByReferenceId = new Map();

        records.forEach(record => {
            splitReferenceList(record.referenceId).forEach(id => recordByReferenceId.set(id, record));
            splitReferenceList(record.id).forEach(id => recordByReferenceId.set(id, record));
        });

        return {
            fileName,
            rows: rows.map(row => Array.isArray(row) ? [...row] : []),
            columns,
            records,
            recordByRowNumber,
            recordByReferenceId
        };
    }

    function finalizeGlossaryCandidates(candidateMap, fullText, limit = 500) {
        return [...candidateMap.values()]
            .map(candidate => {
                const targetEntries = [...candidate.targetCounts.entries()].sort((a, b) => b[1] - a[1]);
                const target = targetEntries[0]?.[0] || '';
                const actualCount = getTermOccurrenceCount(fullText, candidate.term) || candidate.count;
                const confidence = Math.max(40, Math.min(98, Math.round(candidate.score / Math.max(1, candidate.count) + Math.min(24, actualCount * 3))));
                return {
                    term: candidate.term,
                    type: candidate.type || classifyProfessionalTerm(candidate.term),
                    count: actualCount,
                    translation: target,
                    confidence,
                    extractionSource: 'rule-v2',
                    note: candidate.examples[0]
                        ? `行 ${candidate.examples[0].rowNumber}：${candidate.examples[0].source.slice(0, 40)}`
                        : '本地规则识别'
                };
            })
            .filter(term => term.confidence >= 50 || term.count >= 2)
            .sort((a, b) => (b.confidence - a.confidence) || (b.count - a.count))
            .slice(0, limit);
    }

    function extractProfessionalTermsByRule(records, fullText, limit = 500) {
        const candidateMap = new Map();
        records.forEach(record => {
            const sourceText = record.sourceText;
            const targetText = record.targetText;
            if (!sourceText) return;

            const compactSource = sourceText.replace(/\s+/g, '');
            if (compactSource.length >= 2 && compactSource.length <= 12 && !isLowValueTerm(compactSource)) {
                addGlossaryCandidate(candidateMap, compactSource, record, {
                    target: targetText,
                    score: sourceText === compactSource ? 30 : 12
                });
            }

            extractProfessionalTermsFromSource(sourceText).forEach(term => {
                addGlossaryCandidate(candidateMap, term, record, { score: 10 });
            });
        });

        return finalizeGlossaryCandidates(candidateMap, fullText, limit);
    }

    function buildGlossaryAiPromptParts(records, chunkIndex, totalChunks) {
        const systemPrompt = `你是资深游戏本地化术语库编辑和术语质量审校专家。你的任务不是根据出现次数机械筛词，而是直接阅读整批游戏文本，判断哪些词应进入项目术语库，并同时检查术语译法质量。

必须遵守：
1. 直接从输入的原文/译文行中提炼术语，不要依赖本地候选词、出现次数或简单词频。
2. 尽量覆盖游戏项目真实需要固定译法的术语，宁可分批多提，也不要只给很少的高频词。
3. 类型必须细分，允许但不限于：角色/NPC、怪物/BOSS、地点/建筑、阵营/组织、道具/装备、资源/货币、技能/状态、任务/活动、玩法/系统、系统/UI、剧情/世界观、称号/成就、数值/属性、商店/付费、活动/赛季、专有名词、其他游戏术语。
4. 不要输出完整句子、普通说明、纯数字、占位符、文件 ID、临时按钮提示，除非它本身就是必须固定译法的 UI 术语。
5. source 必须是中文原文术语；target 是推荐英文指定译法。能从译文列判断就采用译文列；译文不规范时给更合理的推荐译法。
6. 对每个术语做质量检测：是否符合游戏行业常用表达、英文拼写是否正确、数字/罗马数字/专名是否一致、是否过直译、是否类型误判、是否存在明显不统一风险。
7. referenceId/referenceRows 要用于定位，优先保留输入里的 ID/key；没有 ID 就用行号。
8. 只返回 JSON，不要解释，不要 Markdown。`;

        const rows = records.map(record => ({
            row: record.rowNumber,
            referenceId: record.referenceId || record.id || `行${record.rowNumber}`,
            refs: (record.referenceCells || []).map(cell => `${cell.header}:${cell.value}`).join(' | '),
            source: record.sourceText,
            target: record.targetText
        }));

        const userPrompt = `批次：${chunkIndex + 1}/${totalChunks}

请直接阅读下面这些游戏本地化文本行，提炼本批次中应该进入术语库的游戏术语，并对每个术语给出术语质量检测结论。

文本行 JSON：
${JSON.stringify(rows)}

返回格式必须是合法 JSON：
{
  "terms": [
    {
      "source": "中文术语",
      "target": "推荐英文指定译法",
      "type": "角色/NPC|怪物/BOSS|地点/建筑|阵营/组织|道具/装备|资源/货币|技能/状态|任务/活动|玩法/系统|系统/UI|剧情/世界观|称号/成就|数值/属性|商店/付费|活动/赛季|专有名词|其他游戏术语",
      "confidence": 0,
      "referenceId": "最有代表性的ID或key；没有则行号",
      "referenceRows": "出现过的行号，多个用 ; 分隔",
      "reason": "为什么这是游戏术语，依据要能回查",
      "qualityStatus": "通过|需确认|有问题",
      "qualityIssues": "术语规范、拼写、数字、大小写、直译、误译、不统一等问题；没有则空字符串",
      "qualitySuggestion": "如果有问题，给出建议译法或处理建议；没有则空字符串",
      "originalTranslation": "文本里当前使用的英文译法，没有则空字符串",
      "finalTranslation": "整理后的最终英文译法；无需修改时等于当前译法或推荐译法；需要修改时填修正后的可直接使用译法"
    }
  ]
}`;

        return {
            systemPrompt,
            userPrompt,
            cacheKey: makePromptCacheKey('glossary_ai_full_v2', systemPrompt)
        };
    }

    function parseGlossaryAiResult(text) {
        const raw = String(text || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
        try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed?.terms) ? parsed.terms : [];
        } catch {
            const match = raw.match(/\{[\s\S]*\}/);
            if (!match) return [];
            try {
                const parsed = JSON.parse(match[0]);
                return Array.isArray(parsed?.terms) ? parsed.terms : [];
            } catch {
                return [];
            }
        }
    }

    function chunkGlossaryItems(items, size) {
        const chunks = [];
        for (let index = 0; index < items.length; index += size) {
            chunks.push(items.slice(index, index + size));
        }
        return chunks;
    }

    function chunkGlossaryRecords(records, maxChars = GLOSSARY_AI_CHUNK_MAX_CHARS, maxRows = GLOSSARY_AI_CHUNK_MAX_ROWS) {
        const chunks = [];
        let current = [];
        let currentChars = 0;

        records.forEach(record => {
            const rowChars = JSON.stringify({
                r: record.rowNumber,
                id: record.referenceId,
                s: record.sourceText,
                t: record.targetText
            }).length;

            if (current.length > 0 && (current.length >= maxRows || currentChars + rowChars > maxChars)) {
                chunks.push(current);
                current = [];
                currentChars = 0;
            }

            current.push(record);
            currentChars += rowChars;
        });

        if (current.length > 0) chunks.push(current);
        return chunks;
    }

    function updateGlossaryProgress(completed, total, title, detail) {
        const safeTotal = Math.max(1, total);
        const safeCompleted = Math.max(0, Math.min(completed, safeTotal));
        const progress = Math.round((safeCompleted / safeTotal) * 100);
        document.getElementById('glossaryProgressText').textContent = `${safeCompleted} / ${safeTotal}`;
        document.getElementById('glossaryProgressPercent').textContent = `${progress}%`;
        document.getElementById('glossaryProgressFill').style.width = `${progress}%`;
        if (title) {
            setStatus('processing', title, detail || '');
        }
    }

    function sleepGlossary(ms, taskState = glossaryTaskState) {
        if (!ms) return Promise.resolve();
        return delayWithSignal(ms, taskState?.signal || null);
    }

    function buildGlossaryBatchInfo(records, index) {
        const rowNumbers = records.map(record => Number(record.rowNumber)).filter(Number.isFinite);
        return {
            batch: index + 1,
            rowStart: rowNumbers.length ? Math.min(...rowNumbers) : '',
            rowEnd: rowNumbers.length ? Math.max(...rowNumbers) : '',
            rowCount: records.length,
            referenceStart: records[0]?.referenceId || '',
            referenceEnd: records[records.length - 1]?.referenceId || ''
        };
    }

    function buildGlossaryRetryBatchInfo(records, originalBatch, splitLevel = 0, splitIndex = 0) {
        const parsedIndex = Number(originalBatch?.index);
        const fallbackIndex = Number.parseFloat(originalBatch?.batch) - 1;
        const info = buildGlossaryBatchInfo(records, Number.isFinite(parsedIndex)
            ? parsedIndex
            : (Number.isFinite(fallbackIndex) ? fallbackIndex : 0));
        return {
            ...info,
            index: originalBatch?.index,
            batch: splitLevel > 0
                ? `${originalBatch?.batch || info.batch}.${splitIndex + 1}`
                : (originalBatch?.batch || info.batch),
            originalBatch: originalBatch?.originalBatch || originalBatch?.batch || info.batch,
            splitLevel,
            rowCount: records.length,
            message: originalBatch?.message || ''
        };
    }

    function splitGlossaryRetryChunk(chunk, failedBatch, splitLevel = 0) {
        if (!Array.isArray(chunk) || chunk.length === 0) return [];
        if (chunk.length <= GLOSSARY_AI_CHUNK_MAX_ROWS || splitLevel >= 2) {
            return [{
                chunk,
                failed: buildGlossaryRetryBatchInfo(chunk, failedBatch, splitLevel, 0)
            }];
        }

        const midpoint = Math.ceil(chunk.length / 2);
        return [chunk.slice(0, midpoint), chunk.slice(midpoint)]
            .filter(part => part.length > 0)
            .map((part, index) => ({
                chunk: part,
                failed: buildGlossaryRetryBatchInfo(part, failedBatch, splitLevel + 1, index)
            }));
    }

    function getGlossaryRecoveryRetryDelays(settings = {}) {
        return Array.isArray(settings.recoveryRetryDelays) && settings.recoveryRetryDelays.length > 0
            ? settings.recoveryRetryDelays
            : [settings.resolvedMode === 'stable' ? 8000 : 3000];
    }

    async function retryGlossaryChunkWithAutoSplit({
        chunk,
        failed,
        totalChunks,
        sourceRecords,
        fullText,
        apiConfig,
        model,
        maxTokens,
        taskState,
        phaseLabel = '补跑 ',
        retryDelays = [10000],
        maxSplitLevel = 2,
        onRecovered
    }) {
        const initialSplitLevel = Number(failed?.splitLevel || 0);
        const initialItems = splitGlossaryRetryChunk(chunk, failed, initialSplitLevel);
        const queue = initialItems.length > 0
            ? initialItems.map(item => ({ ...item, splitLevel: Number(item.failed?.splitLevel || initialSplitLevel) }))
            : [{ chunk, failed, splitLevel: initialSplitLevel }];
        const unrecovered = [];
        const recovered = [];

        while (queue.length > 0) {
            await waitGlossaryIfPaused(taskState);
            assertGlossaryTaskActive(taskState);
            const item = queue.shift();
            const currentChunk = item.chunk || [];
            const currentFailed = item.failed || failed;

            if (currentChunk.length === 0) {
                unrecovered.push({
                    ...currentFailed,
                    message: '无法定位该批次行内容'
                });
                continue;
            }

            try {
                const result = await runGlossaryAiChunk({
                    chunk: currentChunk,
                    index: Number(failed?.index || 0),
                    totalChunks,
                    sourceRecords,
                    fullText,
                    apiConfig,
                    model,
                    retryDelays,
                    phaseLabel,
                    maxTokens,
                    taskState
                });
                const recoveredBatch = {
                    ...currentFailed,
                    termCount: result.aiTerms.length,
                    recoveredAt: new Date().toISOString(),
                    splitRecovered: Number(currentFailed?.splitLevel || 0) > 0
                };
                recovered.push(recoveredBatch);
                if (typeof onRecovered === 'function') {
                    onRecovered(result, recoveredBatch);
                }
            } catch (error) {
                if (isGlossaryAbortError(error)) throw error;

                const splitLevel = Number(currentFailed?.splitLevel || item.splitLevel || 0);
                const canSplit = currentChunk.length > GLOSSARY_AI_CHUNK_MAX_ROWS && splitLevel < maxSplitLevel;
                if (canSplit) {
                    queue.unshift(...splitGlossaryRetryChunk(currentChunk, currentFailed, splitLevel).reverse());
                    continue;
                }

                unrecovered.push({
                    ...currentFailed,
                    message: error.message || currentFailed?.message || '补跑仍失败'
                });
            }
        }

        return { recovered, unrecovered };
    }

    function isInvalidAiGlossarySource(term) {
        const value = cleanTermText(term);
        if (!value || value.length < 2 || value.length > 40) return true;
        if (!hasCjkText(value)) return true;
        if (/^[\d\s+\-*/.,%]+$/.test(value)) return true;
        if (/^\d+$/.test(value)) return true;
        if (/[。！？!?]$/.test(value) && value.length > 12) return true;
        if ((value.match(/[，。！？；：,.!?;:]/g) || []).length >= 3) return true;
        return false;
    }

    function splitReferenceList(value) {
        return String(value || '')
            .split(/[;,，；\s]+/)
            .map(item => item.trim())
            .filter(Boolean);
    }

    function mergeReferenceList(...values) {
        const seen = new Set();
        const merged = [];
        values.flatMap(splitReferenceList).forEach(item => {
            if (seen.has(item)) return;
            seen.add(item);
            merged.push(item);
        });
        return merged.slice(0, 12).join('; ');
    }

    function getTermReferenceInfo(source, records) {
        const matched = records.filter(record => record.sourceText.includes(source));
        const referenceIds = matched.map(record => record.referenceId || record.id || `行${record.rowNumber}`);
        const rows = matched.map(record => `行${record.rowNumber}`);
        const targets = matched
            .map(record => record.targetText)
            .filter(target => target && hasLatinText(target));

        return {
            count: matched.length,
            referenceId: mergeReferenceList(referenceIds),
            referenceRows: mergeReferenceList(rows),
            target: targets[0] || ''
        };
    }

    function normalizeAiGlossaryTerm(item, allRecords, fullText) {
        const source = cleanTermText(item.source || item.term || '');
        if (isInvalidAiGlossarySource(source)) return null;

        const referenceInfo = getTermReferenceInfo(source, allRecords);
        const confidence = Number(item.confidence ?? item.score ?? 0);
        const recommendedTarget = cleanTermText(item.target || item.translation || item.recommendedTranslation || referenceInfo.target || '');
        const originalTranslation = cleanTermText(item.originalTranslation || item.currentTarget || item.originalTarget || item.observedTarget || referenceInfo.target || '');
        const qualitySuggestion = cleanTermText(item.qualitySuggestion || item.suggestion || item.recommendedFix || '');
        const finalTranslation = cleanTermText(item.finalTranslation || item.finalTarget || item.revisedTarget || item.fixedTarget || item.correctedTranslation || '') ||
            (qualitySuggestion && hasLatinText(qualitySuggestion) && qualitySuggestion.length <= 80 ? qualitySuggestion : '') ||
            recommendedTarget ||
            originalTranslation;

        return {
            term: source,
            translation: recommendedTarget,
            type: cleanTermText(item.type || item.category || classifyProfessionalTerm(source)) || '游戏术语',
            count: Math.max(1, getTermOccurrenceCount(fullText, source), referenceInfo.count || 0),
            confidence: Number.isFinite(confidence) && confidence > 0 ? Math.max(1, Math.min(100, Math.round(confidence))) : 75,
            note: cleanTermText(item.reason || item.note || item.description || 'AI 全文提炼'),
            extractionSource: 'ai-full-v2',
            referenceId: cleanTermText(item.referenceId || item.id || referenceInfo.referenceId || ''),
            referenceRows: cleanTermText(item.referenceRows || item.rows || referenceInfo.referenceRows || ''),
            originalTranslation,
            finalTranslation,
            qualityStatus: cleanTermText(item.qualityStatus || item.qaStatus || '需确认'),
            qualityIssues: cleanTermText(Array.isArray(item.qualityIssues) ? item.qualityIssues.join('; ') : (item.qualityIssues || item.issues || '')),
            qualitySuggestion
        };
    }

    function mergeAiGlossaryTerms(terms) {
        const map = new Map();

        terms.forEach(term => {
            const key = normalizeTermKey(term.term);
            if (!key) return;

            const existing = map.get(key);
            if (!existing) {
                map.set(key, { ...term });
                return;
            }

            existing.count = Math.max(Number(existing.count || 0), Number(term.count || 0));
            existing.confidence = Math.max(Number(existing.confidence || 0), Number(term.confidence || 0));
            existing.referenceId = mergeReferenceList(existing.referenceId, term.referenceId);
            existing.referenceRows = mergeReferenceList(existing.referenceRows, term.referenceRows);
            existing.extractionBatch = mergeReferenceList(existing.extractionBatch, term.extractionBatch);
            existing.note = existing.note || term.note;
            existing.qualityIssues = mergeReferenceList(existing.qualityIssues, term.qualityIssues);
            existing.qualitySuggestion = existing.qualitySuggestion || term.qualitySuggestion;
            existing.originalTranslation = existing.originalTranslation || term.originalTranslation;
            existing.finalTranslation = existing.finalTranslation || term.finalTranslation;

            if (!existing.translation && term.translation) existing.translation = term.translation;
            if (!existing.type || existing.type === '游戏术语') existing.type = term.type || existing.type;
            if (existing.qualityStatus === '通过' && term.qualityStatus && term.qualityStatus !== '通过') {
                existing.qualityStatus = term.qualityStatus;
            }
        });

        return [...map.values()].sort((a, b) => {
            const issueScore = status => status === '有问题' ? 2 : status === '需确认' ? 1 : 0;
            return (issueScore(b.qualityStatus) - issueScore(a.qualityStatus)) ||
                (b.confidence - a.confidence) ||
                (b.count - a.count) ||
                String(a.term).localeCompare(String(b.term), 'zh-CN');
        });
    }

function isTemporaryGlossaryApiError(error) {
    const text = `${error?.message || ''} ${error?.rawText || ''} ${JSON.stringify(error?.payload || '')}`;
    return error?.status === 429 ||
        error?.status === 500 ||
        error?.status === 502 ||
        error?.status === 503 ||
        error?.isRateLimited ||
        error?.isEmptyEndTurn ||
        /接口返回为空|empty response|finish_reason:\s*end_turn|stop_reason:\s*end_turn/i.test(text) ||
        /UNAVAILABLE|high demand|temporar|try again|overloaded|rate.?limit|quota/i.test(text);
}

    async function requestGlossaryAiBatch(apiConfig, body, batchLabel, options = {}) {
        const retryDelays = options.retryDelays || [5000, 15000];
        const taskState = options.taskState || glossaryTaskState;
        const signal = options.signal || taskState?.signal || null;
        let lastError = null;

        for (let attempt = 0; attempt <= retryDelays.length; attempt++) {
            try {
                await waitGlossaryIfPaused(taskState);
                assertGlossaryTaskActive(taskState);
                return await requestModelContent(apiConfig, body, signal);
            } catch (error) {
                lastError = error;
                if (isGlossaryAbortError(error) || signal?.aborted || taskState?.cancelled) {
                    throw createGlossaryAbortError();
                }
                if (attempt >= retryDelays.length || !isTemporaryGlossaryApiError(error)) {
                    throw error;
                }

                const retryAfter = Number(error.retryAfterMs || 0);
                const waitMs = Math.max(retryDelays[attempt], retryAfter);
                setStatus(
                    'processing',
                    `AI 通道繁忙，等待重试... (${batchLabel})`,
                    `第 ${attempt + 1} 次重试将在 ${Math.ceil(waitMs / 1000)} 秒后进行，当前进度会保留`
                );
                await sleepGlossary(waitMs, taskState);
            }
        }

        throw lastError;
    }

    async function runGlossaryAiChunk({ chunk, index, totalChunks, sourceRecords, fullText, apiConfig, model, retryDelays, phaseLabel, maxTokens = GLOSSARY_AI_MAX_TOKENS, taskState = glossaryTaskState }) {
        await waitGlossaryIfPaused(taskState);
        assertGlossaryTaskActive(taskState);
        const promptParts = buildGlossaryAiPromptParts(chunk, index, totalChunks);
        const resultText = await requestGlossaryAiBatch(apiConfig, {
            model,
            messages: [
                { role: 'system', content: promptParts.systemPrompt, cacheControl: true },
                { role: 'user', content: promptParts.userPrompt }
            ],
            prompt_cache_key: promptParts.cacheKey,
            temperature: 0.1,
            max_tokens: maxTokens
        }, `${phaseLabel || ''}${index + 1}/${totalChunks}`, { retryDelays, taskState });

        const aiTerms = parseGlossaryAiResult(resultText);
        const normalizedTerms = [];
        aiTerms.forEach(item => {
            const normalized = normalizeAiGlossaryTerm(item, sourceRecords, fullText);
            if (normalized) {
                normalizedTerms.push({
                    ...normalized,
                    extractionBatch: index + 1
                });
            }
        });

        return { aiTerms, normalizedTerms };
    }

    async function processGlossaryChunksConcurrently({ chunks, batchInfos, sourceRecords, fullText, apiConfig, model, settings, taskState = glossaryTaskState }) {
        const totalChunks = Math.max(1, chunks.length);
        const allTerms = [];
        const successfulBatches = [];
        const failedBatches = [];
        const concurrency = Math.max(1, Math.min(settings.concurrency || 1, totalChunks));
        let completed = 0;
        let nextIndex = 0;

        updateGlossaryProgress(
            0,
            totalChunks,
            `AI 正在全文提炼术语... (0/${totalChunks})`,
            `${settings.label}：并发 ${concurrency}，每批最多 ${settings.maxRows} 行。模型直接阅读原文/译文行并同步检查术语质量`
        );

        async function worker() {
            while (nextIndex < totalChunks) {
                await waitGlossaryIfPaused(taskState);
                assertGlossaryTaskActive(taskState);
                const index = nextIndex;
                nextIndex++;
                const chunk = chunks[index] || [];
                const batchInfo = batchInfos[index];

                try {
                    const result = await runGlossaryAiChunk({
                        chunk,
                        index,
                        totalChunks,
                        sourceRecords,
                        fullText,
                        apiConfig,
                        model,
                        retryDelays: settings.retryDelays || [5000],
                        phaseLabel: '',
                        maxTokens: settings.maxTokens,
                        taskState
                    });

                    successfulBatches.push({
                        ...batchInfo,
                        termCount: result.aiTerms.length
                    });
                    allTerms.push(...result.normalizedTerms);
                } catch (error) {
                    if (isGlossaryAbortError(error) || taskState?.cancelled) {
                        throw createGlossaryAbortError();
                    }
                    failedBatches.push({
                        index,
                        ...batchInfo,
                        message: error.message || 'AI 通道临时不可用'
                    });
                    console.warn('Glossary AI batch failed after retries:', index + 1, error);
                } finally {
                    completed++;
                    updateGlossaryProgress(
                        completed,
                        totalChunks,
                        `AI 正在全文提炼术语... (${completed}/${totalChunks})`,
                        failedBatches.length > 0
                            ? `已有 ${failedBatches.length} 个批次暂时失败，主流程会继续，结束后只补跑失败批次`
                            : `${settings.label}运行中：并发 ${concurrency}，已合并 ${allTerms.length} 条候选术语`
                    );
                    if (settings.settleDelayMs > 0) {
                        await sleepGlossary(settings.settleDelayMs, taskState);
                    }
                }
            }
        }

        const workerResults = await Promise.allSettled(Array.from({ length: concurrency }, () => worker()));
        const unexpectedError = workerResults
            .filter(result => result.status === 'rejected')
            .map(result => result.reason)
            .find(error => !isGlossaryAbortError(error));
        if (unexpectedError) throw unexpectedError;

        const sortByBatchNumber = (a, b) => Number.parseFloat(a.batch || 0) - Number.parseFloat(b.batch || 0);
        successfulBatches.sort(sortByBatchNumber);
        failedBatches.sort(sortByBatchNumber);
        return {
            allTerms,
            successfulBatches,
            failedBatches,
            cancelled: Boolean(taskState?.cancelled || taskState?.signal?.aborted)
        };
    }

    async function refineTermsWithAI(records, ruleTerms, fullText, apiConfig, model, taskState = glossaryTaskState) {
        const sourceRecords = Array.isArray(records) ? records : [];
        const speedSettings = getGlossarySpeedSettings(apiConfig, model);
        const chunks = chunkGlossaryRecords(sourceRecords, speedSettings.maxChars, speedSettings.maxRows);
        const totalChunks = Math.max(1, chunks.length);
        const recoveredBatches = [];
        const batchInfos = chunks.map((chunk, index) => buildGlossaryBatchInfo(chunk, index));
        const { allTerms, successfulBatches, failedBatches, cancelled } = await processGlossaryChunksConcurrently({
            chunks,
            batchInfos,
            sourceRecords,
            fullText,
            apiConfig,
            model,
            settings: speedSettings,
            taskState
        });

        const unrecoveredBatches = [];
        if (failedBatches.length > 0 && !cancelled) {
            setStatus(
                'processing',
                '主流程完成，正在补跑失败批次',
                `将只补跑 ${failedBatches.length} 个失败批次，最多 1 轮，避免重复消耗 token`
            );

            for (let retryIndex = 0; retryIndex < failedBatches.length; retryIndex++) {
                const failed = failedBatches[retryIndex];
                const chunk = chunks[failed.index] || [];
                setStatus(
                    'processing',
                    `正在补跑失败批次 ${failed.batch} (${retryIndex + 1}/${failedBatches.length})`,
                    `行 ${failed.rowStart || '-'} - ${failed.rowEnd || '-'}，失败会自动拆成更小批次重跑`
                );

                try {
                    const retryResult = await retryGlossaryChunkWithAutoSplit({
                        chunk,
                        totalChunks,
                        sourceRecords,
                        fullText,
                        apiConfig,
                        model,
                        retryDelays: getGlossaryRecoveryRetryDelays(speedSettings),
                        phaseLabel: '补跑 ',
                        maxTokens: speedSettings.maxTokens,
                        taskState,
                        failed,
                        onRecovered: (result, recoveredBatch) => {
                            recoveredBatches.push(recoveredBatch);
                            successfulBatches.push({
                                ...recoveredBatch,
                                recovered: true
                            });
                            allTerms.push(...result.normalizedTerms);
                        }
                    });
                    unrecoveredBatches.push(...retryResult.unrecovered);
                } catch (error) {
                    if (isGlossaryAbortError(error)) {
                        throw error;
                    }
                    unrecoveredBatches.push({
                        ...failed,
                        message: error.message || failed.message || '补跑仍失败'
                    });
                }

                await sleepGlossary(300, taskState);
            }
        }

        const aiResult = mergeAiGlossaryTerms(allTerms)
            .filter(term => term.confidence >= 45 || term.qualityStatus === '有问题' || term.count >= 1);

        if (unrecoveredBatches.length > 0) {
            setStatus(
                'processing',
                '术语提取已完成可用批次',
                `仍有 ${unrecoveredBatches.length} 个批次补跑失败：${unrecoveredBatches.slice(0, 8).map(item => item.batch).join(', ')}${unrecoveredBatches.length > 8 ? '...' : ''}`
            );
        }

        currentGlossaryRunMeta = {
            mode: 'ai',
            model,
            provider: apiConfig?.provider || '',
            speedMode: speedSettings.mode,
            resolvedSpeedMode: speedSettings.resolvedMode,
            speedLabel: speedSettings.label,
            chunkMaxRows: speedSettings.maxRows,
            chunkMaxChars: speedSettings.maxChars,
            concurrency: speedSettings.concurrency,
            maxTokens: speedSettings.maxTokens,
            sourceFileName,
            totalRecords: sourceRecords.length,
            totalBatches: totalChunks,
            successfulBatches,
            recoveredBatches,
            failedBatches: unrecoveredBatches,
            cancelled,
            createdAt: new Date().toISOString()
        };

        if (cancelled && aiResult.length > 0) return aiResult;
        if (cancelled) {
            throw createGlossaryAbortError();
        }
        if (aiResult.length > 0) return aiResult;
        if (unrecoveredBatches.length > 0) {
            throw new Error(`AI 通道持续繁忙，${unrecoveredBatches.length} 个批次未成功。请稍后重试，或换用更稳定/额度更高的模型通道。`);
        }
        return mergeGlossaryTermLists([], ruleTerms || []);
    }

    function mergeGlossaryTermLists(primary, fallback) {
        const map = new Map();
        [...primary, ...fallback].forEach(term => {
            const key = normalizeTermKey(term.term || term.source);
            if (!key) return;
            const existing = map.get(key);
            const normalized = {
                term: term.term || term.source,
                translation: term.translation || term.target || '',
                type: term.type || '游戏术语',
                count: Number(term.count || 1),
                confidence: Number(term.confidence || 0),
                note: term.note || term.reason || '',
                extractionSource: term.extractionSource || ''
            };
            if (!existing || normalized.confidence > existing.confidence) {
                map.set(key, normalized);
            }
        });
        return [...map.values()].sort((a, b) => (b.confidence - a.confidence) || (b.count - a.count));
    }

    async function readGlossarySourceFile(file) {
        const { rows, text } = await readSpreadsheetRows(file);
        return { rows, text };
    }

    function normalizeEntryToEditableTerms(entry) {
        return normalizeGlossaryTerms(entry.terms).map(term => ({
            term: term.source,
            type: term.type || guessTermType(term.source),
            count: term.count || 1,
            translation: term.target || '',
            confidence: term.confidence || 0,
            note: term.note || '',
            extractionSource: term.extractionSource || '',
            extractionBatch: term.extractionBatch || '',
            referenceId: term.referenceId || '',
            referenceRows: term.referenceRows || '',
            originalTranslation: term.originalTranslation || '',
            finalTranslation: term.finalTranslation || term.target || '',
            qualityStatus: term.qualityStatus || '',
            qualityIssues: term.qualityIssues || '',
            qualitySuggestion: term.qualitySuggestion || ''
        }));
    }

    function renderGlossaryLibrary() {
        const library = loadGlossaryLibrary();
        libraryCount.textContent = `${library.length} 个`;
        libraryList.innerHTML = '';

        if (library.length === 0) {
            libraryList.innerHTML = '<div class="resource-empty">暂无已保存术语表。上传已有术语表或提取术语后，会自动记录在这里。</div>';
            return;
        }

        library.forEach(entry => {
            const entryTerms = normalizeGlossaryTerms(entry.terms);
            const confidenceTerms = entryTerms.filter(term => Number(term.confidence) > 0);
            const averageConfidence = confidenceTerms.length
                ? Math.round(confidenceTerms.reduce((sum, term) => sum + Number(term.confidence || 0), 0) / confidenceTerms.length)
                : 0;
            const displayName = entry.name || entry.sourceFileName || '未命名术语表';
            const item = document.createElement('div');
            item.className = 'glossary-library-item';
            item.innerHTML = `
                <div class="glossary-library-main">
                    <div class="glossary-library-title">
                        <strong title="${escapeAttribute(displayName)}">${escapeHtml(displayName)}</strong>
                        <span class="glossary-origin-tag">${getGlossaryOriginLabel(entry.origin)}</span>
                    </div>
                    <div class="glossary-library-meta">
                        ${entryTerms.length} 条术语${averageConfidence ? ` · 平均置信度 ${averageConfidence}%` : ''} · 更新 ${formatGlossaryTime(entry.updatedAt)}${entry.sourceFileName ? ` · ${escapeHtml(entry.sourceFileName)}` : ''}
                    </div>
                </div>
                <div class="glossary-library-actions">
                    <button class="action-btn secondary mini" type="button" data-action="view">查看</button>
                    <button class="action-btn secondary mini" type="button" data-action="download">下载</button>
                    <button class="action-btn mini danger" type="button" data-action="delete">删除</button>
                </div>
            `;

            item.querySelector('[data-action="view"]').addEventListener('click', () => openSavedGlossary(entry));
            item.querySelector('[data-action="download"]').addEventListener('click', () => downloadSavedGlossary(entry));
            item.querySelector('[data-action="delete"]').addEventListener('click', () => deleteSavedGlossary(entry));

            libraryList.appendChild(item);
        });
    }

    function openSavedGlossary(entry) {
        terms = normalizeEntryToEditableTerms(entry);
        sourceFileName = entry.sourceFileName || entry.name || '已保存术语表';
        currentGlossaryName = entry.name || sourceFileName;
        currentGlossaryId = entry.id || '';
        currentGlossaryOrigin = entry.origin || 'uploaded';
        currentGlossaryRunMeta = entry.runMeta || null;

        displayTerms();
        setStatus('success', '已打开术语表', `${currentGlossaryName} · ${terms.length} 条术语`);
        infoPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function deleteSavedGlossary(entry) {
        const displayName = entry.name || entry.sourceFileName || '未命名术语表';
        const confirmed = confirm(`确定删除术语表“${displayName}”吗？本地化检测中也会同步移除。`);
        if (!confirmed) return;

        const library = loadGlossaryLibrary().filter(item => item.id !== entry.id);
        saveGlossaryLibrary(library);
        document.dispatchEvent(new CustomEvent('nexus:glossary-library-updated'));

        if (currentGlossaryId === entry.id) {
            terms = [];
            sourceFileName = '';
            currentGlossaryName = '';
            currentGlossaryId = '';
            currentGlossaryOrigin = 'uploaded';
            infoPanel.style.display = 'none';
            termsSection.style.display = 'none';
        }

        setStatus('success', '术语表已删除', `${displayName} 已从本地术语表库移除`);
    }

    function buildGlossaryCsvRows(glossaryTerms) {
        return [
            ['定位ID/Key', '定位行号', '提取批次', '原文术语（中文）', '原译文/当前译法', '指定译文（英文）', '整理后译文（可直接使用）', '类型', '出现次数', '置信度', '术语质量状态', '术语问题', '修正建议', '提取依据', '提取来源'],
            ...glossaryTerms.map(term => [
                term.referenceId || '',
                term.referenceRows || '',
                term.extractionBatch || '',
                term.term,
                term.originalTranslation || '',
                term.translation || '',
                term.finalTranslation || term.translation || term.originalTranslation || '',
                term.type,
                term.count,
                term.confidence || '',
                term.qualityStatus || '',
                term.qualityIssues || '',
                term.qualitySuggestion || '',
                term.note || '',
                term.extractionSource || ''
            ])
        ];
    }

    function buildFilteredGlossaryTermsFromReview(reviewResult) {
        if (!reviewResult) return [];
        return (reviewResult.finalTerms || reviewResult.keptTerms || []).map(term => ({
            ...term,
            extractionSource: term.extractionSource || 'review-import',
            reviewDecision: 'keep'
        }));
    }

    function buildGlossaryRunReportRows(runMeta = currentGlossaryRunMeta) {
        if (!runMeta) return [];

        const rows = [
            ['报告类型', '字段', '值'],
            ['summary', 'sourceFileName', runMeta.sourceFileName || sourceFileName || ''],
            ['summary', 'provider', runMeta.provider || ''],
            ['summary', 'model', runMeta.model || ''],
            ['summary', 'speedMode', runMeta.speedMode || ''],
            ['summary', 'resolvedSpeedMode', runMeta.resolvedSpeedMode || ''],
            ['summary', 'speedLabel', runMeta.speedLabel || ''],
            ['summary', 'chunkMaxRows', runMeta.chunkMaxRows || ''],
            ['summary', 'chunkMaxChars', runMeta.chunkMaxChars || ''],
            ['summary', 'concurrency', runMeta.concurrency || ''],
            ['summary', 'maxTokens', runMeta.maxTokens || ''],
            ['summary', 'totalRecords', runMeta.totalRecords || 0],
            ['summary', 'totalBatches', runMeta.totalBatches || 0],
            ['summary', 'successfulBatches', runMeta.successfulBatches?.length || 0],
            ['summary', 'recoveredBatches', runMeta.recoveredBatches?.length || 0],
            ['summary', 'failedBatches', runMeta.failedBatches?.length || 0],
            ['summary', 'createdAt', runMeta.createdAt || '']
        ];

        rows.push([]);
        rows.push(['批次状态', '批次', '起始行', '结束行', '行数', '起始ID/Key', '结束ID/Key', '术语数', '失败原因']);

        (runMeta.successfulBatches || []).forEach(batch => {
            rows.push([
                'success',
                batch.batch,
                batch.rowStart,
                batch.rowEnd,
                batch.rowCount,
                batch.referenceStart,
                batch.referenceEnd,
                batch.termCount || 0,
                batch.recovered ? '补跑成功' : ''
            ]);
        });

        (runMeta.failedBatches || []).forEach(batch => {
            rows.push([
                'failed',
                batch.batch,
                batch.rowStart,
                batch.rowEnd,
                batch.rowCount,
                batch.referenceStart,
                batch.referenceEnd,
                '',
                batch.message || ''
            ]);
        });

        return rows;
    }

    function mapParsedGlossaryTermsToEditable(parsedTerms, origin = '') {
        return parsedTerms.map(term => ({
            term: term.source,
            type: term.type || guessTermType(term.source),
            count: term.count || 1,
            translation: term.target || '',
            confidence: term.confidence || 0,
            note: term.note || '',
            extractionSource: term.extractionSource || origin,
            extractionBatch: term.extractionBatch || '',
            referenceId: term.referenceId || '',
            referenceRows: term.referenceRows || '',
            originalTranslation: term.originalTranslation || '',
            finalTranslation: term.finalTranslation || term.target || '',
            qualityStatus: term.qualityStatus || '',
            qualityIssues: term.qualityIssues || '',
            qualitySuggestion: term.qualitySuggestion || ''
        }));
    }

    function normalizeEditableTermsToAiTerms(editableTerms) {
        return (editableTerms || []).map(term => ({
            ...term,
            term: term.term || term.source || '',
            translation: term.translation || term.target || '',
            type: term.type || '',
            count: term.count || 1,
            confidence: term.confidence || 0,
            note: term.note || '',
            extractionSource: term.extractionSource || '',
            extractionBatch: term.extractionBatch || '',
            referenceId: term.referenceId || '',
            referenceRows: term.referenceRows || '',
            originalTranslation: term.originalTranslation || '',
            finalTranslation: term.finalTranslation || term.translation || term.target || '',
            qualityStatus: term.qualityStatus || '',
            qualityIssues: term.qualityIssues || '',
            qualitySuggestion: term.qualitySuggestion || ''
        })).filter(term => term.term);
    }

    function parseGlossaryRunReportRows(rows) {
        if (!Array.isArray(rows) || rows.length === 0) {
            throw new Error('运行报告为空，请上传下载术语表时生成的 *_run_report.csv');
        }

        const runMeta = {
            mode: 'ai',
            successfulBatches: [],
            recoveredBatches: [],
            failedBatches: []
        };
        let batchHeader = null;
        const summaryKeyAliases = {
            sourcefilename: 'sourceFileName',
            provider: 'provider',
            model: 'model',
            speedmode: 'speedMode',
            resolvedspeedmode: 'resolvedSpeedMode',
            speedlabel: 'speedLabel',
            chunkmaxrows: 'chunkMaxRows',
            chunkmaxchars: 'chunkMaxChars',
            concurrency: 'concurrency',
            maxtokens: 'maxTokens',
            totalrecords: 'totalRecords',
            totalbatches: 'totalBatches',
            createdat: 'createdAt'
        };
        const batchHeaderAliases = {
            status: ['批次状态', 'status', 'batch status'],
            batch: ['批次', 'batch'],
            rowStart: ['起始行', 'rowstart', 'row start', 'start row'],
            rowEnd: ['结束行', 'rowend', 'row end', 'end row'],
            rowCount: ['行数', 'rowcount', 'row count'],
            referenceStart: ['起始id/key', '起始id', '起始key', 'referencestart', 'reference start'],
            referenceEnd: ['结束id/key', '结束id', '结束key', 'referenceend', 'reference end'],
            termCount: ['术语数', 'termcount', 'term count'],
            message: ['失败原因', 'message', 'error', 'reason']
        };

        const normalizeHeader = value => String(value || '').trim().toLowerCase().replace(/\s+/g, '');
        const pickCell = (row, index) => index >= 0 && row[index] !== undefined ? String(row[index]).trim() : '';

        rows.forEach(row => {
            const cells = (row || []).map(cell => String(cell ?? '').trim());
            if (cells.every(cell => !cell)) return;
            const first = normalizeHeader(cells[0]);

            if (first === 'summary') {
                const key = summaryKeyAliases[normalizeHeader(cells[1])];
                if (!key) return;
                const rawValue = cells[2] || '';
                runMeta[key] = ['chunkMaxRows', 'chunkMaxChars', 'concurrency', 'maxTokens', 'totalRecords', 'totalBatches'].includes(key)
                    ? Number(rawValue) || 0
                    : rawValue;
                return;
            }

            const normalizedCells = cells.map(normalizeHeader);
            const looksLikeBatchHeader = normalizedCells.some(cell => cell.includes('批次状态') || cell === 'status' || cell.includes('batchstatus')) &&
                normalizedCells.some(cell => cell === '批次' || cell === 'batch');
            if (looksLikeBatchHeader) {
                batchHeader = {};
                Object.entries(batchHeaderAliases).forEach(([key, aliases]) => {
                    batchHeader[key] = normalizedCells.findIndex(cell => aliases.some(alias => normalizeHeader(alias) === cell));
                });
                return;
            }

            if (!batchHeader) return;
            const status = pickCell(cells, batchHeader.status).toLowerCase();
            if (!status || !['success', 'failed'].includes(status)) return;

            const batch = {
                batch: pickCell(cells, batchHeader.batch),
                rowStart: Number(pickCell(cells, batchHeader.rowStart)) || '',
                rowEnd: Number(pickCell(cells, batchHeader.rowEnd)) || '',
                rowCount: Number(pickCell(cells, batchHeader.rowCount)) || 0,
                referenceStart: pickCell(cells, batchHeader.referenceStart),
                referenceEnd: pickCell(cells, batchHeader.referenceEnd),
                termCount: Number(pickCell(cells, batchHeader.termCount)) || 0,
                message: pickCell(cells, batchHeader.message)
            };
            const batchNumber = Number.parseFloat(batch.batch);
            if (Number.isFinite(batchNumber)) {
                batch.index = Math.max(0, Math.floor(batchNumber) - 1);
            }

            if (status === 'failed') {
                runMeta.failedBatches.push(batch);
            } else {
                runMeta.successfulBatches.push({
                    ...batch,
                    recovered: /补跑|recovered/i.test(batch.message || '')
                });
            }
        });

        runMeta.totalBatches = runMeta.totalBatches || (runMeta.successfulBatches.length + runMeta.failedBatches.length);
        runMeta.updatedAt = new Date().toISOString();

        if (runMeta.failedBatches.length === 0 && runMeta.successfulBatches.length === 0) {
            throw new Error('未在运行报告中识别到批次状态，请确认上传的是 *_run_report.csv');
        }

        return runMeta;
    }

    function parsePolishRunReportRows(rows) {
        if (!Array.isArray(rows) || rows.length === 0) {
            throw new Error('AI润色报告为空，请上传 *_polish_report.csv');
        }

        const runMeta = {
            reportKind: 'polish',
            successfulBatches: [],
            failedBatches: [],
            polishedRows: []
        };
        let section = '';
        let resultHeader = null;
        let batchHeader = null;
        const normalizeHeader = value => String(value || '').trim().toLowerCase().replace(/\s+/g, '');
        const pickCell = (row, index) => index >= 0 && row[index] !== undefined ? String(row[index]).trim() : '';
        const summaryKeyAliases = {
            reportkind: 'reportKind',
            sourcefilename: 'sourceFileName',
            glossaryname: 'glossaryName',
            provider: 'provider',
            model: 'model',
            chunksize: 'chunkSize',
            totaltasks: 'totalTasks',
            totalbatches: 'totalBatches',
            createdat: 'createdAt',
            updatedat: 'updatedAt'
        };

        rows.forEach(row => {
            const cells = (row || []).map(cell => String(cell ?? '').trim());
            if (cells.every(cell => !cell)) return;
            const first = normalizeHeader(cells[0]);

            if (first === 'summary') {
                const key = summaryKeyAliases[normalizeHeader(cells[1])];
                if (!key) return;
                const rawValue = cells[2] || '';
                runMeta[key] = ['chunkSize', 'totalTasks', 'totalBatches'].includes(key)
                    ? Number(rawValue) || 0
                    : rawValue;
                return;
            }

            const normalizedCells = cells.map(normalizeHeader);
            if (normalizedCells.includes('润色结果') || normalizedCells.includes('polishresult')) {
                section = 'results';
                resultHeader = {
                    referenceId: normalizedCells.findIndex(cell => ['定位id/key', '定位id', '定位key', 'referenceid'].includes(cell)),
                    rowNumber: normalizedCells.findIndex(cell => ['定位行号', '行号', 'rownumber', 'row'].includes(cell)),
                    originalTarget: normalizedCells.findIndex(cell => ['原译文', 'originaltarget', 'originaltranslation'].includes(cell)),
                    finalText: normalizedCells.findIndex(cell => ['ai润色修正译文', '修正后译文', 'finaltext', 'finaltarget'].includes(cell)),
                    reason: normalizedCells.findIndex(cell => ['修正说明', 'reason', 'note'].includes(cell))
                };
                return;
            }

            if (normalizedCells.includes('批次状态') || normalizedCells.includes('batchstatus')) {
                section = 'batches';
                batchHeader = {
                    status: normalizedCells.findIndex(cell => ['批次状态', 'status', 'batchstatus'].includes(cell)),
                    batch: normalizedCells.findIndex(cell => ['批次', 'batch'].includes(cell)),
                    rowStart: normalizedCells.findIndex(cell => ['起始行', 'rowstart', 'startrow'].includes(cell)),
                    rowEnd: normalizedCells.findIndex(cell => ['结束行', 'rowend', 'endrow'].includes(cell)),
                    rowCount: normalizedCells.findIndex(cell => ['行数', 'rowcount'].includes(cell)),
                    referenceStart: normalizedCells.findIndex(cell => ['起始id/key', '起始id', '起始key', 'referencestart'].includes(cell)),
                    referenceEnd: normalizedCells.findIndex(cell => ['结束id/key', '结束id', '结束key', 'referenceend'].includes(cell)),
                    polishedCount: normalizedCells.findIndex(cell => ['成功行数', 'polishedcount'].includes(cell)),
                    message: normalizedCells.findIndex(cell => ['失败原因', 'message', 'error', 'reason'].includes(cell))
                };
                return;
            }

            if (section === 'results' && resultHeader && (first === 'polished' || Number.isFinite(Number(cells[resultHeader.rowNumber])))) {
                const rowNumber = Number(pickCell(cells, resultHeader.rowNumber));
                const finalText = pickCell(cells, resultHeader.finalText);
                if (!Number.isFinite(rowNumber) || !finalText) return;
                runMeta.polishedRows.push({
                    rowNumber,
                    referenceId: pickCell(cells, resultHeader.referenceId),
                    originalTarget: pickCell(cells, resultHeader.originalTarget),
                    finalText,
                    reason: pickCell(cells, resultHeader.reason)
                });
                return;
            }

            if (section === 'batches' && batchHeader) {
                const status = pickCell(cells, batchHeader.status).toLowerCase();
                if (!['success', 'failed'].includes(status)) return;
                const batch = {
                    batch: pickCell(cells, batchHeader.batch),
                    rowStart: Number(pickCell(cells, batchHeader.rowStart)) || '',
                    rowEnd: Number(pickCell(cells, batchHeader.rowEnd)) || '',
                    rowCount: Number(pickCell(cells, batchHeader.rowCount)) || 0,
                    referenceStart: pickCell(cells, batchHeader.referenceStart),
                    referenceEnd: pickCell(cells, batchHeader.referenceEnd),
                    polishedCount: Number(pickCell(cells, batchHeader.polishedCount)) || 0,
                    message: pickCell(cells, batchHeader.message)
                };
                if (status === 'failed') {
                    runMeta.failedBatches.push(batch);
                } else {
                    runMeta.successfulBatches.push(batch);
                }
            }
        });

        if (runMeta.reportKind && runMeta.reportKind !== 'polish') {
            throw new Error('这不是 AI润色运行报告，请上传 *_polish_report.csv');
        }
        if (runMeta.polishedRows.length === 0 && runMeta.failedBatches.length === 0) {
            throw new Error('未在报告中识别到AI润色结果或失败批次');
        }
        runMeta.totalBatches = runMeta.totalBatches || (runMeta.successfulBatches.length + runMeta.failedBatches.length);
        runMeta.updatedAt = new Date().toISOString();
        return runMeta;
    }

    async function restoreGlossaryRunFromFiles() {
        if (glossaryTaskState?.running) {
            setStatus('warning', '已有术语任务正在运行', '请先暂停或取消当前任务，再恢复上次失败补跑');
            return;
        }
        const { terms: termsFile, report: reportFile, source: sourceFile } = glossaryRestoreFiles;
        if (!termsFile || !reportFile || !sourceFile) {
            setStatus('warning', '恢复文件不完整', '请同时上传旧术语表、运行报告和同一份原文件');
            updateGlossaryRestoreState();
            return;
        }

        restoreGlossaryRunBtn.disabled = true;
        restoreGlossaryRunBtn.textContent = '正在载入...';
        if (restoreStatus) {
            restoreStatus.textContent = '正在读取三份文件并恢复失败批次记录...';
            restoreStatus.className = 'upload-status info';
        }

        try {
            const termsRows = (await readSpreadsheetRows(termsFile)).rows;
            const reportRows = (await readSpreadsheetRows(reportFile)).rows;
            const sourceData = await readGlossarySourceFile(sourceFile);
            const restoredTerms = mapParsedGlossaryTermsToEditable(parseGlossaryTableRows(termsRows), 'restored');
            if (restoredTerms.length === 0) {
                throw new Error('旧术语表中没有识别到可恢复的术语，请上传之前导出的 *_glossary.csv');
            }

            const restoredRunMeta = parseGlossaryRunReportRows(reportRows);
            if (restoredRunMeta.failedBatches.length === 0) {
                throw new Error('运行报告里没有失败批次，不需要继续补跑');
            }

            sourceWorkbookContext = buildSourceWorkbookContext(sourceData.rows, sourceFile.name);
            if (!sourceWorkbookContext.records.length) {
                throw new Error('原文件中没有识别到可用于补跑的原文/译文行，请确认上传的是同一份源文件');
            }

            const missingBatches = restoredRunMeta.failedBatches
                .filter(batch => getRecordsForFailedBatch(batch).length === 0)
                .slice(0, 8)
                .map(batch => batch.batch)
                .join(', ');
            if (missingBatches) {
                throw new Error(`原文件无法定位部分失败批次行号：${missingBatches}。请确认原文件没有增删行，且与运行报告来自同一次提取。`);
            }

            terms = mergeAiGlossaryTerms(normalizeEditableTermsToAiTerms(restoredTerms));
            sourceFileName = sourceFile.name;
            currentGlossaryName = (restoredRunMeta.sourceFileName || sourceFile.name).replace(/\.(csv|xlsx|xls)$/i, '');
            currentGlossaryId = '';
            currentGlossaryOrigin = 'extracted';
            polishedRowPatches = new Map();
            currentPolishRunMeta = null;
            currentGlossaryRunMeta = {
                ...restoredRunMeta,
                sourceFileName,
                restoredFrom: {
                    glossaryFileName: termsFile.name,
                    reportFileName: reportFile.name,
                    sourceFileName: sourceFile.name,
                    restoredAt: new Date().toISOString()
                },
                cancelled: false
            };
            extractFile = sourceFile;

            const savedEntry = saveGlossaryEntry({
                name: currentGlossaryName || sourceFileName.replace(/\.(csv|xlsx|xls)$/i, ''),
                sourceFileName,
                terms,
                origin: currentGlossaryOrigin,
                runMeta: currentGlossaryRunMeta
            });
            if (savedEntry) {
                currentGlossaryId = savedEntry.id;
                currentGlossaryName = savedEntry.name;
            }

            displayTerms();
            updateRetryFailedGlossaryBatchesButton();
            if (restoreStatus) {
                restoreStatus.textContent = `已恢复 ${terms.length} 条旧术语和 ${currentGlossaryRunMeta.failedBatches.length} 个失败批次，可点击“补跑失败批次”继续。`;
                restoreStatus.className = 'upload-status success';
            }
            setStatus(
                'success',
                '已恢复上次失败补跑任务',
                `旧术语表 ${terms.length} 条已载入，失败批次 ${currentGlossaryRunMeta.failedBatches.length} 个。补跑成功后会自动合并到当前术语表。`
            );
            infoPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } catch (error) {
            if (restoreStatus) {
                restoreStatus.textContent = error.message || '恢复失败';
                restoreStatus.className = 'upload-status error';
            }
            setStatus('error', '恢复失败', error.message || '恢复文件无法识别');
        } finally {
            restoreGlossaryRunBtn.textContent = '载入并恢复补跑任务';
            updateGlossaryRestoreState();
        }
    }

    async function restorePolishRunFromFiles() {
        if (glossaryTaskState?.running) {
            setStatus('warning', '已有术语任务正在运行', '请先暂停或取消当前任务，再恢复 AI润色续跑');
            return;
        }
        const { terms: termsFile, report: reportFile, source: sourceFile } = glossaryRestoreFiles;
        if (!termsFile || !reportFile || !sourceFile) {
            setStatus('warning', '恢复文件不完整', '请同时上传旧术语表、AI润色报告和同一份原文件');
            updateGlossaryRestoreState();
            return;
        }

        restorePolishRunBtn.disabled = true;
        restorePolishRunBtn.textContent = '正在载入...';
        if (restoreStatus) {
            restoreStatus.textContent = '正在读取旧术语表、AI润色报告和原文件...';
            restoreStatus.className = 'upload-status info';
        }

        try {
            const termsRows = (await readSpreadsheetRows(termsFile)).rows;
            const reportRows = (await readSpreadsheetRows(reportFile)).rows;
            const sourceData = await readGlossarySourceFile(sourceFile);
            const restoredTerms = mapParsedGlossaryTermsToEditable(parseGlossaryTableRows(termsRows), 'restored');
            if (restoredTerms.length === 0) {
                throw new Error('旧术语表中没有识别到可恢复的术语，请上传对应的 *_glossary.csv');
            }

            const restoredPolishMeta = parsePolishRunReportRows(reportRows);
            sourceWorkbookContext = buildSourceWorkbookContext(sourceData.rows, sourceFile.name);
            if (!sourceWorkbookContext.records.length) {
                throw new Error('原文件中没有识别到可用于润色续跑的原文/译文行，请确认上传的是同一份源文件');
            }

            terms = mergeAiGlossaryTerms(normalizeEditableTermsToAiTerms(restoredTerms));
            sourceFileName = sourceFile.name;
            currentGlossaryName = (restoredPolishMeta.glossaryName || restoredPolishMeta.sourceFileName || sourceFile.name).replace(/\.(csv|xlsx|xls)$/i, '');
            currentGlossaryId = '';
            currentGlossaryOrigin = 'extracted';
            currentGlossaryRunMeta = null;
            polishedRowPatches = new Map();
            restoredPolishMeta.polishedRows.forEach(row => {
                const rowNumber = Number(row.rowNumber);
                if (!Number.isFinite(rowNumber) || !row.finalText) return;
                const record = sourceWorkbookContext.recordByRowNumber.get(rowNumber);
                polishedRowPatches.set(rowNumber, {
                    finalText: row.finalText,
                    reason: row.reason || '',
                    referenceId: row.referenceId || record?.referenceId || '',
                    originalTarget: row.originalTarget || record?.targetText || '',
                    sourceText: record?.sourceText || ''
                });
            });
            currentPolishRunMeta = {
                ...restoredPolishMeta,
                sourceFileName,
                glossaryName: currentGlossaryName,
                restoredFrom: {
                    glossaryFileName: termsFile.name,
                    reportFileName: reportFile.name,
                    sourceFileName: sourceFile.name,
                    restoredAt: new Date().toISOString()
                },
                polishedRows: [...polishedRowPatches.entries()].map(([rowNumber, patch]) => ({
                    rowNumber,
                    referenceId: patch.referenceId || '',
                    originalTarget: patch.originalTarget || '',
                    finalText: patch.finalText || '',
                    reason: patch.reason || ''
                }))
            };
            extractFile = sourceFile;

            const savedEntry = saveGlossaryEntry({
                name: currentGlossaryName || sourceFileName.replace(/\.(csv|xlsx|xls)$/i, ''),
                sourceFileName,
                terms,
                origin: currentGlossaryOrigin,
                runMeta: currentGlossaryRunMeta
            });
            if (savedEntry) {
                currentGlossaryId = savedEntry.id;
                currentGlossaryName = savedEntry.name;
            }

            displayTerms();
            updatePatchedDownloadButtonLabel();
            if (restoreStatus) {
                restoreStatus.textContent = `已恢复 ${polishedRowPatches.size} 条AI润色结果。点击“AI润色修正命中行”会继续处理未完成行。`;
                restoreStatus.className = 'upload-status success';
            }
            setStatus(
                'success',
                '已恢复AI润色续跑任务',
                `已载入 ${terms.length} 条旧术语和 ${polishedRowPatches.size} 条AI润色结果；再次点击 AI润色会跳过已完成行。`
            );
            infoPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } catch (error) {
            if (restoreStatus) {
                restoreStatus.textContent = error.message || 'AI润色恢复失败';
                restoreStatus.className = 'upload-status error';
            }
            setStatus('error', 'AI润色恢复失败', error.message || '恢复文件无法识别');
        } finally {
            restorePolishRunBtn.textContent = '载入AI润色续跑';
            updateGlossaryRestoreState();
        }
    }

    function downloadGlossaryRows(rows, fileName) {
        const ws = XLSX.utils.aoa_to_sheet(rows);
        const csvContent = XLSX.utils.sheet_to_csv(ws);
        const utf8Bytes = new TextEncoder().encode(csvContent);
        const blob = new Blob([utf8Bytes], { type: 'text/csv;charset=utf-8' });

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function downloadWorkbook(workbook, fileName) {
        downloadWorkbookFile(workbook, fileName);
    }

    function getEditableGlossaryTerms() {
        const translationInputs = document.querySelectorAll('.translation-input:not(.final-translation-input)');
        const finalTranslationInputs = document.querySelectorAll('.final-translation-input');
        return terms.map((term, index) => ({
            ...term,
            translation: translationInputs[index]?.value || term.translation || '',
            finalTranslation: finalTranslationInputs[index]?.value || term.finalTranslation || term.translation || term.originalTranslation || ''
        }));
    }

    function getTermPatchValue(term) {
        return cleanTermText(term.finalTranslation || term.translation || term.originalTranslation || '');
    }

    function shouldApplyTermPatch(term) {
        const patchValue = getTermPatchValue(term);
        if (!patchValue || !hasLatinText(patchValue)) return false;
        if (term.qualityStatus === '通过' && !term.qualityIssues) return false;
        return Boolean(term.qualityIssues || term.qualitySuggestion || term.qualityStatus === '有问题' || term.qualityStatus === '需确认');
    }

    function findRecordsForTerm(term, context = sourceWorkbookContext) {
        if (!context) return [];
        const matched = new Map();

        splitReferenceList(term.referenceRows).forEach(value => {
            const rowMatch = String(value).match(/\d+/);
            if (!rowMatch) return;
            const record = context.recordByRowNumber.get(Number(rowMatch[0]));
            if (record) matched.set(record.rowNumber, record);
        });

        splitReferenceList(term.referenceId).forEach(value => {
            const record = context.recordByReferenceId.get(value);
            if (record) matched.set(record.rowNumber, record);
        });

        if (matched.size === 0 && term.term) {
            context.records
                .filter(record => record.sourceText.includes(term.term))
                .forEach(record => matched.set(record.rowNumber, record));
        }

        return [...matched.values()];
    }

    function applyTermPatchesToText(originalText, patches) {
        let result = String(originalText || '');
        const applied = [];

        patches
            .filter(patch => patch.term && patch.value)
            .sort((a, b) => String(b.term).length - String(a.term).length)
            .forEach(patch => {
                const before = result;
                if (patch.originalTranslation && result.includes(patch.originalTranslation)) {
                    result = result.split(patch.originalTranslation).join(patch.value);
                } else if (patch.currentTranslation && result.includes(patch.currentTranslation)) {
                    result = result.split(patch.currentTranslation).join(patch.value);
                } else if (patch.term && result.includes(patch.term)) {
                    result = result.split(patch.term).join(patch.value);
                } else if (patch.value && result.trim() === '') {
                    result = patch.value;
                }

                if (result !== before) applied.push(patch);
            });

        return { text: result, applied };
    }

    function collectTermPatchMap(editableTerms, context = sourceWorkbookContext) {
        const patchMap = new Map();
        if (!context) return patchMap;

        editableTerms.filter(shouldApplyTermPatch).forEach(term => {
            const records = findRecordsForTerm(term, context);
            records.forEach(record => {
                const patches = patchMap.get(record.rowNumber) || [];
                patches.push({
                    term: term.term,
                    value: getTermPatchValue(term),
                    currentTranslation: term.translation || '',
                    originalTranslation: term.originalTranslation || '',
                    issue: term.qualityIssues || '',
                    suggestion: term.qualitySuggestion || '',
                    referenceId: term.referenceId || record.referenceId || '',
                    referenceRows: term.referenceRows || `行${record.rowNumber}`
                });
                patchMap.set(record.rowNumber, patches);
            });
        });

        return patchMap;
    }

    function buildPatchedSourceWorkbook(usePolishedRows = false) {
        if (!sourceWorkbookContext) {
            throw new Error('请先从原文件提取术语，再下载修正版原文件。上传已有术语表无法还原原文件结构。');
        }

        const editableTerms = getEditableGlossaryTerms();
        const context = sourceWorkbookContext;
        const rows = context.rows.map(row => [...row]);
        const columns = context.columns;
        const headerRowIndex = columns.hasHeader ? 0 : -1;
        const patchedHeader = columns.hasHeader ? [...rows[0]] : rows[0]?.map((_, index) => `列${index + 1}`) || [];
        const patchedColumnName = usePolishedRows ? 'AI润色修正译文' : 'AI修正译文';
        const patchNoteColumnName = 'AI修正说明';
        const patchedColumnIndex = patchedHeader.length;
        const patchNoteColumnIndex = patchedHeader.length + 1;

        patchedHeader.push(patchedColumnName, patchNoteColumnName);
        const patchedRows = columns.hasHeader
            ? rows.map(row => [...row])
            : [patchedHeader, ...rows.map(row => [...row])];
        if (columns.hasHeader) {
            patchedRows[0] = patchedHeader;
        }
        const detailRows = [[
            '定位ID/Key',
            '定位行号',
            '原文',
            '原译文',
            '修正后译文',
            '命中术语',
            '问题说明',
            '修正建议',
            '修正方式'
        ]];

        const patchMap = collectTermPatchMap(editableTerms, context);

        context.records.forEach(record => {
            const sourceRow = rows[record.rowNumber - 1] || [];
            const outputRow = [...sourceRow];
            const originalTarget = String(sourceRow[columns.targetIndex] ?? record.targetText ?? '');
            const polished = usePolishedRows ? polishedRowPatches.get(record.rowNumber) : null;
            const patches = patchMap.get(record.rowNumber) || [];
            const appliedResult = polished
                ? { text: polished.finalText, applied: patches }
                : applyTermPatchesToText(originalTarget, patches);
            const finalText = appliedResult.text || originalTarget;
            const appliedTerms = appliedResult.applied.map(patch => patch.term).filter(Boolean);
            const note = polished
                ? `AI行级润色：${polished.reason || '已根据命中术语重写'}`
                : appliedTerms.length > 0
                    ? `本地应用术语：${appliedTerms.join('; ')}`
                    : '无修改';

            outputRow[patchedColumnIndex] = finalText;
            outputRow[patchNoteColumnIndex] = note;

            if (columns.hasHeader) {
                patchedRows[record.rowNumber - 1] = outputRow;
            } else {
                patchedRows[record.rowNumber] = outputRow;
            }

            if (finalText !== originalTarget || appliedTerms.length > 0) {
                detailRows.push([
                    polished?.referenceId || record.referenceId || '',
                    `行${record.rowNumber}`,
                    record.sourceText,
                    originalTarget,
                    finalText,
                    appliedTerms.join('; '),
                    patches.map(patch => patch.issue).filter(Boolean).join('; '),
                    polished?.reason || patches.map(patch => patch.suggestion).filter(Boolean).join('; '),
                    polished ? 'AI行级润色' : '本地术语替换'
                ]);
            }
        });

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(context.rows), '原始数据');
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(patchedRows), '修正后数据');
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(detailRows), '修改明细');
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(buildGlossaryCsvRows(editableTerms)), '术语表');
        return { workbook, detailCount: Math.max(0, detailRows.length - 1) };
    }

    function downloadPatchedSourceFile() {
        try {
            const usePolishedRows = polishedRowPatches.size > 0;
            const { workbook, detailCount } = buildPatchedSourceWorkbook(usePolishedRows);
            const fileBaseName = (currentGlossaryName || sourceFileName || '修正版原文件').replace(/\.(csv|xlsx|xls)$/i, '');
            const suffix = usePolishedRows ? 'AI润色修正版原文件' : '修正版原文件';
            downloadWorkbook(workbook, `${fileBaseName}_${suffix}.xlsx`);
            setStatus('success', `${suffix}已生成`, `共生成 ${detailCount} 条修改明细，原术语表仍保留在工作簿中`);
        } catch (error) {
            setStatus('error', '生成修正版失败', error.message);
        }
    }

    function getPolishTaskFingerprint(task) {
        return makeStableId([
            task.rowNumber,
            task.referenceId,
            task.sourceText,
            task.targetText,
            JSON.stringify(task.terms || [])
        ].join('|'));
    }

    function buildPolishBatchInfo(tasks, index) {
        const rowNumbers = tasks.map(task => Number(task.rowNumber)).filter(Number.isFinite);
        return {
            batch: index + 1,
            rowStart: rowNumbers.length ? Math.min(...rowNumbers) : '',
            rowEnd: rowNumbers.length ? Math.max(...rowNumbers) : '',
            rowCount: tasks.length,
            referenceStart: tasks[0]?.referenceId || '',
            referenceEnd: tasks[tasks.length - 1]?.referenceId || '',
            taskKeys: tasks.map(getPolishTaskFingerprint)
        };
    }

    function getPolishRunBaseName() {
        return (currentGlossaryName || sourceFileName || 'AI润色').replace(/\.(csv|xlsx|xls)$/i, '');
    }

    function updatePolishActionState() {
        if (!downloadPolishReportBtn) return;
        const hasReport = Boolean(currentPolishRunMeta) || polishedRowPatches.size > 0;
        downloadPolishReportBtn.style.display = hasReport ? 'inline-flex' : 'none';
    }

    function buildPolishRunReportRows(runMeta = currentPolishRunMeta) {
        if (!runMeta) return [];

        const rows = [
            ['报告类型', '字段', '值'],
            ['summary', 'reportKind', 'polish'],
            ['summary', 'sourceFileName', runMeta.sourceFileName || sourceFileName || ''],
            ['summary', 'glossaryName', runMeta.glossaryName || currentGlossaryName || ''],
            ['summary', 'provider', runMeta.provider || ''],
            ['summary', 'model', runMeta.model || ''],
            ['summary', 'chunkSize', runMeta.chunkSize || GLOSSARY_POLISH_CHUNK_SIZE],
            ['summary', 'totalTasks', runMeta.totalTasks || 0],
            ['summary', 'totalBatches', runMeta.totalBatches || 0],
            ['summary', 'successfulBatches', runMeta.successfulBatches?.length || 0],
            ['summary', 'failedBatches', runMeta.failedBatches?.length || 0],
            ['summary', 'polishedRows', runMeta.polishedRows?.length || polishedRowPatches.size || 0],
            ['summary', 'createdAt', runMeta.createdAt || ''],
            ['summary', 'updatedAt', runMeta.updatedAt || '']
        ];

        rows.push([]);
        rows.push(['润色结果', '定位ID/Key', '定位行号', '原译文', 'AI润色修正译文', '修正说明']);
        const polishedRows = runMeta.polishedRows || [...polishedRowPatches.entries()].map(([rowNumber, patch]) => ({
            rowNumber,
            referenceId: patch.referenceId || '',
            originalTarget: patch.originalTarget || '',
            finalText: patch.finalText || '',
            reason: patch.reason || ''
        }));
        polishedRows.forEach(row => {
            rows.push([
                'polished',
                row.referenceId || '',
                row.rowNumber || '',
                row.originalTarget || '',
                row.finalText || '',
                row.reason || ''
            ]);
        });

        rows.push([]);
        rows.push(['批次状态', '批次', '起始行', '结束行', '行数', '起始ID/Key', '结束ID/Key', '成功行数', '失败原因']);
        (runMeta.successfulBatches || []).forEach(batch => {
            rows.push([
                'success',
                batch.batch,
                batch.rowStart,
                batch.rowEnd,
                batch.rowCount,
                batch.referenceStart,
                batch.referenceEnd,
                batch.polishedCount || 0,
                ''
            ]);
        });
        (runMeta.failedBatches || []).forEach(batch => {
            rows.push([
                'failed',
                batch.batch,
                batch.rowStart,
                batch.rowEnd,
                batch.rowCount,
                batch.referenceStart,
                batch.referenceEnd,
                '',
                batch.message || ''
            ]);
        });

        return rows;
    }

    function downloadPolishRunReport() {
        const reportRows = buildPolishRunReportRows(currentPolishRunMeta);
        if (reportRows.length === 0) {
            setStatus('warning', '暂无AI润色报告', '请先运行 AI润色修正命中行');
            return;
        }
        downloadGlossaryRows(reportRows, `${getPolishRunBaseName()}_polish_report.csv`);
    }

    function buildPolishTasks() {
        if (!sourceWorkbookContext) {
            throw new Error('请先从原文件提取术语，再使用 AI 润色修正命中行。');
        }

        const editableTerms = getEditableGlossaryTerms();
        const patchMap = collectTermPatchMap(editableTerms, sourceWorkbookContext);
        return [...patchMap.entries()].map(([rowNumber, patches]) => {
            const record = sourceWorkbookContext.recordByRowNumber.get(rowNumber);
            if (!record) return null;
            const row = sourceWorkbookContext.rows[rowNumber - 1] || [];
            return {
                rowNumber,
                referenceId: record.referenceId || '',
                sourceText: record.sourceText,
                targetText: String(row[sourceWorkbookContext.columns.targetIndex] ?? record.targetText ?? ''),
                terms: patches.map(patch => ({
                    source: patch.term,
                    target: patch.value,
                    issue: patch.issue,
                    suggestion: patch.suggestion
                }))
            };
        }).filter(Boolean);
    }

    function buildPolishPromptParts(tasks, chunkIndex, totalChunks) {
        const systemPrompt = `你是游戏本地化译文修正专家。请只处理输入中已经命中术语问题的行，把整行英文译文修正为可直接使用的最终译文。

要求：
1. 必须保留原译文中的变量、占位符、HTML/富文本标签、换行符、数字、百分号和大小写约定。
2. 只修正术语、拼写、数字不一致、明显直译或不自然表达，不要改写不相关内容。
3. 如果原译文已经正确，finalTarget 等于原译文。
4. 输出必须逐行对应输入 rowNumber/referenceId。
5. 只返回 JSON，不要 Markdown。`;
        const compactTasks = tasks.map(task => ({
            rowNumber: task.rowNumber,
            referenceId: task.referenceId,
            sourceText: task.sourceText,
            targetText: task.targetText,
            terms: task.terms.slice(0, 8)
        }));
        const userPrompt = `批次：${chunkIndex + 1}/${totalChunks}

需要润色修正的行：
${JSON.stringify(compactTasks)}

返回合法 JSON：
{
  "rows": [
    {
      "rowNumber": 1,
      "referenceId": "ID或key",
      "finalTarget": "整行修正后的英文译文",
      "reason": "简短说明修正了什么"
    }
  ]
}`;
        return {
            systemPrompt,
            userPrompt,
            cacheKey: makePromptCacheKey('glossary_row_polish_v1', systemPrompt)
        };
    }

    function parsePolishResult(text) {
        const raw = String(text || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
        const normalizeRows = parsed => {
            const rows = Array.isArray(parsed?.rows)
                ? parsed.rows
                : (Array.isArray(parsed?.results)
                    ? parsed.results
                    : (Array.isArray(parsed?.items)
                        ? parsed.items
                        : (Array.isArray(parsed) ? parsed : [])));
            return rows.map(item => ({
                rowNumber: item.rowNumber ?? item.row ?? item.line ?? item.lineNumber,
                referenceId: item.referenceId ?? item.id ?? item.key ?? '',
                finalTarget: item.finalTarget ?? item.finalTranslation ?? item.target ?? item.translation ?? item.corrected ?? item.revisedTarget ?? '',
                reason: item.reason ?? item.note ?? item.explanation ?? ''
            }));
        };

        try {
            const parsed = JSON.parse(raw);
            return normalizeRows(parsed);
        } catch {
            const match = raw.match(/\{[\s\S]*\}/);
            if (!match) return [];
            try {
                const parsed = JSON.parse(match[0]);
                return normalizeRows(parsed);
            } catch {
                return [];
            }
        }
    }

    async function polishMatchedRowsWithAI() {
        if (!ensureApiKeyConfigured('AI润色修正命中行')) return;
        if (glossaryTaskState?.running) {
            setStatus('warning', '已有术语任务正在运行', '请先暂停或取消当前任务，再启动 AI 润色');
            return;
        }

        let tasks = [];
        try {
            tasks = buildPolishTasks();
        } catch (error) {
            setStatus('error', '无法润色修正', error.message);
            return;
        }

        if (tasks.length === 0) {
            setStatus('success', '没有需要 AI 润色的命中行', '当前术语结果没有可应用到原文件的术语问题');
            return;
        }

        const completedRows = new Set([...polishedRowPatches.keys()].map(Number));
        const pendingTasks = tasks.filter(task => !completedRows.has(Number(task.rowNumber)));
        if (pendingTasks.length === 0) {
            setStatus('success', 'AI润色已完成', `已有 ${polishedRowPatches.size} 条行级修正，可直接下载AI润色修正版`);
            updatePatchedDownloadButtonLabel();
            return;
        }

        const resumeText = polishedRowPatches.size > 0
            ? `已有 ${polishedRowPatches.size} 条成功结果，本次只处理剩余 ${pendingTasks.length} 条。`
            : `将对 ${pendingTasks.length} 条命中问题的译文行进行 AI 润色修正。`;
        const confirmed = confirm(`${resumeText} 会额外消耗 API 额度。是否继续？`);
        if (!confirmed) return;

        const taskState = beginGlossaryTask('polish', 'AI润色修正命中行');
        aiPolishMatchedRowsBtn.disabled = true;
        aiPolishMatchedRowsBtn.textContent = 'AI润色中...';
        progressSection.style.display = 'block';
        const apiConfig = getApiConfig();
        const model = apiConfig.model || document.getElementById('glossaryModel').value;
        const chunks = chunkGlossaryItems(pendingTasks, GLOSSARY_POLISH_CHUNK_SIZE);
        const totalChunks = chunks.length;
        const successfulBatches = [...(currentPolishRunMeta?.successfulBatches || [])];
        const failedBatches = [];
        const runStartedAt = currentPolishRunMeta?.createdAt || new Date().toISOString();
        let polishedCount = 0;

        try {
            for (let index = 0; index < totalChunks; index++) {
                await waitGlossaryIfPaused(taskState);
                assertGlossaryTaskActive(taskState);
                const chunk = chunks[index];
                const batchInfo = buildPolishBatchInfo(chunk, index);
                const progress = Math.round(((index + 1) / totalChunks) * 100);
                document.getElementById('glossaryProgressText').textContent = `${index + 1} / ${totalChunks}`;
                document.getElementById('glossaryProgressPercent').textContent = `${progress}%`;
                document.getElementById('glossaryProgressFill').style.width = `${progress}%`;
                setStatus(
                    'processing',
                    `AI 正在润色命中行... (${index + 1}/${totalChunks})`,
                    failedBatches.length > 0
                        ? `已有 ${failedBatches.length} 个批次暂时失败；成功批次会保留，后续可只补跑剩余行`
                        : '只处理有术语问题的 ID 行，不重跑全文'
                );

                try {
                    const promptParts = buildPolishPromptParts(chunk, index, totalChunks);
                    const resultText = await requestGlossaryAiBatch(apiConfig, {
                        model,
                        messages: [
                            { role: 'system', content: promptParts.systemPrompt, cacheControl: true },
                            { role: 'user', content: promptParts.userPrompt }
                        ],
                        prompt_cache_key: promptParts.cacheKey,
                        temperature: 0.1,
                        max_tokens: GLOSSARY_POLISH_MAX_TOKENS
                    }, `润色 ${index + 1}/${totalChunks}`, { taskState });

                    const parsedRows = parsePolishResult(resultText);
                    if (parsedRows.length === 0) {
                        throw new Error('模型返回为空或格式无法识别');
                    }
                    let batchPolishedCount = 0;
                    parsedRows.forEach(item => {
                        const rowNumber = Number(item.rowNumber);
                        const finalText = String(item.finalTarget || item.target || '').trim();
                        if (!Number.isFinite(rowNumber) || !finalText) return;
                        const task = chunk.find(rowTask => Number(rowTask.rowNumber) === rowNumber);
                        polishedRowPatches.set(rowNumber, {
                            finalText,
                            reason: String(item.reason || '').trim(),
                            referenceId: String(item.referenceId || task?.referenceId || '').trim(),
                            originalTarget: task?.targetText || '',
                            sourceText: task?.sourceText || '',
                            updatedAt: new Date().toISOString()
                        });
                        polishedCount++;
                        batchPolishedCount++;
                    });
                    successfulBatches.push({
                        ...batchInfo,
                        polishedCount: batchPolishedCount
                    });
                } catch (error) {
                    if (isGlossaryAbortError(error)) throw error;
                    failedBatches.push({
                        ...batchInfo,
                        message: error.message || 'AI润色批次失败'
                    });
                    console.warn('AI polish batch failed:', index + 1, error);
                }

                currentPolishRunMeta = {
                    reportKind: 'polish',
                    sourceFileName,
                    glossaryName: currentGlossaryName,
                    provider: apiConfig?.provider || '',
                    model,
                    chunkSize: GLOSSARY_POLISH_CHUNK_SIZE,
                    totalTasks: tasks.length,
                    totalBatches: Math.ceil(tasks.length / GLOSSARY_POLISH_CHUNK_SIZE),
                    successfulBatches,
                    failedBatches,
                    polishedRows: [...polishedRowPatches.entries()].map(([rowNumber, patch]) => ({
                        rowNumber,
                        referenceId: patch.referenceId || '',
                        originalTarget: patch.originalTarget || '',
                        finalText: patch.finalText || '',
                        reason: patch.reason || ''
                    })),
                    createdAt: runStartedAt,
                    updatedAt: new Date().toISOString()
                };
                updatePatchedDownloadButtonLabel();

                await sleepGlossary(150, taskState);
            }

            if (failedBatches.length > 0) {
                setStatus(
                    polishedRowPatches.size > 0 ? 'warning' : 'error',
                    'AI润色部分批次失败',
                    `本次新增 ${polishedCount} 条行级修正，剩余失败批次 ${failedBatches.length} 个。再次点击“AI润色修正命中行”会只跑未完成行。`
                );
            } else if (polishedCount > 0) {
                setStatus('success', 'AI润色完成', `本次新增 ${polishedCount} 条行级修正，请点击“下载AI润色修正版”导出`);
                updatePatchedDownloadButtonLabel();
            } else {
                setStatus('warning', 'AI润色未生成可用修正', '模型返回内容为空或格式无法识别；可稍后重试，或直接点击“下载修正版原文件”使用本地术语替换结果');
            }
        } catch (error) {
            if (isGlossaryAbortError(error)) {
                setStatus('warning', 'AI润色已取消', `已保留 ${polishedRowPatches.size} 条已生成的行级修正`);
                if (polishedCount > 0) updatePatchedDownloadButtonLabel();
                return;
            }
            setStatus('error', 'AI润色失败', error.message);
        } finally {
            progressSection.style.display = 'none';
            aiPolishMatchedRowsBtn.disabled = false;
            aiPolishMatchedRowsBtn.textContent = 'AI润色修正命中行';
            finishGlossaryTask(taskState);
        }
    }

    function downloadSavedGlossary(entry) {
        const savedTerms = normalizeEntryToEditableTerms(entry);
        if (savedTerms.length === 0) {
            alert('该术语表没有可下载的术语');
            return;
        }

        downloadGlossaryRows(
            buildGlossaryCsvRows(savedTerms),
            `${getGlossaryFileBaseName(entry)}_glossary.csv`
        );
        const reportRows = buildGlossaryRunReportRows(entry.runMeta || null);
        if (reportRows.length > 0) {
            downloadGlossaryRows(
                reportRows,
                `${getGlossaryFileBaseName(entry)}_run_report.csv`
            );
        }
    }

    function handleExtractFileSelect(file) {
        extractFile = file;
        sourceFileName = file.name;
        currentGlossaryName = file.name.replace(/\.(csv|xlsx|xls)$/i, '');
        currentGlossaryId = '';
        currentGlossaryOrigin = 'extracted';
        sourceWorkbookContext = null;
        polishedRowPatches = new Map();
        currentGlossaryRunMeta = null;
        currentPolishRunMeta = null;
        updatePatchedDownloadButtonLabel();

        extractUploadStatus.textContent = `✓ 文件已选择: ${file.name}`;
        extractUploadStatus.className = 'upload-status success';
        extractTermsBtn.style.display = 'block';
    }

    function handleUploadFileSelect(file) {
        currentGlossaryOrigin = 'uploaded';
        sourceFileName = file.name;
        currentGlossaryName = file.name.replace(/\.(csv|xlsx|xls)$/i, '');
        currentGlossaryId = '';
        sourceWorkbookContext = null;
        polishedRowPatches = new Map();
        currentGlossaryRunMeta = null;
        currentPolishRunMeta = null;
        updatePatchedDownloadButtonLabel();
        uploadGlossaryStatus.textContent = `✓ 文件已选择: ${file.name}`;
        uploadGlossaryStatus.className = 'upload-status success';

        setTimeout(() => {
            uploadGlossary(file);
        }, 500);
    }

    async function extractTerms(file) {
        if (glossaryTaskState?.running) {
            setStatus('warning', '已有术语任务正在运行', '请先暂停或取消当前任务，再开始新的术语提取');
            return;
        }
        sourceFileName = file.name;
        currentGlossaryName = file.name.replace(/\.(csv|xlsx|xls)$/i, '');
        currentGlossaryId = '';
        currentGlossaryOrigin = 'extracted';
        terms = [];
        currentGlossaryRunMeta = null;
        currentPolishRunMeta = null;
        updatePatchedDownloadButtonLabel();
        const extractMode = document.getElementById('glossaryMode').value;

        if (extractMode === 'ai' && !ensureApiKeyConfigured('AI 智能提取术语表')) {
            progressSection.style.display = 'none';
            extractTermsBtn.disabled = false;
            extractTermsBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 12l2 2 4-4"/><path d="M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 0 1-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg> 开始提取术语';
            return;
        }

        const taskState = beginGlossaryTask(extractMode === 'ai' ? 'extract-ai' : 'extract-rule', '提取术语表');
        progressSection.style.display = 'block';
        hideStatus();

        document.getElementById('glossaryProgressText').textContent = `0 / 0`;
        document.getElementById('glossaryProgressPercent').textContent = `0%`;
        document.getElementById('glossaryProgressFill').style.width = `0%`;

        setStatus('processing', '正在提取术语...', `处理文件: ${file.name}`);

        try {
            const { rows, text } = await readGlossarySourceFile(file);
            sourceWorkbookContext = buildSourceWorkbookContext(rows, file.name);
            polishedRowPatches = new Map();
            currentPolishRunMeta = null;
            const records = buildLocalizationRecords(rows);

            console.log('📄 文件内容长度:', text.length);
            console.log('📊 识别到原文/译文行:', records.length);

            if (extractMode === 'ai') {
                console.log('🤖 进入AI全文提取模式');
                const apiConfig = getApiConfig();
                const model = apiConfig.model || document.getElementById('glossaryModel').value;
                console.log('🧠 使用模型:', model);
                terms = await refineTermsWithAI(records, [], text, apiConfig, model, taskState);
            } else {
                assertGlossaryTaskActive(taskState);
                console.log('⚡ 进入规则提取 V2 模式');
                const professionalCandidates = extractProfessionalTermsByRule(records, text);
                console.log('🧩 本地候选术语:', professionalCandidates.length);
                document.getElementById('glossaryProgressText').textContent = `1 / 1`;
                document.getElementById('glossaryProgressPercent').textContent = `100%`;
                document.getElementById('glossaryProgressFill').style.width = `100%`;
                terms = professionalCandidates;
                currentGlossaryRunMeta = null;
            }

            const savedEntry = saveGlossaryEntry({
                name: sourceFileName.replace(/\.(csv|xlsx|xls)$/i, ''),
                sourceFileName,
                terms,
                origin: 'extracted',
                runMeta: currentGlossaryRunMeta
            });
            if (savedEntry) {
                currentGlossaryId = savedEntry.id;
                currentGlossaryName = savedEntry.name;
            }
            displayTerms();
            const failedCount = currentGlossaryRunMeta?.failedBatches?.length || 0;
            const failedText = failedCount > 0 ? `，${failedCount} 个批次失败，下载时会同时生成运行报告` : '';
            if (currentGlossaryRunMeta?.cancelled) {
                setStatus('warning', '术语提取已取消', `已保留并保存 ${terms.length} 个已完成批次中的术语${failedText}`);
            } else {
                setStatus('success', '术语提取完成！', `共提取并保存 ${terms.length} 个术语${failedText}`);
            }

        } catch (error) {
            if (isGlossaryAbortError(error)) {
                const partialCount = terms.length;
                if (partialCount > 0) {
                    displayTerms();
                    setStatus('warning', '术语提取已取消', `已保留 ${partialCount} 个已完成批次中的术语`);
                } else {
                    setStatus('warning', '术语提取已取消', '没有已完成的可保存批次');
                    progressSection.style.display = 'none';
                }
                return;
            }
            console.error('❌ 提取错误:', error);
            setStatus('error', '提取失败', error.message);
            progressSection.style.display = 'none';
        } finally {
            extractTermsBtn.disabled = false;
            extractTermsBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 12l2 2 4-4"/><path d="M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 0 1-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg> 开始提取术语';
            finishGlossaryTask(taskState);
        }
    }

    async function extractTermsWithAI(text) {
        const config = getApiConfig();
        const apiKey = config.apiKey;
        if (!apiKey) {
            throw new Error('请先配置API Key');
        }

        const model = config.model || document.getElementById('glossaryModel').value;
        const provider = document.getElementById('apiProvider').value;

        console.log('🔮 开始AI提取术语');
        console.log('📦 文本长度:', text.length);
        console.log('🧠 使用模型:', model);
        console.log('🏭 API平台:', provider);

        const chunks = text.match(/.{1,3000}/g) || [text];
        const allTerms = [];
        const termSet = new Set();
        const totalChunks = chunks.length;

        for (let i = 0; i < totalChunks; i++) {
            const chunk = chunks[i];
            const progress = Math.round(((i + 1) / totalChunks) * 100);

            document.getElementById('glossaryProgressText').textContent = `${i + 1} / ${totalChunks}`;
            document.getElementById('glossaryProgressPercent').textContent = `${progress}%`;
            document.getElementById('glossaryProgressFill').style.width = `${progress}%`;

            setStatus('processing', `正在提取术语... (${i + 1}/${totalChunks})`, '');

            const prompt = `请从以下文本中提取专业术语和关键词。文本可能包含游戏内容、技术文档等。

文本内容：
${chunk}

请以JSON格式输出，包含以下字段：
- "terms": 术语数组，每个术语包含：
  - "term": 术语名称
  - "type": 术语类型（如：专有名词、技术术语、角色名、技能名、物品名、地点名等）
  - "description": 术语描述或含义（可选）

示例输出格式：
{
  "terms": [
    {"term": "角色名", "type": "角色名", "description": "游戏中的主要角色"},
    {"term": "技能名称", "type": "技能名", "description": "角色的特殊技能"}
  ]
}`;

            const response = await callAPI(prompt, model, provider);
            let result;
            try {
                result = JSON.parse(response);
            } catch {
                const match = response.match(/\{[\s\S]*\}/);
                if (match) {
                    result = JSON.parse(match[0]);
                } else {
                    continue;
                }
            }

            if (result.terms && Array.isArray(result.terms)) {
                for (const item of result.terms) {
                    if (item.term && !termSet.has(item.term)) {
                        termSet.add(item.term);
                        allTerms.push({
                            term: item.term,
                            type: item.type || '其他',
                            count: text.split(item.term).length - 1,
                            translation: ''
                        });
                    }
                }
            }
        }

        return allTerms;
    }

    function extractTermsFromText(text) {
        const termMap = new Map();

        const lines = text.split(/\r?\n/);
        for (const line of lines) {
            const words = line.split(/[,;\t|]+/).map(w => w.trim());

            for (const word of words) {
                if (word.length < 2 || word.length > 50) continue;
                if (/^\d+$/.test(word)) continue;

                const cleanWord = word.replace(/^["'""']+|["'""']+$/g, '').trim();
                if (cleanWord.length < 2) continue;

                const normalized = cleanWord.toLowerCase();

                if (!termMap.has(normalized)) {
                    termMap.set(normalized, {
                        term: cleanWord,
                        count: 0,
                        type: guessTermType(cleanWord)
                    });
                }
                termMap.get(normalized).count++;
            }
        }

        return Array.from(termMap.values())
            .filter(t => t.count >= 1)
            .sort((a, b) => b.count - a.count);
    }

    function guessTermType(word) {
        if (/^[A-Z][a-z]+(?:[A-Z][a-z]+)*$/.test(word)) return '专有名词';
        if (/^[A-Z]+$/.test(word)) return '缩写词';
        if (/^[a-z]+$/.test(word)) return '普通名词';
        if (/^[\u4e00-\u9fa5]+$/.test(word)) return '中文术语';
        if (word.includes('_') || word.includes('-')) return '复合词';
        return '其他';
    }

    async function uploadGlossary(file) {
        sourceFileName = file.name;
        currentGlossaryName = file.name.replace(/\.(csv|xlsx|xls)$/i, '');
        currentGlossaryId = '';
        currentGlossaryOrigin = 'uploaded';

        try {
            const { rows: data } = await readSpreadsheetRows(file);

            terms = parseGlossaryTableRows(data).map(term => ({
                term: term.source,
                type: term.type || guessTermType(term.source),
                count: term.count || 1,
                translation: term.target || '',
                confidence: term.confidence || 0,
                note: term.note || '',
                extractionSource: term.extractionSource || 'uploaded',
                extractionBatch: term.extractionBatch || '',
                referenceId: term.referenceId || '',
                referenceRows: term.referenceRows || '',
                originalTranslation: term.originalTranslation || '',
                finalTranslation: term.finalTranslation || term.target || '',
                qualityStatus: term.qualityStatus || '',
                qualityIssues: term.qualityIssues || '',
                qualitySuggestion: term.qualitySuggestion || ''
            }));
            currentGlossaryRunMeta = null;
            currentPolishRunMeta = null;

            const savedEntry = saveGlossaryEntry({
                name: sourceFileName.replace(/\.(csv|xlsx|xls)$/i, ''),
                sourceFileName,
                terms,
                origin: 'uploaded'
            });
            if (savedEntry) {
                currentGlossaryId = savedEntry.id;
                currentGlossaryName = savedEntry.name;
            }

            displayTerms();
            setStatus('success', '术语表已记录', `共保存 ${terms.length} 个术语，可在本地化检测中勾选使用`);

        } catch (error) {
            console.error('Upload error:', error);
            setStatus('error', '加载失败', error.message);
        }
    }

    function displayTerms() {
        progressSection.style.display = 'none';
        infoPanel.style.display = 'block';
        termsSection.style.display = 'block';

        document.getElementById('glossaryTermCount').textContent = terms.length;
        document.getElementById('glossarySourceFile').textContent = sourceFileName || currentGlossaryName || '-';
        updateRetryFailedGlossaryBatchesButton();
        updatePatchedDownloadButtonLabel();

        const tbody = document.getElementById('glossaryTermsBody');
        tbody.innerHTML = '';

        terms.forEach(term => {
            const tr = document.createElement('tr');
            const confidence = Number(term.confidence || 0);
            const confidenceLabel = confidence > 0 ? `${Math.round(confidence)}%` : '未评分';
            const note = term.note || term.extractionSource || '无';
            const referenceLabel = term.referenceId || term.referenceRows || '-';
            const qualityStatus = term.qualityStatus || '需确认';
            const qualityDetail = [term.qualityIssues, term.qualitySuggestion].filter(Boolean).join('；') || '暂无明显问题';
            const finalTranslation = term.finalTranslation || term.translation || term.originalTranslation || '';
            tr.innerHTML = `
                <td><span class="term-note" title="${escapeAttribute(referenceLabel)}">${escapeHtml(referenceLabel)}</span></td>
                <td>${escapeHtml(term.term)}</td>
                <td><span class="term-type-tag">${escapeHtml(term.type)}</span></td>
                <td>${term.count}</td>
                <td><span class="term-confidence-tag">${escapeHtml(confidenceLabel)}</span></td>
                <td><input type="text" class="translation-input" placeholder="输入英文指定译法" value="${escapeAttribute(term.translation || '')}"></td>
                <td><input type="text" class="translation-input final-translation-input" placeholder="整理后译文" value="${escapeAttribute(finalTranslation)}"></td>
                <td><span class="term-note" title="${escapeAttribute(qualityDetail)}">${escapeHtml(qualityStatus)}</span></td>
                <td><span class="term-note" title="${escapeAttribute(note)}">${escapeHtml(note)}</span></td>
            `;
            tbody.appendChild(tr);
        });
    }

    function updateRetryFailedGlossaryBatchesButton() {
        if (!retryFailedGlossaryBatchesBtn) return;
        const failedCount = currentGlossaryRunMeta?.failedBatches?.length || 0;
        const hasSourceContext = Boolean(sourceWorkbookContext?.records?.length);
        retryFailedGlossaryBatchesBtn.style.display = failedCount > 0 ? 'inline-flex' : 'none';
        retryFailedGlossaryBatchesBtn.disabled = failedCount === 0 || !hasSourceContext;
        retryFailedGlossaryBatchesBtn.textContent = hasSourceContext
            ? `补跑失败批次（${failedCount}）`
            : `补跑失败批次（需重新上传原文件）`;
    }

    function updatePatchedDownloadButtonLabel() {
        if (!downloadPatchedSourceBtn) return;
        if (polishedRowPatches.size > 0) {
            downloadPatchedSourceBtn.textContent = '下载AI润色修正版';
            downloadPatchedSourceBtn.title = '将导出包含“AI润色修正译文”列的修正版原文件';
        } else {
            downloadPatchedSourceBtn.textContent = '下载修正版原文件';
            downloadPatchedSourceBtn.title = '';
        }
        updatePolishActionState();
    }

    function getRecordsForFailedBatch(batch) {
        const records = sourceWorkbookContext?.records || [];
        const start = Number(batch.rowStart);
        const end = Number(batch.rowEnd);
        if (!Number.isFinite(start) || !Number.isFinite(end)) return [];
        return records.filter(record => record.rowNumber >= start && record.rowNumber <= end);
    }

    function isBlockingGlossaryPreflightError(error) {
        const text = `${error?.message || ''} ${error?.rawText || ''} ${JSON.stringify(error?.payload || '')}`;
        return error?.status === 401 ||
            error?.status === 403 ||
            /unauthorized|forbidden|invalid.?key|api.?key|authentication|permission|权限|认证|密钥|余额|balance|insufficient|quota|no available accounts|模型权限|模型族|third.?party|第三方/i.test(text);
    }

    async function preflightGlossaryRetryChannel(apiConfig, model, taskState = glossaryTaskState) {
        if (!apiConfig?.apiKey) {
            throw new Error('未填写 API Key');
        }
        if (!model) {
            throw new Error('未选择模型');
        }

        try {
            await waitGlossaryIfPaused(taskState);
            assertGlossaryTaskActive(taskState);
            await requestModelContent(
                apiConfig,
                {
                    model,
                    messages: [{ role: 'user', content: '不要推理，不要解释，请只回复 OK。' }],
                    temperature: 0,
                    max_tokens: getPreflightMaxTokens(apiConfig, model, 0)
                },
                taskState?.signal || null,
                API_PREFLIGHT_TIMEOUT_MS,
                { reasoningEffort: 'minimal' }
            );
            return true;
        } catch (error) {
            error.isBlockingPreflight = isBlockingGlossaryPreflightError(error);
            throw error;
        }
    }

    async function retryFailedGlossaryBatches() {
        const failedBatches = currentGlossaryRunMeta?.failedBatches || [];
        if (glossaryTaskState?.running) {
            setStatus('warning', '已有术语任务正在运行', '请先暂停或取消当前任务，再补跑失败批次');
            return;
        }
        if (failedBatches.length === 0) {
            setStatus('success', '没有需要补跑的失败批次', '当前术语表没有记录失败批次');
            return;
        }
        if (!sourceWorkbookContext?.records?.length) {
            setStatus('error', '无法补跑失败批次', '请先重新上传原始文件，工具需要原文行内容才能补跑');
            updateRetryFailedGlossaryBatchesButton();
            return;
        }
        if (!ensureApiKeyConfigured('补跑失败批次')) return;

        terms = getEditableGlossaryTerms();
        const apiConfig = getApiConfig();
        const model = currentGlossaryRunMeta?.model || apiConfig.model || document.getElementById('glossaryModel').value;
        const baseSpeedSettings = getGlossarySpeedSettings(apiConfig, model, currentGlossaryRunMeta?.speedMode || glossarySpeedMode?.value || 'auto');
        const speedSettings = {
            ...baseSpeedSettings,
            maxTokens: currentGlossaryRunMeta?.maxTokens || baseSpeedSettings.maxTokens
        };
        const taskState = beginGlossaryTask('retry', '补跑失败批次');
        retryFailedGlossaryBatchesBtn.disabled = true;
        retryFailedGlossaryBatchesBtn.textContent = '检测通道...';
        setStatus('processing', '正在预检 API 通道', '将发送一次极短测试请求；若通道不可用，不会开始补跑失败批次');

        try {
            await preflightGlossaryRetryChannel(apiConfig, model, taskState);
        } catch (error) {
            if (isGlossaryAbortError(error)) {
                setStatus('warning', '补跑失败批次已取消', '通道预检期间已停止任务');
                finishGlossaryTask(taskState);
                updateRetryFailedGlossaryBatchesButton();
                return;
            }
            const hint = error.isBlockingPreflight
                ? '当前更像是 Key、余额、模型权限或 AIGoCode 账号池问题，已停止补跑以避免继续消耗额度。'
                : '通道预检失败，建议稍后再试或换用更稳定的通道。';
            setStatus('error', '补跑前通道预检失败', `${error.message || '接口不可用'} ${hint}`);
            finishGlossaryTask(taskState);
            updateRetryFailedGlossaryBatchesButton();
            return;
        }

        const confirmed = confirm(`通道预检通过。将只补跑 ${failedBatches.length} 个失败批次，会额外消耗 API 额度。是否继续？`);
        if (!confirmed) {
            finishGlossaryTask(taskState);
            updateRetryFailedGlossaryBatchesButton();
            setStatus('success', '已取消补跑失败批次', '通道预检已通过，但未开始补跑');
            return;
        }

        const fullText = sourceWorkbookContext.records
            .map(record => `${record.sourceText}\n${record.targetText}`)
            .join('\n');
        const remainingFailedBatches = [];
        const recoveredBatches = [...(currentGlossaryRunMeta?.recoveredBatches || [])];
        let recoveredTermCount = 0;
        let processedRetryBatchCount = 0;

        retryFailedGlossaryBatchesBtn.textContent = '补跑中...';
        progressSection.style.display = 'block';

        try {
            for (let index = 0; index < failedBatches.length; index++) {
                await waitGlossaryIfPaused(taskState);
                assertGlossaryTaskActive(taskState);
                const failed = failedBatches[index];
                const chunk = getRecordsForFailedBatch(failed);
                const progress = Math.round(((index + 1) / failedBatches.length) * 100);
                document.getElementById('glossaryProgressText').textContent = `${index + 1} / ${failedBatches.length}`;
                document.getElementById('glossaryProgressPercent').textContent = `${progress}%`;
                document.getElementById('glossaryProgressFill').style.width = `${progress}%`;
                setStatus(
                    'processing',
                    `正在补跑失败批次 ${failed.batch} (${index + 1}/${failedBatches.length})`,
                    `行 ${failed.rowStart || '-'} - ${failed.rowEnd || '-'}`
                );

                if (chunk.length === 0) {
                    remainingFailedBatches.push({
                        ...failed,
                        message: '无法在当前原文件中定位该批次行号'
                    });
                    continue;
                }

                try {
                    const retryResult = await retryGlossaryChunkWithAutoSplit({
                        chunk,
                        totalChunks: currentGlossaryRunMeta?.totalBatches || failedBatches.length,
                        sourceRecords: sourceWorkbookContext.records,
                        fullText,
                        apiConfig,
                        model,
                        retryDelays: getGlossaryRecoveryRetryDelays(speedSettings),
                        phaseLabel: '手动补跑 ',
                        maxTokens: speedSettings.maxTokens,
                        taskState,
                        failed: {
                            ...failed,
                            index: Number(failed.index ?? Number(failed.batch || 1) - 1)
                        },
                        onRecovered: (result, recoveredBatch) => {
                            terms = mergeAiGlossaryTerms([...terms, ...result.normalizedTerms]);
                            recoveredTermCount += result.normalizedTerms.length;
                            recoveredBatches.push(recoveredBatch);
                        }
                    });
                    remainingFailedBatches.push(...retryResult.unrecovered);
                } catch (error) {
                    if (isGlossaryAbortError(error)) {
                        throw error;
                    }
                    remainingFailedBatches.push({
                        ...failed,
                        message: error.message || failed.message || '补跑仍失败'
                    });
                }

                await sleepGlossary(300, taskState);
                processedRetryBatchCount = index + 1;
            }

            currentGlossaryRunMeta = {
                ...currentGlossaryRunMeta,
                model,
                provider: apiConfig?.provider || currentGlossaryRunMeta?.provider || '',
                speedMode: currentGlossaryRunMeta?.speedMode || speedSettings.mode,
                resolvedSpeedMode: currentGlossaryRunMeta?.resolvedSpeedMode || speedSettings.resolvedMode,
                speedLabel: currentGlossaryRunMeta?.speedLabel || speedSettings.label,
                chunkMaxRows: currentGlossaryRunMeta?.chunkMaxRows || speedSettings.maxRows,
                chunkMaxChars: currentGlossaryRunMeta?.chunkMaxChars || speedSettings.maxChars,
                concurrency: currentGlossaryRunMeta?.concurrency || speedSettings.concurrency,
                maxTokens: currentGlossaryRunMeta?.maxTokens || speedSettings.maxTokens,
                recoveredBatches,
                failedBatches: remainingFailedBatches,
                updatedAt: new Date().toISOString()
            };

            const savedEntry = saveGlossaryEntry({
                name: currentGlossaryName || sourceFileName.replace(/\.(csv|xlsx|xls)$/i, '') || '术语表',
                sourceFileName,
                terms,
                origin: currentGlossaryOrigin,
                runMeta: currentGlossaryRunMeta
            });
            if (savedEntry) {
                currentGlossaryId = savedEntry.id;
                currentGlossaryName = savedEntry.name;
            }

            displayTerms();
            setStatus(
                remainingFailedBatches.length > 0 ? 'processing' : 'success',
                remainingFailedBatches.length > 0 ? '失败批次已部分补跑' : '失败批次补跑完成',
                `新增/合并 ${recoveredTermCount} 条术语，剩余失败批次 ${remainingFailedBatches.length} 个`
            );
        } catch (error) {
            if (isGlossaryAbortError(error)) {
                currentGlossaryRunMeta = {
                    ...currentGlossaryRunMeta,
                    model,
                    provider: apiConfig?.provider || currentGlossaryRunMeta?.provider || '',
                    recoveredBatches,
                    failedBatches: [...remainingFailedBatches, ...failedBatches.slice(processedRetryBatchCount)],
                    cancelled: true,
                    updatedAt: new Date().toISOString()
                };
                setStatus('warning', '补跑失败批次已取消', `已保留本次补跑成功的 ${recoveredTermCount} 条术语`);
                displayTerms();
                return;
            }
            setStatus('error', '补跑失败批次失败', error.message);
        } finally {
            progressSection.style.display = 'none';
            finishGlossaryTask(taskState);
            updateRetryFailedGlossaryBatchesButton();
        }
    }

    function downloadGlossary() {
        if (terms.length === 0) {
            alert('没有术语可下载');
            return;
        }

        const translationInputs = document.querySelectorAll('.translation-input:not(.final-translation-input)');
        const finalTranslationInputs = document.querySelectorAll('.final-translation-input');
        const termsWithTranslation = terms.map((term, index) => ({
            ...term,
            translation: translationInputs[index]?.value || '',
            finalTranslation: finalTranslationInputs[index]?.value || translationInputs[index]?.value || term.finalTranslation || term.originalTranslation || ''
        }));
        terms = termsWithTranslation;
        const savedEntry = saveGlossaryEntry({
            name: currentGlossaryName || sourceFileName.replace(/\.(csv|xlsx|xls)$/i, '') || '术语表',
            sourceFileName,
            terms,
            origin: currentGlossaryOrigin,
            runMeta: currentGlossaryRunMeta
        });
        if (savedEntry) {
            currentGlossaryId = savedEntry.id;
            currentGlossaryName = savedEntry.name;
        }

        const fileBaseName = (currentGlossaryName || sourceFileName || '术语表').replace(/\.(csv|xlsx|xls)$/i, '');
        downloadGlossaryRows(buildGlossaryCsvRows(termsWithTranslation), `${fileBaseName}_glossary.csv`);
        const reportRows = buildGlossaryRunReportRows(currentGlossaryRunMeta);
        if (reportRows.length > 0) {
            downloadGlossaryRows(reportRows, `${fileBaseName}_run_report.csv`);
        }
    }

    function resetTool() {
        if (glossaryTaskState?.running) {
            cancelGlossaryTask({ silent: true, skipConfirm: true });
        }
        terms = [];
        sourceFileName = '';
        currentGlossaryName = '';
        currentGlossaryId = '';
        extractFile = null;
        currentGlossaryOrigin = 'uploaded';
        sourceWorkbookContext = null;
        polishedRowPatches = new Map();
        currentGlossaryRunMeta = null;
        currentPolishRunMeta = null;
        updateRetryFailedGlossaryBatchesButton();
        updatePatchedDownloadButtonLabel();

        extractInput.value = '';
        uploadInput.value = '';

        extractUploadStatus.textContent = '';
        extractUploadStatus.className = 'upload-status';
        uploadGlossaryStatus.textContent = '';
        uploadGlossaryStatus.className = 'upload-status';
        clearGlossaryRestoreFiles();
        clearGlossaryReviewState();
        extractTermsBtn.style.display = 'none';

        infoPanel.style.display = 'none';
        termsSection.style.display = 'none';
        progressSection.style.display = 'none';
        hideStatus();
    }
}

function readCSVWithEncoding(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = function(e) {
            const bytes = new Uint8Array(e.target.result);

            if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
                const text = new TextDecoder('UTF-8').decode(bytes);
                resolve({ text, encoding: 'UTF-8 (BOM)' });
                return;
            }

            if (isValidUTF8(bytes)) {
                const text = new TextDecoder('UTF-8').decode(bytes);
                resolve({ text, encoding: 'UTF-8' });
                return;
            }

            try {
                const text = new TextDecoder('GBK').decode(bytes);
                resolve({ text, encoding: 'GBK' });
            } catch {
                const text = new TextDecoder('UTF-8').decode(bytes);
                resolve({ text, encoding: 'UTF-8' });
            }
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
}

function isValidUTF8(bytes) {
    let i = 0;
    while (i < bytes.length) {
        if (bytes[i] <= 0x7F) {
            i++;
        } else if ((bytes[i] & 0xE0) === 0xC0) {
            if (i + 1 >= bytes.length || (bytes[i + 1] & 0xC0) !== 0x80) return false;
            i += 2;
        } else if ((bytes[i] & 0xF0) === 0xE0) {
            if (i + 2 >= bytes.length || (bytes[i + 1] & 0xC0) !== 0x80 || (bytes[i + 2] & 0xC0) !== 0x80) return false;
            i += 3;
        } else if ((bytes[i] & 0xF8) === 0xF0) {
            if (i + 3 >= bytes.length || (bytes[i + 1] & 0xC0) !== 0x80 || (bytes[i + 2] & 0xC0) !== 0x80 || (bytes[i + 3] & 0xC0) !== 0x80) return false;
            i += 4;
        } else {
            return false;
        }
    }
    return true;
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function createDownloadLink(blob, fileName) {
    const url = URL.createObjectURL(blob);
    return url;
}
