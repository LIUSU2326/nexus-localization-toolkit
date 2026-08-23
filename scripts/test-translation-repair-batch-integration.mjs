import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

await import('../translation-repair-batch-policy.js');

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

const requestSource = extractFunction('async function repairTranslationsBatchWithRetry(');
const requestLog = [];
let nextResponse = '';
let nextError = null;

const repairTranslationsBatchWithRetry = new Function(
    'getApiConfig',
    'getDefaultModelForProvider',
    'buildTargetedRepairBatchPromptParts',
    'waitForNetwork',
    'runWithTranslationRequestLimiter',
    'translateWithYoudaoLlm',
    'requestModelContent',
    'getTranslationMaxTokens',
    'API_REQUEST_TIMEOUT_MS',
    'restoreProtectedPlaceholders',
    'cleanTranslationResponse',
    'isBlankTranslationResult',
    'recordTranslateRequestTiming',
    'isSplittableTranslationBatchError',
    'isApiQuotaDepletedError',
    'summarizeTranslateError',
    'delayWithSignal',
    'TRANSLATION_TARGETED_REPAIR_PROMPT_CHAR_LIMIT',
    `${requestSource}; return repairTranslationsBatchWithRetry;`
)(
    () => ({}),
    () => 'model-default',
    models => ({
        systemPrompt: 'system',
        userPrompt: 'user',
        expectedIds: models.map(model => model.id),
        cacheKey: 'cache',
        tokenTexts: models.map(model => model.task.text)
    }),
    async () => {},
    async (_limiter, request) => request(),
    async () => nextResponse,
    async (_profile, body) => {
        requestLog.push(body);
        if (nextError) throw nextError;
        return nextResponse;
    },
    () => 2048,
    30_000,
    (text, replacements) => replacements.reduce(
        (value, replacement) => value.replaceAll(replacement.placeholder, replacement.token),
        String(text)
    ),
    value => String(value ?? '').trim(),
    value => !String(value ?? '').trim(),
    () => {},
    error => Boolean(error?.isRepairBatchStructureError || error instanceof SyntaxError),
    error => Boolean(error?.isQuotaDepleted),
    error => error?.message || String(error),
    async () => {},
    12_000
);

const requestModels = [
    {
        id: 'r1',
        task: { text: '源1' },
        protectedContext: { replacements: [{ placeholder: '__PH_1__', token: '{PLAYER}' }] }
    },
    {
        id: 'r2',
        task: { text: '源2' },
        protectedContext: { replacements: [{ placeholder: '__PH_1__', token: '<color>' }] }
    }
];
const profile = { apiKey: 'test-key', model: 'test-model', provider: 'agnes' };

nextResponse = JSON.stringify([
    { id: 'r2', translation: 'Drugi __PH_1__' },
    { id: 'r1', translation: 'Pierwszy __PH_1__' }
]);
const reversed = await repairTranslationsBatchWithRetry(
    requestModels,
    'zh',
    'pl',
    'rules',
    profile,
    null,
    1,
    {}
);
assert.equal(requestLog.length, 1, 'one micro-batch must consume one model request');
assert.equal(reversed.valuesById.get('r1'), 'Pierwszy {PLAYER}');
assert.equal(reversed.valuesById.get('r2'), 'Drugi <color>');
assert.deepEqual([...reversed.invalidIds], [], 'valid out-of-order IDs must not trigger fallback');

nextResponse = JSON.stringify([
    { id: 'r1', translation: 'Gotowe __PH_1__' },
    { id: 'r2', translation: '' }
]);
const partial = await repairTranslationsBatchWithRetry(
    requestModels,
    'zh',
    'pl',
    'rules',
    profile,
    null,
    1,
    {}
);
assert.equal(partial.valuesById.get('r1'), 'Gotowe {PLAYER}');
assert.equal(partial.valuesById.has('r2'), false);
assert.deepEqual([...partial.invalidIds], ['r2'], 'only the blank ID should fall back to single repair');

nextResponse = JSON.stringify(['positional one', 'positional two']);
await assert.rejects(
    repairTranslationsBatchWithRetry(requestModels, 'zh', 'pl', 'rules', profile, null, 1, {}),
    error => error?.isRepairBatchStructureError === true,
    'unsafe positional string arrays must split/fallback instead of being committed'
);

const quotaRequestCountBefore = requestLog.length;
nextError = Object.assign(new Error('quota depleted'), { isQuotaDepleted: true });
await assert.rejects(
    repairTranslationsBatchWithRetry(requestModels, 'zh', 'pl', 'rules', profile, null, 2, {}),
    error => error?.isQuotaDepleted === true
);
assert.equal(
    requestLog.length - quotaRequestCountBefore,
    1,
    'quota exhaustion must stop immediately without a second paid retry'
);
nextError = null;

assert.match(source, /evaluateTranslateResultCandidate[\s\S]*commitTranslateResult/);
assert.match(source, /repairTranslationsBatchWithRetry[\s\S]*parseTargetedRepairBatchResponse/);
assert.match(source, /createTargetedRepairDeferredClaim[\s\S]*repairMemoryPromises\.set/);

console.log('translation-repair-batch-integration: ID mapping, per-item placeholder restore, partial fallback, and strict structure passed');
