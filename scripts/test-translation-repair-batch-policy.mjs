import assert from 'node:assert/strict';

await import('../translation-repair-batch-policy.js');

const policy = globalThis.NexusTranslationRepairBatchPolicy;
assert.ok(policy, 'NexusTranslationRepairBatchPolicy should be installed');
assert.equal(policy.DEFAULT_BATCH_SIZE, 4);
assert.equal(policy.MAX_BATCH_SIZE, 6);
assert.equal(policy.DEFAULT_CHAR_BUDGET, 4800);
assert.equal(policy.PROMOTE_AFTER_CLEAN_BATCHES, 4);
assert.equal(policy.FALLBACK_RATE_DEMOTE_THRESHOLD, 0.10);
assert.equal(policy.COMPOUND_MAX_BATCH_SIZE, 3);

assert.equal(
    policy.getActualIssueSignature({
        actualIssueIds: ['number', 'mixed_chinese', 'number'],
        selectedIssueIds: ['length_review']
    }),
    'mixed_chinese|number',
    'actual findings should be deduplicated and sorted independently of the global selection'
);
assert.equal(
    policy.getActualIssueSignature({
        actualFindings: [{ id: 'term_hard' }, { id: 'mixed_chinese' }]
    }),
    'mixed_chinese|term_hard'
);
assert.equal(
    policy.getActualIssueSignature({ selectedIssueIds: ['mixed_chinese', 'number'] }),
    policy.UNCLASSIFIED_ISSUE_SIGNATURE,
    'a global selected filter is not evidence that the current row has those issues'
);

assert.deepEqual(
    policy.getRepairCompatibilityGroup({ actualIssueIds: ['mixed_chinese', 'wrong_script'] }),
    {
        key: 'lexical_purity',
        route: 'repair',
        families: ['lexical_purity'],
        issueIds: ['mixed_chinese', 'wrong_script'],
        forceSingle: false,
        reason: 'compatible_family',
        maxBatchSize: 6,
        charBudget: 4800
    },
    'different language-purity findings should share one compatibility family'
);
assert.deepEqual(
    policy.getRepairCompatibilityGroup({ actualIssueIds: ['number', 'mixed_chinese'] }),
    {
        key: 'compound:lexical_purity+numeric_exact',
        route: 'repair',
        families: ['lexical_purity', 'numeric_exact'],
        issueIds: ['mixed_chinese', 'number'],
        forceSingle: false,
        reason: 'compound_family_set',
        maxBatchSize: 3,
        charBudget: 3600
    }
);
assert.equal(
    policy.getRepairCompatibilityGroup({ actualIssueIds: ['other_hard'] }).forceSingle,
    true,
    'unknown hard findings must never enter a micro-batch'
);
assert.equal(
    policy.getRepairCompatibilityGroup({ actualIssueIds: ['transport_or_missing', 'number'] }).route,
    'replacement',
    'missing output must route back to ordinary translation'
);

{
    const jobs = [
        { key: 'a1', actualIssueIds: ['mixed_chinese'], chars: 100 },
        { key: 'b1', actualIssueIds: ['number'], chars: 100 },
        { key: 'a2', actualIssueIds: ['mixed_chinese'], chars: 100 },
        { key: 'a3', actualIssueIds: ['mixed_chinese'], chars: 100 },
        { key: 'b2', actualIssueIds: ['number'], chars: 100 },
        { key: 'a4', actualIssueIds: ['mixed_chinese'], chars: 100 },
        { key: 'a5', actualIssueIds: ['mixed_chinese'], chars: 100 }
    ];
    const plan = policy.createTargetedRepairMicroBatches(jobs, {
        getCharCost: job => job.chars
    });
    assert.equal(plan.batchSize, 4);
    assert.equal(plan.charBudget, 4800);
    assert.deepEqual(
        plan.batches.map(batch => ({
            signature: batch.signature,
            keys: batch.jobs.map(job => job.key),
            chars: batch.charCount
        })),
        [
            { signature: 'lexical_purity', keys: ['a1', 'a2', 'a3', 'a4'], chars: 400 },
            { signature: 'numeric_exact', keys: ['b1', 'b2'], chars: 200 }
        ],
        'groups and rows within each group should retain stable first-seen order'
    );
    assert.deepEqual(
        plan.singles.map(item => ({ key: item.job.key, reason: item.reason })),
        [{ key: 'a5', reason: 'single_remainder' }]
    );
}

