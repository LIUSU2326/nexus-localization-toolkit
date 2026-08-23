import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(scriptDir, '..');
const source = fs.readFileSync(path.join(projectDir, 'script.js'), 'utf8');
const html = fs.readFileSync(path.join(projectDir, 'index.html'), 'utf8');

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

assert.doesNotMatch(html, /translateIssuePlanPanel|translateAutoClearMixedChineseBtn|translateImportIssueFilter|translateAutoRetryMultiTarget|translateFastBatchMode|translateAutoCompactLong|translateDiscountGuardPanel|translateDiscountRepairBtn/);
assert.doesNotMatch(source, /TRANSLATE_IMPORT_ISSUE_FILTERS|selectedIssueFilters|autoClearMixedChineseIssues|isTranslateAutoRetryMultiTargetEnabled|isTranslateFastBatchModeEnabled|isTranslateAutoCompactLongEnabled|translateDiscountCheckState|repairDetectedDiscountIssues|compactLongImportedTranslations/);
assert.match(html, /id="translateBtn"[\s\S]*id="translateBtnLabel">开始翻译/);
assert.doesNotMatch(html, /translateRetryFailedBtn|自动处理到可交付/);
assert.doesNotMatch(source, /retryFailedBtn/);

const runActionsSource = extractFunction('function updateTranslationRunActions(');
assert.match(runActionsSource, /hasReport && !deliveryGate\.ready/);

const continuationSource = extractFunction('function buildImportedContinuationPlan(');
assert.match(continuationSource, /repairEntries/);
assert.match(continuationSource, /reviewEntries/);
assert.match(continuationSource, /reusableEntries/);
assert.match(continuationSource, /canonicalPlan\.defaultSelectedIds/);

const importedRetrySource = extractFunction('async function retrySuspiciousImportedTranslations(');
assert.match(importedRetrySource, /continuousRepairTarget:\s*''/);
assert.doesNotMatch(importedRetrySource, /confirm\(/);

const startSource = extractFunction('async function startTranslate(');
assert.match(startSource, /translation-safety-policy-unavailable/);
assert.match(startSource, /translationIssuePolicy\?\.classifyEntry/);
assert.match(startSource, /translationIssuePolicy\?\.decideCandidate/);
assert.match(startSource, /translationIssuePolicy\?\.buildPlan/);
assert.match(startSource, /translationDeliveryPolicy\?\.buildDeliveryGate/);
assert.match(startSource, /reason:\s*'candidate_gate_error'/);
assert.match(startSource, /const acceptedRepair = candidateDecision\.accept/);
assert.match(startSource, /maxContentCandidates:\s*1/);
assert.match(startSource, /maxNoContentSubstitutes:\s*1/);
assert.match(startSource, /if \(twoStageRetryRun\)[\s\S]*runDeferredRetryRepairPhase\(\)/);

const targetedSource = extractFunction('async function processTargetedRepairTasks(');
assert.match(targetedSource, /claimPrimaryBatch/);
assert.match(targetedSource, /getRepairCompatibilityGroup/);
assert.match(targetedSource, /operation\.kind === 'single' \|\| operation\.kind === 'replacement'/);
assert.match(targetedSource, /allowSingleFallback:\s*false/);
assert.match(targetedSource, /outcome\.candidateReturned[\s\S]*evaluation\.accepted \? 'accepted' : 'rejected'/);

const finalizeSource = extractFunction('async function finalizeTargetedRepairJob(');
assert.match(finalizeSource, /if \(candidate\)/);
assert.match(finalizeSource, /terminal:\s*'rejected'/);
assert.doesNotMatch(
    finalizeSource.slice(finalizeSource.indexOf('if (candidate)'), finalizeSource.indexOf('if (shouldSingleFallback)')),
    /repairTranslationWithRetry/,
    'a returned but rejected candidate must never trigger another model request'
);

const queueSource = extractFunction('async function runTranslateQueues(');
assert.match(queueSource, /function createTargetedRepairEnvelopes/);
assert.match(queueSource, /const maxEnvelopeSize = 48/);
assert.match(queueSource, /repairQueue = queue\.filter/);
assert.match(queueSource, /ordinaryQueue = queue\.filter/);
assert.match(queueSource, /createTargetedRepairEnvelopes\(repairQueue\)/);
assert.match(queueSource, /createTranslationTaskBatches\(ordinaryQueue, profile\)/);

const autoSaveSource = extractFunction('async function autoSaveTranslationOutputs(');
assert.match(autoSaveSource, /translated_unverified/);
assert.match(autoSaveSource, /for \(const kind of autoSaveKinds\)/);
assert.match(autoSaveSource, /catch \(error\)[\s\S]*failures\.push/);
assert.match(autoSaveSource, /terminalArtifactKind/);

const batchRequestSource = extractFunction('async function repairTranslationsBatchWithRetry(');
assert.match(batchRequestSource, /TRANSLATION_TARGETED_REPAIR_PROMPT_CHAR_LIMIT/);
assert.match(batchRequestSource, /isRepairBatchStructureError = true/);

console.log('translation-one-click-workflow: simple UI, canonical plan, bounded attempts, safe batching, and terminal artifacts passed');
