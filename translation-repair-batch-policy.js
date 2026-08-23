/*
 * Targeted translation-repair micro-batch policy.
 *
 * This module is deliberately independent from the DOM, workbooks, API
 * providers, and the translation runtime. It owns only deterministic planning,
 * adaptive batch sizing, and strict ID-based response parsing.
 */
(function installNexusTranslationRepairBatchPolicy(root) {
    'use strict';

    const POLICY_VERSION = '2.1.0';

    const DEFAULT_BATCH_SIZE = 4;
    const MAX_BATCH_SIZE = 6;
    const DEFAULT_CHAR_BUDGET = 4800;
    const PROMOTE_AFTER_CLEAN_BATCHES = 4;
    const FALLBACK_RATE_DEMOTE_THRESHOLD = 0.10;
    const OUTCOME_WINDOW_SIZE = 8;
    const UNCLASSIFIED_ISSUE_SIGNATURE = 'unclassified';
    const COMPOUND_MAX_BATCH_SIZE = 3;
    const ISSUE_COMPATIBILITY_FAMILY = Object.freeze({
        mixed_chinese: 'lexical_purity',
        wrong_script: 'lexical_purity',
        english_block: 'lexical_purity',
        zh_conversion: 'lexical_purity',
        spacing: 'lexical_purity',
        term_hard: 'lexical_purity',
        format_placeholder: 'structure_exact',
        protected_ui_token: 'structure_exact',
        number: 'numeric_exact',
        discount_block: 'discount_semantic',
        length_review: 'compact',
        transport_or_missing: 'replacement'
    });
    const FAMILY_ORDER = Object.freeze([
        'lexical_purity',
        'structure_exact',
        'numeric_exact',
        'discount_semantic',
        'compact',
        'replacement',
        'unknown'
    ]);
    const FAMILY_LIMITS = Object.freeze({
        lexical_purity: Object.freeze({ maxBatchSize: 6, charBudget: 4800 }),
        structure_exact: Object.freeze({ maxBatchSize: 4, charBudget: 3600 }),
        numeric_exact: Object.freeze({ maxBatchSize: 4, charBudget: 3600 }),
        discount_semantic: Object.freeze({ maxBatchSize: 2, charBudget: 2400 }),
        compact: Object.freeze({ maxBatchSize: 2, charBudget: 3200 }),
        replacement: Object.freeze({ maxBatchSize: 0, charBudget: 0 }),
        unknown: Object.freeze({ maxBatchSize: 1, charBudget: 4800 })
    });

    function normalizePositiveInteger(value, fallback, cap = Number.POSITIVE_INFINITY) {
        const numeric = Number(value);
        if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
        return Math.max(1, Math.min(cap, Math.floor(numeric)));
    }

    function normalizeIssueId(value) {
        return String(value ?? '')
            .trim()
            .toLowerCase()
            .replace(/\s+/g, '_');
    }

    function collectIssueIds(value) {
        if (value === undefined || value === null || value === '') return [];
        if (Array.isArray(value)) return value.flatMap(collectIssueIds);
        if (typeof value === 'object') {
            const direct = value.id ?? value.issueId ?? value.code ?? value.key;
            if (direct !== undefined && direct !== null && direct !== '') {
                return collectIssueIds(direct);
            }
            return [];
        }
        const normalized = normalizeIssueId(value);
        return normalized ? [normalized] : [];
    }

    function getActualIssueIds(job = {}) {
        const rawIssues = job.actualIssueIds ??
            job.actualIssues ??
            job.actualFindings ??
            job.findings ??
            job.issueIds ??
            [];
        return [...new Set(collectIssueIds(rawIssues))].sort();
    }

    function getActualIssueSignature(job = {}) {
        const issueIds = getActualIssueIds(job);
        return issueIds.length ? issueIds.join('|') : UNCLASSIFIED_ISSUE_SIGNATURE;
    }

    function compareFamilies(left, right) {
        const leftIndex = FAMILY_ORDER.indexOf(left);
        const rightIndex = FAMILY_ORDER.indexOf(right);
        const safeLeft = leftIndex >= 0 ? leftIndex : FAMILY_ORDER.length;
        const safeRight = rightIndex >= 0 ? rightIndex : FAMILY_ORDER.length;
        return safeLeft - safeRight || left.localeCompare(right);
    }

    function getRepairCompatibilityGroup(job = {}) {
        const issueIds = getActualIssueIds(job);
        if (!issueIds.length) {
            return {
                key: 'unknown',
                route: 'repair',
                families: ['unknown'],
                issueIds,
                forceSingle: true,
                reason: 'unclassified',
                ...FAMILY_LIMITS.unknown
            };
        }

        const families = [...new Set(issueIds.map(issueId =>
            ISSUE_COMPATIBILITY_FAMILY[issueId] || 'unknown'
        ))].sort(compareFamilies);

        if (families.includes('replacement')) {
            return {
                key: 'replacement',
                route: 'replacement',
                families,
                issueIds,
                forceSingle: false,
                reason: 'ordinary_translation',
                ...FAMILY_LIMITS.replacement
            };
        }

        if (families.includes('unknown')) {
            return {
                key: 'unknown',
                route: 'repair',
                families,
                issueIds,
                forceSingle: true,
                reason: 'unknown_risk',
                ...FAMILY_LIMITS.unknown
            };
        }

        const compound = families.length > 1;
        const maxBatchSize = Math.min(
            compound ? COMPOUND_MAX_BATCH_SIZE : MAX_BATCH_SIZE,
            ...families.map(family => FAMILY_LIMITS[family]?.maxBatchSize || 1)
        );
        const charBudget = Math.min(
            DEFAULT_CHAR_BUDGET,
            ...families.map(family => FAMILY_LIMITS[family]?.charBudget || DEFAULT_CHAR_BUDGET)
        );
        return {
            key: compound ? `compound:${families.join('+')}` : families[0],
            route: 'repair',
            families,
            issueIds,
            forceSingle: maxBatchSize <= 1,
            reason: compound ? 'compound_family_set' : 'compatible_family',
            maxBatchSize,
            charBudget
        };
    }

    function getDefaultRepairPayload(job = {}) {
        if (Object.prototype.hasOwnProperty.call(job, 'payload')) return job.payload;
        return {
            sourceText: job.sourceText ?? job.text ?? '',
            referenceText: job.referenceText ?? '',
            currentTranslation: job.currentTranslation ?? '',
            focusedQaStatus: job.focusedQaStatus ?? job.qaStatus ?? '',
            glossary: job.glossary ?? job.glossaryTerms ?? [],
            consistencyTerms: job.consistencyTerms ?? [],
            consistencyExamples: job.consistencyExamples ?? [],
            constraints: job.constraints ?? []
        };
    }

    function estimateTargetedRepairPayloadChars(job = {}) {
        try {
            const serialized = JSON.stringify(getDefaultRepairPayload(job));
            return typeof serialized === 'string' ? serialized.length : 0;
        } catch {
            return Number.POSITIVE_INFINITY;
        }
    }

    function createTargetedRepairMicroBatches(jobs = [], options = {}) {
        const requestedSize = normalizePositiveInteger(
            options.batchSize ?? options.targetSize,
            DEFAULT_BATCH_SIZE,
            MAX_BATCH_SIZE
        );
        const batchSize = Math.min(MAX_BATCH_SIZE, requestedSize);
        const charBudget = normalizePositiveInteger(
            options.charBudget,
            DEFAULT_CHAR_BUDGET,
            DEFAULT_CHAR_BUDGET
        );
        const getCompatibility = typeof options.getCompatibilityGroup === 'function'
            ? options.getCompatibilityGroup
            : null;
        const getLegacySignature = typeof options.getIssueSignature === 'function'
            ? options.getIssueSignature
            : null;
        const getCharCost = typeof options.getCharCost === 'function'
            ? options.getCharCost
            : estimateTargetedRepairPayloadChars;
        const groups = new Map();
        const singles = [];
        const replacements = [];

        (Array.isArray(jobs) ? jobs : []).forEach((job, index) => {
            const compatibility = getCompatibility
                ? getCompatibility(job, index)
                : (getLegacySignature
                    ? {
                        key: String(getLegacySignature(job, index) || UNCLASSIFIED_ISSUE_SIGNATURE),
                        route: 'repair',
                        families: [],
                        forceSingle: false,
                        reason: 'custom_signature',
                        maxBatchSize: batchSize,
                        charBudget
                    }
                    : getRepairCompatibilityGroup(job));
            const signature = String(compatibility?.key || 'unknown');
            const rawCost = Number(getCharCost(job, index));
            const charCount = Number.isFinite(rawCost) && rawCost >= 0
                ? Math.ceil(rawCost)
                : Number.POSITIVE_INFINITY;
            const effectiveBatchSize = Math.max(1, Math.min(
                batchSize,
                Number(compatibility?.maxBatchSize) || 1
            ));
            const effectiveCharBudget = Math.max(1, Math.min(
                charBudget,
                Number(compatibility?.charBudget) || charBudget
            ));
            const item = {
                job,
                index,
                signature,
                families: [...(compatibility?.families || [])],
                charCount,
                maxBatchSize: effectiveBatchSize,
                charBudget: effectiveCharBudget
            };
            if (compatibility?.route === 'replacement') {
                replacements.push({ ...item, reason: compatibility.reason || 'ordinary_translation' });
                return;
            }
            if (compatibility?.forceSingle) {
                singles.push({ ...item, reason: compatibility.reason || 'unknown_risk' });
                return;
            }
            if (charCount > effectiveCharBudget) {
                singles.push({ ...item, reason: 'over_budget' });
                return;
            }
            if (!groups.has(signature)) {
                groups.set(signature, {
                    items: [],
                    families: item.families,
                    maxBatchSize: effectiveBatchSize,
                    charBudget: effectiveCharBudget
                });
            }
            groups.get(signature).items.push(item);
        });

        const batches = [];
        const flush = (signature, group, items) => {
            if (!items.length) return;
            const charCount = items.reduce((sum, item) => sum + item.charCount, 0);
            if (items.length === 1) {
                singles.push({ ...items[0], reason: 'single_remainder' });
                return;
            }
            batches.push({
                signature,
                families: [...group.families],
                jobs: items.map(item => item.job),
                indexes: items.map(item => item.index),
                charCount,
                maxBatchSize: group.maxBatchSize,
                charBudget: group.charBudget
            });
        };

        groups.forEach((group, signature) => {
            let current = [];
            let currentChars = 0;
            group.items.forEach(item => {
                const exceedsSize = current.length >= group.maxBatchSize;
                const exceedsBudget = current.length > 0 && currentChars + item.charCount > group.charBudget;
                if (exceedsSize || exceedsBudget) {
                    flush(signature, group, current);
                    current = [];
                    currentChars = 0;
                }
                current.push(item);
                currentChars += item.charCount;
            });
            flush(signature, group, current);
        });

        singles.sort((left, right) => left.index - right.index);
        replacements.sort((left, right) => left.index - right.index);
        return {
            batches,
            singles,
            replacements,
            batchSize,
            charBudget
        };
    }

    function normalizeCount(value) {
        const numeric = Number(value);
        return Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : 0;
    }

    function getOutcomeDiagnostic(outcome = {}) {
        return [
            outcome.message,
            outcome.error?.message,
            typeof outcome.error === 'string' ? outcome.error : '',
            outcome.reason
        ].filter(Boolean).join(' ');
    }

    function classifyTargetedRepairBatchOutcome(outcome = {}) {
        const status = Number(outcome.status ?? outcome.statusCode ?? outcome.error?.status ?? outcome.error?.statusCode ?? 0);
        const diagnostic = getOutcomeDiagnostic(outcome);
        const hasReportedShapeIssue = [
            outcome.missingIds,
            outcome.duplicateIds,
            outcome.unknownIds,
            outcome.emptyIds,
            outcome.invalidItems
        ].some(items => Array.isArray(items) && items.length > 0);
        const structural = Boolean(
            outcome.structuralError ||
            outcome.parseError ||
            outcome.invalidFormat ||
            outcome.outputTruncated ||
            hasReportedShapeIssue ||
            /invalid[_\s-]?(?:json|format)|parse|结构|格式异常|数量不一致|被截断|truncat/i.test(diagnostic)
        );
        const rateLimited = Boolean(
            status === 429 ||
            outcome.rateLimited ||
            outcome.error?.isRateLimited ||
            /rate.?limit|too many requests|限流|频率/i.test(diagnostic)
        );
        const timedOut = Boolean(
            outcome.timedOut ||
            outcome.timeout ||
            outcome.error?.isTimeout ||
            status === 408 ||
            /timeout|timed out|超时/i.test(diagnostic)
        );
        const submittedCount = normalizeCount(
            outcome.submittedCount ?? outcome.itemCount ?? outcome.total
        );
        const fallbackCount = Math.min(
            submittedCount || Number.POSITIVE_INFINITY,
            normalizeCount(outcome.fallbackCount ?? outcome.fallbacks)
        );
        const rejectedCount = Math.min(
            submittedCount || Number.POSITIVE_INFINITY,
            normalizeCount(outcome.rejectedCount ?? outcome.rejected)
        );
        const clean = submittedCount > 0 &&
            fallbackCount === 0 &&
            rejectedCount === 0 &&
            !structural &&
            !rateLimited &&
            !timedOut &&
            outcome.clean !== false;
        return {
            structural,
            rateLimited,
            timedOut,
            submittedCount,
            fallbackCount: Number.isFinite(fallbackCount) ? fallbackCount : 0,
            rejectedCount: Number.isFinite(rejectedCount) ? rejectedCount : 0,
            clean
        };
    }

    function createTargetedRepairBatchState(state = {}) {
        const batchSize = normalizePositiveInteger(
            state.batchSize,
            DEFAULT_BATCH_SIZE,
            MAX_BATCH_SIZE
        );
        return {
            batchSize,
            consecutiveCleanBatches: normalizeCount(state.consecutiveCleanBatches),
            history: Array.isArray(state.history) ? state.history.slice(-OUTCOME_WINDOW_SIZE) : [],
            fallbackRate: Number.isFinite(Number(state.fallbackRate)) ? Math.max(0, Number(state.fallbackRate)) : 0,
            lastDecision: String(state.lastDecision || '')
        };
    }

    function advanceTargetedRepairBatchState(state = {}, outcome = {}) {
        const previous = createTargetedRepairBatchState(state);
        const classified = classifyTargetedRepairBatchOutcome(outcome);
        const history = [
            ...previous.history,
            {
                submittedCount: classified.submittedCount,
                fallbackCount: classified.fallbackCount,
                rejectedCount: classified.rejectedCount
            }
        ].slice(-OUTCOME_WINDOW_SIZE);
        const submittedTotal = history.reduce((sum, item) => sum + normalizeCount(item.submittedCount), 0);
        const fallbackTotal = history.reduce((sum, item) => sum + normalizeCount(item.fallbackCount), 0);
        const rejectedTotal = history.reduce((sum, item) => sum + normalizeCount(item.rejectedCount), 0);
        const fallbackRate = submittedTotal > 0 ? fallbackTotal / submittedTotal : 0;
        const rejectionRate = submittedTotal > 0 ? rejectedTotal / submittedTotal : 0;
        const mustDemote = classified.structural ||
            classified.rateLimited ||
            classified.timedOut ||
            fallbackRate > FALLBACK_RATE_DEMOTE_THRESHOLD ||
            rejectionRate > FALLBACK_RATE_DEMOTE_THRESHOLD;
        const consecutiveCleanBatches = classified.clean
            ? previous.consecutiveCleanBatches + 1
            : 0;
        let batchSize = previous.batchSize;
        let lastDecision = 'hold';

        if (mustDemote) {
            batchSize = previous.batchSize > DEFAULT_BATCH_SIZE
                ? DEFAULT_BATCH_SIZE
                : (previous.batchSize > 2 ? 2 : 1);
            lastDecision = 'demote';
        } else if (
            batchSize < MAX_BATCH_SIZE &&
            consecutiveCleanBatches >= PROMOTE_AFTER_CLEAN_BATCHES
        ) {
            batchSize = batchSize < DEFAULT_BATCH_SIZE
                ? Math.min(DEFAULT_BATCH_SIZE, batchSize * 2)
                : MAX_BATCH_SIZE;
            lastDecision = 'promote';
        }

        return {
            batchSize,
            consecutiveCleanBatches: mustDemote ? 0 : consecutiveCleanBatches,
            history,
            fallbackRate,
            rejectionRate,
            lastDecision,
            lastOutcome: classified
        };
    }

    function cleanBatchResponseText(value) {
        let text = String(value ?? '').trim();
        text = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
        text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
        const firstBracket = text.indexOf('[');
        const lastBracket = text.lastIndexOf(']');
        return firstBracket >= 0 && lastBracket >= firstBracket
            ? text.slice(firstBracket, lastBracket + 1)
            : text;
    }

    function createEmptyParseResult(expectedIds, structuralError = '') {
        return {
            ok: false,
            structuralError,
            translationsById: new Map(),
            itemReports: expectedIds.map(id => ({ id, status: 'missing', translation: '' })),
            missingIds: [...expectedIds],
            duplicateIds: [],
            unknownIds: [],
            emptyIds: [],
            fallbackIds: [...expectedIds],
            invalidItems: [],
            unknownItems: []
        };
    }

    function parseTargetedRepairBatchResponse(value, expectedIds = []) {
        const normalizedExpectedIds = [...new Set((Array.isArray(expectedIds) ? expectedIds : [])
            .map(id => String(id ?? '').trim())
            .filter(Boolean))];
        const expectedSet = new Set(normalizedExpectedIds);
        let parsed;
        try {
            parsed = JSON.parse(cleanBatchResponseText(value));
        } catch (error) {
            return {
                ...createEmptyParseResult(normalizedExpectedIds, 'invalid_json'),
                parseError: error?.message || String(error)
            };
        }
        if (!Array.isArray(parsed)) {
            return createEmptyParseResult(normalizedExpectedIds, 'not_array');
        }

        const translationsById = new Map();
        const seenExpectedCounts = new Map();
        const presentExpected = new Set();
        const duplicateSet = new Set();
        const unknownSet = new Set();
        const emptySet = new Set();
        const invalidItems = [];
        const unknownItems = [];

        parsed.forEach((item, index) => {
            if (!item || typeof item !== 'object' || Array.isArray(item)) {
                invalidItems.push({ index, reason: 'expected_object' });
                return;
            }
            const id = typeof item.id === 'string' ? item.id.trim() : '';
            if (!id) {
                invalidItems.push({ index, reason: 'missing_id' });
                return;
            }
            if (!expectedSet.has(id)) {
                unknownSet.add(id);
                unknownItems.push({ index, id });
                return;
            }

            presentExpected.add(id);
            const nextCount = (seenExpectedCounts.get(id) || 0) + 1;
            seenExpectedCounts.set(id, nextCount);
            if (nextCount > 1) {
                duplicateSet.add(id);
                translationsById.delete(id);
                return;
            }

            const translation = typeof item.translation === 'string'
                ? item.translation.trim()
                : '';
            if (!translation) {
                emptySet.add(id);
                return;
            }
            translationsById.set(id, translation);
        });

        duplicateSet.forEach(id => translationsById.delete(id));
        emptySet.forEach(id => translationsById.delete(id));
        const duplicateIds = normalizedExpectedIds.filter(id => duplicateSet.has(id));
        const emptyIds = normalizedExpectedIds.filter(id => emptySet.has(id));
        const missingIds = normalizedExpectedIds.filter(id => !presentExpected.has(id));
        const unknownIds = [...unknownSet];
        const fallbackIds = normalizedExpectedIds.filter(id => !translationsById.has(id));
        const itemReports = normalizedExpectedIds.map(id => {
            if (duplicateSet.has(id)) return { id, status: 'duplicate', translation: '' };
            if (emptySet.has(id)) return { id, status: 'empty', translation: '' };
            if (!presentExpected.has(id)) return { id, status: 'missing', translation: '' };
            return { id, status: 'ok', translation: translationsById.get(id) || '' };
        });
        const structuralIssues = [];
        if (invalidItems.length) structuralIssues.push('invalid_items');
        if (unknownIds.length) structuralIssues.push('unknown_ids');
        if (duplicateIds.length) structuralIssues.push('duplicate_ids');
        if (missingIds.length) structuralIssues.push('missing_ids');
        if (emptyIds.length) structuralIssues.push('empty_ids');

        return {
            ok: structuralIssues.length === 0 && translationsById.size === normalizedExpectedIds.length,
            structuralError: structuralIssues.join(','),
            translationsById,
            itemReports,
            missingIds,
            duplicateIds,
            unknownIds,
            emptyIds,
            fallbackIds,
            invalidItems,
            unknownItems
        };
    }

    root.NexusTranslationRepairBatchPolicy = Object.freeze({
        POLICY_VERSION,
        DEFAULT_BATCH_SIZE,
        MAX_BATCH_SIZE,
        DEFAULT_CHAR_BUDGET,
        PROMOTE_AFTER_CLEAN_BATCHES,
        FALLBACK_RATE_DEMOTE_THRESHOLD,
        OUTCOME_WINDOW_SIZE,
        UNCLASSIFIED_ISSUE_SIGNATURE,
        COMPOUND_MAX_BATCH_SIZE,
        ISSUE_COMPATIBILITY_FAMILY,
        FAMILY_LIMITS,
        getActualIssueIds,
        getActualIssueSignature,
        getRepairCompatibilityGroup,
        estimateTargetedRepairPayloadChars,
        createTargetedRepairMicroBatches,
        classifyTargetedRepairBatchOutcome,
        createTargetedRepairBatchState,
        advanceTargetedRepairBatchState,
        parseTargetedRepairBatchResponse
    });
})(typeof globalThis !== 'undefined' ? globalThis : window);
