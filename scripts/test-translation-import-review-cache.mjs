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

const reviewEntriesSource = extractFunction(source, 'function reviewImportedTranslationEntries(');
const relevantTermsSource = extractFunction(source, 'function getRelevantTranslateGlossaryTerms(');
const reviewContextSource = extractFunction(source, 'function getImportedTranslationReviewContextKey(');
const restoreEntriesSource = extractFunction(source, 'function buildImportedTranslationRestoreEntries(');
const completenessSource = extractFunction(source, 'function reviewImportedTranslationCompleteness(');
const collectTasksSource = extractFunction(source, 'function collectTranslationTasks(');

{
    let glossaryLoads = 0;
    const qualityRuntime = {
        NexusLanguageQualityProfiles: { getProfileAuditKey: targetLang => `${targetLang}:1.0.0:format-v2:none` },
        NexusLanguageCarryoverGuard: { POLICY_VERSION: '2.0.0' },
        NexusTranslationIssuePolicy: { POLICY_VERSION: '1.1.0' },
        NexusTranslationFormatTokenPolicy: { POLICY_VERSION: '2.0.0' },
        NexusTranslationNumberPolicy: { POLICY_VERSION: '2.1.0' }
    };
    const getReviewContextKey = new Function(
        'getSelectedTranslateGlossaryTerms',
        'getTermTranslationForLanguage',
        'currentProject',
        'globalThis',
        `${reviewContextSource}; return getImportedTranslationReviewContextKey;`
    )(
        () => {
            glossaryLoads += 1;
            return [];
        },
        (term, targetLang) => {
            const languageValue = targetLang === 'ko' ? term.korean : '';
            return languageValue
                ? { value: languageValue, constraint: 'hard' }
                : { value: term.target || '', constraint: targetLang === 'en' ? 'hard' : 'reference' };
        },
        { id: 'project-1', rules: 'keep placeholders' },
        qualityRuntime
    );

    const baseTerm = { source: '金币', target: 'Gold' };
    const firstKey = getReviewContextKey('ko', [{ ...baseTerm, korean: '골드' }]);
    const secondKey = getReviewContextKey('ko', [{ ...baseTerm, korean: '금화' }]);
    assert.notEqual(
        firstKey,
        secondKey,
        'changing a target-language-specific glossary translation must invalidate reviewed imports'
    );
    assert.equal(glossaryLoads, 0, 'an explicit glossary snapshot must not reload storage for its context key');

    const policyKeyBefore = getReviewContextKey('ko', [{ ...baseTerm, korean: '金币' }]);
    qualityRuntime.NexusTranslationNumberPolicy.POLICY_VERSION = '2.1.1';
    const policyKeyAfter = getReviewContextKey('ko', [{ ...baseTerm, korean: '金币' }]);
    assert.notEqual(
        policyKeyBefore,
        policyKeyAfter,
        'changing the canonical number policy version must invalidate reviewed imports'
    );
}

{
    let glossaryLoads = 0;
    const selectedTerms = [{ source: '金币', target: 'Gold' }];
    const seenGlossaryReferences = [];
    const reviewEntries = new Function(
        'getSelectedTranslateGlossaryTerms',
        'buildReviewedImportedTranslationEntry',
        `${reviewEntriesSource}; return reviewImportedTranslationEntries;`
    )(
        () => {
            glossaryLoads += 1;
            return selectedTerms;
        },
        (entry, targetLang, glossaryTerms) => {
            seenGlossaryReferences.push(glossaryTerms);
            return { ...entry, targetLang };
        }
    );

    const entries = Array.from({ length: 15_000 }, (_, index) => ({ id: index }));
    const reviewed = reviewEntries(entries, 'ko');
    assert.equal(reviewed.length, entries.length);
    assert.equal(glossaryLoads, 1, 'a bulk review should load selected glossary terms once');
    assert.equal(seenGlossaryReferences.length, entries.length);
    assert.ok(
        seenGlossaryReferences.every(glossaryTerms => glossaryTerms === selectedTerms),
        'every reviewed entry should reuse the same glossary snapshot'
    );

    const explicitEmpty = reviewEntries(entries.slice(0, 3), 'ko', []);
    assert.equal(explicitEmpty.length, 3);
    assert.equal(glossaryLoads, 1, 'an explicit empty glossary snapshot must not reload storage');
}

