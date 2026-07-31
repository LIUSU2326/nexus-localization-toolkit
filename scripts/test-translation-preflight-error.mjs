import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(scriptDir, '..');
const source = fs.readFileSync(path.join(projectDir, 'script.js'), 'utf8');
const translateStart = source.indexOf('function initTranslateTool()');
const translateEnd = source.indexOf('\nfunction initConvertTool()', translateStart);

assert.ok(translateStart >= 0, 'initTranslateTool should exist');
assert.ok(translateEnd > translateStart, 'initTranslateTool boundary should be detectable');

const translateSource = source.slice(translateStart, translateEnd);
assert.match(
    translateSource,
    /function getFriendlyTranslateApiErrorMessage\(error\)/,
    'text translation should define its own preflight error formatter'
);
assert.match(
    translateSource,
    /getFriendlyTranslateApiErrorMessage\(error\)/,
    'translation preflight should use the translation-scoped formatter'
);
assert.doesNotMatch(
    translateSource,
    /getFriendlyApiErrorMessage\(error/,
    'text translation must not call the localization-check scoped formatter'
);

function extractFunction(functionSource, functionName) {
    const start = functionSource.indexOf(`function ${functionName}(`);
    assert.ok(start >= 0, `${functionName} should exist`);
    const bodyStart = functionSource.indexOf('{', start);
    let depth = 0;
    for (let index = bodyStart; index < functionSource.length; index++) {
        if (functionSource[index] === '{') depth += 1;
        if (functionSource[index] === '}') depth -= 1;
        if (depth === 0) return functionSource.slice(start, index + 1);
    }
    throw new Error(`Could not extract ${functionName}`);
}

const helperSource = extractFunction(translateSource, 'getFriendlyTranslateApiErrorMessage');
const temporaryHelperSource = extractFunction(translateSource, 'isTemporaryTranslateApiError');
const quotaSignalSource = extractFunction(source, 'isApiQuotaDepletedSignal');
const quotaErrorSource = extractFunction(source, 'isApiQuotaDepletedError');
const isApiQuotaDepletedSignal = Function(
    `"use strict"; ${quotaSignalSource}; return isApiQuotaDepletedSignal;`
)();
const isApiQuotaDepletedError = Function(
    'isApiQuotaDepletedSignal',
    `"use strict"; ${quotaErrorSource}; return isApiQuotaDepletedError;`
)(isApiQuotaDepletedSignal);
const getFriendlyTranslateApiErrorMessage = Function(
    'isApiQuotaDepletedError',
    `"use strict"; ${helperSource}; return getFriendlyTranslateApiErrorMessage;`
)(isApiQuotaDepletedError);
const isTemporaryTranslateApiError = Function(
    'isApiQuotaDepletedError',
    `"use strict"; ${temporaryHelperSource}; return isTemporaryTranslateApiError;`
)(isApiQuotaDepletedError);

assert.equal(
    getFriendlyTranslateApiErrorMessage({ message: 'API key lacks access to this model', status: 403 }),
    'API key lacks access to this model',
    'permission and model-access errors should retain the original detail'
);
assert.match(
    getFriendlyTranslateApiErrorMessage({
        message: 'RESOURCE_EXHAUSTED',
        status: 429,
        isRateLimited: true,
        retryAfterMs: 4200
    }),
    /额度或频率限制：RESOURCE_EXHAUSTED。接口建议等待约 5 秒后重试/,
    'rate-limit errors should keep the original detail and retry delay'
);
const depletedError = {
    message: 'Your account\'s prepayment credits have been depleted. Please recharge.',
    rawText: '{"error":{"code":429,"status":"RESOURCE_EXHAUSTED"}}',
    status: 429,
    isQuotaDepleted: true,
    isRateLimited: false
};
assert.equal(
    isApiQuotaDepletedSignal(429, 'RESOURCE_EXHAUSTED', depletedError.message),
    true,
    'explicitly depleted prepaid credits should be terminal quota exhaustion'
);
assert.equal(
    isTemporaryTranslateApiError(depletedError),
    false,
    'depleted prepaid credits must not be retried as temporary rate limiting'
);
const depletedMessage = getFriendlyTranslateApiErrorMessage(depletedError);
assert.match(depletedMessage, /API 额度已用尽/);
assert.match(depletedMessage, /充值|恢复额度/);
assert.match(depletedMessage, /切换到其他有额度的通道/);
assert.doesNotMatch(depletedMessage, /降低.*并发|稍后重试/);

const ordinaryRateLimitError = {
    message: 'Quota exceeded for requests per minute. Retry in 12s.',
    status: 429,
    isRateLimited: true,
    retryAfterMs: 12000
};
assert.equal(
    isApiQuotaDepletedError(ordinaryRateLimitError),
    false,
    'per-minute quota should remain a temporary rate limit'
);
assert.equal(
    isTemporaryTranslateApiError(ordinaryRateLimitError),
    true,
    'ordinary rate limiting should remain retryable'
);
assert.match(
    getFriendlyTranslateApiErrorMessage(ordinaryRateLimitError),
    /接口建议等待约 12 秒后重试/
);
assert.match(
    getFriendlyTranslateApiErrorMessage({
        message: 'request timed out while connecting',
        name: 'ApiTimeoutError',
        isTimeout: true
    }),
    /请求超时：request timed out while connecting/,
    'timeout errors should be explained without hiding the original message'
);
assert.match(
    getFriendlyTranslateApiErrorMessage({
        message: 'Service UNAVAILABLE',
        status: 503,
        isTemporary: true
    }),
    /模型服务临时繁忙或不可用：Service UNAVAILABLE/,
    'temporary provider failures should remain distinguishable'
);

console.log('translation-preflight-error: scope and message cases passed');
