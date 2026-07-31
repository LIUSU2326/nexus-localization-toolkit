import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(scriptDir, '..');
const source = fs.readFileSync(path.join(projectDir, 'script.js'), 'utf8');
const styles = fs.readFileSync(path.join(projectDir, 'styles.css'), 'utf8');

function extractFunction(functionSource, signature) {
    const start = functionSource.indexOf(signature);
    assert.ok(start >= 0, `${signature} should exist`);
    const bodyStart = functionSource.indexOf('{', start);
    let depth = 0;
    for (let index = bodyStart; index < functionSource.length; index++) {
        if (functionSource[index] === '{') depth += 1;
        if (functionSource[index] === '}') depth -= 1;
        if (depth === 0) return functionSource.slice(start, index + 1);
    }
    throw new Error(`Could not extract ${signature}`);
}

const createApiRequestErrorSource = extractFunction(source, 'function createApiRequestError(');
assert.ok(
    createApiRequestErrorSource.indexOf('error.isQuotaDepleted =') <
        createApiRequestErrorSource.indexOf('error.isRateLimited ='),
    'quota exhaustion must be classified before ordinary rate limiting'
);
assert.match(
    createApiRequestErrorSource,
    /error\.isRateLimited\s*=\s*!error\.isQuotaDepleted/,
    'depleted credit must not also be marked as a retryable rate limit'
);

const renderApiSummarySource = extractFunction(source, 'function renderApiSummary(');
assert.match(renderApiSummarySource, /configured:\s*\{\s*inspector:\s*'待验证'/);
assert.match(renderApiSummarySource, /quota:\s*\{\s*inspector:\s*'额度已用尽'/);
assert.match(renderApiSummarySource, /online:\s*\{\s*inspector:\s*'可用'/);
assert.doesNotMatch(
    renderApiSummarySource,
    /hasKey\s*\?\s*'已连接'/,
    'a saved key alone must not be shown as connected'
);
assert.match(styles, /\.ai-status-chip\.blocked\s*\{/);
assert.match(styles, /\.ai-status-chip\.blocked \.status-dot\s*\{/);

const validateSource = extractFunction(source, 'async function validateTranslateProfileConnection(');
assert.match(
    validateSource,
    /const canRetry\s*=\s*!quotaDepleted/,
    'quota exhaustion must stop preflight without a second request'
);
assert.match(validateSource, /wrappedError\.isPreflightFailure\s*=\s*true/);
assert.match(validateSource, /wrappedError\.isQuotaDepleted\s*=\s*quotaDepleted/);

const preflightSource = extractFunction(source, 'async function preflightTranslateProfiles(');
assert.match(preflightSource, /setApiRuntimeHealth\(profile,\s*'checking'/);
assert.match(preflightSource, /setApiRuntimeHealth\(profile,\s*'online'/);
assert.match(preflightSource, /quotaDepleted\s*\?\s*'quota'\s*:\s*'error'/);
assert.match(preflightSource, /preflightError\.isPreflightFailure\s*=\s*true/);
assert.match(preflightSource, /preflightError\.isQuotaDepleted\s*=/);

const preflightBranchStart = source.indexOf('} else if (error.isPreflightFailure) {');
const genericBranchStart = source.indexOf(
    "} else {\n                console.error('Translate error:'",
    preflightBranchStart
);
assert.ok(preflightBranchStart >= 0, 'startTranslate should have a dedicated preflight-failure branch');
assert.ok(genericBranchStart > preflightBranchStart, 'generic translation error branch should follow preflight handling');
const preflightBranch = source.slice(preflightBranchStart, genericBranchStart);
assert.match(preflightBranch, /runOutcome\s*=\s*'preflight_failed'/);
assert.match(preflightBranch, /updateTranslateRunSummary\(0,\s*totalTasks,\s*phase\)/);
assert.match(preflightBranch, /没有发送任何待翻译文本/);
assert.match(preflightBranch, /没有改写导入报告/);
assert.doesNotMatch(preflightBranch, /ensureTranslationReportCoversExpectedTasks/);
assert.doesNotMatch(preflightBranch, /buildTranslationWorkbook/);
assert.doesNotMatch(preflightBranch, /saveCurrentTranslationProgress/);

console.log('translation-preflight-state: terminal quota and non-mutating UI state passed');
