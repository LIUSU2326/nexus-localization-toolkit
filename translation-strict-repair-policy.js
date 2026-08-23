/*
 * Strict translation-repair loop policy.
 *
 * This module intentionally has no DOM, workbook, or provider dependencies.
 * It owns the bounded wave, loop termination, and candidate acceptance rules
 * used when a caller repeatedly repairs blocking mixed-Chinese QA findings.
 */
(function installNexusTranslationStrictRepairPolicy(root) {
    'use strict';

    const DEFAULT_WAVE_SIZE = 60;
    const DEFAULT_MAX_ATTEMPTS = 2;
    const DEFAULT_MAX_NO_PROGRESS_SWEEPS = 2;
    const SOFT_CHINESE_SOURCE_REVIEW_PATTERN = /与中文原文高度一致/;
    const STRICT_MIXED_CHINESE_PATTERNS = Object.freeze([
        /混入(?:简体|繁体)?中文(?:汉字|字符|文本|简体字)?/,
        /(?:简体|繁体)?中文(?:汉字|字符|文本|简体字)?(?:仍)?残留/,
        /残留(?:了)?(?:简体|繁体)?中文(?:汉字|字符|文本|简体字)?/,
        /仍含(?:有)?(?:简体|繁体)?中文(?:汉字|字符|文本|简体字)?/,
        /(?:简体|繁体)?中文(?:汉字|字符|文本|简体字)?(?:尚未|未被|没有被)翻译/,
        /与中文原文(?:完全)?相同/,
        /与中文原文完全一致/,
        /疑似(?:照抄|复制)中文原文/
    ]);

    function normalizePositiveInteger(value, fallback, cap = Number.POSITIVE_INFINITY) {
        if (value === undefined || value === null || value === '') return fallback;
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) return fallback;
        return Math.max(0, Math.min(cap, Math.floor(numeric)));
    }

    function splitQaText(value) {
        return String(value ?? '')
            .split(/[；;\r\n]+/)
            .map(segment => segment.replace(/^\s*需确认\s*[:：]\s*/, '').trim())
            .filter(Boolean);
    }

    function isStrictMixedChineseIssueText(text) {
        return splitQaText(text).some(segment => {
            if (SOFT_CHINESE_SOURCE_REVIEW_PATTERN.test(segment)) return false;
            return STRICT_MIXED_CHINESE_PATTERNS.some(pattern => pattern.test(segment));
        });
    }

    function isStrictMixedChineseGuardResult(result) {
        if (!result || String(result.kind || '').toLowerCase() !== 'block') return false;
        const code = String(result.code || '').trim().toLowerCase();
        return code === 'target_source_copy' || /chinese_residual$/.test(code);
    }

    function getRepairJobKey(job, index, options = {}) {
        if (typeof options.getKey === 'function') return options.getKey(job, index);
        if (job && typeof job === 'object') {
            return job.taskKey ?? job.id ?? job.key ?? job;
        }
        return job ?? index;
    }

    function getAttemptCount(attemptsMap, key, job) {
        let value;
        if (attemptsMap instanceof Map) {
            value = attemptsMap.has(key) ? attemptsMap.get(key) : attemptsMap.get(job);
        } else if (typeof attemptsMap === 'function') {
            value = attemptsMap(key, job);
        } else if (attemptsMap && typeof attemptsMap === 'object') {
            value = attemptsMap[key];
        }
        const numeric = Number(value);
        return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : 0;
    }

    function rankEligibleRepairJobs(jobs = [], attemptsMap = new Map(), options = {}) {
        const maxAttempts = normalizePositiveInteger(
            options.maxAttempts,
            DEFAULT_MAX_ATTEMPTS,
            DEFAULT_MAX_ATTEMPTS
        );
        return (Array.isArray(jobs) ? jobs : [])
            .map((job, index) => {
                const key = getRepairJobKey(job, index, options);
                return {
                    job,
                    index,
                    attempts: getAttemptCount(attemptsMap, key, job)
                };
            })
            .filter(item => item.attempts < maxAttempts)
            .sort((left, right) => left.attempts - right.attempts || left.index - right.index);
    }

    function selectRepairWave(jobs = [], attemptsMap = new Map(), options = {}) {
        const waveSize = normalizePositiveInteger(
            options.waveSize,
            DEFAULT_WAVE_SIZE,
            DEFAULT_WAVE_SIZE
        );
        if (waveSize === 0) return [];
        return rankEligibleRepairJobs(jobs, attemptsMap, options)
            .slice(0, waveSize)
            .map(item => item.job);
    }

    function normalizeSplitRepairArguments(attemptsMap, options) {
        if (typeof attemptsMap === 'number') {
            return {
                attemptsMap: new Map(),
                options: { ...options, waveSize: attemptsMap }
            };
        }
        const looksLikeOptions = attemptsMap &&
            !(attemptsMap instanceof Map) &&
            typeof attemptsMap === 'object' &&
            ['waveSize', 'maxAttempts', 'getKey', 'attemptsMap'].some(key =>
                Object.prototype.hasOwnProperty.call(attemptsMap, key)
            ) &&
            (!options || Object.keys(options).length === 0);
        if (looksLikeOptions) {
            return {
                attemptsMap: attemptsMap.attemptsMap || new Map(),
                options: attemptsMap
            };
        }
        return { attemptsMap: attemptsMap || new Map(), options: options || {} };
    }

    function splitRepairWaves(jobs = [], attemptsMap = new Map(), options = {}) {
        const normalized = normalizeSplitRepairArguments(attemptsMap, options);
        const waveSize = normalizePositiveInteger(
            normalized.options.waveSize,
            DEFAULT_WAVE_SIZE,
            DEFAULT_WAVE_SIZE
        );
        if (waveSize === 0) return [];
        const rankedJobs = rankEligibleRepairJobs(
            jobs,
            normalized.attemptsMap,
            normalized.options
        ).map(item => item.job);
        const waves = [];
        for (let index = 0; index < rankedJobs.length; index += waveSize) {
            waves.push(rankedJobs.slice(index, index + waveSize));
        }
        return waves;
    }

    function normalizeFingerprint(value) {
        if (value === undefined || value === null || value === '') return '';
        return String(value);
    }

    function isTwoCycle(history = [], next) {
        const values = (Array.isArray(history) ? history : [])
            .map(normalizeFingerprint)
            .filter(Boolean);
        const candidate = normalizeFingerprint(next);
        if (!candidate || values.length < 2) return false;
        return candidate === values[values.length - 2] &&
            candidate !== values[values.length - 1];
    }

    function normalizeCount(value, fallback = 0) {
        const numeric = Number(value);
        return Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : fallback;
    }

    function advanceLoopState(state = {}, beforeCount, afterCount, afterFingerprint) {
        const before = normalizeCount(beforeCount);
        const after = normalizeCount(afterCount, before);
        const previousHistory = Array.isArray(state.fingerprintHistory)
            ? state.fingerprintHistory.map(normalizeFingerprint).filter(Boolean)
            : [];
        const fingerprint = normalizeFingerprint(afterFingerprint);
        const oscillating = isTwoCycle(previousHistory, fingerprint);
        const madeProgress = after < before;
        const noProgressSweeps = after === 0 || madeProgress
            ? 0
            : normalizeCount(state.noProgressSweeps) + 1;
        const maxNoProgressSweeps = Math.max(1, normalizePositiveInteger(
            state.maxNoProgressSweeps,
            DEFAULT_MAX_NO_PROGRESS_SWEEPS
        ));
        const fingerprintHistory = fingerprint
            ? [...previousHistory.slice(-1), fingerprint]
            : previousHistory;

        let status = 'continue';
        if (after === 0) {
            status = 'cleared';
        } else if (oscillating) {
            status = 'oscillating';
        } else if (noProgressSweeps >= maxNoProgressSweeps) {
            status = 'stalled';
        }

        return {
            ...state,
            status,
            beforeCount: before,
            afterCount: after,
            noProgressSweeps,
            fingerprintHistory
        };
    }

    function normalizeQaIssueKey(value) {
        return String(value || '')
            .replace(/^\s*需确认\s*[:：]\s*/, '')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
    }

    function getHardIssueCategory(value) {
        const text = normalizeQaIssueKey(value);
        const categories = [
            ['placeholder', /格式|占位符|受保护ui标记|标签缺失|标签被翻译/],
            ['number', /数字不一致/],
            ['discount', /折扣语义不一致|折扣翻译缺失/],
            ['terminology', /术语未遵守/],
            ['english_residual', /混入英文|疑似照抄英文|目标译文仍含英文|玩法名疑似沿用英文/],
            ['foreign_script', /混入日文|混入韩文|目标.+中混入/],
            ['untranslated', /疑似未翻译|与.+原文相同|繁简转换不完整|繁中关键语义缺失/],
            ['spacing', /逐字空格/],
            ['transport', /模型翻译失败|输出被截断|返回空译文|请求超时|限流|网络异常|通道异常/],
            ['completeness', /疑似内容流失|疑似译文过短/],
            ['manual', /用户要求重新翻译|修订译文为空|硬错误不能直接接受/]
        ];
        return categories.find(([, pattern]) => pattern.test(text))?.[0] || '';
    }

    function collectQaIssueDescriptors(value) {
        if (value === undefined || value === null || value === '') return [];
        if (Array.isArray(value)) return value.flatMap(collectQaIssueDescriptors);
        if (typeof value === 'object') {
            if (Array.isArray(value.issues)) {
                return value.issues.flatMap(collectQaIssueDescriptors);
            }
            if ('kind' in value || 'code' in value) {
                const code = normalizeQaIssueKey(value.code);
                const message = normalizeQaIssueKey(value.message || value.qaStatus);
                const strictMixedChinese = isStrictMixedChineseGuardResult(value);
                const kind = normalizeQaIssueKey(value.kind);
                if (!strictMixedChinese && kind && kind !== 'block') return [];
                const category = getHardIssueCategory(code) || getHardIssueCategory(message);
                if (!strictMixedChinese && !category) return [];
                return [{
                    key: strictMixedChinese ? `target:${code || message}` : `category:${category}`,
                    strictMixedChinese
                }];
            }
            if ('qaStatus' in value) return collectQaIssueDescriptors(value.qaStatus);
            return [];
        }
        return splitQaText(value)
            .filter(segment => !/^(?:通过|pass)$/i.test(segment))
            .map(segment => {
                const strictMixedChinese = isStrictMixedChineseIssueText(segment);
                const category = strictMixedChinese ? 'mixed_chinese' : getHardIssueCategory(segment);
                if (!category) return null;
                return {
                    key: `category:${category}`,
                    strictMixedChinese
                };
            })
            .filter(Boolean);
    }

    function dedupeQaIssueDescriptors(descriptors = []) {
        const seen = new Set();
        return descriptors.filter(issue => {
            const key = `${issue.strictMixedChinese ? 'target' : 'other'}:${issue.key}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    function shouldAcceptMixedChineseCandidate(previousQa, nextQa) {
        const previousIssues = dedupeQaIssueDescriptors(collectQaIssueDescriptors(previousQa));
        const nextIssues = dedupeQaIssueDescriptors(collectQaIssueDescriptors(nextQa));
        const previousTargetIssues = previousIssues.filter(issue => issue.strictMixedChinese);
        const nextTargetIssues = nextIssues.filter(issue => issue.strictMixedChinese);
        if (!previousTargetIssues.length || nextTargetIssues.length >= previousTargetIssues.length) {
            return false;
        }

        const previousNonTargetKeys = new Set(
            previousIssues
                .filter(issue => !issue.strictMixedChinese)
                .map(issue => issue.key)
        );
        return nextIssues
            .filter(issue => !issue.strictMixedChinese)
            .every(issue => previousNonTargetKeys.has(issue.key));
    }

    root.NexusTranslationStrictRepairPolicy = Object.freeze({
        DEFAULT_WAVE_SIZE,
        DEFAULT_MAX_ATTEMPTS,
        DEFAULT_MAX_NO_PROGRESS_SWEEPS,
        isStrictMixedChineseIssueText,
        isStrictMixedChineseGuardResult,
        selectRepairWave,
        splitRepairWaves,
        isTwoCycle,
        advanceLoopState,
        shouldAcceptMixedChineseCandidate
    });
})(typeof globalThis !== 'undefined' ? globalThis : window);
