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

const normalizeSource = extractFunction(source, 'function normalizeTranslationRepairFingerprint(');
const changedSource = extractFunction(source, 'function hasTranslationQaRepairChanged(');
const continueSource = extractFunction(source, 'function shouldAttemptNextTranslationQaRepair(');
const concurrencySource = extractFunction(source, 'function getTranslationQaRepairConcurrency(');
const limiterSource = extractFunction(source, 'function createTranslationRequestLimiter(');
const runWithLimiterSource = extractFunction(source, 'async function runWithTranslationRequestLimiter(');
const batchSource = extractFunction(source, 'async function processTranslateTaskBatch(');

const policy = new Function(`
    const TRANSLATION_QA_REPAIR_MAX_ATTEMPTS = 2;
    const TRANSLATION_QA_REPAIR_MAX_CONCURRENCY = 2;
    ${normalizeSource}
    ${changedSource}
    ${continueSource}
    ${concurrencySource}
    ${limiterSource}
    ${runWithLimiterSource}
    return {
        normalizeTranslationRepairFingerprint,
        hasTranslationQaRepairChanged,
        shouldAttemptNextTranslationQaRepair,
        getTranslationQaRepairConcurrency,
        createTranslationRequestLimiter,
        runWithTranslationRequestLimiter
    };
`)();

assert.equal(policy.normalizeTranslationRepairFingerprint('  a\r\n'), 'a');
assert.equal(policy.hasTranslationQaRepairChanged('a\r\n', ' a\n'), false);
assert.equal(policy.hasTranslationQaRepairChanged('a', 'b'), true);
assert.equal(policy.shouldAttemptNextTranslationQaRepair('a', 'b', 0, 2), true);
assert.equal(policy.shouldAttemptNextTranslationQaRepair('a', 'a', 0, 2), false);
assert.equal(policy.shouldAttemptNextTranslationQaRepair('a', 'a', 0, 2, true), true);
assert.equal(policy.shouldAttemptNextTranslationQaRepair('a', 'b', 1, 2), false);

assert.equal(policy.getTranslationQaRepairConcurrency(1, 2, 20), 1);
assert.equal(policy.getTranslationQaRepairConcurrency(3, 2, 20), 2);
assert.equal(policy.getTranslationQaRepairConcurrency(3, 1, 20), 1);
assert.equal(policy.getTranslationQaRepairConcurrency(3, 2, 1), 1);
assert.equal(policy.getTranslationQaRepairConcurrency(3, 2, 0), 1);
assert.ok(batchSource.includes('requestLimiter'), 'batch requests should use the shared request limiter');
assert.ok(
    batchSource.indexOf('commitTranslateResult') < batchSource.indexOf('if (firstPreparationError) throw'),
    'successful prepared results should be committed before propagating a preparation error'
);
assert.match(
    source,
    /adaptive\.current\+\+;\s*setTranslationRequestAdaptiveCap\(profile, adaptive\.current\);/,
    'request limiter cap should follow adaptive concurrency increases'
);
assert.match(
    source,
    /adaptive\.current = 1;\s*setTranslationRequestAdaptiveCap\(profile, adaptive\.current\);/,
    'request limiter cap should follow adaptive concurrency reductions'
);

{
    let capacity = 2;
    let maxActive = 0;
    const limiter = policy.createTranslationRequestLimiter(() => capacity, () => {}, 0);
    const run = async () => {
        const release = await limiter.acquire();
        maxActive = Math.max(maxActive, limiter.getActiveCount());
        await new Promise(resolve => setTimeout(resolve, 5));
        release();
    };
    await Promise.all([run(), run(), run(), run()]);
    assert.equal(maxActive, 2);
    assert.equal(limiter.getActiveCount(), 0);

    capacity = 1;
    const first = await limiter.acquire();
    const waiting = limiter.acquire();
    await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(limiter.getActiveCount(), 1);
    first();
    const second = await waiting;
    assert.equal(limiter.getActiveCount(), 1);
    second();
    assert.equal(limiter.getActiveCount(), 0);

    await assert.rejects(
        policy.runWithTranslationRequestLimiter(limiter, async () => {
            throw new Error('request failed');
        }),
        /request failed/
    );
    assert.equal(limiter.getActiveCount(), 0, 'failed requests should release their limiter slot');
}

console.log('translation-repair-policy: no-change guard and concurrency limits passed');
