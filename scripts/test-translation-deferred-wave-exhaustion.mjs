import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

await import('../translation-strict-repair-policy.js');

const policy = globalThis.NexusTranslationStrictRepairPolicy;
assert.ok(policy, 'NexusTranslationStrictRepairPolicy should be installed');

function createJobs(count) {
    return Array.from({ length: count }, (_, index) => ({
        taskKey: `cell-${index + 1}`
    }));
}

function flattenKeys(waves) {
    return waves.flat().map(job => job.taskKey);
}

// The value 60 is a per-wave request-safety bound, not a total-run cap.
// A 169-cell continuation must finish in three bounded waves without asking
// the user to import the same report again.
{
    const jobs = createJobs(169);
    const waves = policy.splitRepairWaves(jobs, new Map(), {
        waveSize: 60,
        maxAttempts: 1,
        getKey: job => job.taskKey
    });
    const processedKeys = flattenKeys(waves);

    assert.deepEqual(
        waves.map(wave => wave.length),
        [60, 60, 49],
        '169 pending cells should be exhausted as 60/60/49 waves'
    );
    assert.equal(processedKeys.length, 169, 'every eligible cell should be scheduled');
    assert.equal(new Set(processedKeys).size, 169, 'no cell should be scheduled twice');
    assert.deepEqual(
        processedKeys,
        jobs.map(job => job.taskKey),
        'bounded waves should preserve stable cell order'
    );
    assert.ok(waves.every(wave => wave.length <= 60), 'each wave must keep the 60-cell safety bound');
}

// The scheduler must consume the canonical per-cell attempt ledger. Cells
// that already produced their one allowed candidate are not made eligible by
// moving to another wave.
{
    const jobs = createJobs(169);
    const attempts = new Map(jobs.slice(0, 11).map(job => [job.taskKey, 1]));
    const waves = policy.splitRepairWaves(jobs, attempts, {
        waveSize: 60,
        maxAttempts: 1,
        getKey: job => job.taskKey
    });
    const processedKeys = flattenKeys(waves);

    assert.deepEqual(waves.map(wave => wave.length), [60, 60, 38]);
    assert.equal(processedKeys.length, 158);
    assert.ok(
        jobs.slice(0, 11).every(job => !processedKeys.includes(job.taskKey)),
        'a later wave must not reset the one-candidate budget'
    );
}

async function runWavePlan(jobs, options = {}) {
    const attempts = new Map();
    const processed = [];
    const waves = policy.splitRepairWaves(jobs, attempts, {
        waveSize: 60,
        maxAttempts: 1,
        getKey: job => job.taskKey
    });
    let stopReason = '';

    for (const wave of waves) {
        if (stopReason) break;
        for (const job of wave) {
            if (stopReason) break;
            attempts.set(job.taskKey, (attempts.get(job.taskKey) || 0) + 1);
            processed.push(job.taskKey);
            stopReason = options.getStopReason?.(job, processed.length) || '';
        }
    }

    return { processed, attempts, stopReason };
}

// Terminal external state may safely stop the remaining waves. Completed
// cells stay committed and no cell exceeds the global candidate allowance.
for (const stopReason of ['fatal', 'quota', 'cancelled']) {
    const result = await runWavePlan(createJobs(169), {
        getStopReason: (_job, processedCount) => processedCount === 67 ? stopReason : ''
    });
    assert.equal(result.stopReason, stopReason);
    assert.equal(result.processed.length, 67, `${stopReason} should stop later work`);
    assert.equal(new Set(result.processed).size, result.processed.length);
    assert.ok(
        [...result.attempts.values()].every(count => count === 1),
        `${stopReason} handling must not inflate the per-cell candidate budget`
    );
}

