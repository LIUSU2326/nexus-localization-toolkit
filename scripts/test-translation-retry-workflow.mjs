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

function evaluateRejectedCandidateWithProviderOutcome(providerOutcome) {
    return new Function('providerOutcome', `
        const runId = 'regression-run';
        const targetLang = 'tr';
        const retryTasks = [{}];
        const options = { selectedIssueIds: ['mixed_chinese'] };
        const continuousRepairEnabled = false;
        const continuousRepairPolicy = { shouldAcceptMixedChineseCandidate: () => false };
        const previousEntry = {
            taskKey: 'cell-1',
            status: 'qa_failed',
            sourceText: '原文',
            translatedText: '保留旧译文',
            qaStatus: '需确认：混入中文',
            profile: 'Previous',
            model: 'previous-model'
        };
        const task = {
            taskKey: 'cell-1',
            text: '原文',
            referenceText: 'Reference',
            rowIndex: 1,
            colIndex: 2,
            profile: { name: 'Repair', model: 'repair-model' },
            repairTargetIssueIds: ['mixed_chinese']
        };
        let translationRunReport = { entries: [previousEntry] };
        const translationProgressTasks = new Map([['cell-1', previousEntry]]);
        const throwIfTranslationCancelled = () => {};
        const getCompactModelLabel = profile => profile?.name || profile?.model || '';
        const makeTranslateFailureText = (text, reason) => '[翻译失败：' + reason + '] ' + text;
        const normalizeTranslateResultText = value => String(value || '');
        const summarizeTranslationQa = () => '需确认：混入中文';
        const buildTranslationReportEntry = (_task, translated, qaStatus) => ({
            taskKey: _task.taskKey,
            status: 'qa_failed',
            sourceText: _task.text,
            referenceText: _task.referenceText,
            translatedText: translated,
            qaStatus,
            profile: 'Repair',
            model: 'repair-model'
        });
        const decideTranslateCandidateSafely = () => ({
            accept: false,
            candidateReturned: true,
            candidateDecision: 'rejected',
            candidateRejectReason: 'selected_issue_not_reduced',
            reason: 'selected_issue_not_reduced',
            previousIssueIds: ['mixed_chinese'],
            candidateIssueIds: ['mixed_chinese'],
            introducedHardIssueIds: [],
            resolvedIssueIds: []
        });
        const classifyTranslationReportEntry = () => 'hard';
        const createTranslationRepairLifecycle = (_previous, candidate, audit, lifecycleOptions) => ({
            terminalDecision: lifecycleOptions.terminalDecision,
            candidateSnapshot: { text: candidate.translatedText },
            candidateQa: audit
        });
        const getTranslateOutputTaskKey = value => value.taskKey;
        const getTranslateOutputSlotId = () => 'primary';
        ${evaluateSource}
        return evaluateTranslateResultCandidate(
            task,
            'Aday metni',
            '需确认：混入中文',
            { candidateReturned: true, executionOutcome: providerOutcome }
        );
    `)(providerOutcome);
}

for (const providerOutcome of ['accepted', 'reused']) {
    const evaluation = evaluateRejectedCandidateWithProviderOutcome(providerOutcome);
    assert.equal(evaluation.accepted, false);
    assert.equal(evaluation.reportEntry.candidateReturned, true);
    assert.equal(
        evaluation.reportEntry.executionOutcome,
        'candidate_rejected',
        `a ${providerOutcome} provider outcome must not override the final candidate-gate rejection`
    );
    assert.equal(evaluation.reportEntry.resultOrigin, 'previous');
}

