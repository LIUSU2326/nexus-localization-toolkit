import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

await import('../provider-response-policy.js');

const policy = globalThis.NexusProviderResponsePolicy;
assert.ok(policy, 'NexusProviderResponsePolicy should be installed as a browser global');
assert.equal(policy.POLICY_VERSION, '1.0.0');

const extractionCases = [
    {
        name: 'chat message content',
        payload: { choices: [{ message: { content: '  final translation  ' } }] },
        expected: 'final translation',
        source: 'choices[0].message.content'
    },
    {
        name: 'legacy choice text',
        payload: { choices: [{ text: 'legacy completion' }] },
        expected: 'legacy completion',
        source: 'choices[0].text'
    },
    {
        name: 'top-level output_text',
        payload: { output_text: 'responses output' },
        expected: 'responses output',
        source: 'output_text'
    },
    {
        name: 'result output_text',
        payload: { result: { output_text: 'result output' } },
        expected: 'result output',
        source: 'result.output_text'
    },
    {
        name: 'result content',
        payload: { result: { content: 'result content' } },
        expected: 'result content',
        source: 'result.content'
    },
    {
        name: 'result text',
        payload: { result: { text: 'result text' } },
        expected: 'result text',
        source: 'result.text'
    },
    {
        name: 'data output_text',
        payload: { data: { output_text: 'data output' } },
        expected: 'data output',
        source: 'data.output_text'
    },
    {
        name: 'data content',
        payload: { data: { content: 'data content' } },
        expected: 'data content',
        source: 'data.content'
    },
    {
        name: 'data text',
        payload: { data: { text: 'data text' } },
        expected: 'data text',
        source: 'data.text'
    }
];

for (const testCase of extractionCases) {
    const details = policy.extractFinalContentDetails(testCase.payload);
    assert.equal(details.content, testCase.expected, testCase.name);
    assert.equal(details.source, testCase.source, `${testCase.name} source`);
}

assert.equal(
    policy.extractFinalContent({
        choices: [{
            message: {
                content: [
                    { type: 'reasoning', text: 'private analysis' },
                    { type: 'output_text', text: 'part one' },
                    ' + part two'
                ],
                reasoning_content: 'private chain of thought'
            }
        }]
    }),
    'part one + part two',
    'content arrays should join explicit final text while excluding reasoning parts'
);

assert.equal(
    policy.extractFinalContent({
        choices: [{
            message: {
                content: '   ',
                reasoning_content: 'must never become the translation'
            },
            text: 'safe fallback'
        }],
        output_text: 'lower-priority output'
    }),
    'safe fallback',
    'an empty higher-priority field should fall through only to another explicit final field'
);

for (const payload of [
    { choices: [{ message: { reasoning_content: 'private reasoning' } }] },
    { reasoning_content: 'private reasoning' },
    { text: 'unapproved top-level text' },
    { content: 'unapproved top-level content' },
    { result: { reasoning_content: 'private reasoning' } },
    { data: { nested: { text: 'recursive guessing is forbidden' } } },
    { choices: [{ message: { content: [{ type: 'reasoning_text', text: 'private reasoning' }] } }] }
]) {
    assert.equal(policy.extractFinalContent(payload), '', 'non-final or non-allowlisted content must be rejected');
}

{
    const rawText = JSON.stringify({ marker: '译文🚀' });
    const payload = {
        id: 'response-id',
        model: 'provider-model',
        api_key: 'sk-sensitive-key-material',
        endpointUrl: 'https://secret.example/v1/chat/completions',
        headers: { Authorization: 'Bearer sensitive-header-value' },
        choices: [{
            index: 0,
            finish_reason: 'stop',
            logprobs: null,
            message: {
                role: 'assistant',
                content: 'SENSITIVE_FINAL_BODY',
                reasoning_content: 'SENSITIVE_REASONING_BODY',
                authorization: 'Bearer message-secret'
            }
        }]
    };
    const diagnostic = policy.createSafeResponseDiagnostic(payload, {
        status: 200,
        rawText
    });

    assert.deepEqual(diagnostic, {
        policyVersion: '1.0.0',
        httpStatus: 200,
        finishReason: 'stop',
        topLevelFields: ['choices', 'id', 'model'],
        choiceFields: ['finish_reason', 'index', 'logprobs', 'message'],
        messageFields: ['content', 'reasoning_content', 'role'],
        content: {
            source: 'choices[0].message.content',
            type: 'string',
            length: 'SENSITIVE_FINAL_BODY'.length
        },
        responseBytes: Buffer.byteLength(rawText, 'utf8')
    });

    const serialized = JSON.stringify(diagnostic);
    for (const forbidden of [
        'SENSITIVE_FINAL_BODY',
        'SENSITIVE_REASONING_BODY',
        'sk-sensitive-key-material',
        'https://secret.example',
        'sensitive-header-value',
        'message-secret',
        'api_key',
        'endpointUrl',
        'headers',
        'authorization'
    ]) {
        assert.equal(serialized.includes(forbidden), false, `diagnostic must not contain ${forbidden}`);
    }
}

