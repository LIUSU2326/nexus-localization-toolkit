import assert from 'node:assert/strict';

await import('../translation-delivery-policy.js');

const policy = globalThis.NexusTranslationDeliveryPolicy;
assert.ok(policy, 'NexusTranslationDeliveryPolicy should be installed');

const classify = entry => entry.kind;

{
    const gate = policy.buildDeliveryGate([
        { kind: 'hard', qaStatus: '需确认：目标泰语中混入中文' },
        { kind: 'soft', qaStatus: '需确认：英文专名需确认：RTA' }
    ], classify);
    assert.equal(gate.ready, false);
    assert.equal(gate.blockingCount, 1);
    assert.deepEqual(policy.getAutoSaveKinds(gate), ['report']);
    assert.deepEqual(policy.getManualExportKinds(gate), ['translated_unverified', 'report']);
}

{
    const gate = policy.buildDeliveryGate([
        { kind: 'hard', qaStatus: '需确认：目标译文仍含英文参考：Excellent' },
        { kind: 'missing' }
    ], classify);
    assert.equal(gate.ready, false);
    assert.equal(gate.blockingCount, 2);
}

{
    const gate = policy.buildDeliveryGate([
        { kind: 'success' },
        { kind: 'soft', qaStatus: '需确认：英文专名需确认：RTA' },
        { kind: 'length' }
    ], classify);
    assert.equal(gate.ready, true);
    assert.deepEqual(policy.getAutoSaveKinds(gate), ['translated', 'report']);
    assert.deepEqual(policy.getManualExportKinds(gate), ['translated', 'report']);
}

assert.equal(policy.normalizeDecision('接受现译'), 'accept_current');
assert.equal(policy.normalizeDecision('必须重译'), 'must_retry');
assert.equal(policy.normalizeDecision('使用修订译文'), 'use_revision');
assert.equal(policy.normalizeDecision('unknown value'), '');

{
    const selected = policy.selectImportedTranslation({
        translatedText: 'Excellent',
        revisedText: 'ยอดเยี่ยม'
    });
    assert.equal(selected.decision, 'use_revision');
    assert.equal(selected.candidateText, 'ยอดเยี่ยม');
}

{
    const selected = policy.selectImportedTranslation({
        translatedText: 'Excellent',
        userDecision: '使用修订译文',
        revisedText: 'ยอดเยี่ยม'
    });
    assert.equal(selected.candidateText, 'ยอดเยี่ยม');
    assert.equal(selected.revisionApplied, true);
    assert.equal(selected.decisionError, '');
}

{
    const selected = policy.selectImportedTranslation({
        translatedText: 'Excellent',
        userDecision: '使用修订译文',
        revisedText: ''
    });
    assert.equal(selected.candidateText, '');
    assert.match(selected.decisionError, /修订译文为空/);
}

{
    const selected = policy.selectImportedTranslation({
        translatedText: 'Excellent',
        userDecision: '必须重译',
        revisedText: 'ยอดเยี่ยม'
    });
    assert.equal(selected.forceRetry, true);
    assert.equal(selected.candidateText, 'Excellent');
}

{
    const selected = policy.selectImportedTranslation({
        translatedText: 'Xeno Bug',
        userDecision: '接受现译',
        revisedText: 'แมลงต่างดาว'
    });
    assert.equal(selected.acceptRequested, true);
    assert.equal(selected.candidateText, 'Xeno Bug');
    assert.equal(selected.revisionApplied, false);
}

{
    const selected = policy.selectImportedTranslation({
        translatedText: '',
        userDecision: '接受现译'
    });
    assert.match(selected.decisionError, /没有译文/);
}

for (const value of ['', '接受现译', '必须重译', '使用修订译文']) {
    const normalized = policy.normalizeDecision(value);
    assert.equal(policy.normalizeDecision(normalized), normalized);
}

assert.equal(policy.canAcceptCurrentKind('soft'), true);
assert.equal(policy.canAcceptCurrentKind('length'), true);
assert.equal(policy.canAcceptCurrentKind('hard'), false);
assert.equal(policy.canAcceptCurrentKind('missing'), false);
assert.equal(policy.isManualResolutionValid('接受现译', 'soft', false), true);
assert.equal(policy.isManualResolutionValid('接受现译', 'hard', true), false);
assert.equal(policy.isManualResolutionValid('使用修订译文', 'hard', true), true);
assert.equal(policy.isManualResolutionValid('使用修订译文', 'soft', false), false);

{
    const merged = policy.mergeDecisionFields(
        { taskKey: 'task-1', translatedText: 'Xeno Bug' },
        { userDecision: '使用修订译文', revisedText: 'แมลงต่างดาว', decisionNote: '人工修订' }
    );
    assert.deepEqual(merged, {
        taskKey: 'task-1',
        translatedText: 'Xeno Bug',
        userDecision: 'use_revision',
        revisedText: 'แมลงต่างดาว',
        decisionNote: '人工修订'
    });
}

{
    const merged = policy.mergeDecisionFields(
        {
            taskKey: 'task-2',
            userDecision: 'accept_current',
            revisedText: 'เดิม',
            decisionNote: ''
        },
        {
            userDecision: '',
            revisedText: '',
            decisionNote: '只补备注'
        }
    );
    assert.equal(merged.userDecision, 'accept_current');
    assert.equal(merged.revisedText, 'เดิม');
    assert.equal(merged.decisionNote, '只补备注');
}

console.log('translation-delivery-policy: all cases passed');
