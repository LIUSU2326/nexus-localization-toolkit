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
        if (Notification.permission === 'granted') {
            new Notification('任务完成', {
                body: subtext || text
            });
        }
    }
}

function hideStatus() {
    const statusBar = document.getElementById('statusBar');
    statusBar.style.display = 'none';
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

const TRANSLATION_PROJECTS_KEY = 'translationProjects';
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
            count: Number.isFinite(count) ? count : 1,
            confidence: Number.isFinite(confidence) ? confidence : 0,
            note: String(term.note || term.reason || term.description || '').trim(),
            extractionSource: String(term.extractionSource || term.origin || '').trim(),
            referenceId: String(term.referenceId || term.id || term.rowId || term.key || '').trim(),
            referenceRows: String(term.referenceRows || term.rows || term.rowNumbers || '').trim(),
            originalTranslation: String(term.originalTranslation || term.currentTarget || term.originalTarget || term.observedTarget || '').trim(),
            finalTranslation: String(term.finalTranslation || term.finalTarget || term.revisedTarget || term.fixedTarget || '').trim(),
            qualityStatus: String(term.qualityStatus || term.qaStatus || '').trim(),
            qualityIssues: String(term.qualityIssues || term.issues || '').trim(),
            qualitySuggestion: String(term.qualitySuggestion || term.suggestion || '').trim()
        };
    }).filter(term => term?.source);
}

