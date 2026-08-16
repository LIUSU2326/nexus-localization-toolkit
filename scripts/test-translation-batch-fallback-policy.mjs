import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(scriptDir, '..');
const source = fs.readFileSync(path.join(projectDir, 'script.js'), 'utf8');

function extractFunction(functionSource, signature) {
    const start = functionSource.indexOf(signature);
    assert.ok(start >= 0, `${signature} should exist`);
    let parameterDepth = 0;
    let bodyStart = -1;
    for (let index = functionSource.indexOf('(', start); index < functionSource.length; index++) {
        if (functionSource[index] === '(') parameterDepth += 1;
        if (functionSource[index] === ')') parameterDepth -= 1;
        if (parameterDepth === 0 && functionSource[index] === '{') {
            bodyStart = index;
            break;
        }
    }
    assert.ok(bodyStart >= 0, `${signature} body should exist`);
    let depth = 0;
    for (let index = bodyStart; index < functionSource.length; index++) {
        if (functionSource[index] === '{') depth += 1;
        if (functionSource[index] === '}') depth -= 1;
        if (depth === 0) return functionSource.slice(start, index + 1);
    }
    throw new Error(`Could not extract ${signature}`);
}

const splittableSource = extractFunction(source, 'function isSplittableTranslationBatchError(');
const splitSource = extractFunction(source, 'function splitTranslationTaskBatch(');
const planSource = extractFunction(source, 'function getTranslationBatchSplitPlan(');
const classifySource = extractFunction(source, 'function classifyTranslateChannelIncident(');
const temporarySource = extractFunction(source, 'function isTemporaryTranslateApiError(');
const processBatchSource = extractFunction(source, 'async function processTranslateTaskBatch(');
const translateBatchSource = extractFunction(source, 'async function translateBatchWithRetry(');
const youdaoSource = extractFunction(source, 'async function translateWithYoudaoLlm(');
const youdaoFetchSource = extractFunction(source, 'async function fetchWithTranslateAbort(');
const requestTimingSource = extractFunction(source, 'function recordTranslateRequestTiming(');
const retryAfterHeaderSource = extractFunction(source, 'function parseRetryAfterHeaderMs(');
const readResponseSource = extractFunction(source, 'async function readModelResponseContent(');
const apiErrorSource = extractFunction(source, 'function createApiRequestError(');
const postChatSource = extractFunction(source, 'async function postChatCompletion(');
const rustSource = fs.readFileSync(path.join(projectDir, 'src-tauri', 'src', 'lib.rs'), 'utf8');

const splitPolicy = new Function(`
    const TRANSLATION_BATCH_SPLIT_MAX_DEPTH = 2;
    ${splittableSource}
    ${splitSource}
    ${planSource}
    return {
        isSplittableTranslationBatchError,
        splitTranslationTaskBatch,
        getTranslationBatchSplitPlan
    };
`)();

assert.equal(splitPolicy.isSplittableTranslationBatchError(new SyntaxError('Unexpected end of JSON input')), true);
assert.equal(splitPolicy.isSplittableTranslationBatchError(Object.assign(new Error('接口返回被截断'), { isOutputTruncated: true })), true);
assert.equal(splitPolicy.isSplittableTranslationBatchError(new Error('批量翻译返回数量不一致')), true);
assert.equal(splitPolicy.isSplittableTranslationBatchError(new Error('批量翻译返回空译文')), true);
assert.equal(splitPolicy.isSplittableTranslationBatchError(new Error('HTTP 429 Too Many Requests')), false);
assert.equal(splitPolicy.isSplittableTranslationBatchError(Object.assign(new Error('unauthorized'), { status: 401 })), false);
assert.equal(splitPolicy.isSplittableTranslationBatchError(Object.assign(new SyntaxError('JSON parse error'), { status: 503 })), false);
assert.equal(splitPolicy.isSplittableTranslationBatchError(Object.assign(new Error('401 JSON response'), { status: 401 })), false);
assert.equal(splitPolicy.isSplittableTranslationBatchError(Object.assign(new Error('request timeout'), { isTimeout: true })), false);
assert.equal(splitPolicy.isSplittableTranslationBatchError('请求接口超时（超过 240 秒）'), false);
assert.equal(splitPolicy.isSplittableTranslationBatchError(Object.assign(new Error('cancelled'), { name: 'AbortError' })), false);
assert.equal(splitPolicy.isSplittableTranslationBatchError(new Error('TRANSLATION_CANCELLED')), false);

const ordered = Array.from({ length: 9 }, (_, index) => index);
const halves = splitPolicy.splitTranslationTaskBatch(ordered);
assert.deepEqual(halves, [[0, 1, 2, 3, 4], [5, 6, 7, 8]], 'split order must stay stable');
assert.deepEqual(
    splitPolicy.getTranslationBatchSplitPlan(ordered, new Error('批量翻译返回数量不一致'), 0),
    halves
);
assert.deepEqual(
    splitPolicy.getTranslationBatchSplitPlan(ordered, new Error('批量翻译返回数量不一致'), 2),
    [],
    'split recovery must stop at the configured depth'
);
assert.deepEqual(
    splitPolicy.getTranslationBatchSplitPlan(ordered, Object.assign(new Error('busy'), { status: 503 }), 0),
    [],
    'transport failures must not be mistaken for structural output failures'
);

