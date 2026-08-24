import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

await import('../translation-strict-repair-policy.js');
await import('../translation-issue-policy.js');

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

const normalizeKeySource = extractFunction(source, 'function normalizeTranslateImportKeyPart(');
const makeKeySource = extractFunction(source, 'function makeTranslateImportMatchKey(');
const taskKeysSource = extractFunction(source, 'function getTaskImportMatchKeys(');
const entryKeysSource = extractFunction(source, 'function getImportedEntryMatchKeys(');
const taskIndexSource = extractFunction(source, 'function buildTranslateImportTaskIndex(');
const taskLookupSource = extractFunction(source, 'function buildTranslateImportTaskLookup(');
const importedEntryMatchesTaskSource = extractFunction(source, 'function importedEntryMatchesTask(');
const findMatchSource = extractFunction(source, 'function findImportedTranslationTaskMatch(');
const missingEntriesSource = extractFunction(source, 'function buildImportedReportMissingTaskEntries(');
const mergeEntriesSource = extractFunction(source, 'function mergeImportedTranslationEntriesWithCurrentTasks(');
const importSource = extractFunction(source, 'async function importTranslateProgressFile(');
const dedupeKeySource = extractFunction(source, 'function getTranslationReportEntryDedupeKey(');
const candidateRankSource = extractFunction(source, 'function getTranslationReportCandidateRank(');
const candidateTieSource = extractFunction(source, 'function getTranslationReportCandidateTieKey(');
const compactLegacyVariantSource = extractFunction(source, 'function compactLegacyTranslationVariant(');
const mergeLegacyVariantSource = extractFunction(source, 'function mergeLegacyTranslationVariantAudit(');
const selectPreferredEntrySource = extractFunction(source, 'function selectPreferredTranslationReportEntry(');
const dedupeEntriesSource = extractFunction(source, 'function dedupeTranslationReportEntries(');
const continuationPlanSource = extractFunction(source, 'function buildImportedContinuationPlan(');
const retryPreviewSource = extractFunction(source, 'function getImportedIssueRetryPreview(');
const ensureExpectedCoverageSource = extractFunction(source, 'function ensureTranslationReportCoversExpectedTasks(');
const reportDisplayStatusSource = extractFunction(source, 'function getTranslationReportDisplayStatus(');
const issueSummarySource = extractFunction(source, 'function getTranslationReportIssueSummary(');
const formatIssueSummarySource = extractFunction(source, 'function formatTranslationReportIssueSummary(');
const addTranslationItemSource = extractFunction(source, 'function addTranslationItem(');

