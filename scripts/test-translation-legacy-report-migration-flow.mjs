import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

await import('../translation-delivery-policy.js');

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(scriptDir, '..');
const sourceText = fs.readFileSync(path.join(projectDir, 'script.js'), 'utf8');

function extractFunction(signature, functionSource = sourceText) {
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

function createXlsxStub() {
    return {
        utils: {
            book_new: () => ({ SheetNames: [], Sheets: {} }),
            aoa_to_sheet: rows => ({ rows }),
            book_append_sheet: (workbook, sheet, name) => {
                workbook.SheetNames.push(name);
                workbook.Sheets[name] = sheet;
            }
        }
    };
}

const signatures = [
    'function sanitizeTranslationCandidateAudit(',
    'function sanitizeTranslationRepairLifecycle(',
    'function compactTranslationProgressEntry(',
    'function getTranslateSourceOutput(',
    'function getTranslateResultProfile(',
    'function copyPersistableTranslationAudit(',
    'function getTranslateOutputSlotId(',
    'function getTranslateOutputTaskKey(',
    'function createTranslateResultProfileFromReportEntry(',
    'function getStableReportOutputTaskKey(',
    'function ensureTranslateOutputColumn(',
    'function normalizeTranslateImportKeyPart(',
    'function makeTranslateImportMatchKey(',
    'function getTaskImportMatchKeys(',
    'function getImportedEntryMatchKeys(',
    'function buildTranslateImportTaskIndex(',
    'function buildTranslateImportTaskLookup(',
    'function findImportedTranslationTaskMatch(',
    'function importedEntryMatchesTask(',
    'function findTaskForImportedTranslationEntry(',
    'function getTranslationReportEntryDedupeKey(',
    'function getTranslationReportCandidateRank(',
    'function getTranslationReportCandidateTieKey(',
    'function compactLegacyTranslationVariant(',
    'function mergeLegacyTranslationVariantAudit(',
    'function selectPreferredTranslationReportEntry(',
    'function dedupeTranslationReportEntries(',
    'function stripLegacyTranslationArtifactColumns(',
    'function buildRetryTasksForReportEntries(',
    'function appendTranslationQaIssue(',
    'function buildTranslationReportEntry(',
    'function upsertTranslationRunReportEntry(',
    'function refreshTranslationRunCountsFromReport(',
    'function restoreImportedReportEntriesToOutput(',
    'function initializeTranslateOutputFromImportedReport(',
    'function writeTranslationResult(',
    'function getUniqueTranslationWorksheetName(',
    'function buildTranslationWorkbook(',
    'function isTranslationRepairLifecycleFrozen(',
    'function buildTranslationReportRows('
];
const productionFunctions = signatures.map(signature => extractFunction(signature)).join('\n');

const startTranslateSource = extractFunction('async function startTranslate(');
const evaluateCandidateSource = extractFunction('function evaluateTranslateResultCandidate(', startTranslateSource);
const retryFailedTranslationsSource = extractFunction('async function retryFailedTranslations(');
const importTranslateProgressFileSource = extractFunction('async function importTranslateProgressFile(');
const normalizeLoadedSourcesSource = extractFunction('function normalizeLoadedTranslateSourcesFromImportedReport(');
const migrationSourceFileKeySource = extractFunction('function getTranslateMigrationSourceFileKey(');
const expandImportedCandidatesSource = extractFunction('function expandImportedTranslationCandidateEntries(');
const reviewAndDedupeImportedEntriesSource = extractFunction('function reviewAndDedupeImportedTranslationEntries(');
assert.match(
    evaluateCandidateSource,
    /previousEntry\?\.legacyVariants[\s\S]*candidateEntry\.legacyVariants\s*=\s*previousEntry\.legacyVariants/,
    'an accepted repair candidate must carry forward the legacy candidate audit'
);
assert.match(
    retryFailedTranslationsSource,
    /profile:\s*executorProfile,[\s\S]*executorProfile,[\s\S]*reportProfile:\s*executorProfile/,
    'a retry must report the executor that actually generated the replacement'
);
assert.match(
    importTranslateProgressFileSource,
    /normalizeLoadedTranslateSourcesFromImportedReport\(\s*importedReportEntries,\s*importedTargetLang\s*\)/,
    'a separately imported report must normalize a previously exported legacy workbook too'
);
assert.match(normalizeLoadedSourcesSource, /stripLegacyTranslationArtifactColumns\(/);
assert.match(normalizeLoadedSourcesSource, /rebuildTranslateSheetData\(\)/);
assert.match(normalizeLoadedSourcesSource, /getTranslateMigrationSourceFileKey\(entry\.sourceFile\) === sourceFileKey/);
assert.match(normalizeLoadedSourcesSource, /source === headerSource/);
assert.match(importTranslateProgressFileSource, /reviewAndDedupeImportedTranslationEntries\(parsedEntries\.entries/);
assert.match(reviewAndDedupeImportedEntriesSource, /expandImportedTranslationCandidateEntries\(entries\)/);
assert.match(expandImportedCandidatesSource, /entry\?\.legacyVariants/);

const getTranslateMigrationSourceFileKey = new Function(
    'normalizeTranslateImportKeyPart',
    `${migrationSourceFileKeySource}; return getTranslateMigrationSourceFileKey;`
)(value => String(value || '').trim().toLowerCase());
assert.equal(
    getTranslateMigrationSourceFileKey('game.xlsx'),
    getTranslateMigrationSourceFileKey('game_tr_translated_unverified-2.xlsx'),
    'a separately exported legacy workbook must match the original report source file'
);
assert.notEqual(
    getTranslateMigrationSourceFileKey('game.xlsx'),
    getTranslateMigrationSourceFileKey('another-game_tr_translated_unverified.xlsx'),
    'same-named worksheets from different files must not share migration candidates'
);

const oldChannelA = { id: 'old-a', name: 'Old Channel A', model: 'old-model-a' };
const oldChannelB = { id: 'old-b', name: 'Old Channel B', model: 'old-model-b' };
const repairExecutor = { id: 'repair-c', name: 'Repair Channel C', model: 'repair-model-c' };

const legacyRows = [
    [
        'id',
        '备注',
        '管理',
        '英语',
        '管理 (土耳其语 · Old Channel A · old-model-a)',
        '管理 (土耳其语 · Old Channel A · old-model-a · 检测)',
        '管理 (土耳其语 · Old Channel B · old-model-b)',
        '管理 (土耳其语 · Old Channel B · old-model-b · 检测)'
    ],
    [1, '', '开始', 'Start', 'Başla', '通过', '开始', '阻断：混入中文'],
    [2, '', '取消', 'Cancel', '取消', '阻断：混入中文', '取消订单', '阻断：混入中文']
];

const cellIdentity = (rowNumber, sourceText) => ({
    sourceFile: 'game.xlsx',
    sheetName: '全文本',
    rowNumber,
    column: 3,
    sourceText
});
const oldReportEntries = [
    {
        ...cellIdentity(2, '开始'),
        taskKey: 'game.xlsx|全文本|tr|1|2|old-a',
        profile: oldChannelA.name,
        model: oldChannelA.model,
        status: 'success',
        translatedText: 'Başla',
        qaStatus: '通过'
    },
    {
        ...cellIdentity(2, '开始'),
        taskKey: 'game.xlsx|全文本|tr|1|2|old-b',
        profile: oldChannelB.name,
        model: oldChannelB.model,
        status: 'qa_failed',
        translatedText: '开始',
        qaStatus: '阻断：混入中文'
    },
    {
        ...cellIdentity(3, '取消'),
        taskKey: 'game.xlsx|全文本|tr|2|2|old-a',
        profile: oldChannelA.name,
        model: oldChannelA.model,
        status: 'qa_failed',
        translatedText: '取消',
        qaStatus: '阻断：混入中文'
    },
    {
        ...cellIdentity(3, '取消'),
        taskKey: 'game.xlsx|全文本|tr|2|2|old-b',
        profile: oldChannelB.name,
        model: oldChannelB.model,
        status: 'qa_failed',
        translatedText: '取消订单',
        qaStatus: '阻断：混入中文'
    }
];

const createHarness = new Function(
    'assert',
    'XLSX',
    'legacyRowsInput',
    'oldReportEntriesInput',
    'repairExecutorInput',
    `
        'use strict';
        const targetLangSelect = { value: 'tr' };
        const document = {
            getElementById(id) {
                if (id === 'targetLang') return targetLangSelect;
                return null;
            }
        };
        const originalFileName = 'game.xlsx';
        const selectedColumns = [2];
        const repairExecutor = repairExecutorInput;
        let translatedDataLocal = [];
        let translatedWorkbook = null;
        let translationRunReport = null;
        let translationProgressTasks = new Map();
        let failedTranslationTasks = [];
        let successCount = 0;
        let failCount = 0;

        function getTranslateLanguageName(code) {
            return code === 'tr' ? '土耳其语' : String(code || '');
        }
        function getCompactModelLabel(profile) {
            return profile?.name || profile?.model || '';
        }
        function makeStableId(value) {
            return 'stable:' + String(value || '');
        }
        function normalizeTranslateResultText(value) {
            return String(value ?? '').trim();
        }
        function isMissingTranslationResult(value) {
            return !String(value ?? '').trim();
        }
        function isMarkedTranslationFailure(value) {
            return /^\\[翻译失败/.test(String(value || ''));
        }
        function isTranslateFailureText(value) {
            return isMissingTranslationResult(value) || isMarkedTranslationFailure(value);
        }
        function isTranslationQaPassed(qaStatus) {
            return String(qaStatus || '').trim() === '通过';
        }
        function getTranslationReportStatus(translatedText, qaStatus = '') {
            if (isMissingTranslationResult(translatedText)) return 'missing';
            if (isMarkedTranslationFailure(translatedText)) return 'failed';
            return isTranslationQaPassed(qaStatus) ? 'success' : 'qa_failed';
        }
        function classifyTranslationReportEntry(entry = {}) {
            if (entry.manualResolutionValid || entry.status === 'success') return 'success';
            if (entry.status === 'missing' || entry.status === 'failed' || !entry.translatedText) return 'missing';
            if (entry.status === 'qa_failed' || !isTranslationQaPassed(entry.qaStatus)) return 'hard';
            return 'soft';
        }
        function summarizeTranslationQa(_sourceText, translatedText) {
            return /[\\u3400-\\u9fff]/u.test(String(translatedText || ''))
                ? '阻断：混入中文'
                : '通过';
        }
        function getTranslationQaDisplayText(entry = {}) {
            return entry.qaStatus || (entry.status === 'success' ? '通过' : '需确认');
        }
        function getTranslationCompletenessRiskLabel(qaStatus = '') {
            return isTranslationQaPassed(qaStatus) ? '' : '高置信硬问题';
        }
        function getTranslationActionSuggestion(status = '', qaStatus = '') {
            return status === 'success' && isTranslationQaPassed(qaStatus)
                ? ''
                : '阻断交付：重新翻译该行';
        }
        function getTranslationReportDisplayStatus(entry = {}) {
            return entry.status || '';
        }
        function formatTranslateGlossaryTerm(term) {
            return String(term || '');
        }
        function canAcceptCurrentTranslationEntry() {
            return false;
        }
        function queueTranslationTaskProgress() {}
        function countTranslationProgressEntries(entries = []) {
            return entries.reduce((counts, entry) => {
                if (entry.status === 'success') counts.successCount += 1;
                else counts.failCount += 1;
                return counts;
            }, { successCount: 0, failCount: 0 });
        }
        function ensureTranslationReportCoversExpectedTasks() {}
        function getDefaultRetryableTranslationReportEntries() {
            return (translationRunReport?.entries || []).filter(entry => classifyTranslationReportEntry(entry) === 'hard');
        }
        function getTranslationIssueIdentity(entry = {}) {
            return entry.taskKey || [entry.sourceFile, entry.sheetName, entry.rowNumber, entry.column].join('|');
        }
        function assertTranslationOutputConsistency() {}
        function setExpectedTranslationTasks() {}

        ${productionFunctions}

        const strippedArtifact = stripLegacyTranslationArtifactColumns(
            legacyRowsInput.map(row => [...row]),
            oldReportEntriesInput,
            'tr'
        );
        const source = {
            id: 'source-1',
            fileName: 'game.xlsx',
            sheetName: '全文本',
            rows: strippedArtifact.rows,
            rowMap: new Map([[1, 1], [2, 2]])
        };
        const translateSources = [source];
        let sheetData = source.rows;
        const importedTranslateProgressState = {
            targetLang: 'tr',
            entries: oldReportEntriesInput
        };

        function collectTranslationTasks(activeProfiles) {
            return [1, 2].map((rowIndex, index) => {
                const profile = activeProfiles[index % activeProfiles.length];
                return {
                    rowIndex,
                    originalRowIndex: rowIndex,
                    originalRowNumber: rowIndex + 1,
                    colIndex: 2,
                    sourceColumnName: '管理',
                    text: source.rows[rowIndex][2],
                    referenceText: source.rows[rowIndex][3],
                    source,
                    profile,
                    executorProfile: profile,
                    outputSlotId: 'primary',
                    glossaryTerms: [],
                    taskKey: ['game.xlsx', '全文本', 'tr', rowIndex, 2].join('|')
                };
            });
        }
        function getSelectedTranslateProfiles() {
            return [repairExecutor];
        }
        function getSelectedTranslateSources() {
            return translateSources;
        }

        function runMigrationAndRepair() {
            const allTasks = collectTranslationTasks([repairExecutor]);
            const initialized = initializeTranslateOutputFromImportedReport(allTasks, 'tr');
            const blockerEntries = translationRunReport.entries.filter(
                entry => classifyTranslationReportEntry(entry) === 'hard'
            );
            const retryMapping = buildRetryTasksForReportEntries(blockerEntries, [repairExecutor]);
            assert.equal(retryMapping.retryTasks.length, 1, 'only the remaining blocker should be retried');

            const retryTask = retryMapping.retryTasks[0];
            const outputTaskKey = retryTask.outputTaskKey || retryTask.retryOfTaskKey || retryTask.taskKey;
            const preparedRepairTask = {
                ...retryTask,
                profile: repairExecutor,
                executorProfile: repairExecutor,
                reportProfile: repairExecutor,
                outputSlotId: 'primary',
                outputTaskKey,
                retryOfTaskKey: outputTaskKey,
                taskKey: outputTaskKey
            };
            const previousIndex = translationRunReport.entries.findIndex(
                entry => entry.taskKey === outputTaskKey || importedEntryMatchesTask(entry, preparedRepairTask)
            );
            assert.ok(previousIndex >= 0, 'the blocker current-best entry should be available to the repair gate');
            const previousEntry = translationRunReport.entries[previousIndex];
            const acceptedCandidate = buildTranslationReportEntry(preparedRepairTask, 'İptal', '通过');
            if (Array.isArray(previousEntry.legacyVariants) && previousEntry.legacyVariants.length) {
                acceptedCandidate.legacyVariants = previousEntry.legacyVariants;
                acceptedCandidate.legacyVariantCount = previousEntry.legacyVariants.length;
            }
            translationRunReport.entries[previousIndex] = acceptedCandidate;
            const compactCandidate = compactTranslationProgressEntry(acceptedCandidate);
            translationProgressTasks.set(acceptedCandidate.taskKey, compactCandidate);
            writeTranslationResult(preparedRepairTask, acceptedCandidate.translatedText, acceptedCandidate.qaStatus);
            refreshTranslationRunCountsFromReport();

            return {
                strippedArtifact,
                initialized,
                retryMapping,
                source,
                report: translationRunReport,
                translatedWorkbook: buildTranslationWorkbook(),
                reportRows: buildTranslationReportRows()
            };
        }

        return { runMigrationAndRepair };
    `
)(assert, createXlsxStub(), legacyRows, oldReportEntries, repairExecutor);

const result = createHarness.runMigrationAndRepair();

assert.deepEqual(
    result.strippedArtifact.removedColumns,
    [4, 5, 6, 7],
    'all old channel-specific generated columns should be removed before canonical restoration'
);
assert.equal(result.initialized.matched, 2, 'the two logical cells should be restored exactly once');
assert.equal(result.initialized.unmatched, 0);
assert.equal(result.retryMapping.allTasks.length, 2);
assert.equal(result.retryMapping.retryTasks.length, 1);

assert.deepEqual(result.translatedWorkbook.SheetNames, ['全文本']);
const finalRows = result.translatedWorkbook.Sheets['全文本'].rows;
assert.deepEqual(
    finalRows[0],
    ['id', '备注', '管理', '英语', '管理 (土耳其语)', '管理 (土耳其语 · 检测)'],
    'the final translated workbook must contain exactly one canonical translation/QA pair'
);
assert.deepEqual(finalRows[1].slice(4), ['Başla', '通过'], 'the passing legacy current-best translation should be reused');
assert.deepEqual(finalRows[2].slice(4), ['İptal', '通过'], 'the blocker should be replaced in the same canonical cells');
assert.equal(
    finalRows[0].filter(header => /Old Channel|old-model|Repair Channel|repair-model/.test(String(header))).length,
    0,
    'executor provenance must never leak back into output column identity'
);

assert.equal(result.report.entries.length, 2, 'the report must retain one current-best entry per logical cell');
const reusedEntry = result.report.entries.find(entry => entry.sourceText === '开始');
const repairedEntry = result.report.entries.find(entry => entry.sourceText === '取消');
assert.equal(reusedEntry.translatedText, 'Başla');
assert.equal(reusedEntry.profile, oldChannelA.name, 'the reused row should retain its actual legacy executor');
assert.equal(reusedEntry.model, oldChannelA.model);
assert.equal(reusedEntry.outputSlotId, 'primary');
assert.equal(reusedEntry.legacyVariants.length, 2, 'the discarded legacy candidate should remain auditable');
assert.equal(repairedEntry.translatedText, 'İptal');
assert.equal(repairedEntry.profile, repairExecutor.name, 'the repaired row should report the new actual executor');
assert.equal(repairedEntry.model, repairExecutor.model);
assert.equal(repairedEntry.outputSlotId, 'primary');
assert.equal(repairedEntry.legacyVariants.length, 2, 'repair must not erase the migrated legacy candidate audit');
assert.deepEqual(
    new Set(repairedEntry.legacyVariants.map(variant => variant.profile)),
    new Set([oldChannelA.name, oldChannelB.name])
);

const reportHeaderIndex = result.reportRows.findIndex(row => row[0] === '任务Key' && row.includes('历史候选迁移审计'));
assert.ok(reportHeaderIndex >= 0, 'the exported report should expose the migration audit column');
const reportHeaders = result.reportRows[reportHeaderIndex];
const profileColumn = reportHeaders.indexOf('通道');
const modelColumn = reportHeaders.indexOf('模型');
const sourceColumn = reportHeaders.indexOf('原文');
const auditColumn = reportHeaders.indexOf('历史候选迁移审计');
const repairedReportRow = result.reportRows
    .slice(reportHeaderIndex + 1)
    .find(row => row[sourceColumn] === '取消');
assert.equal(repairedReportRow[profileColumn], repairExecutor.name);
assert.equal(repairedReportRow[modelColumn], repairExecutor.model);
const exportedAudit = JSON.parse(repairedReportRow[auditColumn]);
assert.equal(exportedAudit.length, 2);
assert.deepEqual(
    new Set(exportedAudit.map(variant => variant.profile)),
    new Set([oldChannelA.name, oldChannelB.name])
);

console.log('translation-legacy-report-migration-flow: legacy reuse, targeted repair, canonical workbook, and provenance audit passed');
