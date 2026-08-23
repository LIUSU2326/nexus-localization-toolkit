import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

await import('../translation-delivery-policy.js');

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(scriptDir, '..');
const sourceText = fs.readFileSync(path.join(projectDir, 'script.js'), 'utf8');
const indexText = fs.readFileSync(path.join(projectDir, 'index.html'), 'utf8');

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

const getSourceOutputSource = extractFunction(sourceText, 'function getTranslateSourceOutput(');
const getResultProfileSource = extractFunction(sourceText, 'function getTranslateResultProfile(');
const getOutputSlotSource = extractFunction(sourceText, 'function getTranslateOutputSlotId(');
const getOutputTaskKeySource = extractFunction(sourceText, 'function getTranslateOutputTaskKey(');
const stableReportTaskKeySource = extractFunction(sourceText, 'function getStableReportOutputTaskKey(');
const normalizeImportKeySource = extractFunction(sourceText, 'function normalizeTranslateImportKeyPart(');
const dedupeKeySource = extractFunction(sourceText, 'function getTranslationReportEntryDedupeKey(');
const candidateRankSource = extractFunction(sourceText, 'function getTranslationReportCandidateRank(');
const candidateTieSource = extractFunction(sourceText, 'function getTranslationReportCandidateTieKey(');
const compactLegacyVariantSource = extractFunction(sourceText, 'function compactLegacyTranslationVariant(');
const mergeLegacyVariantSource = extractFunction(sourceText, 'function mergeLegacyTranslationVariantAudit(');
const selectPreferredEntrySource = extractFunction(sourceText, 'function selectPreferredTranslationReportEntry(');
const dedupeEntriesSource = extractFunction(sourceText, 'function dedupeTranslationReportEntries(');
const stripLegacyColumnsSource = extractFunction(sourceText, 'function stripLegacyTranslationArtifactColumns(');
const ensureOutputColumnSource = extractFunction(sourceText, 'function ensureTranslateOutputColumn(');
const buildTaskKeySource = extractFunction(sourceText, 'function buildTranslationTaskKey(');
const collectTasksSource = extractFunction(sourceText, 'function collectTranslationTasks(');
const writeResultSource = extractFunction(sourceText, 'function writeTranslationResult(');
const buildReportEntrySource = extractFunction(sourceText, 'function buildTranslationReportEntry(');

const profiles = [
    { id: 'api-a', name: 'Agnes api2', model: 'agnes-2.5-flash' },
    { id: 'api-b', name: 'Agnes AI 5', model: 'agnes-2.5-flash' }
];
const documentStub = {
    getElementById(id) {
        if (id === 'targetLang') return { value: 'tr' };
        return null;
    }
};

function createTaskCollector(activeSheetData, activeSelectedColumns, activeSource, activeReferenceColumn = 3) {
    return new Function(
        'sheetData',
        'selectedColumns',
        'referenceColumn',
        'document',
        'getSelectedTranslateGlossaryTerms',
        'findTranslateSourceForRow',
        'getTranslateReferenceText',
        'getRelevantTranslateGlossaryTerms',
        'isSpecialCode',
        'getTranslateOriginalRowNumber',
        'getTranslateColumnName',
        `${buildTaskKeySource}\n${collectTasksSource}\nreturn collectTranslationTasks;`
    )(
        activeSheetData,
        activeSelectedColumns,
        activeReferenceColumn,
        documentStub,
        () => [],
        () => activeSource,
        row => row[activeReferenceColumn] || '',
        () => [],
        () => false,
        rowIndex => rowIndex + 1,
        columnIndex => `列${columnIndex + 1}`
    );
}

const rows = [
    ['id', '备注', '管理', '英语'],
    [1, '', '开始', 'Start'],
    [2, '', '取消', 'Cancel']
];
const workbookSource = {
    fileName: '佣兵小镇-全文本.xlsx',
    sheetName: '全文本',
    rows,
    rowMap: new Map([[1, 1], [2, 2]])
};
const collectTranslationTasks = createTaskCollector(rows, [2], workbookSource);
const tasks = collectTranslationTasks(profiles, { deferGlossary: true });

assert.equal(tasks.length, 2, 'two selected channels must not multiply two logical cells into four API tasks');
assert.deepEqual(
    tasks.map(task => task.profile.id),
    ['api-a', 'api-b'],
    'selected channels should share one logical task queue deterministically'
);
assert.ok(tasks.every(task => task.outputSlotId === 'primary'));

const oneChannelTasks = collectTranslationTasks([profiles[1]], { deferGlossary: true });
assert.deepEqual(
    oneChannelTasks.map(task => task.taskKey),
    tasks.map(task => task.taskKey),
    'changing executor channels must not change the logical task identity'
);
assert.doesNotMatch(buildTaskKeySource, /getTranslateChannelKey|profile/);
assert.doesNotMatch(buildTaskKeySource, /referenceColIndex/);
assert.doesNotMatch(collectTasksSource, /activeProfiles\.forEach/);

