/*
 * Canonical response parser for ordinary translation batches.
 *
 * Explicit IDs are authoritative. Legacy positional string arrays are only
 * accepted when their length exactly matches the request, so a partial or
 * shifted response can never be written into the wrong cell.
 */
(function installNexusTranslationBatchResponsePolicy(root) {
    'use strict';

    const POLICY_VERSION = '1.0.0';

    function cleanResponseEnvelope(value) {
        let text = String(value ?? '').trim();
        text = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
        text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
        const firstArray = text.indexOf('[');
        const lastArray = text.lastIndexOf(']');
        const firstObject = text.indexOf('{');
        const lastObject = text.lastIndexOf('}');
        if (firstArray >= 0 && lastArray >= firstArray && (firstObject < 0 || firstArray < firstObject)) {
            return text.slice(firstArray, lastArray + 1);
        }
        if (firstObject >= 0 && lastObject >= firstObject) {
            return text.slice(firstObject, lastObject + 1);
        }
        return text;
    }

    function normalizeExpectedIds(expectedIds = []) {
        return [...new Set((Array.isArray(expectedIds) ? expectedIds : [])
            .map(id => String(id ?? '').trim())
            .filter(Boolean))];
    }

    function normalizeTranslationValue(value) {
        return typeof value === 'string' ? value.trim() : '';
    }

    function getObjectTranslation(item) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return '';
        return normalizeTranslationValue(
            item.translation ?? item.translatedText ?? item.translated ?? item.target ?? item.output ?? item.value ?? ''
        );
    }

    function createResult(expectedIds, mode = 'invalid') {
        return {
            ok: false,
            mode,
            valuesById: new Map(),
            missingIds: [...expectedIds],
            duplicateIds: [],
            unknownIds: [],
            emptyIds: [],
            invalidItems: [],
            fallbackIds: [...expectedIds],
            structuralError: ''
        };
    }

    function finalizeResult(result, expectedIds, presentIds = new Set()) {
        const invalidIds = new Set([
            ...result.duplicateIds,
            ...result.emptyIds
        ]);
        invalidIds.forEach(id => result.valuesById.delete(id));
        result.missingIds = expectedIds.filter(id => !presentIds.has(id));
        result.fallbackIds = expectedIds.filter(id => !result.valuesById.has(id));
        const structuralIssues = [];
        if (result.invalidItems.length) structuralIssues.push('invalid_items');
        if (result.unknownIds.length) structuralIssues.push('unknown_ids');
        if (result.duplicateIds.length) structuralIssues.push('duplicate_ids');
        if (result.emptyIds.length) structuralIssues.push('empty_ids');
        if (result.missingIds.length) structuralIssues.push('missing_ids');
        result.structuralError = structuralIssues.join(',');
        result.ok = result.fallbackIds.length === 0 && structuralIssues.length === 0;
        return result;
    }

    function parseIdObjectArray(items, expectedIds) {
        const expectedSet = new Set(expectedIds);
        const result = createResult(expectedIds, 'id_objects');
        const presentIds = new Set();
        const seenCounts = new Map();
        const duplicateSet = new Set();
        const unknownSet = new Set();
        const emptySet = new Set();

        items.forEach((item, index) => {
            if (!item || typeof item !== 'object' || Array.isArray(item)) {
                result.invalidItems.push({ index, reason: 'expected_object' });
                return;
            }
            const id = String(item.id ?? '').trim();
            if (!id) {
                result.invalidItems.push({ index, reason: 'missing_id' });
                return;
            }
            if (!expectedSet.has(id)) {
                unknownSet.add(id);
                return;
            }
            presentIds.add(id);
            const count = (seenCounts.get(id) || 0) + 1;
            seenCounts.set(id, count);
            if (count > 1) {
                duplicateSet.add(id);
                return;
            }
            const translation = getObjectTranslation(item);
            if (!translation) {
                emptySet.add(id);
                return;
            }
            result.valuesById.set(id, translation);
        });

        result.duplicateIds = expectedIds.filter(id => duplicateSet.has(id));
        result.emptyIds = expectedIds.filter(id => emptySet.has(id));
        result.unknownIds = [...unknownSet];
        return finalizeResult(result, expectedIds, presentIds);
    }

    function parseIdMap(value, expectedIds, mode) {
        const expectedSet = new Set(expectedIds);
        const result = createResult(expectedIds, mode);
        const presentIds = new Set();
        const emptySet = new Set();
        const unknownSet = new Set();
        Object.entries(value || {}).forEach(([rawId, rawTranslation]) => {
            const id = String(rawId || '').trim();
            if (!expectedSet.has(id)) {
                if (id) unknownSet.add(id);
                return;
            }
            presentIds.add(id);
            const translation = normalizeTranslationValue(rawTranslation);
            if (!translation) {
                emptySet.add(id);
                return;
            }
            result.valuesById.set(id, translation);
        });
        result.emptyIds = expectedIds.filter(id => emptySet.has(id));
        result.unknownIds = [...unknownSet];
        return finalizeResult(result, expectedIds, presentIds);
    }

    function parseLegacyStringArray(items, expectedIds) {
        const result = createResult(expectedIds, 'legacy_strings');
        if (items.length !== expectedIds.length || !items.every(item => typeof item === 'string')) {
            result.structuralError = 'legacy_length_mismatch';
            result.invalidItems = [{ reason: 'legacy_length_mismatch', receivedCount: items.length }];
            return result;
        }
        const presentIds = new Set(expectedIds);
        items.forEach((item, index) => {
            const id = expectedIds[index];
            const translation = normalizeTranslationValue(item);
            if (!translation) result.emptyIds.push(id);
            else result.valuesById.set(id, translation);
        });
        return finalizeResult(result, expectedIds, presentIds);
    }

    function parseTranslationBatchResponse(value, expectedIds = []) {
        const normalizedExpectedIds = normalizeExpectedIds(expectedIds);
        let parsed;
        try {
            parsed = JSON.parse(cleanResponseEnvelope(value));
        } catch (error) {
            const result = createResult(normalizedExpectedIds, 'invalid_json');
            result.structuralError = 'invalid_json';
            result.parseError = String(error?.message || error || '').slice(0, 160);
            return result;
        }

        if (Array.isArray(parsed)) {
            if (parsed.every(item => typeof item === 'string')) {
                return parseLegacyStringArray(parsed, normalizedExpectedIds);
            }
            return parseIdObjectArray(parsed, normalizedExpectedIds);
        }

        if (parsed && typeof parsed === 'object') {
            // Some OpenAI-compatible models collapse a partial batch with one
            // valid item into a single object instead of a one-item array.
            // Its explicit ID still makes it safe to salvage.
            if (Object.prototype.hasOwnProperty.call(parsed, 'id')) {
                return parseIdObjectArray([parsed], normalizedExpectedIds);
            }
            const values = parsed.valuesById ?? parsed.translationsById;
            if (values && typeof values === 'object' && !Array.isArray(values)) {
                return parseIdMap(values, normalizedExpectedIds, 'id_map');
            }
            const items = parsed.items ?? parsed.translations ?? parsed.results;
            if (Array.isArray(items)) {
                if (items.every(item => typeof item === 'string')) {
                    return parseLegacyStringArray(items, normalizedExpectedIds);
                }
                return parseIdObjectArray(items, normalizedExpectedIds);
            }
        }

        const result = createResult(normalizedExpectedIds, 'invalid_shape');
        result.structuralError = 'invalid_shape';
        return result;
    }

    root.NexusTranslationBatchResponsePolicy = Object.freeze({
        POLICY_VERSION,
        parseTranslationBatchResponse
    });
})(typeof globalThis !== 'undefined' ? globalThis : window);
