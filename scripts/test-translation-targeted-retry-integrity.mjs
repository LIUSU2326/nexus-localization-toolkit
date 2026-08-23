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

const restoreEntriesSource = extractFunction(source, 'function buildImportedTranslationRestoreEntries(');
const initializeOutputSource = extractFunction(source, 'function initializeTranslateOutputFromImportedReport(');
const targetedRetrySource = extractFunction(source, 'async function retrySuspiciousImportedTranslations(');

assert.match(
    targetedRetrySource,
    /initializeTranslateOutputFromImportedReport\(mapping\.allTasks, targetLang, \{\s*taskLookup:\s*mapping\.taskLookup,\s*includeQaFailed:\s*true\s*\}\)/,
    'targeted retry must restore every translated QA failure before selecting the requested retry tasks'
);
assert.match(
    initializeOutputSource,
    /importedTranslateProgressState\?\.entries[\s\S]*preservedByIdentity[\s\S]*translationRunReport\.entries = \[\.\.\.preservedByIdentity\.values\(\)\]/,
    'all imported report rows, including blank, failed, and unmapped blockers, must remain in the live delivery gate'
);
assert.match(
    targetedRetrySource,
    /selectedIssueIds:\s*retryPreview\.selectedIssueIds[\s\S]*continuousRepairTarget:\s*''[\s\S]*continuousRepairUnmappedCount:\s*0/,
    'imported continuation must use canonical required IDs and must not start a separate continuous issue loop'
);
assert.doesNotMatch(source, /async function autoClearMixedChineseIssues\(/);

function createRestoreEntries(state) {
    return new Function(
        'importedTranslateProgressState',
        'getSelectedTranslateGlossaryTerms',
        'getImportedTranslationReviewContextKey',
        'reviewImportedTranslationEntries',
        'getTranslationReportIssueSummary',
        'isReusableImportedTranslationEntry',
        'isTranslateFailureText',
        'buildTranslateImportTaskLookup',
        'classifyTranslationReportEntry',
        'findImportedTranslationTaskMatch',
        'copyPersistableTranslationAudit',
        `${restoreEntriesSource}; return buildImportedTranslationRestoreEntries;`
    )(
        state,
        () => [],
        () => '',
        entries => entries,
        () => ({ retryable: 0 }),
        () => false,
        text => text === '[TRANSLATION_FAILED]',
        () => {
            throw new Error('the explicit task lookup should be reused');
        },
        entry => entry.kind,
        (entry, taskByKey) => taskByKey.get(entry.taskKey) || null,
        () => ({})
    );
}

const reportEntries = [
    {
        taskKey: 'hard-unselected',
        status: 'qa_failed',
        kind: 'hard',
        translatedText: '译文中仍有阻断问题',
        qaStatus: '需确认：占位符缺失'
    },
    {
        taskKey: 'soft',
        status: 'qa_failed',
        kind: 'soft',
        translatedText: '可复用的软问题译文',
        qaStatus: '需确认：长度偏长'
    },
    {
        taskKey: 'success',
        status: 'success',
        kind: 'success',
        translatedText: '已通过译文',
        qaStatus: '通过'
    },
    {
        taskKey: 'missing',
        status: 'missing',
        kind: 'missing',
        translatedText: '',
        qaStatus: '疑似未翻译'
    },
    {
        taskKey: 'failed-result',
        status: 'failed',
        kind: 'hard',
        translatedText: '[TRANSLATION_FAILED]',
        qaStatus: '翻译失败'
    }
];
const tasks = reportEntries.map(entry => ({ taskKey: entry.taskKey }));
const taskLookup = {
    taskByKey: new Map(tasks.map(task => [task.taskKey, task])),
    fallbackIndex: new Map()
};
const restoreEntries = createRestoreEntries({
    entries: reportEntries,
    targetLang: ''
});

const defaultRestore = restoreEntries(tasks, '', { taskLookup });
assert.deepEqual(
    defaultRestore.entries.map(entry => entry.taskKey),
    ['soft', 'success'],
    'normal resume should continue to exclude hard QA failures from reusable candidates'
);

const targetedRestore = restoreEntries(tasks, '', {
    taskLookup,
    includeQaFailed: true
});
assert.deepEqual(
    targetedRestore.entries.map(entry => entry.taskKey),
    ['hard-unselected', 'soft', 'success'],
    'targeted retry should preserve translated hard failures that were not selected for this retry run'
);
assert.equal(
    targetedRestore.entries[0].qaStatus,
    '需确认：占位符缺失',
    'the preserved hard failure must retain its QA report details'
);
assert.ok(
    !targetedRestore.entries.some(entry => ['missing', 'failed-result'].includes(entry.taskKey)),
    'blank and actual failure outputs must never become restore candidates'
);

console.log('translation-targeted-retry-integrity: unselected translated hard failures remain in output and report');