assert.equal(policy.normalizeSafeFinishReason('MAX_TOKENS'), 'max_tokens');
assert.equal(policy.normalizeSafeFinishReason('custom reason with https://secret.example'), 'other');

{
    const sanitized = policy.sanitizeSafeResponseDiagnostic({
        status: 200,
        finishReason: 'stop',
        topLevelFields: ['choices', 'api_key', 'https://secret.example'],
        choiceFields: ['message', 'headers'],
        messageFields: ['content', 'authorization'],
        content: { source: 'choices[0].message.content', type: 'string', length: 12, body: 'SECRET' },
        responseBytes: 55,
        rawText: 'SECRET_BODY'
    });
    assert.deepEqual(sanitized, {
        policyVersion: '1.0.0',
        httpStatus: 200,
        finishReason: 'stop',
        topLevelFields: ['choices'],
        choiceFields: ['message'],
        messageFields: ['content'],
        content: { source: 'choices[0].message.content', type: 'string', length: 12 },
        responseBytes: 55
    });
    assert.equal(JSON.stringify(sanitized).includes('SECRET'), false);
}

{
    const payload = {
        choices: [{
            finish_reason: 'custom-secret-finish-reason',
            message: {
                content: '',
                reasoning_content: 'DO_NOT_LOG_REASONING'
            }
        }],
        api_key: 'sk-do-not-log'
    };
    const error = policy.createEmptyContentError(payload, {
        httpStatus: 200,
        responseBytes: 777
    });

    assert.equal(error.name, 'ProviderResponseEmptyContentError');
    assert.equal(error.code, policy.EMPTY_CONTENT_ERROR_CODE);
    assert.equal(error.finishReason, 'other');
    assert.equal(error.safeDiagnostic.httpStatus, 200);
    assert.equal(error.safeDiagnostic.responseBytes, 777);
    assert.equal(error.safeDiagnostic.content.length, 0);
    assert.equal(JSON.stringify(error.safeDiagnostic).includes('DO_NOT_LOG_REASONING'), false);
    assert.equal(JSON.stringify(error.safeDiagnostic).includes('sk-do-not-log'), false);
    assert.throws(
        () => policy.parseProviderResponse(payload, { httpStatus: 200, responseBytes: 777 }),
        candidate => candidate.code === policy.EMPTY_CONTENT_ERROR_CODE &&
            candidate.safeDiagnostic.responseBytes === 777
    );
}

{
    const parsed = policy.parseProviderResponse({
        choices: [{
            finish_reason: 'length',
            message: { content: 'usable but truncated text' }
        }]
    }, { statusCode: 206, responseBytes: 50 });
    assert.equal(parsed.content, 'usable but truncated text');
    assert.equal(parsed.source, 'choices[0].message.content');
    assert.equal(parsed.safeDiagnostic.finishReason, 'length');
    assert.equal(parsed.safeDiagnostic.httpStatus, 206);
}

{
    const moduleSource = await readFile(new URL('../provider-response-policy.js', import.meta.url), 'utf8');
    const commonJsContext = vm.createContext({
        module: { exports: {} },
        exports: {}
    });
    vm.runInContext(moduleSource, commonJsContext, { filename: 'provider-response-policy.js' });
    const commonJsPolicy = commonJsContext.module.exports;
    assert.equal(typeof commonJsPolicy.extractFinalContent, 'function', 'CommonJS export should be installed');
    assert.equal(
        commonJsPolicy.extractFinalContent({ choices: [{ message: { content: 'commonjs result' } }] }),
        'commonjs result'
    );
}

console.log('provider-response-policy: safe final-content extraction and diagnostics passed');
