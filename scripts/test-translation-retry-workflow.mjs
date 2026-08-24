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
const rebuildSource = extractFunction(source, 'function rebuildFailedTranslationTasksFromReport(');
const retrySource = extractFunction(source, 'async function retryFailedTranslations(');
const importedRetrySource = extractFunction(source, 'async function retrySuspiciousImportedTranslations(');
const startSource = extractFunction(source, 'async function startTranslate(');
const safeCandidateSource = extractFunction(startSource, 'function decideTranslateCandidateSafely(');
const commitSource = extractFunction(source, 'function commitTranslateResult(');
const evaluateSource = extractFunction(source, 'function evaluateTranslateResultCandidate(');
const prepareSource = extractFunction(source, 'async function prepareTranslationForCommit(');
const collectRemainingSource = extractFunction(source, 'function getRemainingRetryRepairJobs(');
const collectDeferredSource = extractFunction(source, 'function getDeferredRetryRepairJobs(');
const deferredSource = extractFunction(source, 'async function runDeferredRetryRepairPhase(');
const replaceSource = extractFunction(source, 'function replaceCommittedTranslateResult(');
const translateBatchSource = extractFunction(source, 'async function translateBatchWithRetry(');

const policy = new Function(`
    ${deferPolicySource}
    ${twoStagePolicySource}
    return {
        shouldDeferRetryQaRepair,
        shouldUseTwoStageTranslationRetry
    };
`)();

assert.equal(policy.shouldDeferRetryQaRepair(), true);
assert.equal(policy.shouldDeferRetryQaRepair({ deferAutoQaRepair: true }), true);
assert.equal(policy.shouldDeferRetryQaRepair({ deferAutoQaRepair: false }), false);
assert.equal(policy.shouldUseTwoStageTranslationRetry([{}]), true);
assert.equal(policy.shouldUseTwoStageTranslationRetry([{}], { twoStageRetry: false }), false);
assert.equal(policy.shouldUseTwoStageTranslationRetry([], {}), true, 'ordinary first translation must auto-run the bounded repair phase');

assert.match(
    rebuildSource,
    /collectTranslationTasks\(activeProfiles, \{ deferGlossary: true \}\)/,
    'restoring retry tasks should not compute glossary matches for the whole workbook'
);
assert.ok(
    !/if \(failedTranslationTasks\.length > 0\) return/.test(rebuildSource),
    'a previous targeted queue must not short-circuit reconstruction of all live report blockers'
);
assert.match(
    rebuildSource,
    /buildTranslateImportTaskLookup\(allTasks\)[\s\S]*findImportedTranslationTaskMatch\(/,
    'rebuilding the all-blocker queue should merge from the indexed live report'
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
assert.doesNotMatch(
    retrySource,
    /confirm\(|确定开始重译/,
    'an explicit retry button click should start directly without a second confirmation'
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
assert.match(
    startSource,
    /continuousRepairRequested && !continuousRepairPolicy[\s\S]*strict-repair-policy-unavailable/,
    'continuous repair must fail safely when its policy module is unavailable'
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
    prepareSource,
    /let qaStatus = summarizeTranslationQa\(task\.text, nextTranslated/,
    'every repair path must run full local QA before it can pass the delivery gate'
);
assert.ok(
    !prepareSource.includes('translatePostCheckInput?.checked'),
    'the UI post-check preference must not bypass core repair QA'
);
assert.match(
    prepareSource,
    /normalizedSelectedIssueIds\.size === 1 && normalizedSelectedIssueIds\.has\('length_review'\)/,
    'compact acceptance may apply only when length is the sole selected repair target'
);
assert.match(
    evaluateSource,
    /decideTranslateCandidateSafely[\s\S]*preservePreviousRepairEntry/,
    'candidate evaluation must use the shared monotonic gate before commit replaces the current best translation'
);
assert.match(
    safeCandidateSource,
    /translationIssuePolicy\.decideCandidate[\s\S]*accept:\s*false/,
    'candidate gate failures must fail closed and preserve the current best translation'
);
assert.match(
    commitSource,
    /evaluatedCandidate \|\| evaluateTranslateResultCandidate/,
    'all final commits must share the same candidate evaluator used by micro-batch preflight'
);

assert.match(
    collectRemainingSource,
    /\['hard', 'missing'\]\.includes\(kind\)/,
    'only hard and missing results may enter the deferred repair phase'
);
assert.match(
    collectDeferredSource,
    /getRemainingRetryRepairJobs\(\{ schedulableOnly: true \}\)/,
    'the schedulable queue must be a filtered view of the real remaining blockers'
);
assert.match(
    deferredSource,
    /summary\.remainingTarget = getRemainingRetryRepairJobs\(\)\.length/,
    'terminal reporting must count real blockers even after their per-run attempt budget is exhausted'
);
assert.match(
    deferredSource,
    /splitRepairWaves\(initialJobs,[\s\S]*maxAttempts:\s*1[\s\S]*for \(const repairWave of ordinaryRepairWaves\)/,
    'ordinary residual queues must exhaust all cells in bounded waves without raising the per-cell attempt budget'
);
assert.match(
    deferredSource,
    /strictPolicy\.selectRepairWave[\s\S]*DEFAULT_WAVE_SIZE[\s\S]*DEFAULT_MAX_ATTEMPTS/,
    'continuous strict repair must schedule bounded fair waves with a per-item attempt ceiling'
);
assert.match(
    deferredSource,
    /sweepStillPending[\s\S]*if \(sweepStillPending\) continue/,
    'no-progress stopping must wait until every remaining item has received the current-attempt sweep'
);
assert.match(
    deferredSource,
    /prepared\.repairError[\s\S]*deferredRepairStopReason = [\s\S]*'api_error'/,
    'continuous repair must stop after a surfaced API repair failure instead of burning later waves'
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
    /if \(previousEntry\)[\s\S]*decideTranslateCandidateSafely[\s\S]*if \(!decision\.accept\)[\s\S]*changed: false/,
    'deep repair must use the same monotonic candidate gate and preserve the previous best result on rejection'
);

console.log('translation-retry-workflow: two-stage bounds and retry glossary snapshot passed');