function saveGlossaryEntry({ name, sourceFileName, terms, origin }) {
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
        ? findHeaderColumn(headers, ['译文', '翻译', '目标', '英文', '英语', 'english', 'translation', 'target'], new Set([sourceIndex]))
        : inferred.targetIndex;
    let typeIndex = hasHeader ? findHeaderColumn(headers, ['类型', '分类', 'type', 'category'], new Set([sourceIndex, targetIndex])) : -1;
    const countIndex = hasHeader ? findHeaderColumn(headers, ['出现次数', '次数', 'count']) : -1;
    const confidenceIndex = hasHeader ? findHeaderColumn(headers, ['置信度', 'confidence', 'score']) : -1;
    const noteIndex = hasHeader ? findHeaderColumn(headers, ['提取依据', '依据', '备注', '说明', 'note', 'reason', 'description']) : -1;
    const extractionSourceIndex = hasHeader ? findHeaderColumn(headers, ['提取来源', '来源', 'source type', 'extraction source', 'extractionsource']) : -1;
    const referenceIdIndex = hasHeader ? findHeaderColumn(headers, ['定位id', '定位 id', '定位key', '定位 key', 'id/key', 'id', 'key', 'string id', 'referenceid']) : -1;
    const referenceRowsIndex = hasHeader ? findHeaderColumn(headers, ['定位行号', '行号', 'reference rows', 'referencerows', 'rows']) : -1;
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
        const referenceId = referenceIdIndex >= 0 && row[referenceIdIndex] !== undefined ? String(row[referenceIdIndex]).trim() : '';
        const referenceRows = referenceRowsIndex >= 0 && row[referenceRowsIndex] !== undefined ? String(row[referenceRowsIndex]).trim() : '';
        const qualityStatus = qualityStatusIndex >= 0 && row[qualityStatusIndex] !== undefined ? String(row[qualityStatusIndex]).trim() : '';
        const qualityIssues = qualityIssuesIndex >= 0 && row[qualityIssuesIndex] !== undefined ? String(row[qualityIssuesIndex]).trim() : '';
        const qualitySuggestion = qualitySuggestionIndex >= 0 && row[qualitySuggestionIndex] !== undefined ? String(row[qualitySuggestionIndex]).trim() : '';
        const repaired = repairLegacyGlossaryTerm(rawSource, rawTarget, rawType);
        if (!repaired) return null;

        return {
            source: repaired.source,
            target: repaired.target,
            type: repaired.type,
            count: Number.isFinite(count) ? count : 1,
            confidence: Number.isFinite(confidence) ? confidence : 0,
            note,
            extractionSource,
            referenceId,
            referenceRows,
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

function isOnline() {
    return navigator.onLine;
}

function waitForNetwork() {
    return new Promise(resolve => {
        if (navigator.onLine) {
            resolve();
        } else {
            window.addEventListener('online', () => resolve(), { once: true });
        }
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
        { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6' },
        { id: 'claude-opus-4-7', name: 'Claude Opus 4.7' },
        { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5' },
        { id: 'claude-opus-4-6', name: 'Claude Opus 4.6' },
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
    doubao: { name: '字节跳动豆包', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', models: [
        { id: 'doubao-seed-2-0-pro-260215', name: '豆包 Seed 2.0 Pro' },
        { id: 'doubao-seed-2-0-lite-260215', name: '豆包 Seed 2.0 Lite' },
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
    const rawModel = String(profile?.model || '').trim();
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
        const disabledReason = !hasKey
            ? '未保存 API Key'
            : (!compatible ? '该平台当前不是 Chat Completions 兼容接口' : '');
        const label = document.createElement('label');
        label.className = `resource-check-item ${isUsable ? '' : 'disabled'}`;
        label.innerHTML = `
            <input type="checkbox" value="${profile.id}" ${nextSelectedIds.has(profile.id) ? 'checked' : ''} ${isUsable ? '' : 'disabled'}>
            <span class="resource-main">
                <span class="resource-title">${escapeHtml(profile.name)}</span>
                <span class="resource-meta">
                    ${getPlatformName(profile.provider)} · ${escapeHtml(getModelDisplayName(profile.provider, profile.model))} · 并发 ${getProfileConcurrency(profile)}${disabledReason ? ` · ${disabledReason}` : ''}
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
        label.className = `resource-check-item ${isUsable ? '' : 'disabled'}`;
        label.innerHTML = `
            <input type="checkbox" value="${profile.id}" ${nextSelectedIds.has(profile.id) ? 'checked' : ''} ${isUsable ? '' : 'disabled'}>
            <span class="resource-main">
                <span class="resource-title">${escapeHtml(profile.name)}</span>
                <span class="resource-meta">
                    ${getPlatformName(profile.provider)} · ${escapeHtml(getModelDisplayName(profile.provider, profile.model))} · 并发 ${getProfileConcurrency(profile)}${isApiProfileTranslationOnly(profile) ? ' · 翻译专用' : ''}${disabledReason ? ` · ${disabledReason}` : ''}
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
                <div class="api-profile-main">
                    <div class="api-profile-title">
                        <strong title="${escapeAttribute(profile.name)}">${escapeHtml(profile.name)}</strong>
                        <span class="api-profile-tag">${isActive ? '默认' : getPlatformName(profile.provider)}</span>
                        ${isGatewayProvider(profile.provider) ? '<span class="api-profile-tag gateway">中转网关</span>' : ''}
                        ${translationOnly ? '<span class="api-profile-tag">翻译专用</span>' : (compatible ? '' : '<span class="api-profile-tag warning">需单独适配</span>')}
                    </div>
                    <div class="api-profile-meta">
                        ${getPlatformName(profile.provider)} · ${escapeHtml(getModelDisplayName(profile.provider, profile.model))} · 并发 ${getProfileConcurrency(profile)} · ${profile.apiKey ? '已保存 Key' : '未填写 Key'}${translationOnly ? ` · ${profile.apiSecret ? '已保存 Secret' : '未填写 Secret'}` : ''}
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
        try {
            await requestModelContent(profile, {
                model: profile.model,
                messages: [{ role: 'user', content: '不要推理，不要解释，请只回复 OK。' }],
                temperature: 0,
                max_tokens: getPreflightMaxTokens(profile, profile.model, 0)
            }, null, API_PREFLIGHT_TIMEOUT_MS, { reasoningEffort: 'minimal' });
            apiStatus.textContent = `通道测试通过：${profile.name}`;
            apiStatus.className = 'api-status success';
            return true;
        } catch (error) {
            const familyHint = isGatewayProvider(profile.provider)
                ? '请确认这个 Key 属于当前选择的 AIGoCode 模型族，并支持第三方调用。'
                : profile.provider === 'xiaomi'
                    ? 'MiMo 使用官方 OpenAI-compatible 入口；如果仍失败，请确认已开通对应模型/插件服务，并检查 Key、模型权限和账户余额。'
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
            toggleBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6,9 12,15 18,9"/></svg>';
        } else {
            configContent.style.display = 'none';
            toggleBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18,15 12,9 6,15"/></svg>';
        }
    });

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
        setTimeout(() => {
            apiStatus.textContent = '';
        }, 2000);
    });

    clearBtn.addEventListener('click', () => {
        clearProfileForm();
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

    if (panel) {
        panel.style.display = 'block';
        panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    if (content) {
        content.style.display = 'grid';
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

function createAnthropicCompatibleHeaders(apiConfig) {
    const headers = {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01'
    };

    if (apiConfig?.provider === 'xiaomi') {
        headers['Authorization'] = `Bearer ${apiConfig.apiKey}`;
        return headers;
    }

    headers['x-api-key'] = apiConfig.apiKey;
    if (apiConfig?.provider === 'aigocodeClaude') {
        headers['Authorization'] = `Bearer ${apiConfig.apiKey}`;
    }
    return headers;
}

function createProviderRequest(apiConfig, body) {
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
            headers: createAnthropicCompatibleHeaders(apiConfig),
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

    if (isApiRateLimitSignal(code, status, rawMessage, rawText)) {
        const retryText = retryDelayMs > 0 ? `；接口建议约 ${Math.ceil(retryDelayMs / 1000)} 秒后再试` : '';
        return `额度或频率已达到限制${retryText}。原始提示：${rawMessage}`;
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

function createApiRequestError(message, status, payload, rawText) {
    const error = new Error(message);
    const code = payload?.error?.code ?? payload?.code;
    const payloadStatus = payload?.error?.status ?? payload?.status;
    error.status = status;
    error.payload = payload;
    error.rawText = rawText;
    error.retryAfterMs = getApiRetryDelayMs(payload, rawText);
    error.isRateLimited = isApiRateLimitSignal(code, status || payloadStatus, message, rawText);
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

function withProviderChatTuning(apiConfig, body, options = {}) {
    if (!isGeminiProfile(apiConfig)) return body;

    return {
        ...body,
        reasoning_effort: body.reasoning_effort || options.reasoningEffort || 'low'
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

        const canRetryAsChat = apiConfig?.provider === 'aigocodeOpenai' &&
            shouldUseAigocodeResponses(model) &&
            /unsupported\s+content\s+type|content.?type/i.test(String(error?.message || error?.rawText || ''));
        if (!canRetryAsChat) {
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
    const l10nAiModelSelect = document.getElementById('l10nAiModel');
    const glossaryModelSelect = document.getElementById('glossaryModel');
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

    [aiModelSelect, l10nAiModelSelect, glossaryModelSelect, globalAiModelSelect].forEach(select => {
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
    const l10nAiModelSelect = document.getElementById('l10nAiModel');
    const glossaryModelSelect = document.getElementById('glossaryModel');

    [aiModelSelect, l10nAiModelSelect, glossaryModelSelect].forEach(select => {
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

document.addEventListener('DOMContentLoaded', function() {
    const navItems = document.querySelectorAll('.nav-item');
    const tools = {
        split: document.getElementById('split-tool'),
        translate: document.getElementById('translate-tool'),
        convert: document.getElementById('convert-tool'),
        'l10n-check': document.getElementById('l10n-check-tool'),
        glossary: document.getElementById('glossary-tool')
    };

    const apiConfigPanel = document.getElementById('apiConfigPanel');
    const toolsRequiringApi = ['translate', 'l10n-check', 'glossary'];

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

        apiConfigPanel.style.display = toolsRequiringApi.includes(targetTool) ? 'block' : 'none';
    }

    navItems.forEach(item => {
        item.addEventListener('click', function() {
            showTool(this.dataset.tool);
        });
    });

    initApiConfig();
    syncGlobalModel();
    installFileDropGuards();

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

    onFile(file);
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
        const totalRows = sheetData.length;
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
    const cancelTranslateBtn = document.getElementById('translateCancelBtn');
    const translateProfileList = document.getElementById('translateProfileList');

    let isPaused = false;
    let isTranslationCancelled = false;
    let currentTranslateAbortController = null;
    let activeTranslateRunId = null;
    let resumeResolve = null;
    let selectedTranslateProfileIds = new Set();

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

    loadProjects();
    renderProjects();
    renderTranslateProfileList();
    document.addEventListener('nexus:api-profiles-updated', renderTranslateProfileList);

    fileInput.addEventListener('click', (e) => e.stopPropagation());
    uploadArea.addEventListener('click', () => fileInput.click());
    bindUploadDrop(uploadArea, fileInput, handleTranslateFile);

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleTranslateFile(e.target.files[0]);
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
        hideStatus();
        if (resumeResolve) {
            resumeResolve();
            resumeResolve = null;
        }
    }

    function waitForResume() {
        return new Promise(resolve => {
            resumeResolve = resolve;
        });
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
        if (resumeResolve) {
            resumeResolve();
            resumeResolve = null;
        }

        isPaused = false;
        pauseBtn.style.display = 'inline-flex';
        resumeBtn.style.display = 'none';
        downloadProgressBtn.style.display = 'none';
        progressSection.style.display = 'none';
        downloadSection.style.display = 'none';
        clearTranslationProgress();

        translatedData = null;
        translatedDataLocal = null;
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
        let dataToDownload = translatedData;

        if (!dataToDownload) {
            const saved = loadTranslationProgress();
            if (saved) {
                dataToDownload = saved.translatedData;
            }
        }

        if (!dataToDownload) {
            alert('没有可下载的进度数据');
            return;
        }

        const ws = XLSX.utils.aoa_to_sheet(dataToDownload);
        const csvContent = XLSX.utils.sheet_to_csv(ws);
        const utf8Bytes = new TextEncoder().encode(csvContent);
        const blob = new Blob([utf8Bytes], { type: 'text/csv;charset=utf-8' });

        const fileName = `${originalFileName}_progress.csv`;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

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
            currentProject = projects[0];
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
            currentProject = projects.find(project => project.id === 'yongbingxiaozhen') || projects[0] || null;
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
        projects.forEach(project => {
            const div = document.createElement('div');
            div.className = `project-item ${currentProject && currentProject.id === project.id ? 'active' : ''}`;
            div.innerHTML = `
                <div class="project-info">
                    <span class="project-name">${project.name}</span>
                    <span class="project-hint">点击选择 | 双击编辑</span>
                </div>
                <div class="project-actions">
                    <button class="action-btn mini" data-id="${project.id}" data-action="view">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                            <circle cx="12" cy="12" r="3"/>
                        </svg>
                        <span>查看</span>
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
            currentProject = projects[0] || null;
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
        }

        saveProjectsToStorage();
        renderProjects();
        closeModal();
    }

    async function handleTranslateFile(file) {
        if (progressSection.style.display !== 'none') {
            cancelTranslateTask({ silent: true });
        }

        originalFileName = file.name.replace(/\.(csv|xlsx|xls)$/i, '');
        const extension = file.name.split('.').pop().toLowerCase();

        document.getElementById('translateFileName').textContent = file.name;

        if (extension === 'csv') {
            const { text, encoding } = await readCSVWithEncoding(file);
            document.getElementById('translateFileEncoding').textContent = encoding;

            const result = XLSX.read(text, { type: 'string', cellDates: true });
            const sheetName = result.SheetNames[0];
            sheetData = XLSX.utils.sheet_to_json(result.Sheets[sheetName], { header: 1 });
        } else {
            document.getElementById('translateFileEncoding').textContent = 'N/A (Excel)';
            const arrayBuffer = await file.arrayBuffer();
            const result = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
            const sheetName = result.SheetNames[0];
            sheetData = XLSX.utils.sheet_to_json(result.Sheets[sheetName], { header: 1 });
        }

        document.getElementById('translateTotalRows').textContent = sheetData.length;
        document.getElementById('translateTotalCols').textContent = sheetData[0] ? sheetData[0].length : 0;

        selectedColumns = [];
        renderColumnList();

        fileInfo.style.display = 'block';
        columnSelectSection.style.display = 'block';
        downloadSection.style.display = 'none';
        setStatus('success', '已载入新文件', file.name);
    }

    function renderColumnList() {
        const columnList = document.getElementById('translateColumnList');
        columnList.innerHTML = '';

        if (!sheetData || sheetData.length === 0 || !sheetData[0]) {
            columnList.innerHTML = '<p class="column-hint">无法读取列信息</p>';
            return;
        }

        const headers = sheetData[0];
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

    async function startTranslate() {
        if (activeTranslateRunId && progressSection.style.display !== 'none') {
            setStatus('warning', '已有翻译任务正在运行', '请先点击“取消任务”停止当前任务，或点击“暂停”保存当前进度。');
            return;
        }

        const sourceLang = document.getElementById('sourceLang').value;
        const targetLang = document.getElementById('targetLang').value;
        let activeProfiles = getSelectedTranslateProfiles();

        console.log('🚀 开始翻译', { targetLang, currentProject: currentProject?.name, selectedColumns, sheetDataLength: sheetData?.length });

        if (!currentProject) {
            alert('请先选择游戏项目');
            return;
        }

        if (selectedColumns.length === 0) {
            alert('请先选择要翻译的列');
            return;
        }

        if (!sheetData || sheetData.length === 0) {
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
        translationList.innerHTML = '';

        const totalRows = sheetData.length;
        const totalCells = (totalRows - 1) * selectedColumns.length * activeProfiles.length;

        console.log(`📈 预计翻译 ${totalCells} 个单元格 (共 ${totalRows} 行, ${selectedColumns.length} 列)`);

        // 创建新的数据结构：保留原文，在旁边添加译文列
        translatedDataLocal = [];
        const langNames = {
            'en': '英文',
            'ja': '日文',
            'ko': '韩文',
            'zh-TW': '繁体中文',
            'fr': '法文',
            'de': '德文',
            'es': '西班牙文',
            'pt': '葡萄牙文',
            'ru': '俄文',
            'th': '泰文',
            'vi': '越南文',
            'id': '印尼文'
        };
        const targetLangName = langNames[targetLang] || targetLang;

        // 处理表头：在每个选中的列后面为每个模型通道添加译文列
        const headerRow = [...sheetData[0]];
        const newHeaderRow = [];
        const targetColMap = new Map();

        for (let colIndex = 0; colIndex < headerRow.length; colIndex++) {
            newHeaderRow.push(headerRow[colIndex]);

            if (selectedColumns.includes(colIndex)) {
                activeProfiles.forEach(profile => {
                    const targetColIndex = newHeaderRow.length;
                    newHeaderRow.push(`${headerRow[colIndex]} (${targetLangName} · ${getCompactModelLabel(profile)})`);
                    targetColMap.set(`${colIndex}:${profile.id}`, targetColIndex);
                });
            }
        }
        translatedDataLocal.push(newHeaderRow);

        // 处理数据行
        for (let i = 1; i < totalRows; i++) {
            const row = sheetData[i];
            const newRow = [];

            for (let colIndex = 0; colIndex < row.length; colIndex++) {
                newRow.push(row[colIndex]);

                if (selectedColumns.includes(colIndex)) {
                    activeProfiles.forEach(() => {
                        newRow.push('');
                    });
                }
            }
            translatedDataLocal.push(newRow);
        }

        let startRow = 1;
        successCount = 0;
        failCount = 0;
        let translateCount = 0;

        const savedProgress = loadTranslationProgress();
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

            // 收集所有需要翻译的任务
            const translationTasks = [];
            let filteredEmpty = 0;
            let filteredSpecial = 0;

            for (let i = startRow; i < totalRows; i++) {
                const row = sheetData[i];
                if (!row) {
                    console.log(`⚠️ 第 ${i} 行为空`);
                    continue;
                }

                for (let j = 0; j < selectedColumns.length; j++) {
                    const originalColIndex = selectedColumns[j];
                    const cell = row[originalColIndex];

                    if (typeof cell !== 'string') {
                        filteredEmpty++;
                        console.log(`🔍 过滤非字符串: 行${i}, 列${originalColIndex}, 值:`, cell);
                    } else if (!cell.trim()) {
                        filteredEmpty++;
                    } else if (isSpecialCode(cell)) {
                        filteredSpecial++;
                        console.log(`🔍 过滤特殊代码: 行${i}, 列${originalColIndex}, 值: "${cell}"`);
                    } else {
                        activeProfiles.forEach(profile => {
                            translationTasks.push({
                                rowIndex: i,
                                colIndex: originalColIndex,
                                targetColIndex: targetColMap.get(`${originalColIndex}:${profile.id}`),
                                text: cell,
                                profile
                            });
                        });
                    }
                }
            }

            console.log(`✅ 收集到 ${translationTasks.length} 个翻译任务 (过滤空值: ${filteredEmpty}, 过滤特殊代码: ${filteredSpecial})`);

            let completedCount = 0;
            const totalTasks = translationTasks.length;

            if (totalTasks === 0) {
                clearTranslationProgress();
                translatedData = translatedDataLocal;
                progressSection.style.display = 'none';
                downloadSection.style.display = 'block';
                document.getElementById('translatedCount').textContent = '0';
                setStatus('success', '翻译完成', '没有需要翻译的有效文本');
                return;
            }

            function commitTranslateResult(task, translated) {
                throwIfTranslationCancelled(runId);
                if (!translated.startsWith('[翻译失败]')) {
                    successCount++;
                } else {
                    failCount++;
                }
                translatedDataLocal[task.rowIndex][task.targetColIndex] = translated;
                translateCount++;
                completedCount++;

                addTranslationItem(translationList, task.text, translated, task.rowIndex, task.colIndex, task.profile);

                const progress = Math.round((completedCount / totalTasks) * 100);
                updateTranslateProgress(completedCount, totalTasks, progress);
                document.getElementById('translateProgressInfo').textContent =
                    `正在翻译... (已完成 ${completedCount}/${totalTasks} 个，通道 ${task.profile.name})`;

                if (completedCount % 10 === 0) {
                    saveTranslationProgress({
                        fileName: originalFileName,
                        totalRows: totalRows,
                        currentRow: Math.max(...translationTasks.slice(0, completedCount).map(t => t.rowIndex)) + 1,
                        translatedData: translatedDataLocal,
                        successCount: successCount,
                        failCount: failCount,
                        selectedColumns: selectedColumns,
                        targetLang: targetLang,
                        selectedProfileIds: [...selectedTranslateProfileIds]
                    });
                }
            }

            async function processTranslateTask(task) {
                throwIfTranslationCancelled(runId);
                while (isPaused && !isTranslationCancelled) {
                    await waitForResume();
                }
                throwIfTranslationCancelled(runId);

                await waitForNetwork();

                const translated = await translateTextWithRetry(task.text, sourceLang, targetLang, currentProject.rules, task.profile, 3, runSignal);
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
                const translations = await translateBatchWithRetry(tasks, sourceLang, targetLang, currentProject.rules, profile, runSignal);
                throwIfTranslationCancelled(runId);

                if (translations && translations.length === tasks.length) {
                    tasks.forEach((task, index) => {
                        commitTranslateResult(task, translations[index] || `[翻译失败] ${task.text}`);
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
            translatedData = translatedDataLocal;

            progressSection.style.display = 'none';
            downloadSection.style.display = 'block';
            document.getElementById('translatedCount').textContent = translateCount;

            setStatus('success', '翻译完成！', `成功 ${successCount} 个，失败 ${failCount} 个`, function() {
                document.getElementById('translate-tool').scrollIntoView({ behavior: 'smooth' });
            });

        } catch (error) {
            if (isTranslationCancelled || error.name === 'AbortError' || error.message === 'TRANSLATION_CANCELLED') {
                console.log('Translate cancelled');
                setStatus('warning', '翻译任务已取消', '已停止后续请求。现在可以重新选择模型、调整配置，或上传新的文件。');
            } else {
                console.error('Translate error:', error);
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
                <div class="translation-result ${translated.startsWith('[翻译失败]') ? 'error' : ''}">${escapeHtml(truncatedTranslated)}</div>
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
        if (!translatedData) {
            alert('没有可下载的翻译结果');
            return;
        }

        const ws = XLSX.utils.aoa_to_sheet(translatedData);
        const csvContent = XLSX.utils.sheet_to_csv(ws);
        const utf8Bytes = new TextEncoder().encode(csvContent);
        const blob = new Blob([utf8Bytes], { type: 'text/csv;charset=utf-8' });

        const fileName = `${originalFileName}_translated.csv`;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function resetTranslateTool() {
        sheetData = null;
        originalFileName = '';
        translatedData = null;
        translatedDataLocal = null;
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
        progressSection.style.display = 'none';
        downloadSection.style.display = 'none';
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

    function buildBatchTranslatePromptParts(texts, sourceLang, targetLang, rules) {
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
        const systemPrompt = `你是批量游戏本地化翻译引擎。将 texts 中的游戏文本逐条翻译成${langNames[targetLang] || targetLang}。
只返回 JSON 字符串数组，数组长度必须等于 texts 数量，顺序必须一致。不要解释，不要输出思考过程，不要 Markdown。
要求：完整翻译；保留 %s/%d、\\n、数字、HTML/颜色/outline 标签；语言自然简洁。
项目规则：${compactRules || '按通用游戏本地化规范执行'}`;
        const userPrompt = `texts:
${JSON.stringify(payload)}`;

        return {
            systemPrompt,
            userPrompt,
            cacheKey: makePromptCacheKey('translate', `${sourceLang}:${targetLang}:${systemPrompt}`)
        };
    }

    function buildBatchTranslatePrompt(texts, sourceLang, targetLang, rules) {
        const { systemPrompt, userPrompt } = buildBatchTranslatePromptParts(texts, sourceLang, targetLang, rules);
        return `${systemPrompt}\n\n${userPrompt}`;
    }

    async function translateBatchWithRetry(tasks, sourceLang, targetLang, rules, profile, signal, retries = 2) {
        if (!tasks || tasks.length <= 1 || profile.provider === 'youdaoTranslate') return null;

        const apiConfig = profile || getApiConfig();
        const model = apiConfig.model || document.getElementById('aiModel').value;
        const texts = tasks.map(task => task.text);

        for (let attempt = 0; attempt < retries; attempt++) {
            try {
                await waitForNetwork();
                if (signal?.aborted) {
                    throw new Error('TRANSLATION_CANCELLED');
                }
                const promptParts = buildBatchTranslatePromptParts(texts, sourceLang, targetLang, rules);
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

    async function translateTextWithRetry(text, sourceLang, targetLang, rules, profile = null, retries = 3, signal = null) {
        const apiConfig = profile || getApiConfig();
        const model = apiConfig.model || document.getElementById('aiModel').value;

        if (!apiConfig.apiKey) {
            throw new Error(`${apiConfig.name || getPlatformName(apiConfig.provider)} 未添加 API Key`);
        }

        console.log(`🤖 正在使用翻译通道: ${apiConfig.name || getPlatformName(apiConfig.provider)} / ${model}`);

        for (let attempt = 0; attempt < retries; attempt++) {
            try {
                await waitForNetwork();
                if (signal?.aborted) {
                    throw new Error('TRANSLATION_CANCELLED');
                }

                if (apiConfig.provider === 'youdaoTranslate') {
                    return await translateWithYoudaoLlm(text, sourceLang, targetLang, rules, apiConfig, signal);
                }

                const prompt = buildTranslatePrompt(text, sourceLang, targetLang, rules);
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
                    return '[翻译失败] ' + text;
                }
                await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
            }
        }
        return '[翻译失败] ' + text;
    }

    function buildTranslatePrompt(text, sourceLang, targetLang, rules) {
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

        return `将下面游戏文本翻译成${langNames[targetLang] || targetLang}。只返回译文。

要求：完整翻译；保留 %s/%d、\\n、数字、HTML/颜色/outline 标签；语言自然简洁；不要解释，不要输出思考过程。

项目规则：${compactRules || '按通用游戏本地化规范执行'}

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

function initL10nCheckTool() {
    const uploadArea = document.getElementById('l10nUploadArea');
    const fileInput = document.getElementById('l10nFileInput');
    const fileInfo = document.getElementById('l10nFileInfo');
    const columnSelectSection = document.getElementById('l10nColumnSelect');
    const checkBtn = document.getElementById('l10nCheckBtn');
    const downloadBtn = document.getElementById('l10nDownloadBtn');
    const downloadGlossaryBtn = document.getElementById('l10nDownloadGlossaryBtn');
    const resetBtn = document.getElementById('l10nResetBtn');
    const confirmColumnBtn = document.getElementById('l10nConfirmColumnBtn');
    const progressSection = document.getElementById('l10nProgressSection');
    const resultsSection = document.getElementById('l10nResults');
    const pauseBtn = document.getElementById('l10nPauseBtn');
    const resumeBtn = document.getElementById('l10nResumeBtn');
    const downloadProgressBtn = document.getElementById('l10nDownloadProgressBtn');
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
    const channelStatusPanel = document.getElementById('l10nChannelStatusPanel');
    const channelStatusGrid = document.getElementById('l10nChannelStatusGrid');

    let sheetData = null;
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
    let resumeResolve = null;
    let isCheckCancelled = false;
    let activeCheckRunId = null;
    let currentCheckAbortController = null;
    let importedHistoryState = createEmptyHistoryImportState();
    let channelProgressState = new Map();

    const L10N_PROGRESS_KEY = 'l10n_check_progress';
    const L10N_AUTO_SAVE_KEY = 'nexus_l10n_auto_save_enabled';
    const L10N_HISTORY_VERSION = 'nexus-l10n-history-v1';
    const L10N_STATUS_PASS = '通过';
    const L10N_STATUS_ISSUE = '异常问题';
    const L10N_STATUS_DISAGREE = '复核分歧';
    const L10N_STATUS_SKIPPED = '未检测';
    const L10N_RULE_ENGINE_VERSION = 'hidden-rules-v2';
    const L10N_CHECK_CACHE_KEY = 'nexus_l10n_check_cache_v2';
    const L10N_CHECK_CACHE_VERSION = 2;
    const L10N_CHECK_CACHE_LIMIT = 3000;
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
    cancelBtn.addEventListener('click', cancelCheckTask);
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

    function makeL10nAutoSaveFileName(kind) {
        const kindLabels = {
            final: 'final',
            partial: 'partial',
            error: 'error',
            cancelled: 'cancelled'
        };
        return `${getL10nReportBaseName()}_l10n_${kindLabels[kind] || 'partial'}_${getL10nTimestamp()}.csv`;
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

            if (fallbackDownload) {
                downloadCsvRows(rows, fileName);
                return fileName;
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
        if (resumeResolve) {
            resumeResolve();
            resumeResolve = null;
        }
    }

    function waitForResume() {
        return new Promise(resolve => {
            resumeResolve = resolve;
        });
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
        cancelBtn.style.display = 'inline-flex';
    }

    function showL10nStoppedControls(canDownload = false) {
        isPaused = false;
        pauseBtn.style.display = 'none';
        resumeBtn.style.display = 'none';
        downloadProgressBtn.style.display = canDownload ? 'inline-flex' : 'none';
        cancelBtn.style.display = 'inline-flex';
    }

    function showL10nFailurePanel(title, message) {
        const checkList = document.getElementById('l10nCheckList');
        progressSection.style.display = 'block';
        updateProgress(0, 0, 0);
        document.getElementById('l10nProgressInfo').textContent = message || title;
        showL10nStoppedControls(checkResults.length > 0 || realtimeCheckResults.length > 0);

        if (checkList) {
            checkList.innerHTML = `
                <div class="check-list-empty error-state">
                    <strong>${escapeHtml(title)}</strong>
                    <span>${escapeHtml(message || '请检查 API Key、Base URL、模型权限或账户余额后重新开始。')}</span>
                </div>
            `;
        }
    }

    function getFriendlyApiErrorMessage(error, profile) {
        const message = String(error?.message || '接口返回异常').replace(/\s+/g, ' ').trim();
        if (error?.isTimeout || error?.name === 'ApiTimeoutError' || /超时|timeout/i.test(message)) {
            return `${profile?.name || getPlatformName(profile?.provider)} 响应超时：${message}。建议先降低该通道并发，或稍后重试；已产生的结果可以下载后导入继续。`;
        }
        if (error?.isRateLimited) {
            const retryText = error.retryAfterMs > 0
                ? `接口建议等待 ${Math.ceil(error.retryAfterMs / 1000)} 秒后重试`
                : '建议降低并发或稍后重试';
            return `${profile?.name || getPlatformName(profile?.provider)} 触发额度/频率限制：${message}。${retryText}。`;
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
        if (resumeResolve) {
            resumeResolve();
            resumeResolve = null;
        }

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
            issues,
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
            issues
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
            issues
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
            issues,
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

    function getReportReferenceHeaders(results = []) {
        const headers = [];
        const addHeader = header => {
            const label = normalizeReferenceHeader(header);
            if (label && !headers.includes(label)) headers.push(label);
        };

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
                <div class="mode-card ${isActive ? 'active' : ''}" data-mode="${mode}">
                    <strong>${escapeHtml(config.label)}${isActive ? ' · 当前选择' : ''}</strong>
                    <span>${escapeHtml(config.description)}</span>
                </div>
            `;
        }).join('');
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

    function getRelevantGlossarySignature(source, target, glossaryTerms) {
        const relevantTerms = getRelevantGlossaryTerms(source, target, glossaryTerms)
            .map(term => ({
                source: normalizeFingerprintText(term.source).toLowerCase(),
                target: normalizeFingerprintText(term.target).toLowerCase(),
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
            glossary: getRelevantGlossarySignature(task.sourceText, task.targetText, glossaryTerms)
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
            glossaryFingerprint: getRelevantGlossarySignature(task.sourceText, task.targetText, glossaryTerms)
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
                tasks.push({
                    rowIndex: i,
                    sourceText,
                    targetText,
                    originalReferences: buildOriginalReferenceMap(row, referenceColumns)
                });
            }
        }

        return tasks;
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
            .map(term => [term.source, term.target, term.type].join('='))
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
        const targetNumbers = new Set(extractNumbers(target));
        const missingNumbers = sourceNumbers.filter(number => !targetNumbers.has(number));
        if (missingNumbers.length > 0) {
            issues.push(buildHiddenRuleIssue(
                'number_mismatch',
                '游戏翻译基本规范',
                '数字信息不一致',
                `译文缺少或改写了原文数字：${missingNumbers.join('、')}`,
                { severity: '严重', evidence: missingNumbers.join('、') }
            ));
        }

        const relevantTerms = getRelevantGlossaryTerms(source, target, glossaryTerms);
        relevantTerms.forEach(term => {
            if (!term.target) return;
            const sourceMatches = source.toLowerCase().includes(term.source.toLowerCase());
            const targetMatches = target.toLowerCase().includes(term.target.toLowerCase());
            if (sourceMatches && !targetMatches) {
                issues.push(buildHiddenRuleIssue(
                    'glossary_term_mismatch',
                    '术语表限制',
                    `术语“${term.source}”未使用指定译法`,
                    `术语表要求“${term.source}”译为“${term.target}”，当前译文未命中该译法`,
                    { severity: '严重', corrected: term.target, evidence: `${term.source} -> ${term.target}` }
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
            `${originalFileName || 'l10n_check'}_current_check_results.csv`
        );
        setStatus('success', '当前检测结果已下载', `已导出 ${resultsToDownload.length} 条实时检测结果`);
    }

    fileInput.addEventListener('click', (e) => e.stopPropagation());
    uploadArea.addEventListener('click', () => fileInput.click());
    bindUploadDrop(uploadArea, fileInput, handleL10nFile);

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleL10nFile(e.target.files[0]);
        }
    });

    confirmColumnBtn.addEventListener('click', confirmColumnSelection);
    checkBtn.addEventListener('click', startCheck);
    downloadBtn.addEventListener('click', downloadReport);
    downloadGlossaryBtn.addEventListener('click', downloadGlossary);
    resetBtn.addEventListener('click', resetTool);

    async function handleL10nFile(file) {
        if (activeCheckRunId || progressSection.style.display !== 'none') {
            cancelCheckTask({ silent: true, skipConfirm: true });
        }

        originalFileName = file.name.replace(/\.(csv|xlsx|xls)$/i, '');
        const extension = file.name.split('.').pop().toLowerCase();

        document.getElementById('l10nFileName').textContent = file.name;

        if (extension === 'csv') {
            const { text } = await readCSVWithEncoding(file);
            const result = XLSX.read(text, { type: 'string', cellDates: true });
            const sheetName = result.SheetNames[0];
            sheetData = XLSX.utils.sheet_to_json(result.Sheets[sheetName], { header: 1 });
        } else {
            const arrayBuffer = await file.arrayBuffer();
            const result = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
            const sheetName = result.SheetNames[0];
            sheetData = XLSX.utils.sheet_to_json(result.Sheets[sheetName], { header: 1 });
        }

        document.getElementById('l10nTotalRows').textContent = sheetData.length;
        document.getElementById('l10nTotalCols').textContent = sheetData[0] ? sheetData[0].length : 0;

        sourceColumn = null;
        targetColumn = null;
        renderColumnLists();

        fileInfo.style.display = 'block';
        columnSelectSection.style.display = 'block';
        progressSection.style.display = 'none';
        resultsSection.style.display = 'none';
        checkResults = [];
        realtimeCheckResults = [];
        glossaryData = [];
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
            option.textContent = project.name;
            projectSelect.appendChild(option);
        });
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
                    <span class="resource-meta">${entryTerms.length} 条术语 · ${entry.origin === 'extracted' ? '提取生成' : '上传记录'}${entry.sourceFileName ? ` · ${escapeHtml(entry.sourceFileName)}` : ''}</span>
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

    async function startCheck() {
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

        checkResults = [];
        realtimeCheckResults = [];
        glossaryData = [];
        let checkedCount = 0;

        const savedProgress = loadL10nProgress();
        if (savedProgress && savedProgress.fileName === originalFileName) {
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

        try {
            const checkCache = loadL10nCheckCache();
            const completedRows = new Set(checkResults
                .filter(result => Number.isInteger(result.rowIndex))
                .map(result => result.rowIndex));
            let completedCount = checkResults.length;
            checkedCount = checkResults.length;
            let liveIssueCount = getIssueResultCount();
            let checkTasks = buildCurrentCheckTasks(completedRows);
            const aiCheckTasks = [];
            const localResolvedEntries = [];

            checkTasks.forEach(task => {
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

            let totalTasks = checkMode === 'strict'
                ? completedCount + (checkTasks.length * activeProfiles.length)
                : completedCount + checkTasks.length;

            if (totalTasks === 0) {
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

            updateProgress(completedCount, totalTasks, Math.round((completedCount / totalTasks) * 100));
            document.getElementById('l10nProgressInfo').textContent =
                `${modeConfig.label}已启用：${estimateTokenSaving(modeConfig, checkTasks.length, activeProfiles)}`;

            await preflightL10nProfiles(activeProfiles, runSignal);
            throwIfCheckCancelled(runId);
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

            function createModelReviewFromEntry(entry) {
                return {
                    profileId: entry.profileId,
                    profileName: entry.profileName,
                    provider: entry.provider,
                    model: entry.model,
                    modelLabel: entry.modelLabel,
                    status: entry.status,
                    issue: entry.issue,
                    corrected: entry.corrected,
                    reason: entry.reason || (entry.status === L10N_STATUS_PASS ? '通过' : ''),
                    issueType: entry.issueType || '',
                    severity: entry.severity || '',
                    detectionSource: entry.detectionSource || '',
                    evidence: entry.evidence || '',
                    ruleIds: entry.ruleIds || '',
                    issues: entry.issues || [],
                    historyReused: Boolean(entry.historyReused),
                    historyMatchType: entry.historyMatchType || '',
                    historyFileName: entry.historyFileName || ''
                };
            }

            async function processProfileBatch(batch, profile) {
                throwIfCheckCancelled(runId);
                while (isPaused && !isCheckCancelled) {
                    await waitForResume();
                }
                throwIfCheckCancelled(runId);

                await waitForNetwork();
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
                const workers = [];
                const toleratedFailures = [];
                const failedProfileKeys = new Set();
                activeProfiles.forEach(profile => {
                    const queue = jobsByProfile.get(profile.id) || [];
                    const batches = chunkArray(queue, modeConfig.batchSize);
                    let nextIndex = 0;
                    const workerCount = Math.min(getProfileConcurrency(profile), batches.length);
                    const existingState = channelProgressState.get(getChannelProfileKey(profile));
                    const profileKey = getChannelProfileKey(profile);

                    if (queue.length > 0) {
                        updateChannelProgress(profile, {
                            total: Math.max(Number(existingState?.total || 0), Number(existingState?.completed || 0) + queue.length),
                            status: 'waiting',
                            message: `已排队 ${queue.length} 条，批次 ${batches.length} 个，并发 ${workerCount}`
                        });
                    } else if (existingState && existingState.total === 0) {
                        updateChannelProgress(profile, {
                            status: 'done',
                            message: '当前阶段无需该通道处理'
                        });
                    }

                    for (let workerIndex = 0; workerIndex < workerCount; workerIndex++) {
                        workers.push((async () => {
                            while (nextIndex < batches.length) {
                                if (continueOnProfileError && failedProfileKeys.has(profileKey)) return;
                                throwIfCheckCancelled(runId);
                                const batch = batches[nextIndex++];
                                try {
                                    updateChannelProgress(profile, {
                                        status: 'running',
                                        message: `正在检测第 ${batch[0]?.rowIndex + 1 || '-'} 行附近，批量 ${batch.length} 条`
                                    });
                                    const entries = await processProfileBatch(batch, profile);
                                    throwIfCheckCancelled(runId);
                                    await onBatchDone(entries, batch, profile);
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
                                            : (completed >= total ? '已完成该通道检测' : `已完成 ${completed}/${total}`)
                                    });
                                } catch (error) {
                                    const isAbortOrCancel = error.name === 'AbortError' || error.message === 'L10N_CHECK_CANCELLED' || isCheckCancelled;
                                    if (isAbortOrCancel) {
                                        updateChannelProgress(profile, {
                                            status: 'paused',
                                            message: '任务已暂停或取消'
                                        });
                                    } else {
                                        updateChannelProgress(profile, {
                                            status: 'failed',
                                            message: getFriendlyApiErrorMessage(error, profile)
                                        });
                                    }
                                    if (continueOnProfileError && !isAbortOrCancel) {
                                        if (!failedProfileKeys.has(profileKey)) {
                                            failedProfileKeys.add(profileKey);
                                            toleratedFailures.push({ profile, error });
                                        }
                                        return;
                                    }
                                    throw error;
                                }
                            }
                        })());
                    }
                });

                await Promise.all(workers);
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
                const reviewsByRow = new Map(checkTasks.map(task => [task.rowIndex, { task, reviews: [] }]));
                const jobsByProfile = new Map(activeProfiles.map(profile => [profile.id, []]));
                checkTasks.forEach(task => {
                    activeProfiles.forEach(profile => {
                        jobsByProfile.get(profile.id)?.push(task);
                    });
                });

                await runProfileBatchQueues(jobsByProfile, async (entries, batch, profile) => {
                    entries.forEach(entry => {
                        reviewsByRow.get(entry.rowIndex)?.reviews.push(createModelReviewFromEntry(entry));
                        addRealtimeCheckItem(entry, true);
                        completedCount++;
                    });
                    updateCheckProgress(profile);
                });

                throwIfCheckCancelled(runId);
                [...reviewsByRow.values()]
                    .sort((a, b) => a.task.rowIndex - b.task.rowIndex)
                    .forEach(({ task, reviews }) => {
                        const checkEntry = createReviewedCheckResultEntry(task, reviews, 'review', activeProfiles);
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
                const isChannelError = error.message &&
                    (error.message.includes('检测通道不可用') || error.message.includes('API 请求失败') || error.message.includes('超时'));
                keepFailurePanel = isChannelError;
                const savedText = savedPath ? `；已自动保存当前结果：${savedPath}` : '';
                setStatus(
                    'error',
                    isChannelError ? '检测通道不可用' : '检测失败',
                    `${error.message || '请检查 API Key、Base URL、模型权限或账户余额'}${savedText}`,
                    isChannelError ? revealApiConfigPanel : null,
                    '去检查 API 配置'
                );
                if (isChannelError) {
                    showL10nFailurePanel('检测通道不可用', `${error.message || '请检查 API Key、Base URL、模型权限或账户余额'}${savedText}`);
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
                    showL10nStoppedControls(checkResults.length > 0 || realtimeCheckResults.length > 0);
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
            getRelevantGlossaryTerms(task.sourceText, task.targetText, glossaryTerms).forEach(term => {
                const key = `${term.source}|${term.target}|${term.type}`;
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
            const targetText = term.target ? term.target : '未填写固定译法';
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

只返回 JSON，不要解释。通过行只返回 {"id": 行id, "ok": true}；异常行才返回 issues。格式：
{
  "results": [
    { "id": 1, "ok": true },
    {
      "id": 2,
      "ok": false,
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

没有问题的行不要写原因，只能返回 {"id": 行id, "ok": true}。`;
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
                issues: normalizeIssues(row)
            });
        });

        tasks.forEach(task => {
            if (!resultMap.has(task.rowIndex)) {
                resultMap.set(task.rowIndex, null);
            }
        });

        return resultMap;
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
                    throw new Error(`${profileName} API 请求失败：${error.message || '接口返回异常'}`);
                }
                const retryDelay = error.retryAfterMs > 0
                    ? Math.min(error.retryAfterMs, 60000)
                    : 1000 * (attempt + 1);
                await new Promise(resolve => setTimeout(resolve, retryDelay));
            }
        }

        return new Map(tasks.map(task => [task.rowIndex, null]));
    }

    async function processCheckBatchWithCache(tasks, profile, project, glossaryTerms, cacheEntries, signal = null) {
        const entries = [];
        const missingTasks = [];
        const taskMeta = new Map();

        tasks.forEach(task => {
            const relevantTerms = getRelevantGlossaryTerms(task.sourceText, task.targetText, glossaryTerms);
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

    function getRelevantGlossaryTerms(source, target, glossaryTerms) {
        if (!glossaryTerms || glossaryTerms.length === 0) return [];

        const sourceText = String(source || '').toLowerCase();
        const relevantTerms = glossaryTerms.filter(term => {
            const sourceTerm = String(term.source || '').toLowerCase();
            if (!sourceTerm) return false;
            if (!hasCjkText(sourceTerm) || isIdLikeGlossaryValue(sourceTerm)) return false;

            return sourceText.includes(sourceTerm);
        });

        return relevantTerms.slice(0, 80);
    }

    function buildGlossaryPromptSection(source, target, glossaryTerms) {
        const terms = getRelevantGlossaryTerms(source, target, glossaryTerms);
        if (terms.length === 0) return '';

        const rows = terms.map(term => {
            const targetText = term.target ? term.target : '未填写固定译法';
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
4. 术语一致性：检查是否符合已勾选术语表；未勾选术语表时，只检查明显的术语前后不一致
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
            getSortedCheckResults().forEach((result) => {
                const hasIssues = result.status === L10N_STATUS_ISSUE;
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${escapeHtml(result.source)}</td>
                    <td>${escapeHtml(result.target)}</td>
                    <td>${escapeHtml(result.modelLabel || result.profileName || result.model || '未记录')}</td>
                    <td><span class="status-tag ${getCheckStatusClass(result.status)}">${escapeHtml(result.status)}</span></td>
                    <td>${escapeHtml(result.issueType || (hasIssues ? classifyIssueCategory(`${result.issue} ${result.reason}`) : '-'))}</td>
                    <td><span class="severity-tag ${getSeverityClass(result.severity || (hasIssues ? '一般' : '-'))}">${escapeHtml(result.severity || (hasIssues ? '一般' : '-'))}</span></td>
                    <td>${escapeHtml(result.corrected || '无需修改')}</td>
                    <td>${escapeHtml(result.reason || (result.status === L10N_STATUS_PASS ? '通过' : ''))}</td>
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
            originalReferences: buildOriginalReferenceMap(row),
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
            [...referenceHeaders, '检测原文', '检测译文', '检测模型', '检测结果', '问题类型', '严重程度', '修改为', '问题原因', '检测来源', ...L10N_REPORT_COMPLETENESS_HEADERS, ...L10N_REPORT_META_HEADERS],
            ...getSortedCheckResults(results).map(result => [
                ...getReportReferenceCells(result, referenceHeaders),
                result.source,
                result.target,
                result.modelLabel || result.profileName || result.model || '',
                result.status,
                result.issueType || '',
                result.severity || '',
                result.corrected || (result.status === L10N_STATUS_PASS ? '无需修改' : ''),
                result.reason || (result.status === L10N_STATUS_PASS ? '通过' : ''),
                result.detectionSource || (result.status === L10N_STATUS_PASS ? '' : 'AI'),
                ...buildReportCompletenessCells(result, rowGroups.get(result.rowIndex) || []),
                ...buildReportMetadataCells(result, activeProject, activeGlossaryTerms)
            ])
        ];
    }

    function buildOriginalFileReportRows() {
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
                result.reason || (result.status === L10N_STATUS_PASS ? '通过' : ''),
                result.detectionSource || (result.status === L10N_STATUS_PASS ? '' : 'AI'),
                ...buildReportCompletenessCells(result, [result]),
                ...buildReportMetadataCells(result, activeProject, activeGlossaryTerms)
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

    function downloadL10nReport(fileName) {
        downloadCsvRows(buildOriginalFileReportRows(), fileName);
    }

    function downloadReport() {
        if (checkResults.length === 0) {
            alert('没有检测结果可下载');
            return;
        }

        downloadL10nReport(`${originalFileName}_l10n_report.csv`);
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

    function saveL10nProgress(data) {
        localStorage.setItem(L10N_PROGRESS_KEY, JSON.stringify({
            ...data,
            timestamp: Date.now()
        }));
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

        fileInfo.style.display = 'none';
        columnSelectSection.style.display = 'none';
        progressSection.style.display = 'none';
        resultsSection.style.display = 'none';
        hideStatus();
        clearL10nProgress();
    }
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
    const resetBtn = document.getElementById('glossaryResetBtn');
    const glossaryMode = document.getElementById('glossaryMode');
    const glossaryModelRow = document.getElementById('glossaryModelRow');
    const extractTermsBtn = document.getElementById('extractTermsBtn');
    const extractUploadStatus = document.getElementById('extractUploadStatus');
    const uploadGlossaryStatus = document.getElementById('uploadGlossaryStatus');
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

    glossaryMode.addEventListener('change', () => {
        if (glossaryMode.value === 'ai') {
            glossaryModelRow.style.display = 'flex';
        } else {
            glossaryModelRow.style.display = 'none';
        }
    });

    if (glossaryMode.value !== 'ai') {
        glossaryModelRow.style.display = 'none';
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
    resetBtn.addEventListener('click', resetTool);
    document.addEventListener('nexus:glossary-library-updated', renderGlossaryLibrary);
    renderGlossaryLibrary();

    function getGlossaryOriginLabel(origin) {
        return origin === 'extracted' ? '提取生成' : '上传记录';
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

    function chunkGlossaryRecords(records, maxChars = 14000, maxRows = 160) {
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
            /UNAVAILABLE|high demand|temporar|try again|overloaded|rate.?limit|quota/i.test(text);
    }

    async function requestGlossaryAiBatch(apiConfig, body, batchLabel) {
        const retryDelays = [5000, 15000, 30000];
        let lastError = null;

        for (let attempt = 0; attempt <= retryDelays.length; attempt++) {
            try {
                return await requestModelContent(apiConfig, body);
            } catch (error) {
                lastError = error;
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
                await new Promise(resolve => setTimeout(resolve, waitMs));
            }
        }

        throw lastError;
    }

    async function refineTermsWithAI(records, ruleTerms, fullText, apiConfig, model) {
        const sourceRecords = Array.isArray(records) ? records : [];
        const chunks = chunkGlossaryRecords(sourceRecords);
        const totalChunks = Math.max(1, chunks.length);
        const allTerms = [];
        const failedBatches = [];

        for (let index = 0; index < totalChunks; index++) {
            const chunk = chunks[index] || [];
            const progress = Math.round(((index + 1) / totalChunks) * 100);
            document.getElementById('glossaryProgressText').textContent = `${index + 1} / ${totalChunks}`;
            document.getElementById('glossaryProgressPercent').textContent = `${progress}%`;
            document.getElementById('glossaryProgressFill').style.width = `${progress}%`;
            setStatus('processing', `AI 正在全文提炼术语... (${index + 1}/${totalChunks})`, '模型直接阅读原文/译文行，提炼游戏术语并同步检查术语质量');

            const promptParts = buildGlossaryAiPromptParts(chunk, index, totalChunks);
            let resultText = '';
            try {
                resultText = await requestGlossaryAiBatch(apiConfig, {
                    model,
                    messages: [
                        { role: 'system', content: promptParts.systemPrompt, cacheControl: true },
                        { role: 'user', content: promptParts.userPrompt }
                    ],
                    prompt_cache_key: promptParts.cacheKey,
                    temperature: 0.1,
                    max_tokens: 8192
                }, `${index + 1}/${totalChunks}`);
            } catch (error) {
                failedBatches.push(index + 1);
                console.warn('Glossary AI batch failed after retries:', index + 1, error);
                setStatus('processing', `第 ${index + 1} 批暂时失败，继续后续批次`, error.message || 'AI 通道临时不可用');
                await new Promise(resolve => setTimeout(resolve, 500));
                continue;
            }
            const aiTerms = parseGlossaryAiResult(resultText);

            aiTerms.forEach(item => {
                const normalized = normalizeAiGlossaryTerm(item, sourceRecords, fullText);
                if (normalized) allTerms.push(normalized);
            });

            await new Promise(resolve => setTimeout(resolve, 150));
        }

        const aiResult = mergeAiGlossaryTerms(allTerms)
            .filter(term => term.confidence >= 45 || term.qualityStatus === '有问题' || term.count >= 1);

        if (failedBatches.length > 0) {
            setStatus(
                'processing',
                '术语提取已完成可用批次',
                `有 ${failedBatches.length} 个批次因 API 繁忙跳过：${failedBatches.slice(0, 8).join(', ')}${failedBatches.length > 8 ? '...' : ''}`
            );
        }

        if (aiResult.length > 0) return aiResult;
        if (failedBatches.length > 0) {
            throw new Error(`AI 通道持续繁忙，${failedBatches.length} 个批次未成功。请稍后重试，或换用更稳定/额度更高的模型通道。`);
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
        const extension = file.name.split('.').pop().toLowerCase();
        if (extension === 'csv') {
            const { text } = await readCSVWithEncoding(file);
            const result = XLSX.read(text, { type: 'string' });
            const sheetName = result.SheetNames[0];
            const rows = XLSX.utils.sheet_to_json(result.Sheets[sheetName], { header: 1 });
            return { rows, text };
        }

        const arrayBuffer = await file.arrayBuffer();
        const result = XLSX.read(arrayBuffer, { type: 'array' });
        const sheetName = result.SheetNames[0];
        const rows = XLSX.utils.sheet_to_json(result.Sheets[sheetName], { header: 1 });
        return { rows, text: XLSX.utils.sheet_to_csv(result.Sheets[sheetName]) };
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
            ['定位ID/Key', '定位行号', '原文术语（中文）', '原译文/当前译法', '指定译文（英文）', '整理后译文（可直接使用）', '类型', '出现次数', '置信度', '术语质量状态', '术语问题', '修正建议', '提取依据', '提取来源'],
            ...glossaryTerms.map(term => [
                term.referenceId || '',
                term.referenceRows || '',
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
            const { workbook, detailCount } = buildPatchedSourceWorkbook(polishedRowPatches.size > 0);
            const fileBaseName = (currentGlossaryName || sourceFileName || '修正版原文件').replace(/\.(csv|xlsx|xls)$/i, '');
            downloadWorkbook(workbook, `${fileBaseName}_修正版原文件.xlsx`);
            setStatus('success', '修正版原文件已生成', `共生成 ${detailCount} 条修改明细，原术语表仍保留在工作簿中`);
        } catch (error) {
            setStatus('error', '生成修正版失败', error.message);
        }
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
        try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed?.rows) ? parsed.rows : [];
        } catch {
            const match = raw.match(/\{[\s\S]*\}/);
            if (!match) return [];
            try {
                const parsed = JSON.parse(match[0]);
                return Array.isArray(parsed?.rows) ? parsed.rows : [];
            } catch {
                return [];
            }
        }
    }

    async function polishMatchedRowsWithAI() {
        if (!ensureApiKeyConfigured('AI润色修正命中行')) return;

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

        const confirmed = confirm(`将对 ${tasks.length} 条命中问题的译文行进行 AI 润色修正，会额外消耗 API 额度。是否继续？`);
        if (!confirmed) return;

        aiPolishMatchedRowsBtn.disabled = true;
        aiPolishMatchedRowsBtn.textContent = 'AI润色中...';
        progressSection.style.display = 'block';
        const apiConfig = getApiConfig();
        const model = apiConfig.model || document.getElementById('glossaryModel').value;
        const chunks = chunkGlossaryItems(tasks, 30);
        const totalChunks = chunks.length;
        let polishedCount = 0;

        try {
            for (let index = 0; index < totalChunks; index++) {
                const chunk = chunks[index];
                const progress = Math.round(((index + 1) / totalChunks) * 100);
                document.getElementById('glossaryProgressText').textContent = `${index + 1} / ${totalChunks}`;
                document.getElementById('glossaryProgressPercent').textContent = `${progress}%`;
                document.getElementById('glossaryProgressFill').style.width = `${progress}%`;
                setStatus('processing', `AI 正在润色命中行... (${index + 1}/${totalChunks})`, '只处理有术语问题的 ID 行，不重跑全文');

                const promptParts = buildPolishPromptParts(chunk, index, totalChunks);
                const resultText = await requestGlossaryAiBatch(apiConfig, {
                    model,
                    messages: [
                        { role: 'system', content: promptParts.systemPrompt, cacheControl: true },
                        { role: 'user', content: promptParts.userPrompt }
                    ],
                    prompt_cache_key: promptParts.cacheKey,
                    temperature: 0.1,
                    max_tokens: 8192
                }, `${index + 1}/${totalChunks}`);

                parsePolishResult(resultText).forEach(item => {
                    const rowNumber = Number(item.rowNumber);
                    const finalText = String(item.finalTarget || item.target || '').trim();
                    if (!Number.isFinite(rowNumber) || !finalText) return;
                    polishedRowPatches.set(rowNumber, {
                        finalText,
                        reason: String(item.reason || '').trim(),
                        referenceId: String(item.referenceId || '').trim()
                    });
                    polishedCount++;
                });

                await new Promise(resolve => setTimeout(resolve, 150));
            }

            setStatus('success', 'AI润色完成', `已生成 ${polishedCount} 条行级修正，可点击“下载修正版原文件”导出`);
        } catch (error) {
            setStatus('error', 'AI润色失败', error.message);
        } finally {
            progressSection.style.display = 'none';
            aiPolishMatchedRowsBtn.disabled = false;
            aiPolishMatchedRowsBtn.textContent = 'AI润色修正命中行';
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
    }

    function handleExtractFileSelect(file) {
        extractFile = file;
        sourceFileName = file.name;
        currentGlossaryName = file.name.replace(/\.(csv|xlsx|xls)$/i, '');
        currentGlossaryId = '';
        currentGlossaryOrigin = 'extracted';
        sourceWorkbookContext = null;
        polishedRowPatches = new Map();

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
        uploadGlossaryStatus.textContent = `✓ 文件已选择: ${file.name}`;
        uploadGlossaryStatus.className = 'upload-status success';

        setTimeout(() => {
            uploadGlossary(file);
        }, 500);
    }

    async function extractTerms(file) {
        sourceFileName = file.name;
        currentGlossaryName = file.name.replace(/\.(csv|xlsx|xls)$/i, '');
        currentGlossaryId = '';
        currentGlossaryOrigin = 'extracted';
        const extractMode = document.getElementById('glossaryMode').value;

        if (extractMode === 'ai' && !ensureApiKeyConfigured('AI 智能提取术语表')) {
            progressSection.style.display = 'none';
            extractTermsBtn.disabled = false;
            extractTermsBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 12l2 2 4-4"/><path d="M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 0 1-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg> 开始提取术语';
            return;
        }

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
            const records = buildLocalizationRecords(rows);

            console.log('📄 文件内容长度:', text.length);
            console.log('📊 识别到原文/译文行:', records.length);

            if (extractMode === 'ai') {
                console.log('🤖 进入AI全文提取模式');
                const apiConfig = getApiConfig();
                const model = apiConfig.model || document.getElementById('glossaryModel').value;
                console.log('🧠 使用模型:', model);
                terms = await refineTermsWithAI(records, [], text, apiConfig, model);
            } else {
                console.log('⚡ 进入规则提取 V2 模式');
                const professionalCandidates = extractProfessionalTermsByRule(records, text);
                console.log('🧩 本地候选术语:', professionalCandidates.length);
                document.getElementById('glossaryProgressText').textContent = `1 / 1`;
                document.getElementById('glossaryProgressPercent').textContent = `100%`;
                document.getElementById('glossaryProgressFill').style.width = `100%`;
                terms = professionalCandidates;
            }

            const savedEntry = saveGlossaryEntry({
                name: sourceFileName.replace(/\.(csv|xlsx|xls)$/i, ''),
                sourceFileName,
                terms,
                origin: 'extracted'
            });
            if (savedEntry) {
                currentGlossaryId = savedEntry.id;
                currentGlossaryName = savedEntry.name;
            }
            displayTerms();
            setStatus('success', '术语提取完成！', `共提取并保存 ${terms.length} 个术语`);

        } catch (error) {
            console.error('❌ 提取错误:', error);
            setStatus('error', '提取失败', error.message);
            progressSection.style.display = 'none';
        } finally {
            extractTermsBtn.disabled = false;
            extractTermsBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 12l2 2 4-4"/><path d="M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 0 1-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg> 开始提取术语';
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
            const extension = file.name.split('.').pop().toLowerCase();
            let data = [];

            if (extension === 'csv') {
                const { text } = await readCSVWithEncoding(file);
                const result = XLSX.read(text, { type: 'string' });
                const sheetName = result.SheetNames[0];
                data = XLSX.utils.sheet_to_json(result.Sheets[sheetName], { header: 1 });
            } else {
                const arrayBuffer = await file.arrayBuffer();
                const result = XLSX.read(arrayBuffer, { type: 'array' });
                const sheetName = result.SheetNames[0];
                data = XLSX.utils.sheet_to_json(result.Sheets[sheetName], { header: 1 });
            }

            terms = parseGlossaryTableRows(data).map(term => ({
                term: term.source,
                type: term.type || guessTermType(term.source),
                count: term.count || 1,
                translation: term.target || '',
                confidence: term.confidence || 0,
                note: term.note || '',
                extractionSource: term.extractionSource || 'uploaded',
                referenceId: term.referenceId || '',
                referenceRows: term.referenceRows || '',
                originalTranslation: term.originalTranslation || '',
                finalTranslation: term.finalTranslation || term.target || '',
                qualityStatus: term.qualityStatus || '',
                qualityIssues: term.qualityIssues || '',
                qualitySuggestion: term.qualitySuggestion || ''
            }));

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
            origin: currentGlossaryOrigin
        });
        if (savedEntry) {
            currentGlossaryId = savedEntry.id;
            currentGlossaryName = savedEntry.name;
        }

        const fileBaseName = (currentGlossaryName || sourceFileName || '术语表').replace(/\.(csv|xlsx|xls)$/i, '');
        downloadGlossaryRows(buildGlossaryCsvRows(termsWithTranslation), `${fileBaseName}_glossary.csv`);
    }

    function resetTool() {
        terms = [];
        sourceFileName = '';
        currentGlossaryName = '';
        currentGlossaryId = '';
        extractFile = null;
        currentGlossaryOrigin = 'uploaded';
        sourceWorkbookContext = null;
        polishedRowPatches = new Map();

        extractInput.value = '';
        uploadInput.value = '';

        extractUploadStatus.textContent = '';
        extractUploadStatus.className = 'upload-status';
        uploadGlossaryStatus.textContent = '';
        uploadGlossaryStatus.className = 'upload-status';
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
