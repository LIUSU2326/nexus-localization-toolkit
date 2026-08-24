import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(scriptDir, '..');
const source = fs.readFileSync(path.join(projectDir, 'script.js'), 'utf8');

function extractFunction(signature) {
    const start = source.indexOf(signature);
    assert.ok(start >= 0, `${signature} should exist`);
    let parameterDepth = 0;
    let bodyStart = -1;
    for (let index = source.indexOf('(', start); index < source.length; index++) {
        if (source[index] === '(') parameterDepth += 1;
        if (source[index] === ')') parameterDepth -= 1;
        if (parameterDepth === 0 && source[index] === '{') {
            bodyStart = index;
            break;
        }
    }
    let depth = 0;
    for (let index = bodyStart; index < source.length; index++) {
        if (source[index] === '{') depth += 1;
        if (source[index] === '}') depth -= 1;
        if (depth === 0) return source.slice(start, index + 1);
    }
    throw new Error(`Could not extract ${signature}`);
}

const reasoningSource = extractFunction('function isReasoningHeavyModel(');
const batchSizeSource = extractFunction('function getTranslationBatchSize(');
const tokenBudgetSource = extractFunction('function getTranslationMaxTokens(');
const batchRequestSource = extractFunction('async function translateBatchWithRetry(');

const policy = new Function(`
    ${reasoningSource}
    ${batchSizeSource}
    ${tokenBudgetSource}
    return { isReasoningHeavyModel, getTranslationBatchSize, getTranslationMaxTokens };
`)();

assert.equal(policy.isReasoningHeavyModel('deepseek-v4-flash'), true);
assert.equal(policy.isReasoningHeavyModel('deepseek-v4-pro'), true);
assert.equal(policy.isReasoningHeavyModel('deepseek-chat'), false);
assert.equal(policy.getTranslationBatchSize({ provider: 'deepseek', model: 'deepseek-v4-flash' }), 10);
assert.equal(policy.getTranslationBatchSize({ provider: 'deepseek', model: 'deepseek-chat' }), 20);

const shortBatch = Array.from({ length: 10 }, () => '学习后增加5%');
assert.ok(
    policy.getTranslationMaxTokens(shortBatch, 'tr', {
        mode: 'batch',
        itemCount: 10,
        attempt: 0,
        model: 'deepseek-v4-flash'
    }) >= 4096,
    'reasoning-heavy batches need room for hidden reasoning plus complete ID-tagged output on the first request'
);
assert.ok(
    policy.getTranslationMaxTokens(['短文本'], 'tr', {
        mode: 'single',
        itemCount: 1,
        attempt: 0,
        model: 'deepseek-v4-flash'
    }) >= 2048,
    'a reasoning-heavy single fallback must not inherit the old 256-token floor'
);
assert.ok(
    policy.getTranslationMaxTokens(shortBatch, 'tr', {
        mode: 'batch',
        itemCount: 10,
        attempt: 0,
        model: 'deepseek-chat'
    }) < 4096,
    'ordinary chat models should retain the lower efficient budget'
);

assert.match(
    batchRequestSource,
    /const willRetry = attempt < retries - 1 && !isSplittableTranslationBatchError\(error\)/,
    'truncated batches must go directly to the bounded split planner instead of retrying the same oversized batch'
);
assert.doesNotMatch(
    batchRequestSource,
    /Boolean\(error\?\.isOutputTruncated\)\s*\|\|/,
    'output truncation must not force an identical paid retry'
);
assert.match(
    batchRequestSource,
    /getTranslationMaxTokens\([\s\S]*model\s*\n?\s*\}/,
    'batch token calculation must receive the actual model classification'
);
assert.match(
    batchRequestSource,
    /rejectTruncated:\s*false/,
    'ordinary ID-tagged batches must expose a truncated tail to the safe partial-object parser'
);

console.log('translation-model-output-budget: reasoning-aware batch size, token floor, and immediate truncation split passed');
