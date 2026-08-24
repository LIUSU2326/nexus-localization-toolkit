import assert from 'node:assert/strict';

await import('../translation-repair-attempt-policy.js');

const policy = globalThis.NexusTranslationRepairAttemptPolicy;
assert.ok(policy, 'NexusTranslationRepairAttemptPolicy should be installed');
assert.equal(policy.POLICY_VERSION, '1.2.0');
assert.equal(policy.PERSISTED_LIFECYCLE_VERSION, '1.0.0');
assert.equal(policy.PRIMARY_BATCH, 'primary_batch');
assert.equal(policy.PRIMARY_SINGLE, 'primary_single');
assert.equal(policy.NO_CONTENT_SUBSTITUTE, 'no_content_substitute');

{
    const lifecycle = policy.createPersistedLifecycle({
        contextSignature: 'context-v1',
        findingFingerprint: 'format-token:missing:{player}',
        terminalDecision: 'detector-conflict',
        reason: 'candidate rejected without a net deterministic improvement',
        candidateSnapshot: {
            text: 'Bonjour {player}',
            status: ' CANDIDATE-REJECTED ',
            source: ' targeted repair '
        },
        candidateQa: {
            candidateReturned: true,
            candidateDecision: 'REJECTED',
            candidateRejectReason: 'selected_issue_not_reduced',
            qaStatus: '阻断：混入中文',
            previousIssueIds: ['missing_translation', 'format_token', 'format_token'],
            candidateIssueIds: ['format_token'],
            introducedHardIssueIds: [],
            resolvedIssueIds: ['missing_translation']
        },
        contentCandidates: 1,
        noContentSubstitutes: 0
    });

    assert.deepEqual(lifecycle, {
        version: policy.PERSISTED_LIFECYCLE_VERSION,
        contextSignature: 'context-v1',
        findingFingerprint: 'format-token:missing:{player}',
        terminalDecision: policy.TERMINAL_DECISIONS.DETECTOR_CONFLICT,
        reason: 'candidate rejected without a net deterministic improvement',
        candidateSnapshot: {
            text: 'Bonjour {player}',
            status: 'candidate_rejected',
            source: 'targeted_repair'
        },
        candidateQa: {
            candidateReturned: true,
            candidateDecision: 'rejected',
            candidateRejectReason: 'selected_issue_not_reduced',
            qaStatus: '阻断：混入中文',
            previousIssueIds: ['missing_translation', 'format_token'],
            candidateIssueIds: ['format_token'],
            introducedHardIssueIds: [],
            resolvedIssueIds: ['missing_translation']
        },
        contentCandidates: 1,
        noContentSubstitutes: 0
    });
    assert.equal(Object.isFrozen(lifecycle), true);
    assert.equal(Object.isFrozen(lifecycle.candidateSnapshot), true);
    assert.equal(Object.isFrozen(lifecycle.candidateQa.previousIssueIds), true);
    assert.equal(policy.isPersistedLifecycleFrozen(lifecycle, {
        contextSignature: 'context-v1',
        findingFingerprint: 'format-token:missing:{player}'
    }), true, 'the same terminal context and finding set must not request another candidate');
    assert.equal(policy.isPersistedLifecycleFrozen(lifecycle, {
        contextSignature: 'context-v2',
        findingFingerprint: 'format-token:missing:{player}'
    }), false, 'a changed translation context must be eligible for validation again');
    assert.equal(policy.isPersistedLifecycleFrozen(lifecycle, {
        contextSignature: 'context-v1',
        findingFingerprint: 'number:mismatch:10'
    }), false, 'a changed finding fingerprint must be eligible for validation again when supplied');
    assert.equal(policy.isPersistedLifecycleFrozen(lifecycle, {
        contextSignature: 'context-v1'
    }), true, 'callers may use the complete context signature without a separate finding fingerprint');
}

