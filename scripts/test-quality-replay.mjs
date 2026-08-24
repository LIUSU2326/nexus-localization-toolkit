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
const replayStartedAt = performance.now();
assert.equal(
    baseline.fixtureVersion,
    manifest.fixtureVersion,
    'quality baseline and fixture manifest must use the same version'
);

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

function record(caseId, passed, actual, expected, meta = {}) {
    outcomes.push({ caseId, passed, actual, expected, ...meta });
    if (!passed) failures.push({ caseId, actual, expected });
}

for (const fixture of manifest.cases) {
    const expected = fixture.expected || {};
    if (fixture.kind === 'format') {
        const actual = formatPolicy.evaluate(fixture.source, fixture.target);
        const passed = (!expected.hardIssues || JSON.stringify(actual.hardIssues) === JSON.stringify(expected.hardIssues)) &&
            (!expected.hardContains || containsAll(actual.hardIssues, expected.hardContains));
        record(fixture.id, passed, { hardIssues: actual.hardIssues, reviewIssues: actual.reviewIssues }, expected, {
            actualBlocking: actual.hardIssues.length > 0,
            expectedBlocking: Boolean(expected.hardContains?.length || expected.hardIssues?.length)
        });
        continue;
    }
    if (fixture.kind === 'format_reference') {
        const sourceResult = formatPolicy.evaluate(fixture.source, fixture.target);
        const referenceResult = formatPolicy.evaluate(fixture.reference, fixture.target);
        const resolvedHardIssues = sourceResult.hardIssues.length && referenceResult.hardIssues.length === 0
            ? []
            : sourceResult.hardIssues;
        const passed = JSON.stringify(resolvedHardIssues) === JSON.stringify(expected.hardIssues || []);
        record(fixture.id, passed, {
            hardIssues: resolvedHardIssues,
            sourceHardIssues: sourceResult.hardIssues,
            referenceHardIssues: referenceResult.hardIssues
        }, expected, {
            actualBlocking: resolvedHardIssues.length > 0,
            expectedBlocking: Boolean(expected.hardIssues?.length)
        });
        continue;
    }
    if (fixture.kind === 'number') {
        const actual = numberPolicy.evaluate(fixture.source, fixture.target, fixture.targetLang);
        const passed = (!expected.hardIssues || JSON.stringify(actual.hardIssues) === JSON.stringify(expected.hardIssues)) &&
            (!expected.hardContains || containsAll(actual.hardIssues, expected.hardContains)) &&
            (!expected.reviewContains || containsAll(actual.reviewIssues, expected.reviewContains));
        record(fixture.id, passed, { hardIssues: actual.hardIssues, reviewIssues: actual.reviewIssues }, expected, {
            actualBlocking: actual.hardIssues.length > 0,
            expectedBlocking: Boolean(expected.hardContains?.length || expected.hardIssues?.length)
        });
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
        record(fixture.id, passed, { hard, codes, issues: issues.map(issue => issue.message) }, expected, {
            actualBlocking: hard,
            expectedBlocking: Boolean(expected.hard)
        });
        continue;
    }
    if (fixture.kind === 'issue') {
        const findings = issuePolicy.classifyEntry(fixture.entry || {});
        const requiredIds = [...new Set(findings.filter(item => item.tier === 'required').map(item => item.id))];
        const reviewIds = [...new Set(findings.filter(item => item.tier === 'review').map(item => item.id))];
        const passed = JSON.stringify(requiredIds) === JSON.stringify(expected.requiredIds || []) &&
            (expected.reviewIds || []).every(id => reviewIds.includes(id));
        record(fixture.id, passed, { requiredIds, reviewIds }, expected, {
            actualBlocking: requiredIds.length > 0,
            expectedBlocking: (expected.requiredIds || []).length > 0
        });
        continue;
    }
    if (fixture.kind === 'candidate') {
        const decision = issuePolicy.decideCandidate({
            previous: fixture.previous || {},
            candidate: fixture.candidate || {},
            selectedIssueIds: fixture.selectedIssueIds || [],
            mode: fixture.mode || 'ordinary'
        });
        const actual = {
            accept: decision.accept,
            reason: decision.reason,
            introducedHardIssueIds: decision.introducedHardIssueIds
        };
        const passed = actual.accept === Boolean(expected.accept) &&
            (!expected.reason || actual.reason === expected.reason);
        record(fixture.id, passed, actual, expected, {
            actualBlocking: !decision.accept,
            expectedBlocking: !Boolean(expected.accept),
            acceptedCandidateNewHardIssues: decision.accept ? decision.introducedHardIssueIds.length : 0
        });
        continue;
    }
    if (fixture.kind === 'lifecycle') {
        const lifecycle = attemptPolicy.createPersistedLifecycle(fixture.lifecycle || {});
        const actual = {
            frozenSameContext: attemptPolicy.isPersistedLifecycleFrozen(lifecycle, fixture.sameContext || {}),
            frozenChangedContext: attemptPolicy.isPersistedLifecycleFrozen(lifecycle, fixture.changedContext || {})
        };
        record(fixture.id, JSON.stringify(actual) === JSON.stringify(expected), actual, expected, {
            contentCandidates: lifecycle.contentCandidates
        });
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
        record(fixture.id, JSON.stringify(actual) === JSON.stringify(expected), actual, expected, {
            contentCandidates: actual.contentCandidates
        });
        continue;
    }
    record(fixture.id, false, { error: `Unknown fixture kind: ${fixture.kind}` }, expected);
}

