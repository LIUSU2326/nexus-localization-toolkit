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

function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const retryFailedSource = extractFunction(source, 'async function retryFailedTranslations(');
const retryPlanSource = extractFunction(source, 'function buildFailedTranslationRetryPlan(');
const targetedRetrySource = extractFunction(source, 'async function retrySuspiciousImportedTranslations(');
const importMatchSource = extractFunction(source, 'function findImportedTranslationTaskMatch(');
const restoreCompletedSource = extractFunction(source, 'function restoreCompletedTranslationTasks(');
const startTranslateSource = extractFunction(source, 'async function startTranslate(');

const failures = [];
let passed = 0;

function contract(name, check) {
    try {
        check();
        passed += 1;
        console.log(`  PASS  ${name}`);
    } catch (error) {
        failures.push({ name, message: error?.message || String(error) });
        console.error(`  FAIL  ${name}`);
        console.error(`        ${error?.message || error}`);
    }
}

console.log('translation repair scope contracts');

contract('retryFailedTranslations honors options.scopedTasks without rebuilding the full report queue', () => {
    assert.match(
        retryFailedSource,
        /Array\.isArray\(options\.scopedTasks\)/,
        'retryFailedTranslations must explicitly distinguish an intentionally supplied scoped task array'
    );
    assert.doesNotMatch(
        retryFailedSource,
        /\b(?:const|let)\s+retryTasks\s*=\s*rebuildFailedTranslationTasksFromReport\(/,
        'the retry queue must not be initialized unconditionally from every hard report entry'
    );

    const conditionalExpression =
        /Array\.isArray\(options\.scopedTasks\)[\s\S]{0,120}\?[\s\S]{0,160}options\.scopedTasks[\s\S]{0,160}:[\s\S]{0,160}rebuildFailedTranslationTasksFromReport\(/;
    const guardedBranches =
        /if\s*\(\s*Array\.isArray\(options\.scopedTasks\)\s*\)\s*\{[\s\S]{0,240}options\.scopedTasks[\s\S]{0,80}\}\s*else\s*\{[\s\S]{0,240}rebuildFailedTranslationTasksFromReport\(/;
    assert.ok(
        conditionalExpression.test(retryFailedSource) || guardedBranches.test(retryFailedSource),
        'scopedTasks must be the queue in the scoped branch, with full-report rebuild confined to the unscoped branch'
    );
});

contract('the canonical imported repair entry passes its exact task subset as scopedTasks', () => {
    assert.match(
        targetedRetrySource,
        /retryFailedTranslations\s*\(\s*\{[\s\S]*?scopedTasks\s*:\s*retryTasks\b/,
        'report issue-filter retry must pass only the mapped selected retryTasks'
    );
    assert.doesNotMatch(
        source,
        /async function (?:autoClearMixedChineseIssues|repairDetectedDiscountIssues|compactLongImportedTranslations)\(/,
        'mixed Chinese, discount, and long-text handling must not create independent repair loops'
    );
});

contract('the generic retry entry locks the report target language into the DOM before task mapping', () => {
    const reportTargetDeclaration = retryFailedSource.match(
        /\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*translationRunReport\?\.targetLang\b[^;]*;/
    );
    assert.ok(
        reportTargetDeclaration,
        'retryFailedTranslations must derive a locked target language from translationRunReport.targetLang'
    );

    const variableName = reportTargetDeclaration[1];
    const variablePattern = escapeRegExp(variableName);
    const domAssignment = new RegExp(`targetLangSelect\\.value\\s*=\\s*${variablePattern}\\b`);
    const selectedSetAssignment = new RegExp(
        `selectedTranslateTargetLangs\\s*=\\s*new Set\\(\\s*\\[\\s*${variablePattern}\\s*\\]\\s*\\)`
    );
    assert.match(
        retryFailedSource,
        domAssignment,
        'the report language must be written back to targetLangSelect before collecting retry tasks'
    );
    assert.match(
        retryFailedSource,
        selectedSetAssignment,
        'the selected target-language set must also be reduced to the locked report language'
    );

    const assignmentIndex = retryFailedSource.search(domAssignment);
    const rebuildIndex = retryFailedSource.indexOf('rebuildFailedTranslationTasksFromReport(');
    assert.ok(
        assignmentIndex >= 0 && rebuildIndex >= 0 && assignmentIndex < rebuildIndex,
        'language locking must happen before report entries are mapped back to current tasks'
    );
});

contract('retry execution profile is separate from the canonical output slot/report identity', () => {
    assert.match(
        retryPlanSource,
        /\bexecutorProfile\b/,
        'the retry plan must name the API execution channel executorProfile rather than replacing the output profile'
    );
    assert.match(
        retryFailedSource,
        /\boutputTaskKey\b/,
        'retry tasks must carry their original outputTaskKey'
    );
    assert.match(
        retryFailedSource,
        /\boutputSlotId\b/,
        'retry tasks must preserve the canonical output slot'
    );
    assert.match(
        retryFailedSource,
        /\bexecutorProfile\b/,
        'retry tasks must separately carry the channel that executes the API request'
    );
    assert.doesNotMatch(
        retryFailedSource,
        /taskKey\s*:\s*buildTranslationTaskKey\([^;\n]*\bexecutorProfile\b/,
        'the stable report/output taskKey must never be rebuilt from the executor profile'
    );
    assert.match(
        startTranslateSource,
        /task\.outputTaskKey/,
        'the translation commit path must use the preserved output task identity'
    );
    assert.match(
        startTranslateSource,
        /getTranslateOutputSlotId\(task\)/,
        'the translation write path must use the canonical output slot instead of the executor channel'
    );
});

contract('an exact imported taskKey is accepted only after validating it against the current source task', () => {
    assert.doesNotMatch(
        importMatchSource,
        /if\s*\(\s*entry\.taskKey\s*&&\s*taskByKey\.has\(entry\.taskKey\)\s*\)\s*\{?\s*return\s+taskByKey\.get\(entry\.taskKey\)/,
        'a stale taskKey must not bypass current file/sheet/row/column/source-text validation'
    );
    assert.match(
        importMatchSource,
        /(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*taskByKey\.get\(entry\.taskKey\)[\s\S]*?importedEntryMatchesTask\(\s*entry\s*,\s*\1\s*\)[\s\S]*?return\s+\1/,
        'the exact-key candidate must pass importedEntryMatchesTask before it is returned'
    );
});

contract('restoring a saved translation always reruns QA for the current task and rules', () => {
    assert.doesNotMatch(
        restoreCompletedSource,
        /trustSavedQa/,
        'saved QA must never bypass current source, target-language, glossary, or policy checks'
    );
    assert.match(
        restoreCompletedSource,
        /currentQaStatus\s*=\s*summarizeTranslationQa\(\s*restoredTask\.text\s*,\s*translated[\s\S]*?targetLang[\s\S]*?restoredTask\s*\)/,
        'every restored candidate must be checked with summarizeTranslationQa using the current task context'
    );
});

contract('obsolete independent repair controls and entry points stay removed', () => {
    assert.doesNotMatch(
        source,
        /translateDiscountRepairBtn|translateCompactLongImportedBtn|translateRetrySuspiciousBtn/,
        'removed repair controls must not regain hidden DOM hooks'
    );
});

if (failures.length) {
    console.error(`\ntranslation repair scope contracts: ${passed} passed, ${failures.length} failed`);
    failures.forEach(({ name, message }, index) => {
        console.error(`${index + 1}. ${name}`);
        console.error(`   ${message}`);
    });
    process.exitCode = 1;
} else {
    console.log(`\ntranslation repair scope contracts: all ${passed} passed`);
}