{
    const exactBudget = policy.createTargetedRepairMicroBatches([
        { key: 'a', actualIssueIds: ['number'], chars: 1800 },
        { key: 'b', actualIssueIds: ['number'], chars: 1800 },
        { key: 'c', actualIssueIds: ['number'], chars: 1 },
        { key: 'oversize', actualIssueIds: ['number'], chars: 3601 }
    ], {
        charBudget: 99_999,
        getCharCost: job => job.chars
    });
    assert.equal(exactBudget.charBudget, 4800, 'the hard character budget cannot be raised by a caller');
    assert.deepEqual(exactBudget.batches.map(batch => batch.jobs.map(job => job.key)), [['a', 'b']]);
    assert.equal(exactBudget.batches[0].charBudget, 3600, 'numeric family must keep its smaller prompt budget');
    assert.equal(exactBudget.batches[0].maxBatchSize, 4);
    assert.deepEqual(
        exactBudget.singles.map(item => [item.job.key, item.reason]),
        [['c', 'single_remainder'], ['oversize', 'over_budget']]
    );
}

{
    const jobs = Array.from({ length: 7 }, (_, index) => ({
        key: `job-${index}`,
        actualIssueIds: ['mixed_chinese'],
        chars: 10
    }));
    const plan = policy.createTargetedRepairMicroBatches(jobs, {
        batchSize: 100,
        getCharCost: job => job.chars
    });
    assert.equal(plan.batchSize, 6, 'a caller cannot exceed the hard six-item batch limit');
    assert.deepEqual(plan.batches.map(batch => batch.jobs.length), [6]);
    assert.deepEqual(plan.singles.map(item => item.job.key), ['job-6']);
}

{
    const jobs = [
        { key: 'mixed-1', actualIssueIds: ['mixed_chinese'], chars: 100 },
        { key: 'script-1', actualIssueIds: ['wrong_script'], chars: 100 },
        { key: 'format-1', actualIssueIds: ['format_placeholder'], chars: 100 },
        { key: 'ui-1', actualIssueIds: ['protected_ui_token'], chars: 100 },
        { key: 'number-1', actualIssueIds: ['number'], chars: 100 },
        { key: 'discount-1', actualIssueIds: ['discount_block'], chars: 100 }
    ];
    const plan = policy.createTargetedRepairMicroBatches(jobs, {
        batchSize: 6,
        getCharCost: job => job.chars
    });
    assert.deepEqual(
        plan.batches.map(batch => [batch.signature, batch.jobs.map(job => job.key)]),
        [
            ['lexical_purity', ['mixed-1', 'script-1']],
            ['structure_exact', ['format-1', 'ui-1']]
        ],
        'compatible findings may combine, while structure, number, and discount remain isolated'
    );
    assert.deepEqual(
        plan.singles.map(item => [item.job.key, item.signature]),
        [
            ['number-1', 'numeric_exact'],
            ['discount-1', 'discount_semantic']
        ]
    );
}

{
    const compoundJobs = Array.from({ length: 7 }, (_, index) => ({
        key: `compound-${index}`,
        actualIssueIds: ['number', 'mixed_chinese'],
        chars: 10
    }));
    const plan = policy.createTargetedRepairMicroBatches(compoundJobs, {
        batchSize: 99,
        getCharCost: job => job.chars
    });
    assert.deepEqual(plan.batches.map(batch => batch.jobs.length), [3, 3]);
    assert.equal(plan.batches[0].signature, 'compound:lexical_purity+numeric_exact');
    assert.equal(plan.batches[0].maxBatchSize, 3, 'compound families must use the stricter hard cap');
    assert.deepEqual(plan.singles.map(item => item.job.key), ['compound-6']);
}

