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

const deferPolicySource = extractFunction(source, 'function shouldDeferRetryQaRepair(');
const twoStagePolicySource = extractFunction(source, 'function shouldUseTwoStageTranslationRetry(');
const boundedPolicySource = extractFunction(source, 'function shouldRunDeferredTranslationRepair(');
const rebuildSource = extractFunction(source, 'function rebuildFailedTranslationTasksFromReport(');
const retrySource = extractFunction(source, 'async function retryFailedTranslations(');
const importedRetrySource = extractFunction(source, 'async function retrySuspiciousImportedTranslations(');
const startSource = extractFunction(source, 'async function startTranslate(');
const prepareSource = extractFunction(source, 'async function prepareTranslationForCommit(');
const collectDeferredSource = extractFunction(source, 'function getDeferredRetryRepairJobs(');
const deferredSource = extractFunction(source, 'async function runDeferredRetryRepairPhase(');
const replaceSource = extractFunction(source, 'function replaceCommittedTranslateResult(');
const translateBatchSource = extractFunction(source, 'async function translateBatchWithRetry(');

const policy = new Function(`
    const TRANSLATION_RETRY_DEEP_REPAIR_LIMIT = 60;
    ${deferPolicySource}
    ${twoStagePolicySource}
    ${boundedPolicySource}
    return {
        shouldDeferRetryQaRepair,
        shouldUseTwoStageTranslationRetry,
        shouldRunDeferredTranslationRepair
    };
`)();

assert.equal(policy.shouldDeferRetryQaRepair(), true);
assert.equal(policy.shouldDeferRetryQaRepair({ deferAutoQaRepair: true }), true);
assert.equal(policy.shouldDeferRetryQaRepair({ deferAutoQaRepair: false }), false);
assert.equal(policy.shouldUseTwoStageTranslationRetry([{}]), true);
assert.equal(policy.shouldUseTwoStageTranslationRetry([{}], { twoStageRetry: false }), false);
assert.equal(policy.shouldUseTwoStageTranslationRetry([], {}), false);
assert.equal(policy.shouldRunDeferredTranslationRepair(1), true);
assert.equal(policy.shouldRunDeferredTranslationRepair(60), true);
assert.equal(policy.shouldRunDeferredTranslationRepair(61), false);
assert.equal(policy.shouldRunDeferredTranslationRepair(0), false);

assert.match(
    rebuildSource,
    /collectTranslationTasks\(activeProfiles, \{ deferGlossary: true \}\)/,
    'restoring retry tasks should not compute glossary matches for the whole workbook'
);
assert.equal(
    (retrySource.match(/getSelectedTranslateGlossaryTerms\(\)/g) || []).length,
    1,
    'a retry run should read the selected glossary only once'
);
assert.match(
    retrySource,
    /getRelevantTranslateGlossaryTerms\([\s\S]*retryGlossaryTerms[\s\S]*\{ normalized: true \}/,
    'retry tasks should reuse the normalized glossary snapshot'
);
assert.match(
    retrySource,
    /glossaryTermsSnapshot: retryGlossaryTerms/,
    'the same retry glossary snapshot should be passed into startTranslate'
);
assert.match(
    retrySource,
    /最多选取 \$\{TRANSLATION_RETRY_DEEP_REPAIR_LIMIT\} 个残余阻断项[\s\S]*下一轮轮转处理/,
    'the confirmation must describe the bounded rotating deep-repair budget'
);
assert.match(
    importedRetrySource,
    /targetLangSelect\.value = state\.targetLang;\s*selectedTranslateTargetLangs = new Set\(\[state\.targetLang\]\);\s*renderTranslateTargetLanguageList\(\);/,
    'an imported report language switch must update both the select and the selected target set'
);
assert.ok(
    !importedRetrySource.includes('getSelectedTranslateGlossaryTerms()'),
    'imported targeted retry should let retryFailedTranslations prepare the glossary once'
);
assert.match(
    translateBatchSource,
    /getRelevantTranslateGlossaryTerms\([\s\S]*glossaryTerms,[\s\S]*\{ normalized: true \}/,
    'batch requests should not re-normalize the same glossary snapshot for every task'
);

assert.match(
    startSource,
    /const twoStageRetryRun = shouldUseTwoStageTranslationRetry\(retryTasks, options\);[\s\S]*twoStageRetryRun \|\|[\s\S]*options\.deferAutoQaRepair/,
    'the batch phase of a two-stage retry must always defer inline per-row QA repair'
);
assert.match(
    startSource,
    /Array\.isArray\(options\.glossaryTermsSnapshot\)[\s\S]*\? options\.glossaryTermsSnapshot[\s\S]*: getSelectedTranslateGlossaryTerms\(\)/,
    'an explicit empty glossary snapshot must not reload storage'
);
{
    const queueIndex = startSource.indexOf('await runTranslateQueues()');
    const phaseIndex = startSource.indexOf('await runDeferredRetryRepairPhase()', queueIndex);
    const workbookIndex = startSource.indexOf('translatedWorkbook = buildTranslationWorkbook()', phaseIndex);
    assert.ok(
        queueIndex >= 0 && phaseIndex > queueIndex && workbookIndex > phaseIndex,
        'the bounded repair phase must run after the batch queue and before final workbook generation'
    );
}
assert.match(prepareSource, /prepareOptions\.deferAutoQaRepair \?\? deferAutoQaRepairForRun/);
assert.match(prepareSource, /prepareOptions\.maxRepairAttempts/);

assert.match(
    collectDeferredSource,
    /\['hard', 'missing'\]\.includes\(kind\)/,
    'only hard and missing results may enter the deferred repair phase'
);
assert.match(
    deferredSource,
    /shouldRunDeferredTranslationRepair\(allJobs\.length\)[\s\S]*rotatedJobs\.slice\(0, TRANSLATION_RETRY_DEEP_REPAIR_LIMIT\)/,
    'large residual queues must use a rotating bounded repair budget'
);
assert.match(
    deferredSource,
    /maxRepairAttempts: 1/g,
    'each residual task should have a one-attempt deep repair bound'
);
assert.ok(
    !deferredSource.includes('commitTranslateResult('),
    'replacement repairs must not increment completed task counters a second time'
);
assert.match(deferredSource, /replaceCommittedTranslateResult\(/);
assert.ok(
    !replaceSource.includes('completedCount++') && !replaceSource.includes('translateCount++'),
    'replacement writes must preserve logical task totals'
);
assert.match(
    replaceSource,
    /previousEntry[\s\S]*!isTranslateFailureText\(previousEntry\.translatedText\)[\s\S]*isTranslateFailureText\(normalizedTranslated\)/,
    'a failed deep repair must preserve the valid first-stage translation'
);
assert.match(
    replaceSource,
    /classifyTranslationReportEntry\(previousEntry\) === 'hard'[\s\S]*!isActualTranslationFailureReportEntry\(previousEntry\)[\s\S]*classifyTranslationReportEntry\(reportEntry\) === 'hard'[\s\S]*changed: false/,
    'a deep repair that remains blocking must not replace the first-stage translation'
);

console.log('translation-retry-workflow: two-stage bounds and retry glossary snapshot passed');