// Bind the dynamic policy expectations above to the actual desktop workflow.
// This prevents a future refactor from keeping splitRepairWaves in a dead
// helper while restoring the old 60-item total truncation in script.js.
const scriptSource = await readFile(new URL('../script.js', import.meta.url), 'utf8');
const functionStart = scriptSource.indexOf('async function runDeferredRetryRepairPhase()');
const functionEnd = scriptSource.indexOf('\n            async function processTranslateTask(task)', functionStart);
assert.ok(functionStart >= 0 && functionEnd > functionStart, 'deferred repair phase should remain discoverable');
const repairPhaseSource = scriptSource.slice(functionStart, functionEnd);

assert.match(
    repairPhaseSource,
    /splitRepairWaves\s*\(/,
    'the real workflow must materialize all eligible bounded waves'
);
assert.match(
    repairPhaseSource,
    /splitRepairWaves\s*\([\s\S]{0,900}maxAttempts\s*:\s*1/,
    'ordinary continuation waves must not raise the one-candidate budget'
);
assert.match(
    repairPhaseSource,
    /for\s*\(\s*const\s+\w*wave\w*\s+of\s+\w+/i,
    'the real workflow must iterate across all planned waves'
);
assert.doesNotMatch(
    repairPhaseSource,
    /rotatedJobs\.slice\s*\(\s*0\s*,\s*TRANSLATION_RETRY_DEEP_REPAIR_LIMIT\s*\)/,
    'the per-wave bound must never be reused as a total-run slice'
);
assert.doesNotMatch(
    repairPhaseSource,
    /shouldRunDeferredTranslationRepair\s*\(/,
    'ordinary continuation must not choose between one wave and a truncated run by total count'
);
assert.doesNotMatch(
    repairPhaseSource,
    /下轮会从后续条目继续|本轮按安全预算只深度处理/,
    'the default flow must not defer eligible cells to another user-started run'
);

assert.match(
    repairPhaseSource,
    /repairAttemptLedger\.claimPrimarySingle\s*\(/,
    'every direct missing-cell request must still claim the canonical attempt ledger'
);
assert.match(
    repairPhaseSource,
    /maxRepairAttempts\s*:\s*1/,
    'QA preparation must remain bounded to one candidate attempt'
);
assert.match(
    repairPhaseSource,
    /isApiQuotaDepletedError\s*\(/,
    'quota exhaustion must become a terminal repair-wave condition'
);
assert.match(
    repairPhaseSource,
    /isApiQuotaDepletedError\s*\([\s\S]{0,500}(?:Stop|Fatal|Terminal)\w*\s*=/i,
    'quota exhaustion must set the terminal state observed by the wave scheduler'
);
assert.match(
    repairPhaseSource,
    /!\s*isTemporaryTranslateApiError\s*\([\s\S]{0,500}(?:Stop|Fatal|Terminal)\w*\s*=/i,
    'non-temporary API failures must set the terminal state instead of starting later waves'
);
assert.match(
    repairPhaseSource,
    /isTranslationCancelled|TRANSLATION_CANCELLED|AbortError/,
    'cancellation must stop scheduling later repair work'
);
assert.match(
    repairPhaseSource,
    /(?:deferred|terminal|wave|repair)\w*(?:Stop|Fatal|Terminal)\w*/i,
    'fatal repair state must be shared by workers and the outer wave loop'
);
assert.match(
    repairPhaseSource,
    /while\s*\(\s*true\s*\)\s*{\s*if\s*\([^)]*(?:Stop|Fatal|Terminal|isTranslationCancelled)/i,
    'a worker must observe terminal state before claiming another job in its wave'
);
assert.match(
    repairPhaseSource,
    /await\s+processRepairWave\s*\([^)]*\)\s*;\s*if\s*\([^)]*(?:Stop|Fatal|Terminal|isTranslationCancelled)/i,
    'the outer scheduler must observe terminal state before starting another wave'
);

console.log('translation-deferred-wave-exhaustion: all eligible cells are processed once in bounded waves; terminal stops preserve the global attempt budget');
