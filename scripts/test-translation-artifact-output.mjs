import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(scriptDir, '..');
const source = fs.readFileSync(path.join(projectDir, 'script.js'), 'utf8');

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

const getUniqueTranslationWorksheetNameSource = extractFunction('function getUniqueTranslationWorksheetName(');
const getUniqueTranslationWorksheetName = new Function(
    `'use strict'; ${getUniqueTranslationWorksheetNameSource}; return getUniqueTranslationWorksheetName;`
)();
const buildTranslationWorkbookSource = extractFunction('function buildTranslationWorkbook(');
const buildTranslationWorkbook = new Function(
    'XLSX',
    'getSelectedTranslateSources',
    'getTranslateSourceOutput',
    'translationRunReport',
    'buildTranslationReportRows',
    'getUniqueTranslationWorksheetName',
    `'use strict'; ${buildTranslationWorkbookSource}; return buildTranslationWorkbook;`
)(
    createXlsxStub(),
    () => [
        { sheetName: 'Management', fileName: 'game.xlsx' },
        { sheetName: 'management', fileName: 'game-2.xlsx' },
        { sheetName: 'CSV', fileName: 'dialogue.csv' }
    ],
    sourceItem => [[sourceItem.fileName, '译文']],
    { entries: [{ taskKey: 'task-1' }] },
    () => [['翻译报告元数据']],
    getUniqueTranslationWorksheetName
);

const translatedWorkbook = buildTranslationWorkbook();
assert.deepEqual(translatedWorkbook.SheetNames, ['Management', 'management_2', 'dialogue']);
assert.equal(translatedWorkbook.SheetNames.includes('翻译报告'), false);
const progressWorkbook = buildTranslationWorkbook({ includeReport: true });
assert.deepEqual(progressWorkbook.SheetNames, ['Management', 'management_2', 'dialogue', '翻译报告']);
assert.match(buildTranslationWorkbookSource, /options\.includeReport/);

const downloadCurrentProgressSource = extractFunction('async function downloadCurrentProgress(');
assert.match(downloadCurrentProgressSource, /buildTranslationWorkbook\(\{ includeReport: true \}\)/);

const buildTranslationReportWorkbookSource = extractFunction('function buildTranslationReportWorkbook(');
const buildTranslationReportWorkbook = new Function(
    'XLSX',
    'buildTranslationReportRows',
    `'use strict'; ${buildTranslationReportWorkbookSource}; return buildTranslationReportWorkbook;`
)(createXlsxStub(), () => [['翻译报告元数据']]);

const reportWorkbook = buildTranslationReportWorkbook();
assert.deepEqual(reportWorkbook.SheetNames, ['翻译报告', '处理说明']);

const buildUnverifiedTranslationWorkbookSource = extractFunction('function buildUnverifiedTranslationWorkbook(');
const buildUnverifiedTranslationWorkbook = new Function(
    'XLSX',
    'buildTranslationWorkbook',
    'getTranslationDeliveryGate',
    'getTranslationReportIssueSummary',
    'translationRunReport',
    'targetLangSelect',
    'getTranslateLanguageName',
    'getUniqueTranslationWorksheetName',
    `'use strict'; ${buildUnverifiedTranslationWorkbookSource}; return buildUnverifiedTranslationWorkbook;`
)(
    createXlsxStub(),
    () => {
        const workbook = createXlsxStub().utils.book_new();
        createXlsxStub().utils.book_append_sheet(workbook, { rows: [['game.xlsx', '当前译文']] }, 'Management');
        return workbook;
    },
    () => ({ ready: false, blockingCount: 2 }),
    () => ({ failedOrMissing: 1, hardQa: 1, softRisk: 3 }),
    { targetLang: 'ko' },
    { value: 'ko' },
    () => '韩语',
    getUniqueTranslationWorksheetName
);

const unverifiedWorkbook = buildUnverifiedTranslationWorkbook({ ready: false, blockingCount: 2 });
assert.deepEqual(unverifiedWorkbook.SheetNames, ['未验证说明', 'Management']);
assert.equal(unverifiedWorkbook.SheetNames.includes('翻译报告'), false);
assert.match(unverifiedWorkbook.Sheets['未验证说明'].rows.flat().join(' '), /独立 translation_report\.xlsx/);

const saveTranslationArtifactSource = extractFunction('async function saveTranslationArtifact(');
assert.match(saveTranslationArtifactSource, /getTranslationOutputFileName\('translated'\)/);
assert.match(saveTranslationArtifactSource, /getTranslationOutputFileName\('translated_unverified'\)/);
assert.match(saveTranslationArtifactSource, /buildTranslationReportWorkbook\(\)/);
assert.match(saveTranslationArtifactSource, /getTranslationOutputFileName\('translation_report'\)/);

