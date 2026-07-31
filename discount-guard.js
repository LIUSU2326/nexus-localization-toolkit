/*
 * Local discount semantic guard.
 *
 * This file intentionally has no dependency on the translation providers or
 * on the DOM.  It is loaded before script.js and is used both by the
 * translation pipeline and by the small local regression button in the UI.
 */
(function installNexusDiscountGuard(root) {
    'use strict';

    const DIGIT_REPLACEMENTS = {
        '０': '0', '１': '1', '２': '2', '３': '3', '４': '4',
        '５': '5', '６': '6', '７': '7', '８': '8', '９': '9',
        '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
        '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
        '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
        '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
        '％': '%', '٪': '%', '．': '.', '，': ','
    };

    const CHINESE_DIGITS = {
        零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4,
        五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10
    };

    /*
     * Patterns are deliberately small and conservative.  A number without a
     * direction word is never auto-approved: discount wording is a monetary
     * semantic, not a generic number-preservation check.
     */
    const LOCALE_RULES = {
        en: {
            off: [/\boff\b/i, /\bdiscount(?:ed)?\b/i, /\breduction\b/i, /\bsave(?:s|d|ing)?\b/i],
            remaining: [/\bof\s+(?:the\s+)?(?:original|regular|list|full)\s+(?:price|amount|cost)\b/i, /\b(?:pay|paying)\b/i, /\bremaining\b/i],
            standalone: percent => `${percent}% off`
        },
        ja: {
            off: [/引き/, /割引/, /値引/, /オフ/, /\boff\b/i],
            remaining: [/定価の/, /元値の/, /原価の/, /価格の/, /支払/, /残り/],
            standalone: percent => `${percent}%引き`
        },
        ko: {
            off: [/할인/, /세일/, /인하/],
            remaining: [/정가의/, /원가의/, /가격의/, /지불/, /남은/],
            standalone: percent => `${percent}% 할인`
        },
        'zh-CN': {
            off: [/减免/, /减价/, /折扣/, /优惠/, /省下/, /省去/],
            remaining: [/折/, /原价的/, /定价的/, /售价的/, /支付/, /保留/],
            standalone: (_percent, fold) => `${fold}折`
        },
        'zh-TW': {
            off: [/減免/, /減價/, /折扣/, /優惠/, /省下/, /省去/],
            remaining: [/折/, /原價的/, /定價的/, /售價的/, /支付/, /保留/],
            standalone: (_percent, fold) => `${fold}折`
        },
        fr: {
            off: [/réduction/i, /remise/i, /rabais/i, /économie/i, /\boff\b/i],
            remaining: [/prix\s+(?:d['’]origine|initial|original)/i, /du prix/i, /payer/i, /reste/i],
            standalone: percent => `${percent} % de réduction`
        },
        de: {
            off: [/rabatt/i, /nachlass/i, /reduz/i, /ersparnis/i],
            remaining: [/ursprüng/i, /originalpreis/i, /vom preis/i, /zahlen/i, /übrig/i],
            standalone: percent => `${percent}% Rabatt`
        },
        es: {
            off: [/descuento/i, /rebaja/i, /reducción/i, /ahorro/i],
            remaining: [/precio\s+original/i, /del precio/i, /pagar/i, /restante/i],
            standalone: percent => `${percent}% de descuento`
        },
        pt: {
            off: [/desconto/i, /redução/i, /economia/i],
            remaining: [/preço\s+original/i, /do preço/i, /pagar/i, /restante/i],
            standalone: percent => `${percent}% de desconto`
        },
        ru: {
            off: [/скидк/i, /сниж/i, /эконом/i],
            remaining: [/исходн/i, /первоначальн/i, /цены/i, /платит/i, /остальн/i],
            standalone: percent => `скидка ${percent}%`
        },
        th: {
            off: [/ลด/, /ส่วนลด/, /ลดราคา/],
            remaining: [/ของราคาเดิม/, /ราคาเดิม/, /ราคาปกติ/, /เหลือ/, /จ่าย/],
            standalone: percent => `ลด ${percent}%`
        },
        vi: {
            off: [/giảm/i, /chiết\s*khấu/i, /giảm\s*giá/i],
            remaining: [/giá\s*gốc/i, /giá\s*ban\s*đầu/i, /còn/i, /thanh\s*toán/i],
            standalone: percent => `giảm ${percent}%`
        },
        id: {
            off: [/diskon/i, /potongan/i, /pengurangan/i],
            remaining: [/harga\s+asli/i, /harga\s+awal/i, /bayar/i, /tersisa/i],
            standalone: percent => `diskon ${percent}%`
        },
        it: {
            off: [/sconto/i, /riduz/i, /risparmio/i],
            remaining: [/prezzo\s+originale/i, /del\s+prezzo/i, /pagare/i, /rimanente/i],
            standalone: percent => `sconto del ${percent}%`
        },
        ar: {
            off: [/خصم/, /تخفيض/, /تنزيل/],
            remaining: [/السعر\s*(?:الأصلي|الأساسي)/, /دفع/, /المتبقي/],
            standalone: percent => `خصم ${percent}%`
        },
        tr: {
            off: [/indirim/i, /tasarruf/i],
            remaining: [/orijinal\s*fiyat/i, /fiyatın/i, /öde/i, /kalan/i],
            standalone: percent => `%${percent} indirim`
        },
        hi: {
            off: [/छूट/, /रियायत/, /डिस्काउंट/i],
            remaining: [/मूल\s*कीमत/, /मूल्य का/, /भुगतान/, /शेष/],
            standalone: percent => `${percent}% की छूट`
        },
        fil: {
            off: [/diskwento/i, /bawas/i, /tawad/i],
            remaining: [/orihinal\s+na\s+presyo/i, /presyo/i, /bayad/i, /natitira/i],
            standalone: percent => `${percent}% diskwento`
        },
        ms: {
            off: [/diskaun/i, /potongan/i, /jimat/i],
            remaining: [/harga\s+asal/i, /harga\s+original/i, /bayar/i, /baki/i],
            standalone: percent => `diskaun ${percent}%`
        },
        nl: {
            off: [/korting/i, /afslag/i, /besparing/i],
            remaining: [/oorspronkelijke\s+prijs/i, /van\s+de\s+prijs/i, /betalen/i, /overblij/i],
            standalone: percent => `${percent}% korting`
        },
        pl: {
            off: [/rabat/i, /zniżk/i, /obniżk/i],
            remaining: [/cena\s+wyjściowa/i, /cena\s+oryginalna/i, /zapłaci/i, /pozosta/i],
            standalone: percent => `rabat ${percent}%`
        },
        uk: {
            off: [/знижк/i, /зменш/i, /економ/i],
            remaining: [/початкової\s+ціни/i, /оригінальн/i, /сплат/i, /залиш/i],
            standalone: percent => `знижка ${percent}%`
        },
        fa: {
            off: [/تخفیف/, /کاهش/],
            remaining: [/قیمت\s*(?:اصلی|اولیه)/, /پرداخت/, /باقی/],
            standalone: percent => `تخفیف ${percent}%`
        },
        ur: {
            off: [/رعایت/, /رعایتی/, /چھوٹ/, /ڈسکاؤنٹ/i],
            remaining: [/اصل\s*قیمت/, /ادائیگی/, /باقی/],
            standalone: percent => `${percent}% رعایت`
        },
        bn: {
            off: [/ছাড়/, /ডিসকাউন্ট/i, /কম/],
            remaining: [/মূল\s*দাম/, /মূল্য/, /পরিশোধ/, /অবশিষ্ট/],
            standalone: percent => `${percent}% ছাড়`
        },
        my: {
            off: [/လျှော့စျေး/, /လျှော့/, /အလျော့/],
            remaining: [/မူလစျေး/, /မူရင်းစျေး/, /ပေးချေ/, /ကျန်/],
            standalone: percent => `${percent}% လျှော့စျေး`
        },
        km: {
            off: [/បញ្ចុះ/, /បញ្ចុះតម្លៃ/],
            remaining: [/តម្លៃដើម/, /តម្លៃដើម/, /បង់/, /នៅសល់/],
            standalone: percent => `បញ្ចុះ ${percent}%`
        },
        lo: {
            off: [/ຫຼຸດ/, /ສ່ວນຫຼຸດ/],
            remaining: [/ລາຄາເດີມ/, /ລາຄາຕົ້ນ/, /ຈ່າຍ/, /ເຫຼືອ/],
            standalone: percent => `ຫຼຸດ ${percent}%`
        }
    };

    function normalizeDigits(value) {
        return String(value == null ? '' : value).replace(/[０-９٠-٩۰-۹％٪．，]/g, char => DIGIT_REPLACEMENTS[char] || char);
    }

    function parseChineseNumeral(value) {
        const text = String(value || '');
        if (!text) return NaN;
        if (/^\d+(?:[.,]\d+)?$/.test(text)) return Number(text.replace(',', '.'));
        if (!/^[零〇一二两三四五六七八九十]+$/.test(text)) return NaN;
        if (text === '十') return 10;
        if (text.includes('十')) {
            const [left, right] = text.split('十');
            const tens = left ? CHINESE_DIGITS[left] : 1;
            const ones = right ? CHINESE_DIGITS[right] : 0;
            if (!Number.isFinite(tens) || !Number.isFinite(ones)) return NaN;
            return tens * 10 + ones;
        }
        if (text.length === 1) return CHINESE_DIGITS[text];
        if (text.length === 2 && CHINESE_DIGITS[text[0]] < 10 && CHINESE_DIGITS[text[1]] < 10) {
            /*
             * Game text commonly writes 9.5 折 as 九五折 / 七五折.  Treat
             * the two Chinese digits as a decimal fold, not as ninety-five.
             */
            return Number(`${CHINESE_DIGITS[text[0]]}.${CHINESE_DIGITS[text[1]]}`);
        }
        return NaN;
    }

    function formatPercent(value) {
        const number = Number(value);
        if (!Number.isFinite(number)) return '';
        return Number.isInteger(number) ? String(number) : String(Number(number.toFixed(4)));
    }

    function parseDiscountSourceExpressions(sourceText) {
        const original = String(sourceText == null ? '' : sourceText);
        const text = normalizeDigits(original);
        const expressions = [];
        const pattern = /(\d+(?:[.,]\d+)?|[零〇一二两三四五六七八九十]+)\s*折/g;
        let match;
        while ((match = pattern.exec(text))) {
            const fold = parseChineseNumeral(match[1]);
            const valid = Number.isFinite(fold) && fold > 0 && fold <= 10;
            if (valid) {
                expressions.push({
                    raw: original.slice(match.index, pattern.lastIndex),
                    normalizedRaw: match[0],
                    fold,
                    remainingPercent: fold * 10,
                    offPercent: 100 - fold * 10,
                    start: match.index,
                    end: pattern.lastIndex
                });
            }
        }
        const rangeRanges = [];
        const rangePattern = /(?:\d+(?:[.,]\d+)?|[零〇一二两三四五六七八九十]+)\s*(?:至|到|[-~～])\s*(?:\d+(?:[.,]\d+)?|[零〇一二两三四五六七八九十]+)\s*折/g;
        while ((match = rangePattern.exec(text))) {
            rangeRanges.push({ start: match.index, end: rangePattern.lastIndex });
        }
        const numericFoldSignal = /(?:\d+(?:[.,]\d+)?|[零〇一二两三四五六七八九十]+)\s*折/.test(text);
        const hasPlaceholder = /(?:%[sd]|%\d+|\$\{[^}]+\}|__PH_[^_]+__)\s*折/i.test(text);
        const hasRangeSignal = rangeRanges.length > 0;
        /* “折扣/打折” without a value is ordinary wording and must not turn
         * thousands of rows into false positives.  半价/对折 do encode an
         * amount but need a human check because this guard only auto-converts
         * the explicit X 折 convention. */
        const specialDiscountSignal = /半价|对折/.test(text);
        const hasSignal = numericFoldSignal || hasPlaceholder || hasRangeSignal || specialDiscountSignal;
        const ambiguous = hasSignal && (!expressions.length || hasPlaceholder || hasRangeSignal || specialDiscountSignal);
        return {
            sourceText: original,
            normalizedText: text,
            expressions,
            ranges: [...expressions.map(item => ({ start: item.start, end: item.end })), ...rangeRanges]
                .filter((range, index, all) => all.findIndex(item => item.start === range.start && item.end === range.end) === index),
            hasSignal,
            ambiguous,
            hasPlaceholder,
            hasRangeSignal
        };
    }

    function getLocaleRule(targetLang) {
        return LOCALE_RULES[targetLang] || null;
    }

    function matchesAny(patterns, text) {
        return (patterns || []).some(pattern => {
            pattern.lastIndex = 0;
            return pattern.test(text);
        });
    }

    function getTargetCandidates(targetText, targetLang = '') {
        const original = String(targetText == null ? '' : targetText);
        const text = normalizeDigits(original);
        const rule = getLocaleRule(targetLang) || {
            off: [/\boff\b/i, /\bdiscount\b/i, /折扣|优惠|减价/],
            remaining: [/\bof\s+(?:the\s+)?original\s+price\b/i, /原价的/, /支付/]
        };
        const candidates = [];
        const addCandidate = candidate => {
            if (!Number.isFinite(candidate.percent)) return;
            const existing = candidates.find(item =>
                item.start === candidate.start &&
                item.end === candidate.end &&
                item.direction === candidate.direction
            );
            if (!existing) candidates.push(candidate);
        };
        const percentPattern = /(\d+(?:[.,]\d+)?)\s*%/g;
        let match;
        while ((match = percentPattern.exec(text))) {
            const percent = Number(match[1].replace(',', '.'));
            const start = match.index;
            const end = percentPattern.lastIndex;
            const context = text.slice(Math.max(0, start - 48), Math.min(text.length, end + 48));
            const offMatch = matchesAny(rule.off, context);
            const remainingMatch = matchesAny(rule.remaining, context);
            let direction = 'unknown';
            let evidence = '';
            if (offMatch !== remainingMatch) {
                direction = offMatch ? 'off' : 'remaining';
                evidence = offMatch ? '减价/折扣表达' : '原价/支付比例表达';
            } else if ((targetLang === 'zh-CN' || targetLang === 'zh-TW') && /折/.test(context)) {
                direction = 'remaining';
                evidence = '折';
            }
            addCandidate({ percent, direction, evidence, raw: original.slice(start, end), start, end, kind: 'percent' });
        }

        /* Turkish and a few RTL/localized UI conventions place the percent
         * sign before the number: %70 indirim / ٪70. */
        const prefixPercentPattern = /%\s*(\d+(?:[.,]\d+)?)/g;
        while ((match = prefixPercentPattern.exec(text))) {
            const percent = Number(match[1].replace(',', '.'));
            const start = match.index;
            const end = prefixPercentPattern.lastIndex;
            const context = text.slice(Math.max(0, start - 48), Math.min(text.length, end + 48));
            const offMatch = matchesAny(rule.off, context);
            const remainingMatch = matchesAny(rule.remaining, context);
            const direction = offMatch !== remainingMatch
                ? (offMatch ? 'off' : 'remaining')
                : 'unknown';
            addCandidate({
                percent,
                direction,
                evidence: direction === 'off' ? '减价/折扣表达' : direction === 'remaining' ? '原价/支付比例表达' : '',
                raw: original.slice(start, end),
                start,
                end,
                kind: 'prefix-percent'
            });
        }

        const foldPattern = /(\d+(?:[.,]\d+)?|[零〇一二两三四五六七八九十]+)\s*折/g;
        while ((match = foldPattern.exec(text))) {
            const fold = parseChineseNumeral(match[1]);
            if (!Number.isFinite(fold) || fold <= 0 || fold > 10) continue;
            addCandidate({
                percent: fold * 10,
                direction: 'remaining',
                evidence: '折',
                raw: original.slice(match.index, foldPattern.lastIndex),
                start: match.index,
                end: foldPattern.lastIndex,
                kind: 'fold'
            });
        }

        if (targetLang === 'ja') {
            const JapaneseOffPattern = /(\d+(?:[.,]\d+)?)\s*割引(?:き)?/g;
            while ((match = JapaneseOffPattern.exec(text))) {
                const amount = Number(match[1].replace(',', '.'));
                if (!Number.isFinite(amount) || amount < 0 || amount > 10) continue;
                addCandidate({
                    percent: amount * 10,
                    direction: 'off',
                    evidence: '割引',
                    raw: original.slice(match.index, JapaneseOffPattern.lastIndex),
                    start: match.index,
                    end: JapaneseOffPattern.lastIndex,
                    kind: 'localized-off'
                });
            }
        }

        return candidates.sort((a, b) => a.start - b.start);
    }

    function maskRanges(text, ranges = []) {
        const chars = String(text == null ? '' : text).split('');
        (ranges || []).forEach(range => {
            const start = Math.max(0, Number(range?.start) || 0);
            const end = Math.min(chars.length, Number(range?.end) || start);
            for (let index = start; index < end; index++) chars[index] = ' ';
        });
        return chars.join('');
    }

    function expectedDiscountLabel(expression) {
        return `${formatPercent(expression.offPercent)}%减价 / 支付原价${formatPercent(expression.remainingPercent)}%`;
    }

    function samePercent(left, right) {
        return Math.abs(Number(left) - Number(right)) < 0.0001;
    }

    function evaluateDiscountTranslation(sourceText, targetText, targetLang = '') {
        const parsed = parseDiscountSourceExpressions(sourceText);
        const target = String(targetText == null ? '' : targetText);
        if (!parsed.hasSignal) {
            return {
                status: 'not_applicable',
                issues: [],
                expressions: [],
                candidates: [],
                sourceRanges: [],
                targetRanges: [],
                sourceAmbiguous: false
            };
        }
        if (parsed.ambiguous) {
            const ambiguousReason = parsed.hasPlaceholder
                ? '原文包含折扣占位符'
                : parsed.hasRangeSignal
                    ? '原文包含折扣范围'
                    : parsed.expressions.length
                        ? '原文包含无法静态换算的折扣表达'
                        : '原文包含无法静态解析的折扣值';
            return {
                status: 'review',
                issues: [{
                    kind: 'review',
                    message: `折扣表达需确认：${ambiguousReason}，不能在本地静态换算。`
                }],
                expressions: parsed.expressions,
                candidates: getTargetCandidates(target, targetLang),
                sourceRanges: parsed.ranges,
                targetRanges: getTargetCandidates(target, targetLang).map(item => ({ start: item.start, end: item.end })),
                sourceAmbiguous: true
            };
        }

        const candidates = getTargetCandidates(target, targetLang);
        const used = new Set();
        const issues = [];
        const sourceRanges = parsed.ranges;

        parsed.expressions.forEach(expression => {
            const expectedOff = expression.offPercent;
            const expectedRemaining = expression.remainingPercent;
            const exact = candidates.findIndex((candidate, index) => {
                if (used.has(index)) return false;
                return (
                    (samePercent(candidate.percent, expectedOff) && candidate.direction === 'off') ||
                    (samePercent(candidate.percent, expectedRemaining) && candidate.direction === 'remaining')
                );
            });
            if (exact >= 0) {
                used.add(exact);
                return;
            }

            const sameValueUnknown = candidates.findIndex((candidate, index) => {
                if (used.has(index) || candidate.direction !== 'unknown') return false;
                return samePercent(candidate.percent, expectedOff) || samePercent(candidate.percent, expectedRemaining);
            });
            if (sameValueUnknown >= 0) {
                used.add(sameValueUnknown);
                issues.push({
                    kind: 'review',
                    message: `折扣表达需确认：源文 ${expression.raw} = ${expectedDiscountLabel(expression)}，译文中的 ${candidates[sameValueUnknown].raw} 未明确是减价比例还是支付比例。`
                });
                return;
            }

            const wrongDirection = candidates.findIndex((candidate, index) => {
                if (used.has(index)) return false;
                return (
                    (samePercent(candidate.percent, expectedRemaining) && candidate.direction === 'off') ||
                    (samePercent(candidate.percent, expectedOff) && candidate.direction === 'remaining')
                );
            });
            if (wrongDirection >= 0) {
                used.add(wrongDirection);
                const candidate = candidates[wrongDirection];
                issues.push({
                    kind: 'block',
                    message: `折扣语义不一致：源文 ${expression.raw} = ${expectedDiscountLabel(expression)}，译文表达为${candidate.direction === 'off' ? '减价' : '支付'} ${candidate.raw}。`
                });
                return;
            }

            const nearby = candidates.findIndex((candidate, index) => !used.has(index));
            if (nearby >= 0) {
                used.add(nearby);
                const candidate = candidates[nearby];
                issues.push({
                    kind: 'block',
                    message: `折扣语义不一致：源文 ${expression.raw} = ${expectedDiscountLabel(expression)}，译文检测到 ${candidate.raw}${candidate.direction === 'off' ? '减价' : candidate.direction === 'remaining' ? '支付比例' : '未标明方向'}。`
                });
            } else {
                issues.push({
                    kind: 'block',
                    message: `折扣翻译缺失：源文 ${expression.raw} = ${expectedDiscountLabel(expression)}，译文没有明确的折扣比例和方向。`
                });
            }
        });

        /*
         * An extra, explicitly directional discount is dangerous even when
         * the expected percentage is also present (for example
         * "70% off and 30% off").  Bare percentages are left to the generic
         * number QA and do not create a false positive here.
         */
        candidates.forEach((candidate, index) => {
            if (used.has(index) || candidate.direction === 'unknown') return;
            issues.push({
                kind: 'block',
                message: `折扣语义不一致：译文额外出现 ${candidate.raw}${candidate.direction === 'off' ? '减价' : '支付比例'}表达，源文没有对应的第二个折扣值。`
            });
        });

        const status = issues.some(issue => issue.kind === 'block')
            ? 'block'
            : issues.length
                ? 'review'
                : 'pass';
        return {
            status,
            issues,
            expressions: parsed.expressions,
            candidates,
            sourceRanges,
            targetRanges: candidates.map(item => ({ start: item.start, end: item.end })),
            sourceAmbiguous: false
        };
    }

    function getQaIssues(sourceText, targetText, targetLang = '') {
        const result = evaluateDiscountTranslation(sourceText, targetText, targetLang);
        return (result.issues || []).map(issue => issue.message);
    }

    function buildPromptInstruction(sourceText, targetLang = '') {
        const parsed = parseDiscountSourceExpressions(sourceText);
        if (!parsed.hasSignal) return '';
        if (parsed.ambiguous && !parsed.expressions.length) {
            return '折扣保护：原文包含无法静态解析的折扣占位符/范围。必须保留占位符和原有方向，不要擅自把未知值换算成固定百分比；无法确认时按原意输出并交由人工复核。';
        }
        const details = parsed.expressions.map(expression =>
            `${expression.raw} 表示支付原价 ${formatPercent(expression.remainingPercent)}%，也等价于减价 ${formatPercent(expression.offPercent)}%`
        ).join('；');
        const languageHint = getLocaleRule(targetLang)?.standalone
            ? `目标语请使用当地自然的“减价/支付比例”表达，并明确方向（例如英语用 ${formatPercent(parsed.expressions[0].offPercent)}% off，不能写成 ${formatPercent(parsed.expressions[0].remainingPercent)}% off）。`
            : '目标语请使用当地自然的折扣表达，必须明确是减价比例还是支付比例。';
        return `折扣保护（金额敏感，必须严格遵守）：${details}。${languageHint} 不要只输出没有方向的裸百分比。`;
    }

    function getStandaloneDiscountTranslation(sourceText, targetLang = '') {
        const original = String(sourceText == null ? '' : sourceText).trim();
        const parsed = parseDiscountSourceExpressions(original);
        if (parsed.ambiguous || parsed.expressions.length !== 1) return null;
        const expression = parsed.expressions[0];
        const compact = normalizeDigits(original)
            .replace(/\s+/g, '')
            .replace(/[，,。．.!！?？:：;；、]/g, '');
        const numericPart = expression.normalizedRaw.replace(/\s+/g, '');
        if (!new RegExp(`^${numericPart}(?:优惠|折扣)?$`).test(compact)) return null;
        const rule = getLocaleRule(targetLang);
        if (!rule || typeof rule.standalone !== 'function') return null;
        return rule.standalone(formatPercent(expression.offPercent), expression.fold, expression);
    }

    function hasDiscountSignal(sourceText) {
        return parseDiscountSourceExpressions(sourceText).hasSignal;
    }

    root.NexusDiscountGuard = Object.freeze({
        normalizeDigits,
        parseDiscountSourceExpressions,
        getTargetCandidates,
        maskRanges,
        evaluateDiscountTranslation,
        getQaIssues,
        buildPromptInstruction,
        getStandaloneDiscountTranslation,
        hasDiscountSignal,
        formatPercent
    });
    root.nexusDiscountGuard = root.NexusDiscountGuard;
})(typeof globalThis !== 'undefined' ? globalThis : window);