{
    let normalizationCalls = 0;
    const getRelevantTerms = new Function(
        'normalizeGlossaryTerms',
        'normalizeTranslateConsistencyTerm',
        'getTermTranslationForLanguage',
        `${relevantTermsSource}; return getRelevantTranslateGlossaryTerms;`
    )(
        terms => {
            normalizationCalls += 1;
            return terms.map(term => ({ ...term }));
        },
        value => String(value || '').trim().toLowerCase(),
        (term, targetLang) => ({
            value: targetLang === 'zh-TW' ? (term.traditionalChinese || '') : (term.target || ''),
            constraint: 'hard'
        })
    );

    const normalizedTerms = [
        { source: '金币', target: 'Gold', type: 'currency' },
        { source: '钻石', target: 'Gem', type: 'currency' }
    ];
    const defaultResult = getRelevantTerms('获得金币', normalizedTerms, 'en', 24);
    assert.equal(normalizationCalls, 1);
    const snapshotResult = getRelevantTerms('获得金币', normalizedTerms, 'en', 24, { normalized: true });
    assert.equal(normalizationCalls, 1, 'normalized snapshots should skip redundant normalization');
    assert.deepEqual(snapshotResult, defaultResult, 'snapshot optimization must preserve glossary matching output');

    const traditionalTerms = [{ source: '金币', target: 'Gold', traditionalChinese: '金幣' }];
    const traditionalDefault = getRelevantTerms('金币', traditionalTerms, 'zh-TW', 24);
    const traditionalSnapshot = getRelevantTerms('金币', traditionalTerms, 'zh-TW', 24, { normalized: true });
    assert.deepEqual(traditionalSnapshot, traditionalDefault, 'the zh-TW exact-source rule must remain unchanged');
    assert.equal(traditionalSnapshot[0]?.target, '金幣');
    assert.deepEqual(
        getRelevantTerms('获得金币', traditionalTerms, 'zh-TW', 24, { normalized: true }),
        [],
        'zh-TW glossary matching must still require the complete source cell to equal the term'
    );
}

assert.match(
    source,
    /reviewAndDedupeImportedTranslationEntries\(parsedEntries\.entries, reviewTargetLang, reviewGlossaryTerms\)/,
    'report import should bulk-review with one glossary snapshot'
);
assert.match(
    source,
    /getImportedTranslationReviewContextKey\(reviewTargetLang, reviewGlossaryTerms\)/,
    'report import context key should use the same glossary snapshot'
);
assert.match(
    restoreEntriesSource,
    /reviewAndDedupeImportedTranslationEntries\(state\.entries \|\| \[\], targetLang, reviewGlossaryTerms\)/,
    'restore should reuse one glossary snapshot when its review context changes'
);
assert.match(
    completenessSource,
    /reviewAndDedupeImportedTranslationEntries\(state\.entries, targetLang, reviewGlossaryTerms\)/,
    'manual completeness review should reuse one glossary snapshot'
);
assert.match(
    completenessSource,
    /collectTranslationTasks\(getSelectedTranslateProfiles\(\), \{ deferGlossary: true \}\)/,
    'missing-task detection should not recompute per-task glossary matches'
);
assert.match(
    collectTasksSource,
    /const glossaryTerms = deferGlossary \? \[\] : getSelectedTranslateGlossaryTerms\(\)/,
    'deferred task collection should also skip loading an unused glossary snapshot'
);

console.log('translation-import-review-cache: one glossary snapshot is reused per bulk review');
