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

for (const signature of [
    'async function retryFailedTranslations(',
    'async function startMultiTargetTranslate(',
    'async function generateFullFixTranslations(',
    'async function polishMatchedRowsWithAI(',
    'async function retryFailedGlossaryBatches('
]) {
    assert.doesNotMatch(
        extractFunction(signature),
        /confirm\(/,
        `${signature} should start directly after its explicit action button`
    );
}

const importedRetry = extractFunction('async function retrySuspiciousImportedTranslations(');
assert.equal(
    (importedRetry.match(/confirm\(/g) || []).length,
    0,
    'imported retry should switch to the report language and start without a second confirmation'
);
assert.match(importedRetry, /state\.targetLang !== targetLangSelect\.value/);
assert.doesNotMatch(importedRetry, /是否开始|自动连续修复约/);

const startTranslate = extractFunction('async function startTranslate(');
assert.doesNotMatch(
    startTranslate,
    /检测到未完成的 \$\{getTranslateLanguageName\(currentTargetLang\)\} 翻译任务[\s\S]*confirm/,
    'matching saved translation progress should resume automatically'
);
assert.match(startTranslate, /正在续接[\s\S]*不会重复翻译/);

const startCheck = extractFunction('async function startCheck(');
assert.doesNotMatch(startCheck, /检测到未完成的任务[\s\S]*confirm/);
assert.match(startCheck, /正在续接未完成检测/);

assert.doesNotMatch(source, /async function executeLiveIssueRepairPlan\(/);
assert.doesNotMatch(source, /function confirmKeepUnselectedLiveIssues\(/);
assert.doesNotMatch(source, /async function autoClearMixedChineseIssues\(/);
assert.doesNotMatch(source, /async function compactLongImportedTranslations\(/);
assert.doesNotMatch(source, /translateCompactLongImportedBtn|translateRetrySuspiciousBtn/);

console.log('task-start-confirmations: routine starts are direct while destructive/risk decisions remain guarded');
