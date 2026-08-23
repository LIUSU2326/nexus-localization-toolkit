import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(scriptDir, '..');
const fixturePath = path.join(projectDir, 'fixtures', 'quality', 'manifest.json');
const baselinePath = path.join(projectDir, 'fixtures', 'quality', 'baseline.json');
const manifest = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));

for (const moduleName of [
    'language-quality-profiles.js',
    'translation-format-token-policy.js',
    'translation-number-policy.js',
    'translation-repair-attempt-policy.js',
    'protected-ui-token-policy.js',
    'language-carryover-guard.js',
    'translation-strict-repair-policy.js',
    'translation-issue-policy.js'
]) {
    await import(pathToFileURL(path.join(projectDir, moduleName)).href);
}

const formatPolicy = globalThis.NexusTranslationFormatTokenPolicy;
const numberPolicy = globalThis.NexusTranslationNumberPolicy;
const attemptPolicy = globalThis.NexusTranslationRepairAttemptPolicy;
const carryoverGuard = globalThis.NexusLanguageCarryoverGuard;
const issuePolicy = globalThis.NexusTranslationIssuePolicy;
assert.ok(formatPolicy && numberPolicy && attemptPolicy && carryoverGuard && issuePolicy);

const failures = [];
const outcomes = [];

function containsAll(values, fragments = []) {
    const text = (values || []).join('；');
    return (fragments || []).every(fragment => text.includes(fragment));
}

function record(caseId, passed, actual, expected) {
    outcomes.push({ caseId, passed, actual, expected });
    if (!passed) failures.push({ caseId, actual, expected });
}

for (const fixture of manifest.cases) {
    const expected = fixture.expected || {};
    if (fixture.kind === 'format') {
        const actual = formatPolicy.evaluate(fixture.source, fixture.target);
        const passed = (!expected.hardIssues || JSON.stringify(actual.hardIssues) === JSON.stringify(expected.hardIssues)) &&
            (!expected.hardContains || containsAll(actual.hardIssues, expected.hardContains));
        record(fixture.id, passed, { hardIssues: actual.hardIssues, reviewIssues: actual.reviewIssues }, expected);
        continue;
    }
    if (fixture.kind === 'number') {
        const actual = numberPolicy.evaluate(fixture.source, fixture.target, fixture.targetLang);
        const passed = (!expected.hardIssues || JSON.stringify(actual.hardIssues) === JSON.stringify(expected.hardIssues)) &&
            (!expected.hardContains || containsAll(actual.hardIssues, expected.hardContains)) &&
            (!expected.reviewContains || containsAll(actual.reviewIssues, expected.reviewContains));
        record(fixture.id, passed, { hardIssues: actual.hardIssues, reviewIssues: actual.reviewIssues }, expected);
        continue;
    }
    if (fixture.kind === 'carryover') {
        const carryover = carryoverGuard.evaluateCarryover(
            fixture.source,
            fixture.target,
            fixture.targetLang,
            { referenceText: fixture.reference || '' }
        );
        const scriptLeakage = carryoverGuard.evaluateScriptLeakage(
            fixture.source,
            fixture.target,
            fixture.targetLang,
            { referenceText: fixture.reference || '' }
        );
        const issues = [...(carryover.issues || []), ...(scriptLeakage.issues || [])];
        const hard = issues.some(issue => issue.kind === 'block');
        const codes = issues.map(issue => issue.code);
        const passed = hard === Boolean(expected.hard) && (!expected.codes || expected.codes.every(code => codes.includes(code)));
        record(fixture.id, passed, { hard, codes, issues: issues.map(issue => issue.message) }, expected);
        continue;
    }
    if (fixture.kind === 'issue') {
        const findings = issuePolicy.classifyEntry(fixture.entry || {});
        const requiredIds = [...new Set(findings.filter(item => item.tier === 'required').map(item => item.id))];
        const reviewIds = [...new Set(findings.filter(item => item.tier === 'review').map(item => item.id))];
        const passed = JSON.stringify(requiredIds) === JSON.stringify(expected.requiredIds || []) &&
            (expected.reviewIds || []).every(id => reviewIds.includes(id));
        record(fixture.id, passed, { requiredIds, reviewIds }, expected);
        continue;
    }
    if (fixture.kind === 'attempt') {
        const ledger = attemptPolicy.createLedger();
        const cellId = fixture.id;
        ledger.claimPrimary(cellId, 'fixture');
        if (fixture.id.includes('reject')) {
            ledger.recordCandidate(cellId);
            ledger.settle(cellId, 'rejected', 'fixture_gate_reject');
            ledger.claimNoContentSubstitute(cellId);
        } else {
            ledger.claimNoContentSubstitute(cellId);
            ledger.settle(cellId, 'no_content', 'fixture_empty');
        }
        const recordState = ledger.get(cellId);
        const actual = {
            primaryClaims: recordState.primaryClaims,
            contentCandidates: recordState.contentCandidates,
            substitutes: recordState.substitutes,
            terminal: recordState.terminal
        };
        record(fixture.id, JSON.stringify(actual) === JSON.stringify(expected), actual, expected);
        continue;
    }
    record(fixture.id, false, { error: `Unknown fixture kind: ${fixture.kind}` }, expected);
}

const metrics = {
    fixtureVersion: manifest.fixtureVersion,
    totalCases: outcomes.length,
    passedCases: outcomes.filter(outcome => outcome.passed).length,
    failedCases: failures.length,
    hardFalsePositives: failures.filter(failure => /not-hard|review|pass/i.test(failure.caseId)).length,
    failures
};

console.log(JSON.stringify(metrics, null, 2));
assert.ok(metrics.failedCases <= Number(baseline.maxFailures || 0), `quality replay failures: ${metrics.failedCases}`);
