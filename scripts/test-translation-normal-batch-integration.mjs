import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

await import('../translation-batch-response-policy.js');

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.resolve(scriptDir, '..', 'script.js'), 'utf8');

function extractFunction(signature, text = source) {
    const start = text.indexOf(signature);
    assert.ok(start >= 0, `${signature} should exist`);
    let parameterDepth = 0;
    let bodyStart = -1;
    for (let index = text.indexOf('(', start); index < text.length; index++) {
        if (text[index] === '(') parameterDepth++;
        if (text[index] === ')') parameterDepth--;
        if (parameterDepth === 0 && text[index] === '{') {
            bodyStart = index;
            break;
        }
    }
    assert.ok(bodyStart >= 0, `${signature} body should exist`);
    let depth = 0;
    for (let index = bodyStart; index < text.length; index++) {
        if (text[index] === '{') depth++;
        if (text[index] === '}') depth--;
        if (depth === 0) return text.slice(start, index + 1);
    }
    throw new Error(`Could not extract ${signature}`);
}

const getId = new Function(
    `${extractFunction('function getTranslationBatchRequestId(')}; return getTranslationBatchRequestId;`
)();
const tasks = [
    { taskKey: 'file|sheet|pl|2|3', text: '第一条' },
    { taskKey: 'file|sheet|pl|3|3', text: '第二条' }
];
assert.equal(getId(tasks[0], 0), 'task:file|sheet|pl|2|3');
assert.equal(getId(tasks[0], 99), 'task:file|sheet|pl|2|3', 'task identity must not change when a partial batch is rebuilt');

const parsed = globalThis.NexusTranslationBatchResponsePolicy.parseTranslationBatchResponse(
    JSON.stringify([
        { id: getId(tasks[1], 1), translation: 'drugi' },
        { id: getId(tasks[0], 0), translation: 'pierwszy' }
    ]),
    tasks.map(getId)
);
assert.equal(parsed.valuesById.get(getId(tasks[0], 0)), 'pierwszy');
assert.equal(parsed.valuesById.get(getId(tasks[1], 1)), 'drugi');

const partial = globalThis.NexusTranslationBatchResponsePolicy.parseTranslationBatchResponse(
    JSON.stringify([{ id: getId(tasks[1], 1), translation: 'drugi' }]),
    tasks.map(getId)
);
assert.deepEqual(partial.fallbackIds, [getId(tasks[0], 0)]);

const promptSource = extractFunction('function buildBatchTranslatePromptParts(');
assert.match(promptSource, /getTranslationBatchRequestId\(item, index\)/);
assert.match(promptSource, /"translation"/);

const batchRequestSource = extractFunction('async function translateBatchWithRetry(');
assert.match(batchRequestSource, /protectedTaskById\.get\(id\)/, 'placeholder restoration must follow the same stable ID');
assert.doesNotMatch(batchRequestSource, /return\s*\{[\s\S]*translations:/, 'runtime must not expose a positional result contract');

const startSource = extractFunction('async function startTranslate(');
const processBatchSource = extractFunction('async function processTranslateTaskBatch(', startSource);
assert.match(processBatchSource, /valuesById\.get\(getTranslationBatchRequestId\(task, index\)\)/);
assert.match(processBatchSource, /for \(const fallbackTask of fallbackTasks\)[\s\S]*processTranslateTask\(fallbackTask\)/);
assert.doesNotMatch(
    processBatchSource,
    /for \(const fallbackBatch of fallbackBatches\)[\s\S]*processTranslateTaskBatch\(fallbackBatch/,
    'a partial response may only retry its missing cells once through the single-item path'
);
assert.doesNotMatch(
    processBatchSource,
    /preparedResults\[preparedIndex\]\?\.error[\s\S]{0,240}fallbackRepresentativeIndexes\.add/,
    'a returned candidate with local QA trouble must not be relabeled as missing and translated again'
);

console.log('translation-normal-batch-integration: stable IDs, partial salvage, and single missing fallback passed');