{
    const plan = policy.createTargetedRepairMicroBatches([
        { key: 'unknown-a', actualIssueIds: ['other_hard'], chars: 10 },
        { key: 'unknown-b', actualIssueIds: [], chars: 10 },
        { key: 'missing-a', actualIssueIds: ['transport_or_missing'], chars: 10 },
        { key: 'missing-b', actualIssueIds: ['transport_or_missing', 'number'], chars: 10 }
    ], {
        batchSize: 6,
        getCharCost: job => job.chars
    });
    assert.deepEqual(plan.batches, []);
    assert.deepEqual(
        plan.singles.map(item => [item.job.key, item.reason]),
        [['unknown-a', 'unknown_risk'], ['unknown-b', 'unclassified']],
        'unknown and unclassified work must remain independent singles'
    );
    assert.deepEqual(
        plan.replacements.map(item => [item.job.key, item.reason]),
        [['missing-a', 'ordinary_translation'], ['missing-b', 'ordinary_translation']],
        'replacement work is redirected instead of entering the repair planner'
    );
}

{
    const discountJobs = Array.from({ length: 5 }, (_, index) => ({
        key: `discount-${index}`,
        actualIssueIds: ['discount_block'],
        chars: 700
    }));
    const plan = policy.createTargetedRepairMicroBatches(discountJobs, {
        batchSize: 6,
        charBudget: 99_999,
        getCharCost: job => job.chars
    });
    assert.deepEqual(plan.batches.map(batch => batch.jobs.length), [2, 2]);
    assert.ok(plan.batches.every(batch => batch.charBudget === 2400));
    assert.ok(plan.batches.every(batch => batch.maxBatchSize === 2));
    assert.deepEqual(plan.singles.map(item => item.job.key), ['discount-4']);
}

{
    const payload = {
        sourceText: '提升攻击力',
        currentTranslation: 'Zwiększa 攻击力',
        focusedQaStatus: '需确认：混入中文'
    };
    assert.equal(
        policy.estimateTargetedRepairPayloadChars({ payload }),
        JSON.stringify(payload).length
    );
    const circular = {};
    circular.self = circular;
    assert.equal(policy.estimateTargetedRepairPayloadChars({ payload: circular }), Number.POSITIVE_INFINITY);
}

{
    let state = policy.createTargetedRepairBatchState();
    for (let index = 0; index < 3; index++) {
        state = policy.advanceTargetedRepairBatchState(state, {
            submittedCount: 4,
            fallbackCount: 0
        });
        assert.equal(state.batchSize, 4, 'three clean batches are not enough to promote');
    }
    state = policy.advanceTargetedRepairBatchState(state, {
        submittedCount: 4,
        fallbackCount: 0
    });
    assert.equal(state.batchSize, 6, 'the fourth consecutive clean batch should promote 4 -> 6');
    assert.equal(state.lastDecision, 'promote');

    const structural = policy.advanceTargetedRepairBatchState(state, {
        submittedCount: 6,
        fallbackCount: 0,
        structuralError: 'duplicate_ids'
    });
    assert.equal(structural.batchSize, 4);
    assert.equal(structural.lastDecision, 'demote');
    assert.equal(structural.consecutiveCleanBatches, 0);
}

{
    const fromFour = policy.advanceTargetedRepairBatchState(
        policy.createTargetedRepairBatchState({ batchSize: 4 }),
        { submittedCount: 4, structuralError: 'invalid_json' }
    );
    assert.equal(fromFour.batchSize, 2, 'an unstable default batch must actually demote 4 -> 2');

    const fromTwo = policy.advanceTargetedRepairBatchState(
        fromFour,
        { submittedCount: 2, fallbackCount: 1 }
    );
    assert.equal(fromTwo.batchSize, 1, 'continued instability must demote 2 -> 1');

    let recovered = policy.createTargetedRepairBatchState({ batchSize: 1 });
    for (let index = 0; index < policy.PROMOTE_AFTER_CLEAN_BATCHES; index++) {
        recovered = policy.advanceTargetedRepairBatchState(recovered, {
            submittedCount: recovered.batchSize,
            fallbackCount: 0,
            rejectedCount: 0,
            clean: true
        });
    }
    assert.equal(recovered.batchSize, 2, 'recovery from single mode must be staged instead of jumping 1 -> 6');
}

for (const outcome of [
    { submittedCount: 6, fallbackCount: 0, status: 429 },
    { submittedCount: 6, fallbackCount: 0, timedOut: true },
    { submittedCount: 6, fallbackCount: 0, error: Object.assign(new Error('request timeout'), { isTimeout: true }) }
]) {
    const state = policy.advanceTargetedRepairBatchState(
        policy.createTargetedRepairBatchState({ batchSize: 6 }),
        outcome
    );
    assert.equal(state.batchSize, 4, 'rate limits and timeouts should immediately demote to four');
}

