import assert from 'node:assert/strict';

await import('../translation-repair-attempt-policy.js');

const policy = globalThis.NexusTranslationRepairAttemptPolicy;
assert.ok(policy, 'NexusTranslationRepairAttemptPolicy should be installed');
assert.equal(policy.POLICY_VERSION, '1.1.0');
assert.equal(policy.PRIMARY_BATCH, 'primary_batch');
assert.equal(policy.PRIMARY_SINGLE, 'primary_single');
assert.equal(policy.NO_CONTENT_SUBSTITUTE, 'no_content_substitute');

{
    const ledger = policy.createLedger();
    const cellId = 'cell-rejected';
    assert.equal(ledger.claimPrimaryBatch(cellId, 'targeted'), true);
    assert.equal(ledger.claimPrimaryBatch(cellId, 'targeted'), false, 'primary may be claimed only once');
    assert.equal(ledger.recordPhysicalRequest(cellId, 'batch', 1), true);
    assert.equal(ledger.recordCandidate(cellId, 'batch'), true);
    assert.equal(ledger.recordCandidate(cellId, 'single'), false, 'a cell may record at most one content candidate');
    ledger.settle(cellId, 'rejected', 'quality_gate');
    assert.equal(ledger.claimPrimarySingle(cellId, 'retry'), false, 'a terminal rejection cannot claim another primary');
    assert.equal(ledger.claimNoContentSubstitute(cellId), false, 'a rejected content candidate cannot use no-content substitution');
    assert.equal(ledger.recordPhysicalRequest(cellId, 'late', 1), false, 'terminal cells ignore late request accounting');
    assert.equal(ledger.markCommitted(cellId), true);
    assert.equal(ledger.markCommitted(cellId), false, 'logical commit is idempotent');

    const record = ledger.get(cellId);
    assert.equal(record.primaryMode, policy.PRIMARY_BATCH);
    assert.equal(record.primaryBatchClaims, 1);
    assert.equal(record.primarySingleClaims, 0);
    assert.equal(record.contentCandidates, 1);
    assert.equal(record.noContentSubstitutes, 0);
    assert.equal(record.logicalCommits, 1);
    assert.equal(record.terminal, 'rejected');
}

{
    const ledger = policy.createLedger();
    const cellId = 'cell-no-content';
    assert.equal(ledger.claimNoContentSubstitute(cellId), false, 'substitution requires a primary attempt');
    assert.equal(ledger.claimPrimarySingle(cellId, 'oversize'), true);
    assert.equal(ledger.recordPhysicalRequest(cellId, 'primary_single'), true);
    assert.equal(ledger.claimNoContentSubstitute(cellId), true, 'a content-free primary may use one substitute');
    assert.equal(ledger.claimNoContentSubstitute(cellId), false, 'only one no-content substitute is allowed');
    assert.equal(ledger.recordPhysicalRequest(cellId, policy.NO_CONTENT_SUBSTITUTE), true);
    assert.equal(ledger.recordCandidate(cellId, policy.NO_CONTENT_SUBSTITUTE), true);
    ledger.settle(cellId, 'accepted', 'substitute_accepted');
    assert.equal(ledger.canScheduleRepair(cellId), false);
    assert.equal(ledger.markCommitted(cellId), true);

    const record = ledger.get(cellId);
    assert.equal(record.primaryMode, policy.PRIMARY_SINGLE);
    assert.equal(record.primaryBatchClaims, 0);
    assert.equal(record.primarySingleClaims, 1);
    assert.equal(record.substitutes, 1);
    assert.equal(record.noContentSubstitutes, 1);
    assert.deepEqual(record.physicalRequestsByKind, {
        primary_single: 1,
        no_content_substitute: 1
    });
    assert.deepEqual(record.candidatesBySource, { no_content_substitute: 1 });
}

{
    const ledger = policy.createLedger();
    const cellId = 'cell-had-content';
    assert.equal(ledger.claimPrimary(cellId, 'repair', policy.PRIMARY_BATCH), true);
    assert.equal(ledger.recordCandidate(cellId), true);
    assert.equal(
        ledger.claimNoContentSubstitute(cellId),
        false,
        'substitution is forbidden once any content candidate was returned'
    );
    ledger.settle(cellId, 'accepted');
    assert.equal(ledger.claimPrimary(cellId), false);
}

{
    const ledger = policy.createLedger();
    ledger.claimPrimaryBatch('batch-cell', 'targeted');
    ledger.recordPhysicalRequest('batch-cell', 'batch');
    ledger.recordCandidate('batch-cell', 'batch');
    ledger.settle('batch-cell', 'rejected', 'gate');
    ledger.markCommitted('batch-cell');

    ledger.claimPrimarySingle('single-cell', 'oversize');
    ledger.recordPhysicalRequest('single-cell', 'primary_single');
    ledger.claimNoContentSubstitute('single-cell');
    ledger.recordPhysicalRequest('single-cell', 'no_content_substitute');
    ledger.recordCandidate('single-cell', 'no_content_substitute');
    ledger.settle('single-cell', 'accepted', 'fallback');
    ledger.markCommitted('single-cell');

    const summary = ledger.summarize();
    assert.equal(summary.cells, 2);
    assert.equal(summary.activeCells, 0);
    assert.equal(summary.terminalCells, 2);
    assert.equal(summary.primaryClaims, 2);
    assert.equal(summary.primaryBatchClaims, 1);
    assert.equal(summary.primarySingleClaims, 1);
    assert.deepEqual(summary.primaryModes, {
        primary_batch: 1,
        primary_single: 1
    });
    assert.equal(summary.physicalRequests, 3);
    assert.deepEqual(summary.physicalRequestsByKind, {
        batch: 1,
        primary_single: 1,
        no_content_substitute: 1
    });
    assert.equal(summary.contentCandidates, 2);
    assert.deepEqual(summary.candidatesBySource, {
        batch: 1,
        no_content_substitute: 1
    });
    assert.equal(summary.noContentSubstitutes, 1);
    assert.equal(summary.logicalCommits, 2);
    assert.equal(summary.committedCells, 2);
    assert.deepEqual(summary.terminals, {
        rejected: 1,
        accepted: 1
    });
    assert.equal(Object.isFrozen(summary), true);
    assert.equal(Object.isFrozen(summary.terminals), true);
}

console.log('translation-repair-attempt-policy: single candidate, no-content substitute, terminal lock, commit, and summaries passed');