const getTranslationOutputFileNameSource = extractFunction('function getTranslationOutputFileName(');
function createOutputFileNameBuilder(languageSuffix) {
    return new Function(
        'sanitizeTranslationFileStem',
        'originalFileName',
        'activeTranslationOutputSuffix',
        'translationRunReport',
        'targetLangSelect',
        `'use strict'; ${getTranslationOutputFileNameSource}; return getTranslationOutputFileName;`
    )(
        value => String(value || '').replace(/\.(csv|xlsx|xls)$/i, '').replace(/\s+/g, '_'),
        '佣兵小镇-全文本.xlsx',
        languageSuffix,
        null,
        { value: languageSuffix }
    );
}

assert.equal(createOutputFileNameBuilder('pl')('translated'), '佣兵小镇-全文本_pl_translated.xlsx');
assert.equal(createOutputFileNameBuilder('pl')('translation_report'), '佣兵小镇-全文本_pl_translation_report.xlsx');
assert.equal(createOutputFileNameBuilder('ko')('translated'), '佣兵小镇-全文本_ko_translated.xlsx');
assert.equal(createOutputFileNameBuilder('ko')('translation_report'), '佣兵小镇-全文本_ko_translation_report.xlsx');

const restoredReportCompletionSource = extractFunction('async function handleTranslatePrimaryAction(');
assert.match(restoredReportCompletionSource, /autoSaveTranslationOutputs\(\)/);

const startTranslateSource = extractFunction('async function startTranslate(');
assert.equal(
    (startTranslateSource.match(/autoSaveTranslationOutputs\(\)/g) || []).length,
    4,
    'zero-task, normal, cancelled, and interrupted terminal paths should each save the artifact pair'
);
assert.doesNotMatch(source, /suppressAutoSave:\s*true/);

const multiTargetSource = extractFunction('async function startMultiTargetTranslate(');
assert.match(multiTargetSource, /activeTranslationOutputSuffix = getMultiTargetOutputSuffix\(targetLang\)/);
assert.match(multiTargetSource, /startTranslate\(\{[\s\S]*outputSuffix: getMultiTargetOutputSuffix\(targetLang\)/);

const autoSaveTranslationOutputsSource = extractFunction('async function autoSaveTranslationOutputs(');
async function runAutoSaveCase(kinds, failingKind = '') {
    const calls = [];
    const errors = [];
    const autoSaveTranslationOutputs = new Function(
        'globalThis',
        'ensureTranslationReportCoversExpectedTasks',
        'getTranslationDeliveryGate',
        'saveTranslationArtifact',
        'recordClientError',
        'waitForBrowserFrame',
        `'use strict'; ${autoSaveTranslationOutputsSource}; return autoSaveTranslationOutputs;`
    )(
        { NexusTranslationDeliveryPolicy: { getAutoSaveKinds: () => kinds } },
        () => {},
        () => ({ ready: kinds.includes('translated'), blockingCount: kinds.includes('translated') ? 0 : 2 }),
        async kind => {
            calls.push(kind);
            if (kind === failingKind) throw new Error(`${kind} failed`);
            return `C:\\Downloads\\${kind}.xlsx`;
        },
        (scope, error, context) => errors.push({ scope, error, context }),
        async () => {}
    );
    const result = await autoSaveTranslationOutputs();
    return { calls, errors, result };
}

const verifiedAutoSave = await runAutoSaveCase(['translated', 'report']);
assert.deepEqual(verifiedAutoSave.calls, ['translated', 'report']);
assert.deepEqual(verifiedAutoSave.result.savedArtifacts.map(item => item.kind), ['translated', 'report']);

const unverifiedAutoSave = await runAutoSaveCase(['translated_unverified', 'report'], 'translated_unverified');
assert.deepEqual(unverifiedAutoSave.calls, ['translated_unverified', 'report']);
assert.deepEqual(unverifiedAutoSave.result.savedArtifacts.map(item => item.kind), ['report']);
assert.deepEqual(unverifiedAutoSave.result.failures.map(item => item.kind), ['translated_unverified']);
assert.equal(unverifiedAutoSave.errors.length, 1);

await import('../translation-delivery-policy.js');
const deliveryPolicy = globalThis.NexusTranslationDeliveryPolicy;
assert.deepEqual(deliveryPolicy.getAutoSaveKinds({ ready: true }), ['translated', 'report']);
assert.deepEqual(deliveryPolicy.getAutoSaveKinds({ ready: false }), ['translated_unverified', 'report']);

console.log('translation-artifact-output: clean translated workbooks and paired terminal report passed');
