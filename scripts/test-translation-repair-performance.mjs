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

function extractNumericConstant(name) {
    const match = source.match(new RegExp(`const\\s+${name}\\s*=\\s*([\\d_]+)`));
    assert.ok(match, `${name} should exist as a numeric constant`);
    return Number(match[1].replaceAll('_', ''));
}

const processBatchSource = extractFunction(source, 'async function processTranslateTaskBatch(');
const processTaskSource = extractFunction(source, 'async function processTranslateTask(');
const processTargetedRepairSource = extractFunction(source, 'async function processTargetedRepairTasks(');
const createRepairClaimSource = extractFunction(source, 'function createTargetedRepairDeferredClaim(');
const boundedWorkersSource = extractFunction(source, 'async function runBoundedTranslationWorkers(');
const throttleSource = extractFunction(source, 'function getTranslationChannelThrottleLevel(');
const repairMemoryKeySource = extractFunction(source, 'function buildTranslationRepairMemoryKey(');
const recordCompletionSource = extractFunction(source, 'function recordTranslateTaskCompletion(');
const rollingThroughputSource = extractFunction(source, 'function getTranslateRollingThroughput(');
const formatEtaSource = extractFunction(source, 'function formatTranslateEta(');
const normalizeProfileSource = extractFunction(source, 'function normalizeApiProfile(');

