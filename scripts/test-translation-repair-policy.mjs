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
const targetRpmSource = extractFunction(source, 'function getTranslationTargetRpm(');
const pacerSource = extractFunction(source, 'function createTranslationRpmPacer(');
const limiterSource = extractFunction(source, 'function createTranslationRequestLimiter(');
const gateSource = extractFunction(source, 'function createTranslationRequestGate(');
const runWithLimiterSource = extractFunction(source, 'async function runWithTranslationRequestLimiter(');
const batchSource = extractFunction(source, 'async function processTranslateTaskBatch(');

const policy = new Function(`
    const TRANSLATION_QA_REPAIR_MAX_ATTEMPTS = 2;
    const TRANSLATION_QA_REPAIR_MAX_CONCURRENCY = 2;
    const TRANSLATION_AGNES_TARGET_RPM = 17;
    ${normalizeSource}
    ${changedSource}
    ${continueSource}
    ${concurrencySource}
    ${targetRpmSource}
    ${pacerSource}
    ${limiterSource}
    ${gateSource}
    ${runWithLimiterSource}
    return {
        normalizeTranslationRepairFingerprint,
        hasTranslationQaRepairChanged,
        shouldAttemptNextTranslationQaRepair,
        getTranslationQaRepairConcurrency,
        getTranslationTargetRpm,
        createTranslationRpmPacer,
        createTranslationRequestLimiter,
        createTranslationRequestGate,
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
assert.equal(policy.getTranslationTargetRpm({ provider: 'agnes' }), 17);
assert.equal(policy.getTranslationTargetRpm({ provider: 'deepseek' }), 0);
assert.equal(policy.getTranslationTargetRpm({ provider: 'agnes', translationRpm: 18 }), 18);
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

{
    let clock = 0;
    const pacer = policy.createTranslationRpmPacer(
        () => 60,
        () => {},
        1000,
        {
            now: () => clock,
            delay: async milliseconds => {
                clock += milliseconds;
            }
        }
    );
    const starts = await Promise.all([
        pacer.waitForTurn(),
        pacer.waitForTurn(),
        pacer.waitForTurn()
    ]);
    assert.deepEqual(starts, [0, 1000, 2000], 'concurrent callers should start in a smooth FIFO cadence');
    pacer.deferFor(5000);
    assert.equal(await pacer.waitForTurn(), 7000, 'Retry-After should delay the whole channel without a burst');

    const concurrencyLimiter = policy.createTranslationRequestLimiter(() => 2, () => {}, 0);
    const gate = policy.createTranslationRequestGate(concurrencyLimiter, pacer);
    await assert.rejects(
        policy.runWithTranslationRequestLimiter(gate, async () => {
            const error = new Error('rate limited');
            error.retryAfterMs = 3000;
            throw error;
        }),
        /rate limited/
    );
    assert.equal(gate.getActiveCount(), 0, 'paced request failures should release their concurrency slot');
    assert.ok(pacer.snapshot().blockedUntil >= clock + 3000, 'Retry-After should be shared with later requests');
}

{
    let clock = 0;
    const pacer = policy.createTranslationRpmPacer(
        () => 17,
        () => {},
        10_000,
        {
            now: () => clock,
            delay: async milliseconds => {
                clock += milliseconds;
            }
        }
    );
    const starts = [];
    for (let index = 0; index < 18; index++) starts.push(await pacer.waitForTurn());
    assert.equal(starts[1], 3530);
    assert.equal(starts[17], 60010);
    assert.equal(starts.filter(startedAt => startedAt < 60000).length, 17, 'a rolling minute must not start an 18th Agnes request');
}

{
    let active = false;
    let resume = null;
    const resumed = new Promise(resolve => {
        resume = resolve;
    });
    const concurrencyLimiter = policy.createTranslationRequestLimiter(() => 2, () => {}, 0);
    const pacer = policy.createTranslationRpmPacer(() => 0, () => {}, 0);
    const gate = policy.createTranslationRequestGate(
        concurrencyLimiter,
        pacer,
        async () => {
            if (!active) await resumed;
        }
    );
    const waiting = gate.acquire();
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(concurrencyLimiter.getActiveCount(), 0, 'paused requests must not reserve or start a network slot');
    active = true;
    resume();
    const release = await waiting;
    assert.equal(concurrencyLimiter.getActiveCount(), 1);
    release();
}

{
    let capacity = 2;
    let clock = 0;
    const concurrencyLimiter = policy.createTranslationRequestLimiter(() => capacity, () => {}, 0);
    const pacer = policy.createTranslationRpmPacer(
        () => 60,
        () => {},
        1000,
        {
            now: () => clock,
            delay: async milliseconds => {
                clock += milliseconds;
            }
        }
    );
    const gate = policy.createTranslationRequestGate(concurrencyLimiter, pacer);
    const firstRelease = await gate.acquire();
    capacity = 1;
    const secondAcquire = gate.acquire();
    await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(concurrencyLimiter.getActiveCount(), 1, 'a queued request must re-check a reduced adaptive cap at actual start');
    firstRelease();
    const secondRelease = await secondAcquire;
    assert.equal(concurrencyLimiter.getActiveCount(), 1);
    secondRelease();
}

{
    let clock = 0;
    const concurrencyLimiter = policy.createTranslationRequestLimiter(() => 1, () => {}, 0);
    const pacer = policy.createTranslationRpmPacer(
        () => 0,
        () => {},
        30_000,
        {
            now: () => clock,
            delay: async milliseconds => {
                clock += milliseconds;
            }
        }
    );
    const gate = policy.createTranslationRequestGate(concurrencyLimiter, pacer);
    const firstRelease = await gate.acquire();
    const waiting = gate.acquire();
    await new Promise(resolve => setTimeout(resolve, 5));
    pacer.deferFor(30_000);
    firstRelease();
    const secondRelease = await waiting;
    assert.equal(clock, 30_000, 'a queued request must re-check Retry-After after acquiring a slot');
    assert.equal(concurrencyLimiter.getActiveCount(), 1);
    secondRelease();
}

console.log('translation-repair-policy: no-change guard, pacing, and concurrency limits passed');