const changedReferenceCollector = createTaskCollector(rows, [2], workbookSource, 1);
assert.deepEqual(
    changedReferenceCollector(profiles, { deferGlossary: true }).map(task => task.taskKey),
    tasks.map(task => task.taskKey),
    'changing the reference column must not create a second logical translation task identity'
);

const outputHarness = new Function(
    'document',
    'getTranslateLanguageName',
    'normalizeTranslateResultText',
    'getTranslationReportStatus',
    'getTranslationQaDisplayText',
    `${getSourceOutputSource}\n${getOutputSlotSource}\n${ensureOutputColumnSource}\n${writeResultSource}\nreturn { ensureTranslateOutputColumn, writeTranslationResult };`
)(
    documentStub,
    code => code === 'tr' ? '土耳其语' : code,
    value => String(value ?? ''),
    () => 'success',
    entry => entry.qaStatus || '通过'
);

outputHarness.writeTranslationResult(tasks[0], 'Başla', '通过');
outputHarness.writeTranslationResult(tasks[1], 'İptal', '通过');
assert.deepEqual(
    workbookSource.outputRows[0].slice(-2),
    ['管理 (土耳其语)', '管理 (土耳其语 · 检测)'],
    'the translated workbook should expose one channel-neutral translation/QA column pair'
);
assert.equal(workbookSource.outputRows[1][4], 'Başla');
assert.equal(workbookSource.outputRows[2][4], 'İptal');
assert.equal(workbookSource.outputRows[0].length, rows[0].length + 2);

outputHarness.writeTranslationResult({
    ...tasks[0],
    profile: { id: 'api-c', name: 'Repair API', model: 'repair-model' },
    executorProfile: { id: 'api-c', name: 'Repair API', model: 'repair-model' },
    outputSlotId: 'legacy-profile-c'
}, 'Başlat', '通过');
assert.equal(
    workbookSource.outputRows[0].length,
    rows[0].length + 2,
    'changing the executor or carrying a legacy slot label must never append another output pair'
);
assert.equal(workbookSource.outputRows[1][4], 'Başlat');

const duplicateHeaderRows = [
    ['id', '管理', '管理', '英语'],
    [1, '开始', '取消', 'Start / Cancel']
];
const duplicateHeaderSource = {
    fileName: 'duplicate-headers.xlsx',
    sheetName: 'Sheet1',
    rows: duplicateHeaderRows,
    rowMap: new Map([[1, 1]])
};
const duplicateHeaderTasks = createTaskCollector(
    duplicateHeaderRows,
    [1, 2],
    duplicateHeaderSource,
    3
)(profiles, { deferGlossary: true });
outputHarness.writeTranslationResult(duplicateHeaderTasks[0], 'Başla', '通过');
outputHarness.writeTranslationResult(duplicateHeaderTasks[1], 'İptal', '通过');
assert.deepEqual(
    duplicateHeaderSource.outputRows[0].slice(-4),
    [
        '管理 [列2] (土耳其语)',
        '管理 [列2] (土耳其语 · 检测)',
        '管理 [列3] (土耳其语)',
        '管理 [列3] (土耳其语 · 检测)'
    ],
    'duplicate source headers must receive distinct output pairs instead of overwriting each other'
);

const { dedupeTranslationReportEntries } = new Function(
    'isTranslateFailureText',
    'classifyTranslationReportEntry',
    `${normalizeImportKeySource}\n${dedupeKeySource}\n${candidateRankSource}\n${candidateTieSource}\n${compactLegacyVariantSource}\n${mergeLegacyVariantSource}\n${selectPreferredEntrySource}\n${dedupeEntriesSource}\nreturn { dedupeTranslationReportEntries };`
)(
    text => String(text || '').startsWith('[翻译失败'),
    entry => {
        if (entry.manualResolutionValid) return 'success';
        if (entry.status === 'success') return 'success';
        if (entry.status === 'missing' || !entry.translatedText) return 'missing';
        if (entry.status === 'qa_failed') return 'hard';
        return 'soft';
    }
);
const sharedIdentity = {
    sourceFile: 'source.xlsx',
    sheetName: 'Sheet1',
    rowNumber: 2,
    column: 3,
    sourceText: '开始'
};
const passingVariant = {
    ...sharedIdentity,
    taskKey: 'legacy-a',
    profile: 'Channel A',
    model: 'model-a',
    status: 'success',
    translatedText: 'Başla',
    qaStatus: '通过'
};
const failingVariant = {
    ...sharedIdentity,
    taskKey: 'legacy-b',
    profile: 'Channel B',
    model: 'model-b',
    status: 'qa_failed',
    translatedText: '开始',
    qaStatus: '阻断：混入中文'
};
for (const orderedVariants of [
    [passingVariant, failingVariant],
    [failingVariant, passingVariant]
]) {
    const [selected] = dedupeTranslationReportEntries(orderedVariants);
    assert.equal(selected.translatedText, 'Başla', 'legacy migration must select the better candidate regardless of report order');
    assert.equal(selected.legacyVariants.length, 2, 'discarded legacy candidates must remain in the migration audit');
}
const manuallyAcceptedVariant = {
    ...failingVariant,
    taskKey: 'legacy-manual',
    translatedText: 'Başlat',
    manualResolutionValid: true,
    userDecision: 'accept_current'
};
assert.equal(
    dedupeTranslationReportEntries([passingVariant, manuallyAcceptedVariant])[0].translatedText,
    'Başlat',
    'a validated manual decision must outrank an automatic QA result'
);
const unverifiedRevisionVariant = {
    ...failingVariant,
    taskKey: 'legacy-unverified-revision',
    userDecision: 'use_revision',
    revisedText: 'Başlat',
    manualResolutionValid: false,
    revisionApplied: false
};
assert.equal(
    dedupeTranslationReportEntries([passingVariant, unverifiedRevisionVariant])[0].translatedText,
    'Başla',
    'an unverified legacy decision must not displace a currently passing candidate before recheck'
);
assert.equal(
    dedupeTranslationReportEntries([
        { sourceText: '重复原文', translatedText: 'A' },
        { sourceText: '重复原文', translatedText: 'B' }
    ]).length,
    2,
    'entries without a complete cell identity or task key must not be merged by source text alone'
);