// Targeted repair must have a real worker pool. The quality gate remains inside
// processTranslateTask/prepareTranslationForCommit; this contract changes scheduling only.
const targetedRepairMaxConcurrency = extractNumericConstant('TRANSLATION_TARGETED_REPAIR_MAX_CONCURRENCY');
assert.equal(targetedRepairMaxConcurrency, 3, 'targeted repair should be capped at three workers');
assert.match(processBatchSource, /const directRepairTasks\s*=\s*tasks\.filter\(/);
assert.match(
    processBatchSource,
    /processTargetedRepairTasks\(directRepairTasks, options\)/,
    'direct repairs should delegate to the micro-batch coordinator'
);
assert.match(
    processTargetedRepairSource,
    /workerCount[\s\S]*TRANSLATION_TARGETED_REPAIR_MAX_CONCURRENCY[\s\S]*runBoundedTranslationWorkers\(operations/,
    'targeted micro-batches must remain bounded by the shared worker cap'
);
assert.doesNotMatch(
    processBatchSource,
    /if\s*\(task\.repairFromCurrent\s*&&\s*task\.currentTranslation\)\s*\{\s*const directStatus\s*=\s*await processTranslateTask\(task\)/,
    'the old for-loop that awaited each targeted repair serially must not return'
);

const runBoundedTranslationWorkers = new Function(
    `${boundedWorkersSource}; return runBoundedTranslationWorkers;`
)();
let simulatedActive = 0;
let simulatedMaxActive = 0;
const simulatedPool = await runBoundedTranslationWorkers(
    Array.from({ length: 12 }, (_, index) => index),
    async item => {
        simulatedActive += 1;
        simulatedMaxActive = Math.max(simulatedMaxActive, simulatedActive);
        try {
            await new Promise(resolve => setTimeout(resolve, 2));
            return item * 2;
        } finally {
            simulatedActive -= 1;
        }
    },
    targetedRepairMaxConcurrency
);
assert.equal(simulatedMaxActive, 3, 'the extracted worker pool should sustain three in-flight repairs');
assert.deepEqual(simulatedPool, Array.from({ length: 12 }, (_, index) => index * 2));

let startedAfterFatal = 0;
await assert.rejects(
    runBoundedTranslationWorkers(
        Array.from({ length: 10 }, (_, index) => index),
        async item => {
            startedAfterFatal += 1;
            if (item === 0) throw new Error('fatal worker error');
            await new Promise(resolve => setTimeout(resolve, 4));
            return item;
        },
        3,
        { stopOnError: true }
    ),
    /fatal worker error/
);
assert.ok(
    startedAfterFatal <= 3,
    `stop-on-error workers must not pull new work after a fatal error, started ${startedAfterFatal}`
);

// A single timeout must not force the channel to one worker. Two consecutive
// interruptions are a soft throttle, three are a hard throttle, and congestion is immediate.
const softCooldownMs = extractNumericConstant('TRANSLATION_INTERRUPTION_SOFT_COOLDOWN_MS');
const hardCooldownMs = extractNumericConstant('TRANSLATION_INTERRUPTION_HARD_COOLDOWN_MS');
const congestionCooldownMs = extractNumericConstant('TRANSLATION_CONGESTION_COOLDOWN_MS');
for (const [label, value] of [
    ['soft interruption cooldown', softCooldownMs],
    ['hard interruption cooldown', hardCooldownMs],
    ['congestion cooldown', congestionCooldownMs]
]) {
    assert.ok(value > 0 && value <= 60_000, `${label} should be positive and no longer than 60 seconds`);
}

const now = 1_800_000_000_000;
function readThrottleLevel(state) {
    const getThrottleLevel = new Function(
        'translateChannelProgressState',
        'getTranslateChannelKey',
        'TRANSLATION_INTERRUPTION_HARD_COOLDOWN_MS',
        'TRANSLATION_CONGESTION_COOLDOWN_MS',
        'Date',
        `${throttleSource}; return getTranslationChannelThrottleLevel;`
    )(
        new Map([['profile-key', state]]),
        () => 'profile-key',
        hardCooldownMs,
        congestionCooldownMs,
        { now: () => now }
    );
    return getThrottleLevel({ id: 'profile-key' });
}

assert.equal(readThrottleLevel({ consecutiveInterruptions: 1, lastInterruptionAt: now - 1_000 }), 0);
assert.equal(readThrottleLevel({ consecutiveInterruptions: 2, lastInterruptionAt: now - 1_000 }), 1);
assert.equal(readThrottleLevel({ consecutiveInterruptions: 3, lastInterruptionAt: now - 1_000 }), 2);
assert.equal(readThrottleLevel({ consecutiveInterruptions: 0, lastCongestionAt: now - 1_000 }), 2);
assert.equal(
    readThrottleLevel({ consecutiveInterruptions: 3, lastInterruptionAt: now - hardCooldownMs - 1 }),
    0,
    'an expired interruption streak must not keep the channel throttled forever'
);

// Repair-memory identity must include everything that can change the correct answer.
const createRepairMemoryKey = (context = {}) => new Function(
    'makeStableId',
    'getTranslateChannelKey',
    'sourceLang',
    'targetLang',
    'currentProject',
    `${repairMemoryKeySource}; return buildTranslationRepairMemoryKey;`
)(
    value => String(value),
    profile => `${profile.provider}:${profile.baseUrl}:${profile.model}:${profile.id}`,
    context.sourceLang || 'zh-CN',
    context.targetLang || 'pl',
    context.project || { id: 'project-1', rules: 'Preserve combat terminology.' }
);

const baseRepairTask = {
    text: '提升攻击力',
    referenceText: 'Increase ATK',
    profile: { id: 'agnes-1', provider: 'agnes', baseUrl: 'https://example.test', model: 'agnes-2.5-flash' },
    glossaryTerms: [{ source: '攻击力', target: 'ATK', constraint: 'hard' }],
    consistencyTerms: ['ATK'],
    consistencyExamples: [{ sourceText: '攻击', translatedText: 'ATK' }]
};
const getBaseKey = createRepairMemoryKey();
const baseKey = getBaseKey(baseRepairTask, 'Zwiększa 攻击力', '需确认：混入中文');
assert.notEqual(baseKey, getBaseKey(baseRepairTask, 'Zwiększa siłę', '需确认：混入中文'));
assert.notEqual(baseKey, getBaseKey(baseRepairTask, 'Zwiększa 攻击力', '需确认：数字不一致'));
assert.notEqual(baseKey, getBaseKey({
    ...baseRepairTask,
    glossaryTerms: [{ source: '攻击力', target: 'Siła ataku', constraint: 'hard' }]
}, 'Zwiększa 攻击力', '需确认：混入中文'));
assert.notEqual(baseKey, createRepairMemoryKey({
    project: { id: 'project-1', rules: 'Translate every combat term.' }
})(baseRepairTask, 'Zwiększa 攻击力', '需确认：混入中文'));
assert.notEqual(baseKey, getBaseKey({
    ...baseRepairTask,
    profile: { ...baseRepairTask.profile, id: 'agnes-2' }
}, 'Zwiększa 攻击力', '需确认：混入中文'));
assert.match(processTaskSource, /repairMemory\.has\(repairMemoryKey\)/);
assert.match(processTaskSource, /repairMemoryPromises\.has\(repairMemoryKey\)/);
assert.match(
    processTaskSource,
    /repairMemoryPromises\.set\(repairMemoryKey, repairPromise\)[\s\S]*repairResult = \{[\s\S]*\.\.\.\(await repairPromise\)[\s\S]*requestOwner: true/,
    'equivalent concurrent repairs must join one in-flight promise'
);
assert.match(processTaskSource, /finally\(\(\) => repairMemoryPromises\.delete\(repairMemoryKey\)\)/);
assert.match(
    processTaskSource,
    /onFailure:\s*error =>[\s\S]*repairRequestFailed = true[\s\S]*evaluation\.accepted[\s\S]*!repairResult\.failed[\s\S]*repairMemory\.set/,
    'only an accepted, non-failed repair candidate may enter the settled cache'
);
assert.match(
    processTaskSource,
    /recordChannelOutcome\([\s\S]*repairResult\.failed && repairResult\.requestOwner[\s\S]*status === 'failed'/,
    'only the single-flight request owner may advance channel failure recovery for one transport failure'
);
assert.match(
    processTaskSource,
    /repairMemoryPromises\.has\(repairMemoryKey\)[\s\S]*requestOwner:\s*false[\s\S]*repairMemoryPromises\.set\(repairMemoryKey, repairPromise\)[\s\S]*requestOwner:\s*true/,
    'joined repairs must share the candidate without multiplying request-level failure streaks'
);
assert.match(
    createRepairClaimSource,
    /repairMemoryPromises\.set\(memoryKey, trackedPromise\)/,
    'micro-batch owners must synchronously preclaim each memory key'
);
assert.match(
    processTargetedRepairSource,
    /buildTargetedRepairJob\([\s\S]*pendingOwnerGroups\.push\(ownerGroup\)[\s\S]*createTargetedRepairDeferredClaim\(group\.memoryKey\)[\s\S]*owners\.forEach\(job =>[\s\S]*getRepairCompatibilityGroup\(job\)[\s\S]*createTargetedRepairMicroBatches\(bucketJobs/,
    'all unique repair keys must be claimed before family-compatible micro-batches are planned and sent'
);
assert.match(
    processTargetedRepairSource,
    /catch \(error\) \{[\s\S]*owners\.forEach\(job => job\.claim\?\.reject\(error\)\)[\s\S]*Promise\.allSettled/,
    'synchronous setup failures must reject and drain every already-created claim'
);
assert.match(
    processTargetedRepairSource,
    /job\.claim\.resolve\(finalOutcome\)[\s\S]*operation\.jobs\.forEach\(\(job, index\) => job\.claim\.resolve\(finalOutcomes\[index\]\)\)/,
    'the single-flight claim must cover both direct singles and batch fallback completion'
);

{
    const repairMemoryPromises = new Map();
    const createClaim = new Function(
        'repairMemoryPromises',
        `${createRepairClaimSource}; return createTargetedRepairDeferredClaim;`
    )(repairMemoryPromises);
    const claim = createClaim('claim-key');
    assert.equal(repairMemoryPromises.size, 1);
    claim.reject(new Error('setup failed'));
    await Promise.allSettled([claim.promise]);
    assert.equal(repairMemoryPromises.size, 0, 'rejected setup claims must never leak in-flight keys');
}

// Rolling throughput and ETA must be derived from actual completions, not configured concurrency.
const throughput = new Function(
    'TRANSLATION_THROUGHPUT_WINDOW_MS',
    `let translateCompletionHistory = [];
    ${recordCompletionSource}
    ${rollingThroughputSource}
    ${formatEtaSource}
    return { recordTranslateTaskCompletion, getTranslateRollingThroughput, formatTranslateEta };`
)(120_000);
const throughputNow = Date.now();
throughput.recordTranslateTaskCompletion(10, throughputNow - 60_000);
throughput.recordTranslateTaskCompletion(10, throughputNow - 30_000);
throughput.recordTranslateTaskCompletion(10, throughputNow);
const rolling = throughput.getTranslateRollingThroughput(throughputNow);
assert.ok(Math.abs(rolling.perMinute - 30) < 0.1, `expected about 30 items/minute, got ${rolling.perMinute}`);
assert.equal(throughput.formatTranslateEta(90, rolling.perMinute), '约3分钟');
assert.equal(throughput.formatTranslateEta(20, 60), '不足1分钟');
assert.match(source, /recordTranslateTaskCompletion\(1\)/, 'committed tasks should feed the throughput sample');
assert.match(source, /getTranslateRollingThroughput\(\)/, 'the progress UI should read rolling throughput');
assert.match(source, /formatTranslateEta\(remaining, rolling\.perMinute\)/, 'the progress UI should show an ETA');

// User-configured RPM must survive profile normalization, including the legacy alias.
const normalizeApiProfile = new Function(
    'PLATFORM_CONFIG',
    'getDefaultModelForProvider',
    'normalizeProfileName',
    'normalizeProviderBaseUrl',
    'makeStableId',
    `${normalizeProfileSource}; return normalizeApiProfile;`
)(
    { deepseek: { name: 'DeepSeek', baseUrl: 'https://api.example.test' } },
    () => 'model-default',
    (_provider, name) => name || 'DeepSeek',
    (_provider, baseUrl) => baseUrl,
    value => String(value)
);
assert.equal(normalizeApiProfile({ provider: 'deepseek', translationRpm: 42 }).translationRpm, 42);
assert.equal(normalizeApiProfile({ provider: 'deepseek', requestsPerMinute: 31 }).translationRpm, 31);
assert.equal(normalizeApiProfile({ provider: 'deepseek', translationRpm: 999 }).translationRpm, 600);

function theoreticalItemsPerMinute(workerCount, averageSeconds, rpmLimit) {
    return Math.min(workerCount * 60 / averageSeconds, rpmLimit || Number.POSITIVE_INFINITY);
}
assert.ok(
    theoreticalItemsPerMinute(3, 8.5, 17) >= theoreticalItemsPerMinute(1, 8.5, 17) * 2.3,
    'three targeted-repair workers should provide at least 2.3x modeled throughput at the observed latency'
);

console.log('translation-repair-performance: worker pool, adaptive throttle, repair cache, throughput ETA, and RPM persistence passed');
