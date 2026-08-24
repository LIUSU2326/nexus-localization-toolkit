/* High-precision numeric invariant checks with review-only ambiguity. */
(function installNexusTranslationNumberPolicy(root) {
    'use strict';

    const POLICY_VERSION = '2.2.0';
    const profiles = root.NexusLanguageQualityProfiles;
    const formatTokens = root.NexusTranslationFormatTokenPolicy;
    // Percent signs can be written before or after the magnitude depending on
    // locale (for example Turkish "%5" and English "5%"). Both forms carry
    // the same deterministic numeric invariant.
    const TOKEN_PATTERN = /(?<![\d%])(?:%[+\-−]?\d+(?:(?:[.,]\d+)|(?:[ \u00a0]\d{3}))*|[+\-−]?\d+(?:(?:[.,]\d+)|(?:[ \u00a0]\d{3}))*(?:%)?)/g;
    const CLOCK_HOUR_SUFFIX_PATTERN = /^\s*(?:点|點|时|時)/u;

    function isUnsupportedLeadingDecimal(input, index) {
        const separator = input[index - 1];
        if (separator !== '.' && separator !== ',') return false;
        const beforeSeparator = input[index - 2] || '';
        return !beforeSeparator || /[\s([\]{}<>:=+\-−]/u.test(beforeSeparator);
    }

    function normalizeBodyValue(value) {
        const [integerPart = '0', fractionPart = ''] = String(value || '').split('.');
        const integer = integerPart.replace(/^0+(?=\d)/, '') || '0';
        const fraction = fractionPart.replace(/0+$/, '');
        return fraction ? `${integer}.${fraction}` : integer;
    }

    function getBodyCandidates(value, role = 'source', targetLang = '') {
        const compact = String(value || '').replace(/[\s\u00a0]/g, '');
        const separators = [...compact.matchAll(/[.,]/g)].map(match => ({ value: match[0], index: match.index }));
        if (!separators.length) return [normalizeBodyValue(compact)];
        const unique = new Set(separators.map(item => item.value));
        if (unique.size > 1) {
            const decimal = separators[separators.length - 1];
            const normalized = compact.split('')
                .filter((char, index) => !/[.,]/.test(char) || index === decimal.index)
                .join('')
                .replace(decimal.value, '.');
            return [normalizeBodyValue(normalized)];
        }
        const separator = separators[0].value;
        const groups = compact.split(separator);
        const grouped = groups.length > 1 && groups[0] !== '0' && groups.slice(1).every(group => group.length === 3);
        const decimalValue = normalizeBodyValue(compact.replaceAll(separator, '.'));
        const groupedValue = normalizeBodyValue(groups.join(''));
        if (groups.length > 2 && grouped) return [groupedValue];
        if (role === 'source') return separator === ',' && grouped ? [groupedValue] : [decimalValue];
        const profile = profiles?.getProfile?.(targetLang);
        const decimalSeparators = new Set(profile?.numberSeparators?.decimal || ['.']);
        const groupingSeparators = new Set(profile?.numberSeparators?.grouping || [',', ' ', '\u00a0']);
        if (groupingSeparators.has(separator) && grouped) return [groupedValue];
        if (decimalSeparators.has(separator)) return [decimalValue];
        return grouped ? [...new Set([decimalValue, groupedValue])] : [decimalValue];
    }

    function extract(text = '', role = 'source', targetLang = '') {
        const input = String(text || '');
        const details = [];
        for (const match of input.matchAll(TOKEN_PATTERN)) {
            // A period/comma can separate a UI label or sentence from its number
            // (for example, "Lv.50" or "Text.2"). The old lookbehind dropped
            // those numbers entirely. Preserve the previous behavior for bare
            // leading decimals such as ".5" until they have explicit locale
            // normalization instead of misreading them as the integer 5.
            if (isUnsupportedLeadingDecimal(input, match.index)) continue;
            const raw = match[0];
            const percentPrefix = raw.startsWith('%');
            const percentSuffix = raw.endsWith('%');
            const numericStart = percentPrefix ? 1 : 0;
            const signRaw = raw[numericStart] || '';
            const sign = /^[+\-−]$/.test(signRaw) ? signRaw.replace('−', '-') : '';
            const percent = percentPrefix || percentSuffix;
            const unsigned = raw.slice(
                numericStart + (sign ? 1 : 0),
                percentSuffix ? -1 : undefined
            );
            const comparatorText = input.slice(Math.max(0, match.index - 3), match.index);
            const comparatorMatch = comparatorText.match(/(?:>=|<=|>|<|≥|≤)\s*$/);
            const comparatorRaw = comparatorMatch?.[0]?.trim() || '';
            const comparator = ({ '>=': '≥', '<=': '≤' })[comparatorRaw] || comparatorRaw;
            const prefix = input.slice(Math.max(0, match.index - 1), match.index);
            const separatorCount = (unsigned.match(/[.,]/g) || []).length;
            const codeLike = /[A-Za-z_#]/.test(prefix) || (
                separatorCount > 1 && !/^[\d]+(?:([.,])\d{3})(?:\1\d{3})+$/.test(unsigned)
            );
            const bodies = codeLike
                ? [unsigned.replace(/[\s\u00a0]/g, '')]
                : getBodyCandidates(unsigned, role, targetLang);
            details.push({
                raw,
                bodies,
                magnitudeKeys: bodies.map(body => `${body}${percent ? '%' : ''}`),
                sign,
                comparator,
                percent,
                reviewOnlyWhenMissing: role === 'source' && CLOCK_HOUR_SUFFIX_PATTERN.test(input.slice(match.index + raw.length)),
                index: match.index,
                end: match.index + raw.length
            });
        }
        return details;
    }

    function matchSourceToTarget(sourceTokens, targetTokens) {
        const used = new Set();
        const matches = [];
        const missing = [];
        sourceTokens.forEach(source => {
            const targetIndex = targetTokens.findIndex((target, index) =>
                !used.has(index) && source.magnitudeKeys.some(key => target.magnitudeKeys.includes(key))
            );
            if (targetIndex < 0) missing.push(source);
            else {
                used.add(targetIndex);
                matches.push({ source, target: targetTokens[targetIndex], targetIndex });
            }
        });
        return { used, matches, missing };
    }

    function extractRangePairs(text, tokens) {
        const input = String(text || '');
        const pairs = [];
        for (let index = 0; index < tokens.length - 1; index++) {
            const left = tokens[index];
            const right = tokens[index + 1];
            const separator = input.slice(left.end, right.index);
            if (/(?:至|到|~|～|–|—|\.\.\.|…|\bto\b|\bbis\b|\bdo\b|\bhasta\b|\baté\b|\btot\b|\bsampai\b|\bđến\b|\bal\b|\bile\b)/iu.test(separator) || /^\s*-\s*$/.test(separator)) {
                pairs.push([left.magnitudeKeys[0], right.magnitudeKeys[0]]);
            }
        }
        return pairs;
    }

    function evaluate(sourceText = '', targetText = '', targetLang = '') {
        // Numeric attributes inside placeholders and markup belong to the
        // format-token policy. Masking them here prevents one missing tag from
        // producing a second, misleading numeric blocker.
        const sourceInput = formatTokens?.mask ? formatTokens.mask(sourceText) : String(sourceText || '');
        const targetInput = formatTokens?.mask ? formatTokens.mask(targetText) : String(targetText || '');
        const sourceTokens = extract(sourceInput, 'source', targetLang);
        const targetTokens = extract(targetInput, 'target', targetLang);
        const matching = matchSourceToTarget(sourceTokens, targetTokens);
        const hardIssues = [];
        const reviewIssues = [];

        const collapsedDuplicateRequirements = matching.missing.filter(source =>
            targetTokens.some(target => source.magnitudeKeys.some(key => target.magnitudeKeys.includes(key)))
        );
        // Clock hours can be rendered as words (for example, 0点 -> midnight).
        // Without a language-aware semantic parser, absence of the digit is not
        // deterministic enough to trigger AI repair or block delivery.
        const semanticReviewRequirements = matching.missing.filter(token =>
            token.reviewOnlyWhenMissing && !collapsedDuplicateRequirements.includes(token)
        );
        const hardMissing = matching.missing.filter(token =>
            !collapsedDuplicateRequirements.includes(token) && !semanticReviewRequirements.includes(token)
        );
        if (hardMissing.length) {
            hardIssues.push(`数字不一致：缺少 ${hardMissing.map(token => token.magnitudeKeys[0]).join(', ')}`);
        }
        if (collapsedDuplicateRequirements.length) {
            reviewIssues.push(`数字重复约束需确认：${collapsedDuplicateRequirements.map(token => token.magnitudeKeys[0]).join(', ')}`);
        }
        if (semanticReviewRequirements.length) {
            reviewIssues.push(`数字表达需确认：时间数字 ${semanticReviewRequirements.map(token => token.magnitudeKeys[0]).join(', ')} 可能使用了文字表达`);
        }
        const extras = targetTokens.filter((_token, index) => !matching.used.has(index));
        if (extras.length) {
            reviewIssues.push(`数字表达需确认：目标新增 ${extras.map(token => token.magnitudeKeys[0]).join(', ')}`);
        }

        matching.matches.forEach(({ source, target }) => {
            if (source.sign && target.sign && source.sign !== target.sign) {
                hardIssues.push(`数字符号不一致：${source.raw} → ${target.raw}`);
            } else if (source.sign && !target.sign) {
                reviewIssues.push(`数字符号需确认：${source.raw} → ${target.raw}`);
            }
            if (source.comparator && target.comparator && source.comparator !== target.comparator) {
                hardIssues.push(`数字比较方向不一致：${source.comparator} → ${target.comparator}`);
            } else if (source.comparator && !target.comparator) {
                reviewIssues.push(`数字比较表达需确认：${source.comparator}${source.raw}`);
            }
        });

        const sourceRanges = extractRangePairs(sourceInput, sourceTokens);
        sourceRanges.forEach(([start, end]) => {
            if (start === end) return;
            const hasOrdered = targetTokens.some((startToken, startIndex) =>
                startToken.magnitudeKeys.includes(start) && targetTokens.some((endToken, endIndex) =>
                    endIndex > startIndex && endToken.magnitudeKeys.includes(end)
                )
            );
            const hasReversed = targetTokens.some((endToken, endIndex) =>
                endToken.magnitudeKeys.includes(end) && targetTokens.some((startToken, startIndex) =>
                    startIndex > endIndex && startToken.magnitudeKeys.includes(start)
                )
            );
            if (!hasOrdered && hasReversed) hardIssues.push(`数字区间方向不一致：应保持 ${start} → ${end}`);
        });

        return Object.freeze({
            policyVersion: POLICY_VERSION,
            profileVersion: profiles?.PROFILE_VERSION || '',
            hardIssues: Object.freeze([...new Set(hardIssues)]),
            reviewIssues: Object.freeze([...new Set(reviewIssues)]),
            sourceTokens: Object.freeze(sourceTokens),
            targetTokens: Object.freeze(targetTokens)
        });
    }

    root.NexusTranslationNumberPolicy = Object.freeze({
        POLICY_VERSION,
        extract,
        evaluate
    });
})(typeof globalThis !== 'undefined' ? globalThis : window);
