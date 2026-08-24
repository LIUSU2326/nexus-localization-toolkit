/* Run-scoped per-cell repair attempt ledger. */
(function installNexusTranslationRepairAttemptPolicy(root) {
    'use strict';

    const POLICY_VERSION = '1.2.0';
    const PERSISTED_LIFECYCLE_VERSION = '1.0.0';
    const PRIMARY_BATCH = 'primary_batch';
    const PRIMARY_SINGLE = 'primary_single';
    const NO_CONTENT_SUBSTITUTE = 'no_content_substitute';
    const MAX_PERSISTED_CONTENT_CANDIDATES = 2;
    const MAX_PERSISTED_NO_CONTENT_SUBSTITUTES = 1;
    const MAX_SIGNATURE_LENGTH = 2048;
    const MAX_REASON_LENGTH = 512;
    const MAX_CANDIDATE_TEXT_LENGTH = 32768;
    const MAX_CANDIDATE_QA_LENGTH = 4096;
    const MAX_SNAPSHOT_FIELD_LENGTH = 128;
    const MAX_ISSUE_ID_LENGTH = 128;
    const MAX_ISSUE_IDS = 64;
    const MAX_PERSISTED_LIFECYCLE_JSON_LENGTH = 32000;

    const TERMINAL_DECISIONS = Object.freeze({
        DETECTOR_CONFLICT: 'detector_conflict',
        ATTEMPT_EXHAUSTED: 'attempt_exhausted',
        ACCEPTED: 'accepted'
    });
    const PERSISTED_TERMINAL_DECISIONS = new Set(Object.values(TERMINAL_DECISIONS));
    const PERSISTED_CANDIDATE_DECISIONS = new Set([
        'accepted',
        'rejected',
        'not_returned',
        'not_attempted'
    ]);

    function normalizeBoundedInteger(value, fallback, minimum = 0) {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) return fallback;
        return Math.max(minimum, Math.floor(numeric));
    }

    function normalizePrimaryMode(value) {
        return String(value || '').trim().toLowerCase() === PRIMARY_SINGLE
            ? PRIMARY_SINGLE
            : PRIMARY_BATCH;
    }

    function normalizeRequestKind(value) {
        const normalized = String(value || '').trim().toLowerCase();
        return normalized || 'unspecified';
    }

    function sanitizePersistedString(value, maximumLength, { trim = true } = {}) {
        if (!['string', 'number', 'boolean'].includes(typeof value)) return '';
        const sanitized = String(value)
            .replace(/\u0000/g, '')
            .replace(/[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');
        return (trim ? sanitized.trim() : sanitized).slice(0, maximumLength);
    }

    function normalizePersistedToken(value, maximumLength = MAX_SNAPSHOT_FIELD_LENGTH) {
        return sanitizePersistedString(value, maximumLength)
            .toLowerCase()
            .replace(/[\s-]+/g, '_');
    }

    function normalizeClampedInteger(value, maximum) {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) return 0;
        return Math.min(maximum, Math.max(0, Math.floor(numeric)));
    }

    function sanitizeIssueIds(values) {
        const result = [];
        const seen = new Set();
        (Array.isArray(values) ? values : []).some(value => {
            const issueId = sanitizePersistedString(value, MAX_ISSUE_ID_LENGTH);
            if (issueId && !seen.has(issueId)) {
                seen.add(issueId);
                result.push(issueId);
            }
            return result.length >= MAX_ISSUE_IDS;
        });
        return Object.freeze(result);
    }

    function sanitizeCandidateSnapshot(value) {
        const snapshot = value && typeof value === 'object' && !Array.isArray(value)
            ? value
            : { text: value };
        return Object.freeze({
            text: sanitizePersistedString(
                snapshot.text ?? snapshot.candidateText,
                MAX_CANDIDATE_TEXT_LENGTH,
                { trim: false }
            ),
            status: normalizePersistedToken(snapshot.status),
            source: normalizePersistedToken(snapshot.source)
        });
    }

    function sanitizeCandidateQa(value) {
        const qa = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
        const candidateDecision = normalizePersistedToken(qa.candidateDecision);
        return Object.freeze({
            candidateReturned: qa.candidateReturned === true
                ? true
                : (qa.candidateReturned === false ? false : null),
            candidateDecision: PERSISTED_CANDIDATE_DECISIONS.has(candidateDecision)
                ? candidateDecision
                : '',
            candidateRejectReason: sanitizePersistedString(
                qa.candidateRejectReason,
                MAX_REASON_LENGTH
            ),
            qaStatus: sanitizePersistedString(qa.qaStatus, MAX_CANDIDATE_QA_LENGTH),
            previousIssueIds: sanitizeIssueIds(qa.previousIssueIds),
            candidateIssueIds: sanitizeIssueIds(qa.candidateIssueIds),
            introducedHardIssueIds: sanitizeIssueIds(qa.introducedHardIssueIds),
            resolvedIssueIds: sanitizeIssueIds(qa.resolvedIssueIds)
        });
    }

    function fitPersistedLifecycleToExcelCell(value) {
        const serializedLength = () => JSON.stringify(value).length;
        const trimStringField = (containerKey, fieldKey) => {
            const container = value[containerKey];
            const current = String(container?.[fieldKey] || '');
            const excess = serializedLength() - MAX_PERSISTED_LIFECYCLE_JSON_LENGTH;
            if (excess <= 0 || !current) return;
            value[containerKey] = Object.freeze({
                ...container,
                [fieldKey]: current.slice(0, Math.max(0, current.length - excess - 64))
            });
        };

        trimStringField('candidateSnapshot', 'text');
        trimStringField('candidateQa', 'qaStatus');
        trimStringField('candidateQa', 'candidateRejectReason');

        const issueFields = [
            'previousIssueIds', 'candidateIssueIds', 'introducedHardIssueIds', 'resolvedIssueIds'
        ];
        while (serializedLength() > MAX_PERSISTED_LIFECYCLE_JSON_LENGTH) {
            const largestField = issueFields
                .map(field => ({ field, values: value.candidateQa[field] || [] }))
                .sort((left, right) => right.values.length - left.values.length)[0];
            if (!largestField?.values.length) break;
            value.candidateQa = Object.freeze({
                ...value.candidateQa,
                [largestField.field]: Object.freeze(largestField.values.slice(0, -1))
            });
        }

        if (serializedLength() > MAX_PERSISTED_LIFECYCLE_JSON_LENGTH) {
            const excess = serializedLength() - MAX_PERSISTED_LIFECYCLE_JSON_LENGTH;
            value.reason = value.reason.slice(0, Math.max(0, value.reason.length - excess - 64));
        }
        if (serializedLength() > MAX_PERSISTED_LIFECYCLE_JSON_LENGTH) {
            const excess = serializedLength() - MAX_PERSISTED_LIFECYCLE_JSON_LENGTH;
            value.findingFingerprint = value.findingFingerprint.slice(
                0,
                Math.max(0, value.findingFingerprint.length - excess - 64)
            );
        }
        if (serializedLength() > MAX_PERSISTED_LIFECYCLE_JSON_LENGTH) {
            const excess = serializedLength() - MAX_PERSISTED_LIFECYCLE_JSON_LENGTH;
            value.contextSignature = value.contextSignature.slice(
                0,
                Math.max(0, value.contextSignature.length - excess - 64)
            );
        }
        return Object.freeze(value);
    }

    function sanitizePersistedLifecycle(value = {}) {
        const lifecycle = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
        const terminalDecision = normalizePersistedToken(lifecycle.terminalDecision);
        return fitPersistedLifecycleToExcelCell({
            version: PERSISTED_LIFECYCLE_VERSION,
            contextSignature: sanitizePersistedString(
                lifecycle.contextSignature,
                MAX_SIGNATURE_LENGTH
            ),
            findingFingerprint: sanitizePersistedString(
                lifecycle.findingFingerprint,
                MAX_SIGNATURE_LENGTH
            ),
            terminalDecision: PERSISTED_TERMINAL_DECISIONS.has(terminalDecision)
                ? terminalDecision
                : '',
            reason: sanitizePersistedString(lifecycle.reason, MAX_REASON_LENGTH),
            candidateSnapshot: sanitizeCandidateSnapshot(
                lifecycle.candidateSnapshot ?? lifecycle.candidate
            ),
            candidateQa: sanitizeCandidateQa(lifecycle.candidateQa ?? lifecycle.candidateQA),
            contentCandidates: normalizeClampedInteger(
                lifecycle.contentCandidates,
                MAX_PERSISTED_CONTENT_CANDIDATES
            ),
            noContentSubstitutes: normalizeClampedInteger(
                lifecycle.noContentSubstitutes,
                MAX_PERSISTED_NO_CONTENT_SUBSTITUTES
            )
        });
    }

    function createPersistedLifecycle(input = {}) {
        return sanitizePersistedLifecycle(input);
    }

    function isPersistedLifecycleFrozen(value, options = {}) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
        const lifecycle = sanitizePersistedLifecycle(value);
        const contextSignature = sanitizePersistedString(
            options?.contextSignature,
            MAX_SIGNATURE_LENGTH
        );
        if (
            !lifecycle.contextSignature ||
            !contextSignature ||
            lifecycle.contextSignature !== contextSignature ||
            !PERSISTED_TERMINAL_DECISIONS.has(lifecycle.terminalDecision)
        ) {
            return false;
        }
        if (Object.prototype.hasOwnProperty.call(options || {}, 'findingFingerprint')) {
            const findingFingerprint = sanitizePersistedString(
                options.findingFingerprint,
                MAX_SIGNATURE_LENGTH
            );
            return lifecycle.findingFingerprint === findingFingerprint;
        }
        return true;
    }

    function incrementCounter(target, key, count = 1) {
        const amount = Math.max(0, Number(count) || 0);
        if (!amount) return;
        target[key] = Number(target[key] || 0) + amount;
    }

    function freezeCounter(value = {}) {
        return Object.freeze({ ...value });
    }

    function createLedger(options = {}) {
        const records = new Map();
        const maxContentCandidates = normalizeBoundedInteger(options.maxContentCandidates, 1, 1);
        const maxNoContentSubstitutes = normalizeBoundedInteger(options.maxNoContentSubstitutes, 1, 0);

        function get(cellId) {
            const key = String(cellId || '');
            if (!records.has(key)) {
                records.set(key, {
                    cellId: key,
                    primaryClaims: 0,
                    primaryMode: '',
                    primaryBatchClaims: 0,
                    primarySingleClaims: 0,
                    physicalRequests: 0,
                    physicalRequestsByKind: {},
                    contentCandidates: 0,
                    candidatesBySource: {},
                    substitutes: 0,
                    noContentSubstitutes: 0,
                    terminal: '',
                    phase: '',
                    decision: '',
                    logicalCommitted: false,
                    logicalCommits: 0
                });
            }
            return records.get(key);
        }

        function peek(cellId) {
            return records.get(String(cellId || '')) || null;
        }

        function canClaimPrimary(cellId) {
            const record = get(cellId);
            return !record.terminal &&
                record.primaryClaims === 0 &&
                record.contentCandidates < maxContentCandidates;
        }

        function claimPrimary(cellId, phase = 'repair', mode = PRIMARY_BATCH) {
            const record = get(cellId);
            if (!canClaimPrimary(cellId)) return false;
            const normalizedMode = normalizePrimaryMode(mode);
            record.primaryClaims = 1;
            record.primaryMode = normalizedMode;
            record.primaryBatchClaims = normalizedMode === PRIMARY_BATCH ? 1 : 0;
            record.primarySingleClaims = normalizedMode === PRIMARY_SINGLE ? 1 : 0;
            record.phase = String(phase || 'repair');
            return true;
        }

        function claimPrimaryBatch(cellId, phase = 'repair') {
            return claimPrimary(cellId, phase, PRIMARY_BATCH);
        }

        function claimPrimarySingle(cellId, phase = 'repair') {
            return claimPrimary(cellId, phase, PRIMARY_SINGLE);
        }

        function setPrimaryMode(cellId, mode) {
            const record = get(cellId);
            if (record.primaryClaims !== 1 || record.contentCandidates > 0 || record.terminal) return false;
            const normalizedMode = normalizePrimaryMode(mode);
            record.primaryMode = normalizedMode;
            record.primaryBatchClaims = normalizedMode === PRIMARY_BATCH ? 1 : 0;
            record.primarySingleClaims = normalizedMode === PRIMARY_SINGLE ? 1 : 0;
            return true;
        }

        function recordPhysicalRequest(cellId, kindOrCount = 'unspecified', count = 1) {
            const record = get(cellId);
            if (record.terminal) return false;
            const legacyCount = typeof kindOrCount === 'number';
            const kind = legacyCount ? 'unspecified' : normalizeRequestKind(kindOrCount);
            const amount = Math.max(0, Number(legacyCount ? kindOrCount : count) || 0);
            if (!amount) return false;
            record.physicalRequests += amount;
            incrementCounter(record.physicalRequestsByKind, kind, amount);
            return true;
        }

        function recordCandidate(cellId, source = 'primary') {
            const record = get(cellId);
            if (
                record.terminal ||
                record.primaryClaims === 0 ||
                record.contentCandidates >= maxContentCandidates
            ) {
                return false;
            }
            record.contentCandidates += 1;
            incrementCounter(record.candidatesBySource, normalizeRequestKind(source), 1);
            return true;
        }

        function canClaimNoContentSubstitute(cellId) {
            const record = get(cellId);
            return !record.terminal &&
                record.primaryClaims === 1 &&
                record.contentCandidates === 0 &&
                record.noContentSubstitutes < maxNoContentSubstitutes;
        }

        function claimNoContentSubstitute(cellId) {
            const record = get(cellId);
            if (!canClaimNoContentSubstitute(cellId)) return false;
            record.noContentSubstitutes += 1;
            record.substitutes = record.noContentSubstitutes;
            return true;
        }

        function settle(cellId, terminal, decision = '') {
            const record = get(cellId);
            if (!record.terminal) {
                record.terminal = String(terminal || 'rejected');
                record.decision = String(decision || '');
            }
            return record;
        }

        function markCommitted(cellId) {
            const record = get(cellId);
            if (record.logicalCommitted) return false;
            record.logicalCommitted = true;
            record.logicalCommits = 1;
            return true;
        }

        function canScheduleRepair(cellId) {
            return canClaimPrimary(cellId);
        }

        function summarize() {
            const values = [...records.values()];
            const terminals = {};
            const primaryModes = {};
            const physicalRequestsByKind = {};
            const candidatesBySource = {};

            values.forEach(record => {
                incrementCounter(terminals, record.terminal || 'active', 1);
                if (record.primaryMode) incrementCounter(primaryModes, record.primaryMode, 1);
                Object.entries(record.physicalRequestsByKind || {}).forEach(([kind, count]) => {
                    incrementCounter(physicalRequestsByKind, kind, count);
                });
                Object.entries(record.candidatesBySource || {}).forEach(([source, count]) => {
                    incrementCounter(candidatesBySource, source, count);
                });
            });

            const logicalCommits = values.reduce((sum, record) => sum + Number(record.logicalCommits || 0), 0);
            const terminalCells = values.filter(record => Boolean(record.terminal)).length;
            return Object.freeze({
                policyVersion: POLICY_VERSION,
                cells: values.length,
                activeCells: values.length - terminalCells,
                terminalCells,
                primaryClaims: values.reduce((sum, record) => sum + record.primaryClaims, 0),
                primaryBatchClaims: values.reduce((sum, record) => sum + record.primaryBatchClaims, 0),
                primarySingleClaims: values.reduce((sum, record) => sum + record.primarySingleClaims, 0),
                primaryModes: freezeCounter(primaryModes),
                physicalRequests: values.reduce((sum, record) => sum + record.physicalRequests, 0),
                physicalRequestsByKind: freezeCounter(physicalRequestsByKind),
                contentCandidates: values.reduce((sum, record) => sum + record.contentCandidates, 0),
                candidatesBySource: freezeCounter(candidatesBySource),
                substitutes: values.reduce((sum, record) => sum + record.noContentSubstitutes, 0),
                noContentSubstitutes: values.reduce((sum, record) => sum + record.noContentSubstitutes, 0),
                logicalCommits,
                committedCells: values.filter(record => record.logicalCommitted).length,
                terminals: freezeCounter(terminals)
            });
        }

        return Object.freeze({
            get,
            peek,
            canClaimPrimary,
            claimPrimary,
            claimPrimaryBatch,
            claimPrimarySingle,
            setPrimaryMode,
            recordPhysicalRequest,
            recordCandidate,
            canClaimNoContentSubstitute,
            claimNoContentSubstitute,
            settle,
            markCommitted,
            canScheduleRepair,
            summarize
        });
    }

    root.NexusTranslationRepairAttemptPolicy = Object.freeze({
        POLICY_VERSION,
        PERSISTED_LIFECYCLE_VERSION,
        PRIMARY_BATCH,
        PRIMARY_SINGLE,
        NO_CONTENT_SUBSTITUTE,
        TERMINAL_DECISIONS,
        sanitizePersistedLifecycle,
        createPersistedLifecycle,
        isPersistedLifecycleFrozen,
        createLedger
    });
})(typeof globalThis !== 'undefined' ? globalThis : window);
