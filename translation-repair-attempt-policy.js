/* Run-scoped per-cell repair attempt ledger. */
(function installNexusTranslationRepairAttemptPolicy(root) {
    'use strict';

    const POLICY_VERSION = '1.1.0';
    const PRIMARY_BATCH = 'primary_batch';
    const PRIMARY_SINGLE = 'primary_single';
    const NO_CONTENT_SUBSTITUTE = 'no_content_substitute';

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
        PRIMARY_BATCH,
        PRIMARY_SINGLE,
        NO_CONTENT_SUBSTITUTE,
        createLedger
    });
})(typeof globalThis !== 'undefined' ? globalThis : window);
