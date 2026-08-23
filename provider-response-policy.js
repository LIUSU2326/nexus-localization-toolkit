/*
 * Safe parsing policy for OpenAI-compatible provider responses.
 *
 * The module deliberately uses a small allowlist of final-content paths. It
 * never falls back to reasoning fields or recursively searches the payload,
 * because either behavior can mistake private chain-of-thought for output.
 */
(function installNexusProviderResponsePolicy(root, factory) {
    'use strict';

    const policy = factory();

    if (typeof define === 'function' && define.amd) {
        define([], function getNexusProviderResponsePolicy() {
            return policy;
        });
    } else if (typeof module === 'object' && module && module.exports) {
        module.exports = policy;
    } else if (root) {
        root.NexusProviderResponsePolicy = policy;
    }
})(
    typeof globalThis !== 'undefined'
        ? globalThis
        : (typeof self !== 'undefined' ? self : this),
    function createNexusProviderResponsePolicy() {
        'use strict';

        const POLICY_VERSION = '1.0.0';
        const GLOBAL_NAME = 'NexusProviderResponsePolicy';
        const EMPTY_CONTENT_ERROR_CODE = 'EMPTY_PROVIDER_CONTENT';

        const FINAL_CONTENT_PATHS = Object.freeze([
            Object.freeze({ path: Object.freeze(['choices', 0, 'message', 'content']), label: 'choices[0].message.content' }),
            Object.freeze({ path: Object.freeze(['choices', 0, 'text']), label: 'choices[0].text' }),
            Object.freeze({ path: Object.freeze(['output_text']), label: 'output_text' }),
            Object.freeze({ path: Object.freeze(['result', 'output_text']), label: 'result.output_text' }),
            Object.freeze({ path: Object.freeze(['result', 'content']), label: 'result.content' }),
            Object.freeze({ path: Object.freeze(['result', 'text']), label: 'result.text' }),
            Object.freeze({ path: Object.freeze(['data', 'output_text']), label: 'data.output_text' }),
            Object.freeze({ path: Object.freeze(['data', 'content']), label: 'data.content' }),
            Object.freeze({ path: Object.freeze(['data', 'text']), label: 'data.text' })
        ]);

        const SAFE_FINISH_REASONS = new Set([
            'stop',
            'length',
            'content_filter',
            'tool_calls',
            'function_call',
            'end_turn',
            'max_tokens',
            'max_output',
            'max_output_tokens',
            'incomplete',
            'completed',
            'cancelled',
            'canceled',
            'error',
            'safety',
            'recitation'
        ]);

        const REASONING_PART_TYPES = new Set([
            'analysis',
            'reasoning',
            'reasoning_text',
            'thinking',
            'thought'
        ]);

        const SENSITIVE_FIELD_NAME = /(?:authorization|api[-_]?key|access[-_]?key|secret|password|credential|cookie|set[-_]?cookie|headers?|endpoint|urls?|uris?|request[-_]?body|response[-_]?body)/i;
        const SECRET_LIKE_FIELD_NAME = /^(?:(?:sk|pk|rk|sess|ghp|github_pat)[-_][a-z0-9_-]{8,}|bearer[-_][a-z0-9_-]{8,})$/i;
        const SAFE_FIELD_NAME = /^[A-Za-z_$][A-Za-z0-9_$.-]{0,63}$/;

        function isObjectLike(value) {
            return value !== null && (typeof value === 'object' || typeof value === 'function');
        }

        function hasOwn(value, key) {
            return isObjectLike(value) && Object.prototype.hasOwnProperty.call(value, key);
        }

        function readOwnPath(value, path) {
            let current = value;
            for (const key of path) {
                if (!hasOwn(current, key)) {
                    return { present: false, value: undefined };
                }
                try {
                    current = current[key];
                } catch {
                    return { present: false, value: undefined };
                }
            }
            return { present: true, value: current };
        }

        function getValueType(value, present = true) {
            if (!present) return 'missing';
            if (value === null) return 'null';
            if (Array.isArray(value)) return 'array';
            return typeof value;
        }

        function isReasoningPart(part) {
            if (!part || typeof part !== 'object') return false;
            const rawType = hasOwn(part, 'type') ? part.type : '';
            const type = typeof rawType === 'string' ? rawType.trim().toLowerCase() : '';
            return REASONING_PART_TYPES.has(type) || type.startsWith('reasoning_');
        }

        function normalizeExplicitText(value, seen = new Set()) {
            if (typeof value === 'string') return value;
            if (!value || (typeof value !== 'object' && !Array.isArray(value))) return '';
            if (seen.has(value)) return '';
            seen.add(value);

            if (Array.isArray(value)) {
                const text = value.map(item => normalizeExplicitText(item, seen)).join('');
                seen.delete(value);
                return text;
            }

            if (isReasoningPart(value)) {
                seen.delete(value);
                return '';
            }

            for (const key of ['output_text', 'text', 'content']) {
                if (!hasOwn(value, key)) continue;
                const text = normalizeExplicitText(value[key], seen);
                if (text) {
                    seen.delete(value);
                    return text;
                }
            }

            seen.delete(value);
            return '';
        }

        function extractFinalContentDetails(payload) {
            let firstObserved = null;

            for (const candidate of FINAL_CONTENT_PATHS) {
                const observed = readOwnPath(payload, candidate.path);
                if (!observed.present) continue;

                const normalized = normalizeExplicitText(observed.value);
                const details = {
                    content: normalized.trim(),
                    source: candidate.label,
                    contentType: getValueType(observed.value),
                    contentLength: normalized.length
                };
                if (!firstObserved) firstObserved = details;
                if (details.content) return details;
            }

            return firstObserved || {
                content: '',
                source: '',
                contentType: 'missing',
                contentLength: 0
            };
        }

        function extractFinalContent(payload) {
            return extractFinalContentDetails(payload).content;
        }

        function normalizeSafeFinishReason(value) {
            if (typeof value !== 'string') return '';
            const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, '_');
            if (!normalized) return '';
            return SAFE_FINISH_REASONS.has(normalized) ? normalized : 'other';
        }

        function getFinishReason(payload) {
            const choice = readOwnPath(payload, ['choices', 0]);
            if (!choice.present || !isObjectLike(choice.value)) return '';
            if (hasOwn(choice.value, 'finish_reason')) {
                return normalizeSafeFinishReason(choice.value.finish_reason);
            }
            if (hasOwn(choice.value, 'finishReason')) {
                return normalizeSafeFinishReason(choice.value.finishReason);
            }
            return '';
        }

        function normalizeHttpStatus(metadata) {
            const candidates = [
                metadata && metadata.httpStatus,
                metadata && metadata.status,
                metadata && metadata.statusCode,
                metadata && metadata.response && metadata.response.status
            ];
            for (const candidate of candidates) {
                const numeric = Number(candidate);
                if (Number.isInteger(numeric) && numeric >= 100 && numeric <= 599) {
                    return numeric;
                }
            }
            return null;
        }

        function utf8ByteLength(value) {
            const text = String(value ?? '');
            let bytes = 0;
            for (let index = 0; index < text.length; index += 1) {
                const code = text.charCodeAt(index);
                if (code <= 0x7f) {
                    bytes += 1;
                } else if (code <= 0x7ff) {
                    bytes += 2;
                } else if (code >= 0xd800 && code <= 0xdbff && index + 1 < text.length) {
                    const next = text.charCodeAt(index + 1);
                    if (next >= 0xdc00 && next <= 0xdfff) {
                        bytes += 4;
                        index += 1;
                    } else {
                        bytes += 3;
                    }
                } else {
                    bytes += 3;
                }
            }
            return bytes;
        }

        function getResponseByteSize(payload, metadata) {
            const supplied = Number(metadata && (
                metadata.responseBytes ?? metadata.byteLength ?? metadata.responseByteLength
            ));
            if (Number.isFinite(supplied) && supplied >= 0) {
                return Math.floor(supplied);
            }
            if (metadata && typeof metadata.rawText === 'string') {
                return utf8ByteLength(metadata.rawText);
            }
            try {
                const serialized = JSON.stringify(payload);
                return typeof serialized === 'string' ? utf8ByteLength(serialized) : 0;
            } catch {
                return null;
            }
        }

        function isSafeFieldName(value) {
            if (typeof value !== 'string' || !SAFE_FIELD_NAME.test(value)) return false;
            if (SENSITIVE_FIELD_NAME.test(value) || SECRET_LIKE_FIELD_NAME.test(value)) return false;
            return !/(?:https?|wss?):/i.test(value);
        }

        function listSafeFieldNames(value) {
            if (!isObjectLike(value) || Array.isArray(value)) return [];
            try {
                return Object.keys(value)
                    .filter(isSafeFieldName)
                    .sort((left, right) => left.localeCompare(right));
            } catch {
                return [];
            }
        }

        function createSafeResponseDiagnostic(payload, metadata = {}) {
            const choiceRead = readOwnPath(payload, ['choices', 0]);
            const choice = choiceRead.present && isObjectLike(choiceRead.value)
                ? choiceRead.value
                : null;
            const messageRead = readOwnPath(payload, ['choices', 0, 'message']);
            const message = messageRead.present && isObjectLike(messageRead.value)
                ? messageRead.value
                : null;
            const content = extractFinalContentDetails(payload);

            return Object.freeze({
                policyVersion: POLICY_VERSION,
                httpStatus: normalizeHttpStatus(metadata),
                finishReason: getFinishReason(payload),
                topLevelFields: Object.freeze(listSafeFieldNames(payload)),
                choiceFields: Object.freeze(listSafeFieldNames(choice)),
                messageFields: Object.freeze(listSafeFieldNames(message)),
                content: Object.freeze({
                    source: content.source,
                    type: content.contentType,
                    length: content.contentLength
                }),
                responseBytes: getResponseByteSize(payload, metadata)
            });
        }

        function sanitizeSafeResponseDiagnostic(value) {
            if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
            const safeNames = values => Object.freeze((Array.isArray(values) ? values : [])
                .filter(isSafeFieldName)
                .slice(0, 32));
            const httpStatus = normalizeHttpStatus(value);
            const finishReason = normalizeSafeFinishReason(value.finishReason);
            const sourceAllowlist = new Set(FINAL_CONTENT_PATHS.map(item => item.label));
            const contentSource = sourceAllowlist.has(value.content?.source) ? value.content.source : '';
            const contentType = ['missing', 'null', 'array', 'string', 'object', 'number', 'boolean', 'undefined']
                .includes(value.content?.type)
                ? value.content.type
                : '';
            const contentLength = Number(value.content?.length);
            const responseBytes = Number(value.responseBytes);
            return Object.freeze({
                policyVersion: POLICY_VERSION,
                httpStatus,
                finishReason,
                topLevelFields: safeNames(value.topLevelFields),
                choiceFields: safeNames(value.choiceFields),
                messageFields: safeNames(value.messageFields),
                content: Object.freeze({
                    source: contentSource,
                    type: contentType,
                    length: Number.isFinite(contentLength) && contentLength >= 0 ? Math.floor(contentLength) : 0
                }),
                responseBytes: Number.isFinite(responseBytes) && responseBytes >= 0 ? Math.floor(responseBytes) : null
            });
        }

        function createEmptyContentError(payload, metadata = {}) {
            const safeDiagnostic = createSafeResponseDiagnostic(payload, metadata);
            const reasonSuffix = safeDiagnostic.finishReason
                ? ` (finish_reason: ${safeDiagnostic.finishReason})`
                : '';
            const error = new Error(`Provider response contained no explicit final content${reasonSuffix}`);
            error.name = 'ProviderResponseEmptyContentError';
            error.code = EMPTY_CONTENT_ERROR_CODE;
            error.finishReason = safeDiagnostic.finishReason;
            error.safeDiagnostic = safeDiagnostic;
            return error;
        }

        function parseProviderResponse(payload, metadata = {}) {
            const details = extractFinalContentDetails(payload);
            if (!details.content) throw createEmptyContentError(payload, metadata);
            return Object.freeze({
                content: details.content,
                source: details.source,
                safeDiagnostic: createSafeResponseDiagnostic(payload, metadata)
            });
        }

        return Object.freeze({
            POLICY_VERSION,
            GLOBAL_NAME,
            EMPTY_CONTENT_ERROR_CODE,
            FINAL_CONTENT_PATHS,
            extractFinalContent,
            extractFinalContentDetails,
            normalizeSafeFinishReason,
            createSafeResponseDiagnostic,
            sanitizeSafeResponseDiagnostic,
            createEmptyContentError,
            parseProviderResponse
        });
    }
);
