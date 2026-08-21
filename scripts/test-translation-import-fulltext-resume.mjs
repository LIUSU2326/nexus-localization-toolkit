import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
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

const normalizeKeySource = extractFunction(source, 'function normalizeTranslateImportKeyPart(');
const makeKeySource = extractFunction(source, 'function makeTranslateImportMatchKey(');
const taskKeysSource = extractFunction(source, 'function getTaskImportMatchKeys(');
const entryKeysSource = extractFunction(source, 'function getImportedEntryMatchKeys(');
const taskIndexSource = extractFunction(source, 'function buildTranslateImportTaskIndex(');
const findMatchSource = extractFunction(source, 'function findImportedTranslationTaskMatch(');
const missingEntriesSource = extractFunction(source, 'function buildImportedReportMissingTaskEntries(');
const mergeEntriesSource = extractFunction(source, 'function mergeImportedTranslationEntriesWithCurrentTasks(');
const importSource = extractFunction(source, 'async function importTranslateProgressFile(');
const issueFiltersStart = source.indexOf('const TRANSLATE_IMPORT_ISSUE_FILTERS = [');
const issueFiltersEnd = source.indexOf('const DEFAULT_PROJECTS = [', issueFiltersStart);
assert.ok(issueFiltersStart >= 0 && issueFiltersEnd > issueFiltersStart, 'translation import issue filters should exist');
const issueFiltersSource = source.slice(issueFiltersStart, issueFiltersEnd);
const filterSelectionSource = extractFunction(source, 'function getImportedIssueFilterSelection(');
const dedupeKeySource = extractFunction(source, 'function getTranslationReportEntryDedupeKey(');
const dedupeEntriesSource = extractFunction(source, 'function dedupeTranslationReportEntries(');
const filteredEntriesSource = extractFunction(source, 'function getTranslationReportEntriesForIssueFilters(');
const retryPreviewSource = extractFunction(source, 'function getImportedIssueRetryPreview(');

const { mergeImportedTranslationEntriesWithCurrentTasks } = new Function(
    'getCompactModelLabel',
    `${normalizeKeySource}
    ${makeKeySource}
    ${taskKeysSource}
    ${entryKeysSource}
    ${taskIndexSource}
    ${findMatchSource}
    ${missingEntriesSource}
    ${dedupeKeySource}
    ${dedupeEntriesSource}
    ${mergeEntriesSource}
    return { mergeImportedTranslationEntriesWithCurrentTasks };`
)(profile => profile?.name || profile?.model || '');

const { getImportedIssueRetryPreview } = new Function(
    'isRepairableTranslationReportEntry',
    'getTranslationReportIssueText',
    'isLengthSoftRiskTranslationReportEntry',
    'isFailedTranslationReportEntry',
    'isMissingTranslationReportEntry',
    `${normalizeKeySource}
    ${issueFiltersSource}
    ${filterSelectionSource}
    ${dedupeKeySource}
    ${dedupeEntriesSource}
    ${filteredEntriesSource}
    ${retryPreviewSource}
    return { getImportedIssueRetryPreview };`
)(
    entry => ['failed', 'missing', 'qa_failed'].includes(entry?.status),
    entry => [entry?.qaStatus, entry?.completenessRisk, entry?.error].filter(Boolean).join('；'),
    () => false,
    entry => entry?.status !== 'success',
    entry => entry?.status === 'missing'
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
    const uncoveredTask = makeTask(0);
    const merged = mergeImportedTranslationEntriesWithCurrentTasks([], [uncoveredTask]);
    const missingEntry = merged.reportMissingEntries[0];
    const retryPreview = getImportedIssueRetryPreview({
        entries: merged.entries,
        suspiciousEntries: merged.reportMissingEntries,
        selectedIssueFilters: ['untranslated']
    });
    assert.equal(retryPreview.custom, true);
    assert.equal(
        retryPreview.entries.length,
        1,
        'selecting “疑似未翻译” must include rows synthesized from report/full-text coverage gaps'
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
        entries: [missingEntry, mixedChineseEntry],
        suspiciousEntries: [missingEntry, mixedChineseEntry],
        selectedIssueFilters: ['mixedChinese']
    });
    assert.equal(retryPreview.selectedIssueCount, 1);
    assert.equal(retryPreview.mandatoryMissingCount, 1);
    assert.equal(
        retryPreview.entries.length,
        2,
        'targeted retry must always include blank/missing rows so a narrow issue filter cannot produce an incomplete delivery'
    );
}

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
