import assert from 'node:assert/strict';

await import('../translation-batch-response-policy.js');
const policy = globalThis.NexusTranslationBatchResponsePolicy;
assert.ok(policy);
assert.equal(policy.POLICY_VERSION, '1.0.0');

{
    const result = policy.parseTranslationBatchResponse(JSON.stringify([
        { id: 't3', translation: 'three' },
        { id: 't1', translation: 'one' },
        { id: 't2', translation: 'two' }
    ]), ['t1', 't2', 't3']);
    assert.equal(result.ok, true);
    assert.deepEqual([...result.valuesById.entries()].sort(), [['t1', 'one'], ['t2', 'two'], ['t3', 'three']]);
}

{
    const result = policy.parseTranslationBatchResponse(JSON.stringify([
        { id: 't1', translation: 'valid' },
        { id: 't3', translation: '' },
        { id: 'other', translation: 'ignored' }
    ]), ['t1', 't2', 't3']);
    assert.equal(result.ok, false);
    assert.equal(result.valuesById.get('t1'), 'valid');
    assert.deepEqual(result.fallbackIds, ['t2', 't3']);
    assert.deepEqual(result.unknownIds, ['other']);
}

{
    const result = policy.parseTranslationBatchResponse(JSON.stringify([
        { id: 't1', translation: 'first' },
        { id: 't1', translation: 'duplicate' },
        { id: 't2', translation: 'second' }
    ]), ['t1', 't2']);
    assert.equal(result.valuesById.has('t1'), false, 'duplicate IDs must never be accepted ambiguously');
    assert.equal(result.valuesById.get('t2'), 'second');
    assert.deepEqual(result.fallbackIds, ['t1']);
}

{
    const legacy = policy.parseTranslationBatchResponse('["one","two"]', ['t1', 't2']);
    assert.equal(legacy.ok, true);
    assert.equal(legacy.mode, 'legacy_strings');
    assert.equal(legacy.valuesById.get('t2'), 'two');

    const partialLegacy = policy.parseTranslationBatchResponse('["one"]', ['t1', 't2']);
    assert.equal(partialLegacy.valuesById.size, 0, 'partial positional arrays must not risk shifted cell mapping');
    assert.deepEqual(partialLegacy.fallbackIds, ['t1', 't2']);
}

{
    const mapped = policy.parseTranslationBatchResponse(
        '{"valuesById":{"t2":"two","t1":"one"}}',
        ['t1', 't2']
    );
    assert.equal(mapped.ok, true);
    assert.equal(mapped.valuesById.get('t1'), 'one');
}

{
    const singleObject = policy.parseTranslationBatchResponse(
        '{"id":"t2","translation":"two"}',
        ['t1', 't2']
    );
    assert.equal(singleObject.valuesById.get('t2'), 'two');
    assert.deepEqual(singleObject.fallbackIds, ['t1']);
}

console.log('translation-batch-response-policy: stable ID parsing and bounded legacy compatibility passed');
