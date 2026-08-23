/*
 * Translation delivery and report-decision policy.
 *
 * This module intentionally has no DOM, workbook, or provider dependencies so
 * the desktop workflow can use one tested policy for report import, delivery
 * gating, and auto-save behavior.
 */
(function installNexusTranslationDeliveryPolicy(root) {
    'use strict';

    const DECISIONS = Object.freeze({
        PENDING: '',
        ACCEPT_CURRENT: 'accept_current',
        MUST_RETRY: 'must_retry',
        USE_REVISION: 'use_revision'
    });

    const DECISION_LABELS = Object.freeze({
        [DECISIONS.PENDING]: '',
        [DECISIONS.ACCEPT_CURRENT]: '接受现译',
        [DECISIONS.MUST_RETRY]: '必须重译',
        [DECISIONS.USE_REVISION]: '使用修订译文'
    });

    function normalizeDecision(value) {
        const normalized = String(value || '')
            .trim()
            .toLowerCase()
            .replace(/[\s-]+/g, '_');
        if (!normalized || ['pending', '待处理', '未处理'].includes(normalized)) {
            return DECISIONS.PENDING;
        }
        if ([
            'accept_current', 'accept', 'accepted', 'keep', 'keep_current',
            '接受现译', '接受当前译文', '保留现译', '保留当前译文'
        ].includes(normalized)) {
            return DECISIONS.ACCEPT_CURRENT;
        }
        if ([
            'must_retry', 'retry', 'retranslate', 'must_retranslate',
            '必须重译', '重新翻译', '要求重译', '补跑'
        ].includes(normalized)) {
            return DECISIONS.MUST_RETRY;
        }
        if ([
            'use_revision', 'revision', 'use_revised', 'use_revised_translation',
            '使用修订译文', '采用修订译文', '使用修改译文'
        ].includes(normalized)) {
            return DECISIONS.USE_REVISION;
        }
        return DECISIONS.PENDING;
    }

    function getDecisionLabel(value) {
        return DECISION_LABELS[normalizeDecision(value)] || '';
    }

    function selectImportedTranslation(entry = {}) {
        const currentText = String(entry.translatedText || '');
        const revisedText = String(entry.revisedText || entry.revisionText || '').trim();
        const explicitDecision = normalizeDecision(entry.userDecision || entry.decision);
        const decision = explicitDecision || (revisedText ? DECISIONS.USE_REVISION : DECISIONS.PENDING);

        if (decision === DECISIONS.USE_REVISION) {
            return {
                decision,
                candidateText: revisedText,
                revisionApplied: Boolean(revisedText),
                forceRetry: false,
                acceptRequested: false,
                decisionError: revisedText ? '' : '已选择“使用修订译文”，但修订译文为空'
            };
        }
        if (decision === DECISIONS.MUST_RETRY) {
            return {
                decision,
                candidateText: currentText,
                revisionApplied: false,
                forceRetry: true,
                acceptRequested: false,
                decisionError: ''
            };
        }
        if (decision === DECISIONS.ACCEPT_CURRENT) {
            return {
                decision,
                candidateText: currentText,
                revisionApplied: false,
                forceRetry: false,
                acceptRequested: true,
                decisionError: currentText ? '' : '当前没有译文，不能选择“接受现译”'
            };
        }
        return {
            decision: DECISIONS.PENDING,
            candidateText: currentText,
            revisionApplied: false,
            forceRetry: false,
            acceptRequested: false,
            decisionError: ''
        };
    }

    function canAcceptCurrentKind(kind) {
        return ['success', 'soft', 'length'].includes(String(kind || '').toLowerCase());
    }

    function isManualResolutionValid(decision, kind, qaPassed = false) {
        const normalized = normalizeDecision(decision);
        if (normalized === DECISIONS.ACCEPT_CURRENT) return canAcceptCurrentKind(kind);
        if (normalized === DECISIONS.USE_REVISION) return Boolean(qaPassed);
        return false;
    }

    function mergeDecisionFields(entry = {}, overlay = {}) {
        const overlayDecision = String(overlay.userDecision ?? '').trim();
        const overlayRevision = String(overlay.revisedText ?? '').trim();
        const overlayNote = String(overlay.decisionNote ?? '').trim();
        const revisedText = overlayRevision || String(entry.revisedText ?? '');
        const decisionNote = overlayNote || String(entry.decisionNote ?? '');
        const rawDecision = overlayDecision || entry.userDecision || '';
        return {
            ...entry,
            userDecision: normalizeDecision(rawDecision) ||
                (revisedText.trim() ? DECISIONS.USE_REVISION : DECISIONS.PENDING),
            revisedText,
            decisionNote
        };
    }

    function buildDeliveryGate(entries = [], classifyEntry = () => 'success') {
        const blockingEntries = [];
        const kindCounts = { success: 0, soft: 0, length: 0, hard: 0, missing: 0 };
        (entries || []).forEach(entry => {
            const kind = String(classifyEntry(entry) || 'success').toLowerCase();
            if (Object.prototype.hasOwnProperty.call(kindCounts, kind)) {
                kindCounts[kind] += 1;
            }
            if (kind === 'hard' || kind === 'missing') blockingEntries.push(entry);
        });
        return {
            ready: blockingEntries.length === 0,
            blockingCount: blockingEntries.length,
            blockingEntries,
            kindCounts
        };
    }

    function getAutoSaveKinds(gate) {
        return gate?.ready
            ? ['translated', 'report']
            : ['translated_unverified', 'report'];
    }

    function getManualExportKinds(gate) {
        return gate?.ready
            ? ['translated', 'report']
            : ['translated_unverified', 'report'];
    }

    root.NexusTranslationDeliveryPolicy = Object.freeze({
        DECISIONS,
        normalizeDecision,
        getDecisionLabel,
        selectImportedTranslation,
        canAcceptCurrentKind,
        isManualResolutionValid,
        mergeDecisionFields,
        buildDeliveryGate,
        getAutoSaveKinds,
        getManualExportKinds
    });
})(typeof globalThis !== 'undefined' ? globalThis : window);