const metrics = {
    fixtureVersion: manifest.fixtureVersion,
    totalCases: outcomes.length,
    passedCases: outcomes.filter(outcome => outcome.passed).length,
    failedCases: failures.length,
    hardFalsePositives: outcomes.filter(outcome => outcome.expectedBlocking === false && outcome.actualBlocking === true).length,
    hardFalseNegatives: outcomes.filter(outcome => outcome.expectedBlocking === true && outcome.actualBlocking === false).length,
    acceptedCandidateNewHardIssues: outcomes.reduce((sum, outcome) => sum + Number(outcome.acceptedCandidateNewHardIssues || 0), 0),
    maxContentCandidatesPerCell: outcomes.reduce((max, outcome) => Math.max(max, Number(outcome.contentCandidates || 0)), 0),
    replayDurationMs: Math.round((performance.now() - replayStartedAt) * 100) / 100,
    failures
};

console.log(JSON.stringify(metrics, null, 2));
assert.ok(metrics.failedCases <= Number(baseline.maxFailures || 0), `quality replay failures: ${metrics.failedCases}`);
assert.ok(metrics.hardFalsePositives <= Number(baseline.maxHardFalsePositives || 0), `hard QA false positives: ${metrics.hardFalsePositives}`);
assert.equal(metrics.hardFalseNegatives, 0, `hard QA false negatives: ${metrics.hardFalseNegatives}`);
assert.ok(
    metrics.acceptedCandidateNewHardIssues <= Number(baseline.maxAcceptedCandidateNewHardIssues || 0),
    `accepted candidate new hard issues: ${metrics.acceptedCandidateNewHardIssues}`
);
assert.ok(
    metrics.maxContentCandidatesPerCell <= Number(baseline.maxContentCandidatesPerCell || 1),
    `content candidate budget exceeded: ${metrics.maxContentCandidatesPerCell}`
);
if (Number(baseline.replayDurationMs) > 0) {
    const maximumDuration = Number(baseline.replayDurationMs) *
        (1 + Number(baseline.maxPerformanceRegressionPercent || 0) / 100);
    assert.ok(metrics.replayDurationMs <= maximumDuration, `quality replay performance regression: ${metrics.replayDurationMs}ms > ${maximumDuration}ms`);
}