async function runInlineTransportFailureRegression() {
    return new Function('prepareSource', 'commitSource', `
        return (async () => {
            const task = {
                taskKey: 'timeout-cell',
                text: '原文',
                rowIndex: 1,
                colIndex: 2,
                glossaryTerms: [],
                profile: { name: 'Repair', model: 'repair-model' }
            };
            const targetLang = 'tr';
            const sourceLang = 'zh-CN';
            const runId = 'transport-regression';
            const runSignal = null;
            const currentProject = { rules: '' };
            const options = { selectedIssueIds: [] };
            const deferAutoQaRepairForRun = false;
            const TRANSLATION_QA_REPAIR_MAX_ATTEMPTS = 1;
            const TRANSLATION_PROGRESS_SAVE_INTERVAL = 999;
            const retryTasks = null;
            const totalTasks = 1;
            const runLanguageLabel = '土耳其语';
            const applyLocalTranslationFixes = (_source, value) => value;
            const summarizeTranslationQa = () => '需确认：混入中文';
            const isTranslateFailureText = () => false;
            const isTranslationQaPassed = () => false;
            const shouldAutoRepairTranslationQa = () => true;
            const getTranslationRequestLimiter = () => ({ getActiveCount: () => 0 });
            const getRepairAttemptCellId = value => value.taskKey;
            const repairAttemptLedger = {
                claimPrimarySingle: () => true,
                get: () => ({ terminal: '', contentCandidates: 0 }),
                recordPhysicalRequest: () => true,
                recordCandidate: () => true,
                settle: () => true,
                peek: () => null,
                markCommitted: () => true
            };
            const recordTranslateQaRepairAttempt = () => {};
            const updateTranslateChannelProgress = () => {};
            const timeoutError = Object.assign(new Error('request timeout'), { isTimeout: true });
            const repairTranslationWithRetry = async (...args) => {
                const callbacks = args.at(-1);
                callbacks.onFailure(timeoutError);
                return args[1];
            };
            const hasTranslationQaRepairChanged = () => false;
            const shouldAttemptNextTranslationQaRepair = () => false;
            const translationIssuePolicy = {
                normalizeSelectedIssueIds: values => new Set(values),
                buildTargetedQaStatus: value => value
            };
            const getTranslationReportStatus = () => 'qa_failed';
            const decideTranslateCandidateSafely = () => ({
                accept: false,
                candidateReturned: true,
                candidateDecision: 'rejected',
                candidateRejectReason: 'hard_findings_not_reduced',
                reason: 'hard_findings_not_reduced',
                previousIssueIds: ['mixed_chinese'],
                candidateIssueIds: ['mixed_chinese'],
                introducedHardIssueIds: [],
                resolvedIssueIds: []
            });
            const sanitizeTranslationCandidateAudit = value => ({
                candidateReturned: value.candidateReturned,
                candidateDecision: value.candidateDecision,
                candidateRejectReason: value.candidateRejectReason,
                previousIssueIds: value.previousIssueIds || [],
                candidateIssueIds: value.candidateIssueIds || [],
                introducedHardIssueIds: value.introducedHardIssueIds || [],
                resolvedIssueIds: value.resolvedIssueIds || []
            });
            const createTranslationRepairLifecycle = (_previous, candidate, audit, lifecycleOptions) => ({
                terminalDecision: lifecycleOptions.terminalDecision,
                reason: lifecycleOptions.reason,
                candidateSnapshot: { text: candidate.translatedText || '' },
                candidateQa: audit
            });
            const classifyTranslateExecutionError = error => error?.isTimeout ? 'timeout' : 'request_failed';
            const summarizeTranslateError = error => error?.message || 'request failed';
            const getCompactModelLabel = profile => profile?.name || '';

            let translationRunReport = { entries: [] };
            const translationProgressTasks = new Map();
            let successCount = 0;
            let failCount = 0;
            let runFailCount = 0;
            let runSuccessCount = 0;
            let translateCount = 0;
            let completedCount = 0;
            const throwIfTranslationCancelled = () => {};
            const countTranslationProgressEntries = () => ({ successCount: 0, failCount: 0 });
            const deleteTranslationTaskProgress = () => {};
            const writeTranslationResult = () => {};
            const recordTranslateTaskCompletion = () => {};
            const compactTranslationProgressEntry = entry => entry;
            const queueTranslationTaskProgress = () => {};
            const rememberSuccessfulTranslation = () => {};
            const shouldRenderTranslationPreview = () => false;
            const updateTranslateProgress = () => {};
            const recordTranslateChannelResult = () => {};
            const updateTranslateRunSummary = () => {};
            const saveCurrentTranslationProgress = () => {};
            const updateTranslationRunActions = () => {};

            eval(prepareSource);
            eval(commitSource);
            const prepared = await prepareTranslationForCommit(task, 'Eski ceviri', {
                deferAutoQaRepair: false,
                maxRepairAttempts: 1
            });
            const reportEntries = translationRunReport.entries;
            const baseReportEntry = {
                taskKey: task.taskKey,
                status: 'qa_failed',
                translatedText: prepared.translated,
                qaStatus: prepared.qaStatus,
                executionOutcome: 'accepted',
                resultOrigin: 'candidate',
                candidateReturned: true,
                candidateDecision: 'accepted'
            };
            commitTranslateResult(task, prepared.translated, prepared.qaStatus, {
                previousTaskKeys: new Set(),
                existingReportIndex: -1,
                reportEntries,
                reportEntry: baseReportEntry
            });
            return translationRunReport.entries[0];
        })();
    `)(prepareSource, commitSource);
}

{
    const entry = await runInlineTransportFailureRegression();
    assert.equal(entry.candidateReturned, false, 'a timed-out repair cannot be recorded as a returned candidate');
    assert.equal(entry.candidateDecision, 'not_returned');
    assert.ok(
        ['timeout', 'request_failed'].includes(entry.executionOutcome),
        `a timed-out repair must remain a transport failure, got ${entry.executionOutcome}`
    );
    assert.notEqual(entry.executionOutcome, 'candidate_rejected');
}

console.log('translation-retry-workflow: two-stage bounds and retry glossary snapshot passed');