const {
    buildTranslateImportTaskIndex,
    findImportedTranslationTaskMatch,
    mergeImportedTranslationEntriesWithCurrentTasks
} = new Function(
    'getCompactModelLabel',
    'isTranslateFailureText',
    'classifyTranslationReportEntry',
    `${normalizeKeySource}
    ${makeKeySource}
    ${taskKeysSource}
    ${entryKeysSource}
    ${taskIndexSource}
    ${taskLookupSource}
    ${importedEntryMatchesTaskSource}
    ${findMatchSource}
    ${missingEntriesSource}
    ${dedupeKeySource}
    ${candidateRankSource}
    ${candidateTieSource}
    ${compactLegacyVariantSource}
    ${mergeLegacyVariantSource}
    ${selectPreferredEntrySource}
    ${dedupeEntriesSource}
    ${mergeEntriesSource}
    return {
        buildTranslateImportTaskIndex,
        findImportedTranslationTaskMatch,
        mergeImportedTranslationEntriesWithCurrentTasks
    };`
)(
    profile => profile?.name || profile?.model || '',
    text => /^\[(?:翻译失败|TRANSLATION_FAILED)/.test(String(text || '')),
    entry => {
        if (entry?.manualResolutionValid || entry?.status === 'success') return 'success';
        if (entry?.status === 'missing' || !entry?.translatedText) return 'missing';
        return globalThis.NexusTranslationIssuePolicy.classifyEntry(entry)
            .some(finding => finding.tier === 'required') ? 'hard' : 'soft';
    }
);

const {
    getTranslationReportIssueSummary,
    formatTranslationReportIssueSummary
} = new Function(
    'getTranslationReportIssueGroups',
    'isActualTranslationFailureReportEntry',
    'classifyTranslationReportEntry',
    `${issueSummarySource}
    ${formatIssueSummarySource}
    return {
        getTranslationReportIssueSummary,
        formatTranslationReportIssueSummary
    };`
)(
    entries => ({
        missing: entries.filter(entry => ['no_content', 'not_processed', 'import_missing'].includes(entry.executionOutcome)),
        hard: entries.filter(entry => ['request_failed', 'candidate_rejected'].includes(entry.executionOutcome)),
        length: [],
        soft: []
    }),
    entry => entry.executionOutcome === 'request_failed',
    entry => ['no_content', 'not_processed', 'import_missing'].includes(entry.executionOutcome)
        ? 'missing'
        : 'hard'
);

const { getImportedIssueRetryPreview } = new Function(
    'isMissingTranslationReportEntry',
    'isHardTranslationReportEntry',
    'isTranslateFailureText',
    'classifyTranslationReportEntry',
    `${normalizeKeySource}
    ${dedupeKeySource}
    ${candidateRankSource}
    ${candidateTieSource}
    ${compactLegacyVariantSource}
    ${mergeLegacyVariantSource}
    ${selectPreferredEntrySource}
    ${dedupeEntriesSource}
    ${continuationPlanSource}
    ${retryPreviewSource}
    return { getImportedIssueRetryPreview };`
)(
    entry => entry?.status === 'missing',
    entry => globalThis.NexusTranslationIssuePolicy
        .classifyEntry(entry)
        .some(finding => finding.tier === 'required'),
    text => String(text || '').startsWith('[TRANSLATION_FAILED]'),
    entry => {
        if (entry?.manualResolutionValid || entry?.status === 'success') return 'success';
        if (entry?.status === 'missing' || !entry?.translatedText) return 'missing';
        return globalThis.NexusTranslationIssuePolicy.classifyEntry(entry)
            .some(finding => finding.tier === 'required') ? 'hard' : 'soft';
    }
);

function makeTask(index, overrides = {}) {
    const rowNumber = index + 2;
    return {
        taskKey: `current-task-${index}`,
        rowIndex: index + 1,
        originalRowNumber: rowNumber,
        colIndex: 2,
        text: `原文 ${index}`,
        referenceText: index % 5 === 0 ? `Reference ${index}` : '',
        source: {
            fileName: '佣兵小镇-全文本.xlsx',
            sheetName: '全文本'
        },
        profile: {
            name: 'Agnes AI',
            model: 'agnes-2.0-flash'
        },
        ...overrides
    };
}

function makeReportEntry(task, overrides = {}) {
    return {
        taskKey: task.taskKey,
        status: 'success',
        sourceFile: task.source.fileName,
        sheetName: task.source.sheetName,
        rowNumber: task.originalRowNumber,
        column: task.colIndex + 1,
        profile: task.profile.name,
        model: task.profile.model,
        sourceText: task.text,
        referenceText: task.referenceText,
        translatedText: `ترجمة ${task.originalRowNumber}`,
        qaStatus: '通过',
        ...overrides
    };
}

{
    const totalTaskCount = 20_000;
    const reportCoveredCount = 17_000;
    const existingSuspiciousCount = 13;
    const tasks = Array.from({ length: totalTaskCount }, (_, index) => makeTask(index));
    const coveredTasks = tasks.filter((_, index) => index % 20 < 17);
    assert.equal(coveredTasks.length, reportCoveredCount, 'fixture should leave 3 scattered gaps in every 20 rows');
    const reportEntries = coveredTasks.map((task, index) => {
        if (index >= reportCoveredCount - existingSuspiciousCount) {
            return makeReportEntry(task, {
                status: 'missing',
                translatedText: '',
                qaStatus: '疑似未翻译'
            });
        }
        return makeReportEntry(task);
    });

    const startedAt = performance.now();
    const merged = mergeImportedTranslationEntriesWithCurrentTasks(reportEntries, tasks);
    const elapsedMs = performance.now() - startedAt;

    assert.equal(merged.reportMissingEntries.length, 3_000, 'all tasks absent from the report should be detected');
    assert.equal(merged.entries.length, totalTaskCount, 'the merged import should cover every current source task exactly once');
    assert.equal(
        new Set(merged.entries.map(entry => entry.taskKey)).size,
        totalTaskCount,
        'coverage merging must not duplicate report rows that already exist but have an empty translation'
    );
    assert.equal(
        merged.entries.filter(entry => entry.status === 'missing').length,
        3_000 + existingSuspiciousCount,
        'new report gaps and the 13 pre-existing suspicious rows should all remain retryable'
    );
    assert.equal(
        merged.entries.filter(entry => entry.status === 'success').length,
        reportCoveredCount - existingSuspiciousCount,
        'previously translated rows should remain reusable instead of being scheduled again'
    );
    assert.ok(
        merged.reportMissingEntries.every(entry =>
            entry.qaStatus.includes('报告缺失') &&
            entry.translatedText === '' &&
            entry.actionSuggestion === '重新处理该行'
        ),
        'synthesized gaps should be explicit missing tasks with no fabricated translation'
    );
    assert.deepEqual(
        merged.reportMissingEntries.slice(0, 3).map(entry => entry.rowNumber),
        [19, 20, 21],
        'missing detection should find holes within the worksheet, not only an unfinished tail'
    );
    assert.ok(elapsedMs < 10_000, `20k-row coverage merge should stay indexed and bounded; took ${elapsedMs.toFixed(0)} ms`);

    const secondMerge = mergeImportedTranslationEntriesWithCurrentTasks(merged.entries, tasks);
    assert.equal(secondMerge.reportMissingEntries.length, 0, 'coverage merging should be idempotent');
    assert.equal(secondMerge.entries.length, totalTaskCount, 'rechecking an imported report must not grow it');
}

{
    const currentTask = makeTask(0);
    const legacyEntry = makeReportEntry(currentTask, {
        taskKey: 'legacy-channel-task-key',
        profile: '旧通道',
        model: 'deepseek-v4-pro'
    });
    const merged = mergeImportedTranslationEntriesWithCurrentTasks([legacyEntry], [currentTask]);
    assert.equal(
        merged.reportMissingEntries.length,
        0,
        'a changed API channel/model should still match the same source row by file, sheet, row, column and source text'
    );
    assert.equal(merged.entries.length, 1);
}

{
    const firstTask = makeTask(0, {
        taskKey: 'file-a-row-2',
        source: { fileName: '文件A.xlsx', sheetName: '全文本' }
    });
    const secondTask = makeTask(0, {
        taskKey: 'file-b-row-2',
        source: { fileName: '文件B.xlsx', sheetName: '全文本' }
    });
    const tasks = [firstTask, secondTask];
    const taskByKey = new Map(tasks.map(task => [task.taskKey, task]));
    const fallbackIndex = buildTranslateImportTaskIndex(tasks);
    const ambiguousLegacyEntry = makeReportEntry(firstTask, {
        taskKey: '',
        sourceFile: '',
        profile: '',
        model: '',
        translatedText: '旧报告中的有效译文'
    });

    assert.equal(
        findImportedTranslationTaskMatch(ambiguousLegacyEntry, taskByKey, fallbackIndex),
        null,
        'a weak fallback key that matches multiple logical cells must remain unmatched instead of choosing the first task'
    );

    const explicitFileEntry = { ...ambiguousLegacyEntry, sourceFile: secondTask.source.fileName };
    assert.equal(
        findImportedTranslationTaskMatch(explicitFileEntry, taskByKey, fallbackIndex)?.taskKey,
        secondTask.taskKey,
        'a uniquely identifying source file may still resolve an otherwise identical row'
    );

    const merged = mergeImportedTranslationEntriesWithCurrentTasks([ambiguousLegacyEntry], tasks);
    assert.equal(
        merged.reportMissingEntries.length,
        tasks.length,
        'an ambiguous old report row must not claim coverage for either current logical cell'
    );
    assert.equal(
        merged.entries.length,
        tasks.length,
        'canonical delivery entries must contain current logical cells only, excluding unmatched old report rows'
    );
    assert.ok(
        merged.entries.every(entry => entry.executionOutcome === 'import_missing'),
        'both unresolved current cells must remain explicit canonical import gaps'
    );
    assert.equal(merged.unmatchedEntries?.length, 1);
    assert.equal(merged.unmatchedEntries[0].translatedText, ambiguousLegacyEntry.translatedText);
    assert.equal(
        merged.unmatchedEntries[0].sourceText,
        ambiguousLegacyEntry.sourceText,
        'unmatched old rows should remain available for migration audit without entering canonical delivery counts'
    );
}

{
    const currentTask = makeTask(0);
    const unrelatedLegacyEntry = makeReportEntry(currentTask, {
        taskKey: 'unrelated-old-task',
        sourceFile: '另一份文件.xlsx',
        sheetName: '旧工作表',
        rowNumber: 999,
        sourceText: '另一条旧原文',
        translatedText: '不应计入当前交付的旧译文'
    });
    const merged = mergeImportedTranslationEntriesWithCurrentTasks([unrelatedLegacyEntry], [currentTask]);
    assert.equal(merged.entries.length, 1);
    assert.equal(merged.entries[0].taskKey, currentTask.taskKey);
    assert.equal(merged.entries[0].executionOutcome, 'import_missing');
    assert.equal(merged.unmatchedEntries?.length, 1);
    assert.equal(
        merged.unmatchedEntries[0].translatedText,
        unrelatedLegacyEntry.translatedText,
        'an unrelated legacy row must be audited separately and never counted as canonical success'
    );
}

{
    const uncoveredTask = makeTask(0);
    const merged = mergeImportedTranslationEntriesWithCurrentTasks([], [uncoveredTask]);
    const missingEntry = merged.reportMissingEntries[0];
    const retryPreview = getImportedIssueRetryPreview({
        entries: merged.entries
    });
    assert.equal(missingEntry.profile, '', 'an imported report gap must not inherit the currently selected API channel');
    assert.equal(missingEntry.model, '', 'an imported report gap must not inherit the currently selected model');
    assert.equal(missingEntry.executorProfile, '', 'an imported report gap has no executor');
    assert.equal(missingEntry.executorModel, '', 'an imported report gap has no executor model');
    assert.equal(missingEntry.executionOutcome, 'import_missing');
    assert.equal(missingEntry.candidateReturned, null, 'an imported report gap is unattempted, not a model no-content result');
    assert.equal(missingEntry.candidateDecision, 'not_attempted');
    assert.equal(retryPreview.custom, false);
    assert.equal(
        retryPreview.entries.length,
        1,
        'the canonical continuation plan must include rows synthesized from report/full-text coverage gaps'
    );
    assert.equal(retryPreview.entries[0], missingEntry);
}

{
    const uncoveredTask = makeTask(0);
    const mixedChineseTask = makeTask(1);
    const missingEntry = mergeImportedTranslationEntriesWithCurrentTasks([], [uncoveredTask])
        .reportMissingEntries[0];
    const mixedChineseEntry = makeReportEntry(mixedChineseTask, {
        status: 'qa_failed',
        qaStatus: '需确认：混入中文'
    });
    const retryPreview = getImportedIssueRetryPreview({
        entries: [missingEntry, mixedChineseEntry]
    });
    assert.equal(retryPreview.selectedIssueCount, 2);
    assert.equal(retryPreview.mandatoryMissingCount, 1);
    assert.equal(
        retryPreview.entries.length,
        2,
        'the one-click continuation plan must include every unique required or missing row'
    );
}

{
    const reviewOnlyTask = makeTask(2);
    const reviewOnlyEntry = makeReportEntry(reviewOnlyTask, {
        status: 'qa_failed',
        qaStatus: '需确认：疑似译文过短：4/12 字符，可能存在内容流失'
    });
    const retryPreview = getImportedIssueRetryPreview({ entries: [reviewOnlyEntry] });
    assert.equal(retryPreview.entries.length, 0, 'review-only heuristics must never call AI automatically');
    assert.equal(retryPreview.plan.reviewCount, 1);
    assert.equal(retryPreview.plan.reusableCount, 1);
}

{
    const currentProfile = { name: 'DeepSeek', model: 'deepseek-v4-flash' };
    const notProcessedEntry = new Function(
        'ensureExpectedCoverageSource',
        `
            const task = {
                taskKey: 'not-processed-task',
                rowIndex: 1,
                colIndex: 2,
                text: '尚未处理原文',
                profile: ${JSON.stringify(currentProfile)}
            };
            let translationRunReport = { entries: [] };
            let translationExpectedTaskMap = new Map([[
                task.taskKey,
                {
                    task,
                    snapshot: {
                        taskKey: task.taskKey,
                        sourceText: task.text,
                        profile: task.profile.name,
                        model: task.profile.model
                    }
                }
            ]]);
            function makeTranslateFailureText(_sourceText, reason) {
                return '[翻译失败：' + reason + ']';
            }
            function writeTranslationResult() {}
            eval(ensureExpectedCoverageSource);
            ensureTranslationReportCoversExpectedTasks();
            return translationRunReport.entries[0];
        `
    )(ensureExpectedCoverageSource);

    assert.equal(notProcessedEntry.profile, '', 'an unprocessed task must not be attributed to the selected channel');
    assert.equal(notProcessedEntry.model, '', 'an unprocessed task must not be attributed to the selected model');
    assert.equal(notProcessedEntry.executorProfile, '');
    assert.equal(notProcessedEntry.executorModel, '');
    assert.equal(notProcessedEntry.executionOutcome, 'not_processed');
    assert.equal(notProcessedEntry.resultOrigin, 'none');
    assert.equal(notProcessedEntry.candidateReturned, null);
    assert.equal(notProcessedEntry.candidateDecision, 'not_attempted');
}

{
    const getTranslationReportDisplayStatus = new Function(
        'classifyTranslationReportEntry',
        'isActualTranslationFailureReportEntry',
        `${reportDisplayStatusSource}; return getTranslationReportDisplayStatus;`
    )(
        () => 'missing',
        () => false
    );
    assert.equal(
        getTranslationReportDisplayStatus({ executionOutcome: 'no_content', candidateReturned: false }),
        '模型未返回可用译文',
        'a no-content response must be presented as missing content, not candidate rejection'
    );
    assert.equal(
        getTranslationReportDisplayStatus({ executionOutcome: 'candidate_rejected', candidateReturned: true }),
        '候选未采用 · 保留此前结果',
        'candidate rejection remains a distinct audited state'
    );

    const renderTranslationItem = new Function(
        'escapeHtml',
        'isTranslateFailureText',
        'getApiProfileLabel',
        'getTranslateLanguageName',
        `
            const TRANSLATION_PREVIEW_MAX_ITEMS = 50;
            const document = {
                createElement() {
                    return { className: '', innerHTML: '' };
                }
            };
            ${addTranslationItemSource}
            return audit => {
                const list = {
                    children: [],
                    get firstChild() { return this.children[0] || null; },
                    insertBefore(item) { this.children.unshift(item); },
                    removeChild(item) { this.children.splice(this.children.indexOf(item), 1); }
                };
                addTranslationItem(list, '原文', '此前译文', 1, 2, null, '', audit);
                return list.children[0].innerHTML;
            };
        `
    )(
        value => String(value || ''),
        () => false,
        () => '',
        () => ''
    );
    const noContentHtml = renderTranslationItem({
        executionOutcome: 'no_content',
        resultOrigin: 'previous',
        resultProfile: 'Agnes AI',
        resultModel: 'agnes-2.5-flash',
        candidateReturned: false
    });
    assert.match(noContentHtml, /本轮未获得可用候选/);
    assert.doesNotMatch(noContentHtml, /候选未通过确定性质检/);

    const rejectedHtml = renderTranslationItem({
        executionOutcome: 'candidate_rejected',
        resultOrigin: 'previous',
        resultProfile: 'Agnes AI',
        resultModel: 'agnes-2.5-flash',
        candidateReturned: true
    });
    assert.match(rejectedHtml, /候选未通过确定性质检/);
}

{
    const entries = [
        { executionOutcome: 'no_content', candidateReturned: false },
        { executionOutcome: 'request_failed', candidateReturned: false },
        { executionOutcome: 'candidate_rejected', candidateReturned: true, translatedText: '保留此前译文' },
        { executionOutcome: 'not_processed', candidateReturned: null },
        { executionOutcome: 'import_missing', candidateReturned: null }
    ];
    const summary = getTranslationReportIssueSummary(entries);

    assert.equal(summary.noContent, 1, 'model no-content must have its own summary count');
    assert.equal(summary.requestFailed, 1, 'transport/provider request failure must have its own summary count');
    assert.equal(summary.candidateRejected, 1, 'returned-but-rejected candidates must not be called model failures');
    assert.equal(summary.notProcessed, 1, 'work not attempted in this run must be counted separately');
    assert.equal(summary.importMissing, 1, 'an old report coverage gap must remain an import state, not a model failure');
    assert.equal(
        summary.actualFailed,
        2,
        'only no-content and request-failed outcomes are actual model/request failures in this fixture'
    );

    const formatted = formatTranslationReportIssueSummary(summary);
    assert.doesNotMatch(
        formatted,
        /翻译失败\/未返回/,
        'the visible summary must not collapse execution, rejection and import states into one ambiguous count'
    );
    assert.match(formatted, /模型未返回\s*1/, 'the visible summary must expose no-content separately');
    assert.match(formatted, /请求失败\s*1/, 'the visible summary must expose request failures separately');
    assert.match(formatted, /候选未采用\s*1/, 'the visible summary must expose candidate rejection separately');
    assert.match(formatted, /尚未处理\s*1/, 'the visible summary must expose unattempted rows separately');
    assert.match(formatted, /导入(?:报告)?缺(?:少|项)\s*1/, 'the visible summary must expose imported report gaps separately');
}

assert.doesNotMatch(source, /TRANSLATE_IMPORT_ISSUE_FILTERS/);
assert.doesNotMatch(source, /selectedIssueFilters/);

assert.match(
    importSource,
    /collectTranslationTasks\([\s\S]*?\{\s*deferGlossary:\s*true\s*\}/,
    'report import should build current source-task coverage without doing per-row glossary work'
);
assert.match(
    importSource,
    /mergeImportedTranslationEntriesWithCurrentTasks\(/,
    'report import should merge report rows with tasks missing from the current full-text source'
);
assert.match(
    importSource,
    /reportMissingEntries/,
    'report import state and status should retain the inferred missing-task count'
);

console.log('translation-import-fulltext-resume: 20k current tasks merge with 17k old report rows without restarting translated rows');
