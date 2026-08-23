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

const startTranslateSource = extractFunction('async function startTranslate(');
assert.match(
    startTranslateSource,
    /Boolean\(savedProgress\.sourceSignature\)[\s\S]*savedProgress\.sourceSignature === currentSourceSignature/,
    'translation auto-resume must require a verifiable exact source signature'
);
assert.doesNotMatch(
    startTranslateSource,
    /!savedProgress\.sourceSignature \|\| savedProgress\.sourceSignature ===/,
    'legacy unsigned translation progress must never auto-resume by filename alone'
);
assert.match(
    startTranslateSource,
    /savedProgressVersion\s*>=\s*5[\s\S]*currentContextSignature[\s\S]*legacyContextSignature/,
    'translation auto-resume must match the semantic context while retaining a bounded legacy-signature adapter'
);
assert.match(source, /contentSignature: parsed\.contentSignature \|\| ''/);
const spreadsheetReaderSource = extractFunction('async function readSpreadsheetSheets(');
assert.match(spreadsheetReaderSource, /contentSignature = await makeFileContentSignature/);
const translationMetaSource = extractFunction('function buildTranslationProgressRecord(');
assert.match(translationMetaSource, /contextSignature:/);
const translationSourceSignature = extractFunction('function getTranslateSourceSignature(');
assert.match(translationSourceSignature, /source\.contentSignature/);
const translationContextSource = extractFunction('function getTranslateProgressContextSignature(');
assert.match(translationContextSource, /getTermTranslationForLanguage\(term, nextTargetLang\)/);
assert.match(translationContextSource, /note: term\.note/);

{
    let glossaryTerms = [{ source: '攻击', japanese: '攻撃', note: 'short UI term' }];
    let executorProfiles = [{ id: 'profile', provider: 'agnes', baseUrl: 'base', model: 'model' }];
    const getSignature = new Function(
        'currentProject',
        'getSelectedTranslateProfiles',
        'getSelectedTranslateGlossaryTerms',
        'targetLangSelect',
        'selectedTranslateSourceIds',
        'selectedColumns',
        'sourceLangSelect',
        'getTranslateStrategy',
        'referenceColumn',
        'getTranslateSourceSignature',
        'getTermTranslationForLanguage',
        'makeStableId',
        `${translationContextSource}; return getTranslateProgressContextSignature;`
    )(
        { id: 'project', rules: 'rules' },
        () => executorProfiles,
        () => glossaryTerms,
        { value: 'ja' },
        new Set(['source']),
        [2],
        { value: 'zh' },
        () => 'source-reference',
        3,
        () => 'source-signature',
        (term, targetLang) => ({
            value: targetLang === 'ja' && term.japanese ? term.japanese : term.finalTranslation || '',
            constraint: 'hard',
            source: targetLang === 'ja' && term.japanese ? 'japanese' : 'finalTranslation'
        }),
        value => String(value)
    );
    const base = getSignature();
    executorProfiles = [{ id: 'replacement', provider: 'agnes', baseUrl: 'other', model: 'new-model' }];
    assert.equal(getSignature(), base, 'changing only the executor channel must not discard accepted translations');
    assert.notEqual(
        getSignature({ includeExecutorProfiles: true }),
        base,
        'the legacy compatibility signature may still include executor profiles for version-4 checkpoints'
    );
    glossaryTerms = [{ source: '攻击', japanese: 'アタック', note: 'short UI term' }];
    assert.notEqual(getSignature(), base, 'changing a target-language-specific term must invalidate translation resume');
    glossaryTerms = [{ source: '攻击', japanese: '攻撃', note: 'different prompt note' }];
    assert.notEqual(getSignature(), base, 'changing a prompt note must invalidate translation resume');
    glossaryTerms = [{ source: '攻击', finalTranslation: 'Attack A' }];
    const finalA = getSignature();
    glossaryTerms = [{ source: '攻击', finalTranslation: 'Attack B' }];
    assert.notEqual(getSignature(), finalA, 'changing the effective final translation must invalidate resume');
}

const contentSignatureSource = extractFunction('async function makeFileContentSignature(');
const makeFileContentSignature = new Function(
    'TextEncoder',
    `${contentSignatureSource}; return makeFileContentSignature;`
)(TextEncoder);
const signatureA = await makeFileContentSignature('row 1\nrow 2');
const signatureARepeat = await makeFileContentSignature('row 1\nrow 2');
const signatureB = await makeFileContentSignature('row 1\nrow X');
assert.equal(signatureA, signatureARepeat);
assert.notEqual(signatureA, signatureB, 'same-size changed content must produce a different signature');

const startCheckSource = extractFunction('async function startCheck(');
assert.match(
    startCheckSource,
    /savedProgress\?\.sourceSignature[\s\S]*savedProgress\?\.contextSignature[\s\S]*savedProgressMatchesContext/,
    'localization-check resume must verify both file content and the full detection context'
);
assert.match(startCheckSource, /旧检测进度未自动套用/);

const metaSource = extractFunction('function buildL10nProgressMetaRecord(');
for (const requiredField of ['sourceSignature', 'contextSignature', 'sourceColumn', 'targetColumn', 'checkMode']) {
    assert.match(metaSource, new RegExp(`${requiredField}:`), `L10n progress meta must persist ${requiredField}`);
}
assert.match(source, /contentSignature = await makeFileContentSignature/);
const handleL10nFilesSource = extractFunction('async function handleL10nFiles(');
assert.doesNotMatch(
    handleL10nFilesSource,
    /clearL10nProgress\(/,
    'selecting a file must preserve saved progress until startCheck verifies its signatures'
);
const l10nContextSource = extractFunction('function getL10nProgressContextSignature(');
assert.match(l10nContextSource, /type: term\.type/);
assert.match(l10nContextSource, /getGlossaryEffectiveTarget\(term\)/);
assert.match(startCheckSource, /await clearL10nProgress\(\)/);

{
    let glossaryTerms = [{ source: '攻击', finalTranslation: 'Attack A', type: 'skill' }];
    const getSignature = new Function(
        'currentProject',
        'getSelectedL10nProject',
        'getSelectedL10nProfiles',
        'getSelectedGlossaryTerms',
        'getL10nSourceSignature',
        'selectedSourceIds',
        'sourceColumn',
        'targetColumn',
        'getSelectedCheckMode',
        'getGlossaryEffectiveTarget',
        'makeStableId',
        `${l10nContextSource}; return getL10nProgressContextSignature;`
    )(
        null,
        () => ({ id: 'project', rules: 'rules' }),
        () => [{ id: 'profile', provider: 'agnes', baseUrl: 'base', model: 'model' }],
        () => glossaryTerms,
        () => 'source-signature',
        new Set(['source']),
        1,
        2,
        () => 'balanced',
        term => term.finalTranslation || term.target || '',
        value => String(value)
    );
    const base = getSignature();
    glossaryTerms = [{ source: '攻击', finalTranslation: 'Attack B', type: 'skill' }];
    assert.notEqual(getSignature(), base, 'changing finalTranslation must invalidate L10n resume');
    glossaryTerms = [{ source: '攻击', finalTranslation: 'Attack A', type: 'resource' }];
    assert.notEqual(getSignature(), base, 'changing glossary type must invalidate L10n resume');
}

console.log('progress-resume-identity: auto-resume requires exact file and workflow identity');