const classifyIncident = new Function(`${classifySource}; return classifyTranslateChannelIncident;`)();
assert.equal(classifyIncident({ status: 429 }), 'congestion');
assert.equal(classifyIncident({ status: 503 }), 'congestion');
assert.equal(classifyIncident({ status: 408 }), 'interruption');
assert.equal(classifyIncident({ status: 500 }), 'interruption');
assert.equal(classifyIncident({ status: 599 }), 'interruption');
assert.equal(classifyIncident('请求接口超时（超过 240 秒）'), 'interruption');
assert.equal(classifyIncident('发送接口请求失败：无法连接到服务器'), 'interruption');
assert.equal(classifyIncident('请求接口失败：channel closed'), 'interruption');
assert.equal(classifyIncident('读取接口返回失败：body error'), 'interruption');
assert.equal(classifyIncident(new SyntaxError('Unexpected end of JSON input')), '');

const parseRetryAfterHeader = new Function(`${retryAfterHeaderSource}; return parseRetryAfterHeaderMs;`)();
assert.equal(parseRetryAfterHeader('3'), 3000);
assert.equal(parseRetryAfterHeader('0.5'), 500);
assert.equal(parseRetryAfterHeader('Wed, 21 Oct 2015 07:28:00 GMT', Date.parse('Wed, 21 Oct 2015 07:27:55 GMT')), 5000);
assert.equal(parseRetryAfterHeader('invalid'), 0);

const isTemporaryError = new Function(
    'isApiQuotaDepletedError',
    `${temporarySource}; return isTemporaryTranslateApiError;`
)(() => false);
assert.equal(isTemporaryError('请求接口超时（超过 240 秒）'), true);
assert.equal(isTemporaryError('发送接口请求失败：连接失败'), true);
assert.equal(isTemporaryError('请求接口失败：channel closed'), true);

assert.match(
    processBatchSource,
    /getTranslationBatchSplitPlan\(\s*uncachedTasks,/,
    'recovery must split uncached tasks so duplicate-memory tasks are not dropped'
);
assert.match(
    processBatchSource,
    /await processTranslateTaskBatch\(splitBatch,/,
    'split batches should recurse through the existing processing and commit path'
);
assert.ok(
    !processBatchSource.includes('shouldSlowDown: true'),
    'batch processing must not unconditionally slow down for QA or structural failures'
);
assert.match(
    processBatchSource,
    /shouldSlowDown: hasNewChannelIncident\(\)/,
    'adaptive slowdown should follow observed transport incidents'
);
assert.match(
    translateBatchSource,
    /!isSplittableTranslationBatchError\(error\)/,
    'structural output failures should split instead of repeating the same malformed batch'
);
assert.match(
    youdaoSource,
    /throw createApiRequestError\([\s\S]*response\.status,[\s\S]*rawText[\s\S]*\)/,
    'Youdao HTTP failures must retain their status so channel incidents can trigger slowdown'
);
assert.match(
    requestTimingSource,
    /try \{[\s\S]*renderTranslateChannelProgress\(\);[\s\S]*\} catch \{/,
    'request telemetry must be best-effort and never change translation success semantics'
);
assert.match(
    readResponseSource,
    /getResponseRetryAfterMs\(response\)/,
    'HTTP errors should retain the standard Retry-After response header'
);
assert.match(
    apiErrorSource,
    /Math\.max\([\s\S]*getApiRetryDelayMs\(payload, rawText\)[\s\S]*retryAfterMs/,
    'payload and header retry delays should use the longer value'
);
assert.match(
    postChatSource,
    /response\?\.retryAfter \|\| response\?\.retry_after/,
    'Tauri responses should expose Retry-After to the browser response shim'
);
assert.match(
    youdaoSource,
    /getResponseRetryAfterMs\(response\)/,
    'direct Youdao responses should also preserve Retry-After'
);
assert.match(rustSource, /reqwest::header::RETRY_AFTER/);
assert.match(rustSource, /#\[serde\(rename = "retryAfter"\)\]/);

{
    const fetchWithTimeout = new Function(
        'fetch',
        'AbortController',
        'API_REQUEST_TIMEOUT_MS',
        'createApiTimeoutError',
        `${youdaoFetchSource}; return fetchWithTranslateAbort;`
    )(
        (_url, options) => new Promise((_, reject) => {
            options.signal.addEventListener('abort', () => {
                const error = new Error('aborted');
                error.name = 'AbortError';
                reject(error);
            }, { once: true });
        }),
        AbortController,
        240_000,
        timeoutMs => Object.assign(new Error(`timeout ${timeoutMs}`), { isTimeout: true })
    );
    await assert.rejects(
        fetchWithTimeout('https://example.invalid', {}, null, 5),
        error => error?.isTimeout === true,
        'Youdao requests must release their limiter slot with a classified timeout error'
    );
}

console.log('translation-batch-fallback-policy: structural split and transport slowdown rules passed');
