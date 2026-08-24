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
    assert.ok(bodyStart >= 0, `${signature} body should exist`);
    let depth = 0;
    for (let index = bodyStart; index < source.length; index++) {
        if (source[index] === '{') depth += 1;
        if (source[index] === '}') depth -= 1;
        if (depth === 0) return source.slice(start, index + 1);
    }
    throw new Error(`Could not extract ${signature}`);
}

const getSelectedSourcesSource = extractFunction('function getSelectedTranslateSources(');
const detectNoticeSource = extractFunction('function isGeneratedTranslationNoticeSheet(');
const rebuildSheetDataSource = extractFunction('function rebuildTranslateSheetData(');
const findSourceForRowSource = extractFunction('function findTranslateSourceForRow(');
const getOriginalRowNumberSource = extractFunction('function getTranslateOriginalRowNumber(');
const buildTaskKeySource = extractFunction('function buildTranslationTaskKey(');
const buildLegacyTaskKeySource = extractFunction('function buildLegacyGlobalTranslationTaskKey(');
const collectTasksSource = extractFunction('function collectTranslationTasks(');

const isGeneratedTranslationNoticeSheet = new Function(
    `'use strict'; ${detectNoticeSource}; return isGeneratedTranslationNoticeSheet;`
)();

assert.equal(
    isGeneratedTranslationNoticeSheet({
        sheetName: '未验证说明',
        rows: [
            ['未验证译文，请勿直接交付'],
            [],
            ['文件状态', '仍有阻断问题'],
            ['数据说明', '后续工作表是当前译文快照']
        ]
    }),
    true,
    'a standalone generated unverified notice must be recognized without an embedded report sheet'
);
assert.equal(
    isGeneratedTranslationNoticeSheet({
        sheetName: '未验证说明_2',
        rows: [['未验证译文，请勿直接交付']]
    }),
    true,
    'a generated notice with a collision suffix must also be excluded'
);
assert.equal(
    isGeneratedTranslationNoticeSheet({
        sheetName: '未验证说明',
        rows: [['id', '说明'], [1, '这是用户自己的数据工作表']]
    }),
    false,
    'a user worksheet with the same name must not be discarded without the exact generated marker'
);

function createHarness(initialSources, initialSelectedIds) {
    return new Function(
        'initialSources',
        'initialSelectedIds',
        `
            let translateSources = initialSources;
            let selectedTranslateSourceIds = new Set(initialSelectedIds);
            let sheetData = null;
            const selectedColumns = [2];
            const referenceColumn = 3;
            const document = {
                getElementById(id) {
                    return id === 'targetLang' ? { value: 'tr' } : null;
                }
            };
            const getSelectedTranslateGlossaryTerms = () => [];
            const getRelevantTranslateGlossaryTerms = () => [];
            const getTranslateReferenceText = row => row?.[referenceColumn] || '';
            const isSpecialCode = () => false;
            const getTranslateColumnName = columnIndex => '列' + (columnIndex + 1);

            ${getSelectedSourcesSource}
            ${rebuildSheetDataSource}
            ${findSourceForRowSource}
            ${getOriginalRowNumberSource}
            ${buildTaskKeySource}
            ${buildLegacyTaskKeySource}
            ${collectTasksSource}

            return {
                rebuild: rebuildTranslateSheetData,
                setSelected(ids) {
                    selectedTranslateSourceIds = new Set(ids);
                },
                getSheetData() {
                    return sheetData;
                },
                findSourceForRow: findTranslateSourceForRow,
                collectTasks: profiles => collectTranslationTasks(profiles, { deferGlossary: true })
            };
        `
    )(initialSources, initialSelectedIds);
}

const generatedNoticeSource = {
    id: 'generated-notice',
    fileName: 'game_tr_translated_unverified.xlsx',
    sheetName: '未验证说明',
    rows: [
        ['未验证译文，请勿直接交付'],
        ...Array.from({ length: 12 }, (_, index) => [`说明 ${index + 1}`])
    ],
    rowMap: new Map()
};
const fullTextSource = {
    id: 'full-text',
    fileName: 'game_tr_translated_unverified.xlsx',
    sheetName: '全文本',
    rows: [
        ['id', '备注', '管理', '英语'],
        [-506, '', '创建账号', 'Account creation'],
        [-505, '', '角色不存在', 'Character does not exist']
    ],
    rowMap: new Map()
};
const harness = createHarness(
    [generatedNoticeSource, fullTextSource],
    [generatedNoticeSource.id, fullTextSource.id]
);
const profiles = [{ id: 'agnes', name: 'Agnes', model: 'agnes-2.5-flash' }];

harness.rebuild();
const taskWithLeadingSheet = harness.collectTasks(profiles).find(task =>
    task.source.id === fullTextSource.id && task.originalRowIndex === 1
);
assert.ok(taskWithLeadingSheet, 'the full-text task should be collected while a leading sheet is selected');

harness.setSelected([fullTextSource.id]);
harness.rebuild();
assert.equal(
    generatedNoticeSource.rowMap.size,
    0,
    'deselecting the leading notice sheet must clear its stale merged row map'
);
assert.equal(
    harness.findSourceForRow(1)?.id,
    fullTextSource.id,
    'the first full-text row must not be claimed by a deselected source'
);
assert.deepEqual(
    harness.getSheetData()[1],
    fullTextSource.rows[1],
    'the rebuilt merged data should start with the selected full-text sheet'
);

const taskWithoutLeadingSheet = harness.collectTasks(profiles).find(task =>
    task.source.id === fullTextSource.id && task.originalRowIndex === 1
);
assert.ok(taskWithoutLeadingSheet, 'the same full-text task should remain after changing sheet selection');
assert.equal(
    taskWithoutLeadingSheet.taskKey,
    taskWithLeadingSheet.taskKey,
    'a logical cell taskKey must use its source-sheet row and remain stable when preceding sheets are toggled'
);

console.log('translation-sheet-row-identity: generated notice filtering, stale row maps, and stable task keys passed');
