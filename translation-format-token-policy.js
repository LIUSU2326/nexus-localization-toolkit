/* Deterministic placeholder and structural-format comparison. */
(function installNexusTranslationFormatTokenPolicy(root) {
    'use strict';

    const POLICY_VERSION = '2.0.0';
    const TOKEN_SPECS = Object.freeze([
        { family: 'protected', pattern: /__PH_\d+__/g, alwaysHardExtra: true },
        { family: 'printf', pattern: /%(?:\d+\$)?[-+#0]*(?:\d+)?(?:\.\d+)?(?:ll|l|h)?[sdifux@]/g, alwaysHardExtra: true },
        { family: 'newline', pattern: /\\n/g, alwaysHardExtra: true },
        { family: 'html', pattern: /<\/?[A-Za-z][^>]*>/g, alwaysHardExtra: true, ordered: true },
        { family: 'curly', pattern: /\{(?:\d+|[A-Za-z_][A-Za-z0-9_.:-]*)\}/g, alwaysHardExtra: false },
        { family: 'bracket', pattern: /\[[A-Z][A-Z0-9_]{1,}\]/g, alwaysHardExtra: false }
    ]);

    function extract(text = '') {
        const value = String(text || '');
        const tokens = [];
        TOKEN_SPECS.forEach(spec => {
            const pattern = new RegExp(spec.pattern.source, spec.pattern.flags);
            for (const match of value.matchAll(pattern)) {
                tokens.push({
                    value: match[0],
                    family: spec.family,
                    index: match.index,
                    alwaysHardExtra: Boolean(spec.alwaysHardExtra),
                    ordered: Boolean(spec.ordered)
                });
            }
        });
        return tokens.sort((left, right) => left.index - right.index || right.value.length - left.value.length)
            .filter((token, index, all) => !all.slice(0, index).some(previous =>
                token.index >= previous.index && token.index + token.value.length <= previous.index + previous.value.length
            ));
    }

    function countByKey(tokens = []) {
        return tokens.reduce((map, token) => {
            const key = `${token.family}\u001f${token.value}`;
            map.set(key, (map.get(key) || 0) + 1);
            return map;
        }, new Map());
    }

    function expandDifference(leftCounts, rightCounts) {
        const values = [];
        leftCounts.forEach((count, key) => {
            const other = rightCounts.get(key) || 0;
            const value = key.split('\u001f').slice(1).join('\u001f');
            for (let index = other; index < count; index++) values.push(value);
        });
        return values;
    }

    function evaluate(sourceText = '', targetText = '') {
        const sourceTokens = extract(sourceText);
        const targetTokens = extract(targetText);
        const sourceCounts = countByKey(sourceTokens);
        const targetCounts = countByKey(targetTokens);
        const missing = expandDifference(sourceCounts, targetCounts);
        const rawExtra = expandDifference(targetCounts, sourceCounts);
        const sourceFamilies = new Set(sourceTokens.map(token => token.family));
        const extraHard = [];
        const extraReview = [];
        rawExtra.forEach(value => {
            const token = targetTokens.find(item => item.value === value);
            if (token?.alwaysHardExtra || sourceFamilies.has(token?.family)) extraHard.push(value);
            else extraReview.push(value);
        });

        const hardIssues = [];
        const reviewIssues = [];
        if (missing.length) hardIssues.push(`缺少格式/占位符：${missing.join(', ')}`);
        if (extraHard.length) hardIssues.push(`多出格式/占位符：${extraHard.join(', ')}`);
        if (extraReview.length) reviewIssues.push(`格式符号需确认：目标新增 ${extraReview.join(', ')}`);

        const sourceOrdered = sourceTokens.filter(token => token.ordered).map(token => token.value);
        const targetOrdered = targetTokens.filter(token => token.ordered).map(token => token.value);
        if (
            !missing.length &&
            !extraHard.length &&
            sourceOrdered.length > 1 &&
            sourceOrdered.join('\u001f') !== targetOrdered.join('\u001f')
        ) {
            hardIssues.push(`格式/标签顺序不一致：应保持 ${sourceOrdered.join(' → ')}`);
        }

        return Object.freeze({
            policyVersion: POLICY_VERSION,
            hardIssues: Object.freeze(hardIssues),
            reviewIssues: Object.freeze(reviewIssues),
            sourceTokens: Object.freeze(sourceTokens),
            targetTokens: Object.freeze(targetTokens)
        });
    }

    function replaceTokens(text = '', replacer = value => value) {
        const source = String(text || '');
        const tokens = extract(source);
        if (!tokens.length) return source;
        let output = '';
        let cursor = 0;
        tokens.forEach(token => {
            output += source.slice(cursor, token.index);
            output += replacer(token.value, token);
            cursor = token.index + token.value.length;
        });
        return output + source.slice(cursor);
    }

    function mask(text = '') {
        return replaceTokens(text, token => ' '.repeat(token.length));
    }

    root.NexusTranslationFormatTokenPolicy = Object.freeze({
        POLICY_VERSION,
        extract,
        evaluate,
        replaceTokens,
        mask
    });
})(typeof globalThis !== 'undefined' ? globalThis : window);