const stripLegacyTranslationArtifactColumns = new Function(
    'getTranslateLanguageName',
    `${stripLegacyColumnsSource}\nreturn stripLegacyTranslationArtifactColumns;`
)(code => code === 'tr' ? '土耳其语' : code);
const legacyRows = [
    ['id', '备注', '管理', '英语', '', '管理 (土耳其语 · Channel A · model-a)', '管理 (土耳其语 · Channel A · model-a · 检测)', '管理 (土耳其语 · Channel B · model-b)', '管理 (土耳其语 · Channel B · model-b · 检测)'],
    [1, '', '开始', 'Start', '', 'Başla', '通过', '', ''],
    [2, '', '取消', 'Cancel', '', '', '', 'İptal', '通过']
];
const strippedLegacy = stripLegacyTranslationArtifactColumns(
    legacyRows,
    [passingVariant, {
        ...passingVariant,
        profile: 'Channel B',
        model: 'model-b',
        rowNumber: 3,
        sourceText: '取消',
        translatedText: 'İptal'
    }],
    'tr'
);
assert.deepEqual(strippedLegacy.removedColumns, [5, 6, 7, 8]);
assert.deepEqual(
    strippedLegacy.rows[0],
    ['id', '备注', '管理', '英语', ''],
    'loading an old translated workbook with an embedded report must remove only generated output columns'
);
const incompleteLegacyReport = stripLegacyTranslationArtifactColumns(
    legacyRows,
    [passingVariant],
    'tr'
);
assert.deepEqual(
    incompleteLegacyReport.removedColumns,
    [5, 6],
    'only legacy columns fully recoverable from the report may be removed'
);
assert.deepEqual(
    incompleteLegacyReport.rows[0],
    ['id', '备注', '管理', '英语', '', '管理 (土耳其语 · Channel B · model-b)', '管理 (土耳其语 · Channel B · model-b · 检测)']
);

const getStableReportOutputTaskKey = new Function(
    'makeStableId',
    `${stableReportTaskKeySource}\nreturn getStableReportOutputTaskKey;`
)(value => `hash:${value}`);
assert.equal(
    getStableReportOutputTaskKey({ taskKey: 'legacy|profile|task' }, tasks[0]),
    tasks[0].taskKey,
    'old profile-bound report keys must migrate to the current canonical cell key'
);

const buildTranslationReportEntry = new Function(
    'normalizeTranslateResultText',
    'getTranslationReportStatus',
    'getTranslationCompletenessRiskLabel',
    'getTranslationActionSuggestion',
    'formatTranslateGlossaryTerm',
    'getCompactModelLabel',
    `${getResultProfileSource}\n${getOutputSlotSource}\n${getOutputTaskKeySource}\n${buildReportEntrySource}\nreturn buildTranslationReportEntry;`
)(
    value => String(value ?? ''),
    () => 'success',
    () => '',
    () => '',
    term => String(term),
    profile => profile?.name || profile?.model || ''
);
const repairExecutor = { id: 'repair', name: 'Repair API', model: 'repair-model' };
const reportEntry = buildTranslationReportEntry({
    ...tasks[0],
    executorProfile: repairExecutor,
    reportProfile: repairExecutor
}, 'Başlat', '通过');
assert.equal(reportEntry.outputSlotId, 'primary');
assert.equal(reportEntry.profile, 'Repair API');
assert.equal(reportEntry.model, 'repair-model');

assert.match(indexText, /多选通道会分担同一批任务/);
assert.doesNotMatch(indexText, /多选通道会生成多组译文/);

console.log('translation-output-column-identity: canonical output slots, executor sharing, and provenance passed');