{
    const demoted = policy.advanceTargetedRepairBatchState(
        policy.createTargetedRepairBatchState({ batchSize: 6 }),
        { submittedCount: 6, fallbackCount: 1 }
    );
    assert.ok(demoted.fallbackRate > 0.10);
    assert.equal(demoted.batchSize, 4, 'a fallback rate above ten percent should demote');

    const held = policy.advanceTargetedRepairBatchState(
        policy.createTargetedRepairBatchState({ batchSize: 6 }),
        { submittedCount: 10, fallbackCount: 1 }
    );
    assert.equal(held.fallbackRate, 0.10);
    assert.equal(held.batchSize, 6, 'exactly ten percent is not above the demotion threshold');

    const rejected = policy.advanceTargetedRepairBatchState(
        policy.createTargetedRepairBatchState({ batchSize: 6 }),
        { submittedCount: 6, fallbackCount: 0, rejectedCount: 1 }
    );
    assert.ok(rejected.rejectionRate > 0.10);
    assert.equal(rejected.batchSize, 4, 'quality-gate rejection above ten percent should demote');
}

{
    const parsed = policy.parseTargetedRepairBatchResponse(
        '```json\n[{"id":"r3","translation":"three"},{"id":"r1","translation":"one"},{"id":"r2","translation":"two"}]\n```',
        ['r1', 'r2', 'r3']
    );
    assert.equal(parsed.ok, true);
    assert.equal(parsed.structuralError, '');
    assert.deepEqual([...parsed.translationsById.entries()], [
        ['r3', 'three'],
        ['r1', 'one'],
        ['r2', 'two']
    ], 'ID mapping should accept arbitrary response order without positional matching');
    assert.deepEqual(parsed.itemReports, [
        { id: 'r1', status: 'ok', translation: 'one' },
        { id: 'r2', status: 'ok', translation: 'two' },
        { id: 'r3', status: 'ok', translation: 'three' }
    ]);
}

{
    const strings = policy.parseTargetedRepairBatchResponse('["one","two"]', ['r1', 'r2']);
    assert.equal(strings.ok, false);
    assert.deepEqual(strings.fallbackIds, ['r1', 'r2']);
    assert.deepEqual(strings.missingIds, ['r1', 'r2']);
    assert.deepEqual(strings.invalidItems, [
        { index: 0, reason: 'expected_object' },
        { index: 1, reason: 'expected_object' }
    ], 'plain string arrays must be rejected instead of trusted by position');
}

{
    const parsed = policy.parseTargetedRepairBatchResponse(JSON.stringify([
        { id: 'r1', translation: 'first' },
        { id: 'r1', translation: 'duplicate' },
        { id: 'r2', translation: '   ' },
        { id: 'unknown', translation: 'unknown value' }
    ]), ['r1', 'r2', 'r3', 'r4']);
    assert.equal(parsed.ok, false);
    assert.deepEqual(parsed.duplicateIds, ['r1']);
    assert.deepEqual(parsed.emptyIds, ['r2']);
    assert.deepEqual(parsed.missingIds, ['r3', 'r4']);
    assert.deepEqual(parsed.unknownIds, ['unknown']);
    assert.deepEqual(parsed.fallbackIds, ['r1', 'r2', 'r3', 'r4']);
    assert.deepEqual(parsed.itemReports, [
        { id: 'r1', status: 'duplicate', translation: '' },
        { id: 'r2', status: 'empty', translation: '' },
        { id: 'r3', status: 'missing', translation: '' },
        { id: 'r4', status: 'missing', translation: '' }
    ]);
    assert.deepEqual(parsed.unknownItems, [{ index: 3, id: 'unknown' }]);
    assert.match(parsed.structuralError, /duplicate_ids/);
    assert.match(parsed.structuralError, /empty_ids/);
    assert.match(parsed.structuralError, /missing_ids/);
    assert.match(parsed.structuralError, /unknown_ids/);
}

{
    const malformed = policy.parseTargetedRepairBatchResponse('{not json}', ['r1']);
    assert.equal(malformed.ok, false);
    assert.equal(malformed.structuralError, 'invalid_json');
    assert.deepEqual(malformed.missingIds, ['r1']);
}

console.log('translation-repair-batch-policy: grouping, budget, adaptive sizing, and strict ID parsing passed');