{
    const longSignature = `  context-${'x'.repeat(2200)}  `;
    const longReason = `reason-${'r'.repeat(700)}`;
    const longText = `${'t'.repeat(33000)}\u0000discarded-tail`;
    const issueIds = Array.from({ length: 80 }, (_, index) => ` issue-${index} `);
    const sanitized = policy.sanitizePersistedLifecycle({
        version: 'future-or-untrusted',
        contextSignature: `${longSignature}\u0000`,
        findingFingerprint: 42,
        terminalDecision: 'unknown-terminal',
        reason: `${longReason}\u0000`,
        candidate: {
            candidateText: longText,
            status: ' Returned Content\u0000 ',
            source: { untrusted: true }
        },
        candidateQA: {
            candidateReturned: 'true',
            candidateDecision: 'invented',
            candidateRejectReason: `${longReason}\u0000`,
            qaStatus: `${'q'.repeat(5000)}\u0000`,
            previousIssueIds: [...issueIds, 'issue-0', null, { unsafe: true }]
        },
        contentCandidates: 999,
        noContentSubstitutes: -3,
        unexpected: 'must not persist'
    });

    assert.equal(sanitized.version, policy.PERSISTED_LIFECYCLE_VERSION);
    assert.equal(sanitized.contextSignature.length, 2048, 'context signatures are bounded');
    assert.equal(sanitized.contextSignature.includes('\u0000'), false);
    assert.equal(sanitized.findingFingerprint, '42');
    assert.equal(sanitized.terminalDecision, '', 'unknown terminal states cannot freeze a cell');
    assert.equal(sanitized.reason.length, 512);
    assert.ok(
        sanitized.candidateSnapshot.text.length > 0 && sanitized.candidateSnapshot.text.length < 32767,
        'candidate snapshots must leave room for lifecycle metadata inside one Excel cell'
    );
    assert.equal(sanitized.candidateSnapshot.text.includes('\u0000'), false);
    assert.equal(sanitized.candidateSnapshot.status, 'returned_content');
    assert.equal(sanitized.candidateSnapshot.source, '', 'objects are not stringified into persisted fields');
    assert.equal(sanitized.candidateQa.candidateReturned, null);
    assert.equal(sanitized.candidateQa.candidateDecision, '');
    assert.equal(sanitized.candidateQa.candidateRejectReason.length, 512);
    assert.equal(sanitized.candidateQa.qaStatus.length, 4096);
    assert.equal(sanitized.candidateQa.previousIssueIds.length, 64);
    assert.equal(sanitized.contentCandidates, 2, 'persisted content candidates respect the global ceiling');
    assert.equal(sanitized.noContentSubstitutes, 0);
    assert.equal(Object.hasOwn(sanitized, 'unexpected'), false);
    assert.equal(policy.isPersistedLifecycleFrozen(sanitized, {
        contextSignature: sanitized.contextSignature
    }), false);
    assert.deepEqual(policy.sanitizePersistedLifecycle(null), policy.createPersistedLifecycle());

    const excelCellJson = JSON.stringify(sanitized);
    assert.ok(
        excelCellJson.length <= 32767,
        `serialized repair lifecycle must fit one Excel cell, got ${excelCellJson.length} characters`
    );
    const roundTripped = policy.sanitizePersistedLifecycle(JSON.parse(excelCellJson));
    assert.equal(roundTripped.candidateSnapshot.text, sanitized.candidateSnapshot.text);
    assert.equal(roundTripped.contextSignature, sanitized.contextSignature);
    assert.equal(roundTripped.findingFingerprint, sanitized.findingFingerprint);
}

{
    for (const terminalDecision of Object.values(policy.TERMINAL_DECISIONS)) {
        const lifecycle = policy.createPersistedLifecycle({
            contextSignature: 'stable-context',
            findingFingerprint: '',
            terminalDecision
        });
        assert.equal(policy.isPersistedLifecycleFrozen(lifecycle, {
            contextSignature: 'stable-context',
            findingFingerprint: ''
        }), true, `${terminalDecision} is terminal in an unchanged context`);
    }
    assert.equal(policy.isPersistedLifecycleFrozen({
        contextSignature: 'stable-context',
        terminalDecision: 'accepted'
    }, { contextSignature: '' }), false, 'an empty current context cannot freeze persisted work');
    assert.equal(policy.isPersistedLifecycleFrozen(null, {
        contextSignature: 'stable-context'
    }), false);
}

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

console.log('translation-repair-attempt-policy: persistent lifecycle freeze, sanitization, single candidate, no-content substitute, terminal lock, commit, and summaries passed');
