/*
 * Local English-reference carryover guard.
 *
 * This file has no DOM or translation-provider dependencies. It detects
 * suspicious English copied from a reference column into non-English game
 * localization, while allowing placeholders, platform names, hard glossary
 * terms, and explicit project keep-English rules.
 */
(function installNexusLanguageCarryoverGuard(root) {
    'use strict';

    const POLICY_VERSION = '2.0.0';

    const LATIN_SCRIPT_TARGETS = new Set([
        'en', 'fr', 'de', 'es', 'pt', 'vi', 'id', 'it', 'tr',
        'fil', 'ms', 'nl', 'pl'
    ]);

    const protectedUiTokenPolicy = root.NexusProtectedUiTokenPolicy;
    const formatTokenPolicy = root.NexusTranslationFormatTokenPolicy;
    const SAFE_PHRASES = new Set([
        'google play',
        'google play games',
        'app store',
        'game center',
        ...(protectedUiTokenPolicy?.getSafeCarryoverPhrases?.() || []).map(value => String(value || '').toLowerCase())
    ]);

    const SAFE_TOKENS = new Set([
        'id', 'uid', 'api', 'sdk', 'ui', 'url', 'http', 'https', 'ip', 'pc',
        'ios', 'android', 'facebook', 'huawei', 'apple', 'steam', 'discord',
        'youtube', 'wechat', 'taptap', 'wifi', 'wi-fi', 'vip', 'gm', 'cdk', 'qr',
    ]);

    const GAMEPLAY_SOURCE_PATTERN = /玩法|战令|通行证|竞技场|副本|地下城|云中城|秘境|挑战|远征|模式|关卡|赛季|活动|公会战|联盟战|爬塔|塔层|排行榜|战场|试炼|锦标赛|联赛|奖励轨道/;
    const GAMEPLAY_REFERENCE_PATTERN = /\b(?:battle\s*pass|season\s*pass|pass|arena|dungeon|realm|tower|raid|challenge|expedition|campaign|game\s*mode|guild\s*war|tournament|league|reward\s*track)\b/i;
    const FORMAT_TOKEN_PATTERN = /%(?:\d+\$)?[-+#0]*(?:\d+)?(?:\.\d+)?(?:ll|l|h)?[sdifux@]|__PH_\d+__|\\n|<\/?[A-Za-z][^>]*>|\{(?:\d+|[A-Za-z_][A-Za-z0-9_.:-]*)\}|\[[A-Z][A-Z0-9_]{1,}\]/g;
    const URL_EMAIL_PATTERN = /https?:\/\/\S+|www\.\S+|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/gi;
    const LATIN_RUN_PATTERN = /[\p{Script=Latin}][\p{Script=Latin}\p{N}_.+’'-]*(?:[\t ]+[\p{Script=Latin}][\p{Script=Latin}\p{N}_.+’'-]*)*/gu;
    const LATIN_TOKEN_PATTERN = /[\p{Script=Latin}][\p{Script=Latin}\p{N}_.+’'-]*/gu;
    const HAN_PATTERN = /[\u3400-\u9fff\uf900-\ufaff]/;
    const KANA_PATTERN = /[\u3040-\u30ff\u31f0-\u31ff]/;
    const HANGUL_PATTERN = /[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af]/;
    const ARABIC_PATTERN = /[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff]/;
    const CYRILLIC_PATTERN = /[\u0400-\u052f]/;
    const THAI_PATTERN = /[\u0e00-\u0e7f]/;
    const LATIN_PATTERN = /[A-Za-z\u00c0-\u024f\u1e00-\u1eff]/;
    const DEVANAGARI_PATTERN = /[\u0900-\u097f]/;
    const BENGALI_PATTERN = /[\u0980-\u09ff]/;
    const MYANMAR_PATTERN = /[\u1000-\u109f\ua9e0-\ua9ff\uaa60-\uaa7f]/;
    const KHMER_PATTERN = /[\u1780-\u17ff\u19e0-\u19ff]/;
    const LAO_PATTERN = /[\u0e80-\u0eff]/;
    const GREEK_PATTERN = /[\u0370-\u03ff\u1f00-\u1fff]/;
    const HEBREW_PATTERN = /[\u0590-\u05ff]/;
    const ARMENIAN_PATTERN = /[\u0530-\u058f]/;
    const GEORGIAN_PATTERN = /[\u10a0-\u10ff\u2d00-\u2d2f]/;
    const JAPANESE_INVALID_SIMPLIFIED_PATTERN = /[个们为龙发战级获进还这过术买卖开关击伤敌蓝红绿黄门队阳阴阵阶际陆难飞马鱼鸟风电质贝货责败账贵费赏赠赚赛赢边达远连选递释铁钢银铜钥钱钻铠锐锁锅锻镜长问间闯闹闻阅阔险隐顶顺须顾领颁频题额颜饭饮馆骑骄骆验鲜鲨鸡鸣齐齿龄云灵奖强处时传]/;
    const JAPANESE_SHARED_HAN_TERMS = new Set([
        '成功', '最大', '最小', '物理', '魔法', '防御', '防御力', '属性',
        '使用', '必要', '不足', '可能', '保存', '限定'
    ]);
    const SCRIPT_DEFINITIONS = Object.freeze({
        latin: Object.freeze({ pattern: LATIN_PATTERN, label: '拉丁字母' }),
        han: Object.freeze({ pattern: HAN_PATTERN, label: '中文汉字' }),
        kana: Object.freeze({ pattern: KANA_PATTERN, label: '日文假名' }),
        hangul: Object.freeze({ pattern: HANGUL_PATTERN, label: '韩文' }),
        arabic: Object.freeze({ pattern: ARABIC_PATTERN, label: '阿拉伯文字' }),
        cyrillic: Object.freeze({ pattern: CYRILLIC_PATTERN, label: '西里尔文字' }),
        thai: Object.freeze({ pattern: THAI_PATTERN, label: '泰文' }),
        devanagari: Object.freeze({ pattern: DEVANAGARI_PATTERN, label: '天城文' }),
        bengali: Object.freeze({ pattern: BENGALI_PATTERN, label: '孟加拉文字' }),
        myanmar: Object.freeze({ pattern: MYANMAR_PATTERN, label: '缅甸文字' }),
        khmer: Object.freeze({ pattern: KHMER_PATTERN, label: '高棉文字' }),
        lao: Object.freeze({ pattern: LAO_PATTERN, label: '老挝文字' }),
        greek: Object.freeze({ pattern: GREEK_PATTERN, label: '希腊文字' }),
        hebrew: Object.freeze({ pattern: HEBREW_PATTERN, label: '希伯来文字' }),
        armenian: Object.freeze({ pattern: ARMENIAN_PATTERN, label: '亚美尼亚文字' }),
        georgian: Object.freeze({ pattern: GEORGIAN_PATTERN, label: '格鲁吉亚文字' })
    });
    const NON_LATIN_SCRIPT_KEYS = Object.freeze(
        Object.keys(SCRIPT_DEFINITIONS).filter(key => key !== 'latin')
    );

    function createTargetScriptProfile(expectedScripts) {
        const expected = Object.freeze([...expectedScripts]);
        return Object.freeze({
            expected,
            /*
             * Latin text is checked separately by the English-reference
             * carryover guard so canonical UI abbreviations and explicit
             * keep-English terms remain valid in non-Latin languages.
             */
            disallowed: Object.freeze(
                NON_LATIN_SCRIPT_KEYS.filter(key => !expected.includes(key))
            )
        });
    }

    const LATIN_TARGET_SCRIPT_PROFILE = createTargetScriptProfile(['latin']);
    const TARGET_SCRIPT_PROFILES = Object.freeze({
        en: LATIN_TARGET_SCRIPT_PROFILE,
        fr: LATIN_TARGET_SCRIPT_PROFILE,
        de: LATIN_TARGET_SCRIPT_PROFILE,
        es: LATIN_TARGET_SCRIPT_PROFILE,
        pt: LATIN_TARGET_SCRIPT_PROFILE,
        vi: LATIN_TARGET_SCRIPT_PROFILE,
        id: LATIN_TARGET_SCRIPT_PROFILE,
        it: LATIN_TARGET_SCRIPT_PROFILE,
        tr: LATIN_TARGET_SCRIPT_PROFILE,
        fil: LATIN_TARGET_SCRIPT_PROFILE,
        ms: LATIN_TARGET_SCRIPT_PROFILE,
        nl: LATIN_TARGET_SCRIPT_PROFILE,
        pl: LATIN_TARGET_SCRIPT_PROFILE,
        ja: createTargetScriptProfile(['han', 'kana']),
        ko: createTargetScriptProfile(['hangul']),
        'zh-TW': createTargetScriptProfile(['han']),
        ru: createTargetScriptProfile(['cyrillic']),
        uk: createTargetScriptProfile(['cyrillic']),
        th: createTargetScriptProfile(['thai']),
        ar: createTargetScriptProfile(['arabic']),
        fa: createTargetScriptProfile(['arabic']),
        ur: createTargetScriptProfile(['arabic']),
        hi: createTargetScriptProfile(['devanagari']),
        bn: createTargetScriptProfile(['bengali']),
        my: createTargetScriptProfile(['myanmar']),
        km: createTargetScriptProfile(['khmer']),
        lo: createTargetScriptProfile(['lao'])
    });
    const SCRIPT_ISSUE_OVERRIDES = Object.freeze({
        'ja:hangul': Object.freeze({
            code: 'japanese_hangul_residual',
            message: '目标日文中混入韩文'
        }),
        'ko:han': Object.freeze({
            code: 'korean_chinese_residual',
            message: '目标韩文中混入中文汉字'
        }),
        'ko:kana': Object.freeze({
            code: 'korean_japanese_residual',
            message: '目标韩文中混入日文假名'
        }),
        'ar:han': Object.freeze({
            code: 'arabic_chinese_residual',
            message: '目标阿拉伯文中混入中文'
        }),
        'ar:kana': Object.freeze({
            code: 'arabic_japanese_residual',
            message: '目标阿拉伯文中混入日文'
        }),
        'ar:hangul': Object.freeze({
            code: 'arabic_korean_residual',
            message: '目标阿拉伯文中混入韩文'
        })
    });
    const TARGET_LANGUAGE_LABELS = Object.freeze({
        en: '英文',
        ja: '日文',
        ko: '韩文',
        'zh-TW': '繁体中文',
        fr: '法文',
        de: '德文',
        es: '西班牙文',
        pt: '葡萄牙文',
        ru: '俄文',
        th: '泰文',
        vi: '越南文',
        id: '印尼文',
        it: '意大利文',
        ar: '阿拉伯文',
        tr: '土耳其文',
        hi: '印地文',
        fil: '菲律宾文',
        ms: '马来文',
        nl: '荷兰文',
        pl: '波兰文',
        uk: '乌克兰文',
        fa: '波斯文',
        ur: '乌尔都文',
        bn: '孟加拉文',
        my: '缅甸文',
        km: '高棉文',
        lo: '老挝文'
    });
    const LATIN_TARGET_COMMON_BORROWINGS = new Set([
        'app', 'arena', 'audio', 'bonus', 'boss', 'chat', 'email', 'gamepad',
        'event', 'internet', 'item', 'joystick', 'login', 'offline', 'online',
        'pixel', 'premium', 'quest', 'raid', 'ranking', 'server', 'skill',
        'skin', 'status', 'video', 'web'
    ]);
    const STRONG_ENGLISH_GAME_WORDS = new Set([
        'account', 'armor', 'attack', 'available', 'battle', 'cancel', 'chapter',
        'back', 'buy', 'character', 'claim', 'click', 'collect', 'complete',
        'completed', 'confirm', 'current', 'daily', 'damage', 'decrease',
        'defeat', 'defense', 'delete', 'download', 'dungeon', 'equip', 'exit',
        'failed', 'free', 'guild', 'increase', 'language', 'level', 'loading',
        'locked', 'mail', 'message', 'mission', 'mode', 'monthly', 'new', 'next',
        'now', 'open', 'owned', 'play', 'player', 'press', 'purchase', 'receive',
        'remaining', 'required', 'retry', 'reward', 'rewards', 'save', 'settings',
        'shop', 'speed', 'stage', 'start', 'success', 'summon', 'tap', 'team',
        'unlock', 'update', 'upgrade', 'use', 'weapon', 'weekly'
    ]);
    const CLEARLY_TRANSLATABLE_ENGLISH_WORDS = new Set([
        ...STRONG_ENGLISH_GAME_WORDS,
        'area', 'buff', 'buffs', 'counter', 'countered', 'dust', 'excellent',
        'festival', 'pass', 'purchase', 'relic', 'realm', 'rush', 'spirit',
        'wild'
    ]);

    function normalizeToken(value) {
        return String(value || '')
            .toLowerCase()
            .replace(/^[._+’'-]+|[._+’'-]+$/g, '');
    }

    function normalizePhrase(value) {
        return String(value || '')
            .toLowerCase()
            .replace(/[’']/g, "'")
            .replace(/[^\p{L}\p{N}+._'-]+/gu, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function normalizeComparable(value) {
        const masked = formatTokenPolicy?.mask
            ? formatTokenPolicy.mask(value)
            : String(value || '').replace(FORMAT_TOKEN_PATTERN, ' ');
        return masked
            .toLowerCase()
            .replace(/[^\p{L}\p{N}]+/gu, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function escapeRegExp(value) {
        return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function extractLatinTokens(value) {
        return String(value || '').match(LATIN_TOKEN_PATTERN) || [];
    }

    function extractExplicitKeepEnglishRules(projectRules = '') {
        const phrases = [];
        String(projectRules || '').split(/\r?\n/).forEach(line => {
            const match = line.match(/(?:保留英文|英文保留|keep\s+(?:in\s+)?english)\s*[:：]\s*(.+)$/i);
            if (!match) return;
            match[1]
                .split(/[、,，;；|]/)
                .map(item => item.trim().replace(/^["'“”‘’]+|["'“”‘’]+$/g, ''))
                .filter(Boolean)
                .forEach(item => phrases.push(item));
        });
        return phrases;
    }

    function buildAllowlist(options = {}) {
        const phrases = new Set(SAFE_PHRASES);
        const tokens = new Set(SAFE_TOKENS);
        const configured = [
            ...(Array.isArray(options.allowedTerms) ? options.allowedTerms : []),
            ...(Array.isArray(options.allowlist) ? options.allowlist : []),
            ...extractExplicitKeepEnglishRules(options.projectRules)
        ];

        configured.forEach(value => {
            const normalized = normalizePhrase(value);
            if (!normalized) return;
            if (normalized.includes(' ')) phrases.add(normalized);
            else tokens.add(normalized);
        });
        return { phrases, tokens };
    }

    function maskPattern(value, pattern) {
        return String(value || '').replace(pattern, match => ' '.repeat(match.length));
    }

    function maskFormatTokens(value) {
        return formatTokenPolicy?.mask
            ? formatTokenPolicy.mask(value)
            : maskPattern(value, FORMAT_TOKEN_PATTERN);
    }

    function maskAllowedPhrases(value, phrases) {
        let masked = String(value || '');
        [...phrases]
            .filter(Boolean)
            .sort((left, right) => right.length - left.length)
            .forEach(phrase => {
                const parts = phrase.split(/\s+/).map(escapeRegExp);
                if (!parts.length) return;
                const pattern = new RegExp(`(^|[^A-Za-z0-9])(${parts.join('\\s+')})(?=$|[^A-Za-z0-9])`, 'gi');
                masked = masked.replace(pattern, match => ' '.repeat(match.length));
            });
        return masked;
    }

    function getMeaningfulTextAfterSafeContent(value, options = {}) {
        const allowlist = buildAllowlist(options);
        let masked = maskFormatTokens(value);
        masked = maskPattern(masked, URL_EMAIL_PATTERN);
        masked = maskAllowedPhrases(masked, allowlist.phrases);
        masked = masked.replace(LATIN_TOKEN_PATTERN, token => {
            const normalized = normalizeToken(token);
            const allowed = allowlist.tokens.has(normalized) ||
                Boolean(protectedUiTokenPolicy?.isSafeCarryoverToken?.(token));
            return allowed ? ' '.repeat(token.length) : token;
        });
        return masked.replace(/[\p{N}\p{P}\p{S}\s]+/gu, '');
    }

    function evaluateScriptLeakage(sourceText, targetText, targetLang = '', options = {}) {
        const source = String(sourceText || '');
        const target = String(targetText || '');
        if (!source || !target || !targetLang) {
            return { status: 'pass', issues: [] };
        }

        const issues = [];
        const addIssue = (kind, code, message, phrase = '') => {
            if (issues.some(issue => issue.code === code && issue.phrase === phrase)) return;
            issues.push({ kind, code, message, phrase });
        };
        const label = TARGET_LANGUAGE_LABELS[targetLang] || targetLang;
        const meaningfulRemainder = getMeaningfulTextAfterSafeContent(target, options);
        const hasMeaningfulLetters = /\p{L}/u.test(meaningfulRemainder);
        const sourceComparable = normalizeComparable(source);
        const targetComparable = normalizeComparable(target);
        const sameAsChineseSource = HAN_PATTERN.test(source) &&
            sourceComparable.length >= 2 &&
            sourceComparable === targetComparable;
        const profile = TARGET_SCRIPT_PROFILES[targetLang];
        let foreignScriptDetected = false;

        if (targetLang === 'ja') {
            const simplifiedMatches = target.match(new RegExp(JAPANESE_INVALID_SIMPLIFIED_PATTERN.source, 'g')) || [];
            if (simplifiedMatches.length) {
                addIssue(
                    'block',
                    'japanese_simplified_chinese_residual',
                    `目标日文中混入中文简体字：${[...new Set(simplifiedMatches)].slice(0, 8).join('、')}`
                );
            } else if (sameAsChineseSource && !JAPANESE_SHARED_HAN_TERMS.has(targetComparable)) {
                addIssue(
                    'review',
                    'japanese_source_copy_review',
                    '目标日文与中文原文高度一致，需人工确认是否为合法共用汉字'
                );
            }
        }

        if (profile) {
            profile.disallowed.forEach(scriptKey => {
                const definition = SCRIPT_DEFINITIONS[scriptKey];
                if (!definition?.pattern.test(meaningfulRemainder)) return;
                foreignScriptDetected = true;
                const override = SCRIPT_ISSUE_OVERRIDES[`${targetLang}:${scriptKey}`];
                if (override) {
                    addIssue('block', override.code, override.message);
                    return;
                }
                const legacyCode = scriptKey === 'han'
                    ? 'target_chinese_residual'
                    : (LATIN_SCRIPT_TARGETS.has(targetLang)
                        ? `latin_${scriptKey}_residual`
                        : `target_${scriptKey}_residual`);
                addIssue(
                    'block',
                    legacyCode,
                    `目标${label}中混入${definition.label}`
                );
            });

            const hasExpectedScript = profile.expected.some(scriptKey =>
                SCRIPT_DEFINITIONS[scriptKey]?.pattern.test(meaningfulRemainder)
            );
            const abbreviationOnlyRemainder = isShortUnknownAbbreviation(
                meaningfulRemainder.trim()
            );
            if (
                hasMeaningfulLetters &&
                !hasExpectedScript &&
                !foreignScriptDetected &&
                !abbreviationOnlyRemainder
            ) {
                const legacyWrongScriptCodes = {
                    ja: 'japanese_wrong_script_review',
                    ko: 'korean_wrong_script_review',
                    ar: 'arabic_wrong_script_review'
                };
                addIssue(
                    'review',
                    legacyWrongScriptCodes[targetLang] || 'target_wrong_script',
                    `目标${label}疑似未翻译成${label}，需确认`
                );
            }
        }

        if (
            sameAsChineseSource &&
            !['ja', 'zh-TW'].includes(targetLang) &&
            !issues.some(issue => issue.code.endsWith('chinese_residual'))
        ) {
            addIssue('block', 'target_source_copy', `目标${label}与中文原文相同，疑似未翻译`);
        }

        const status = issues.some(issue => issue.kind === 'block')
            ? 'block'
            : (issues.length ? 'review' : 'pass');
        return { status, issues };
    }

    function isShortUnknownAbbreviation(token) {
        const value = String(token || '');
        return /^[A-Z][A-Z0-9_+-]{1,5}$/.test(value);
    }

    function isLikelyProperNameCandidate(candidate) {
        const tokens = candidate?.tokens || [];
        return tokens.length > 0 && tokens.length <= 4 && tokens.every(token =>
            /^[A-Z][\p{Script=Latin}’'._-]*$/u.test(String(token || ''))
        );
    }

    function uniqueBy(items, getKey) {
        const seen = new Set();
        return items.filter(item => {
            const key = getKey(item);
            if (!key || seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    function getReferenceCarryoverCandidates(sourceText, targetText, referenceText, options = {}) {
        const referenceTokens = new Set(extractLatinTokens(referenceText).map(normalizeToken).filter(Boolean));
        const includeUnexpectedTargetLatin = Boolean(options.includeUnexpectedTargetLatin);
        const includeStrongEnglishGameWords = Boolean(options.includeStrongEnglishGameWords);
        if (!referenceTokens.size && !includeUnexpectedTargetLatin && !includeStrongEnglishGameWords) return [];

        const sourceTokens = new Set(extractLatinTokens(sourceText).map(normalizeToken).filter(Boolean));
        const allowlist = buildAllowlist(options);
        let maskedTarget = maskFormatTokens(targetText);
        maskedTarget = maskPattern(maskedTarget, URL_EMAIL_PATTERN);
        maskedTarget = maskAllowedPhrases(maskedTarget, allowlist.phrases);

        const runs = maskedTarget.match(LATIN_RUN_PATTERN) || [];
        const candidates = runs.map(run => {
            const rawTokens = extractLatinTokens(run);
            const carriedTokens = rawTokens.filter(token => {
                const normalized = normalizeToken(token);
                return normalized &&
                    (
                        referenceTokens.has(normalized) ||
                        includeUnexpectedTargetLatin ||
                        (includeStrongEnglishGameWords && STRONG_ENGLISH_GAME_WORDS.has(normalized))
                    ) &&
                    !allowlist.tokens.has(normalized) &&
                    !protectedUiTokenPolicy?.isSafeCarryoverToken?.(token);
            });
            if (!carriedTokens.length) return null;
            const normalizedTokens = carriedTokens.map(normalizeToken);
            return {
                phrase: carriedTokens.join(' '),
                tokens: carriedTokens,
                normalizedTokens,
                appearsInSource: normalizedTokens.every(token => sourceTokens.has(token)),
                appearsInReference: normalizedTokens.every(token => referenceTokens.has(token)),
                abbreviationOnly: carriedTokens.every(isShortUnknownAbbreviation),
                strongEnglishOnly: normalizedTokens.every(token => STRONG_ENGLISH_GAME_WORDS.has(token))
            };
        }).filter(Boolean);

        return uniqueBy(candidates, item => normalizePhrase(item.phrase));
    }

    function evaluateCarryover(sourceText, targetText, targetLang = '', options = {}) {
        const source = String(sourceText || '');
        const target = String(targetText || '');
        const reference = String(options.referenceText || '');
        if (!source || !target || !targetLang) {
            return { status: 'pass', issues: [], candidates: [] };
        }

        const protectedRequirements = protectedUiTokenPolicy?.getRequirements
            ? protectedUiTokenPolicy.getRequirements(source, reference, {
                projectRules: options.projectRules || ''
            })
            : [];
        const protectedIssues = protectedUiTokenPolicy?.getIssues
            ? protectedUiTokenPolicy.getIssues(source, target, {
                referenceText: reference,
                projectRules: options.projectRules || ''
            })
            : [];
        const buildResult = (carryoverIssues = [], candidates = []) => {
            const uniqueIssues = uniqueBy(
                [...protectedIssues, ...carryoverIssues],
                issue => `${issue.kind}:${issue.code || ''}:${normalizePhrase(issue.phrase)}`
            ).slice(0, 8);
            const status = uniqueIssues.some(issue => issue.kind === 'block')
                ? 'block'
                : (uniqueIssues.length ? 'review' : 'pass');
            return { status, issues: uniqueIssues, candidates };
        };

        if (targetLang === 'en') {
            return buildResult();
        }

        const usesLatinScript = LATIN_SCRIPT_TARGETS.has(targetLang);
        const sourceHasGameplaySignal = GAMEPLAY_SOURCE_PATTERN.test(source);
        const targetHasStrongEnglishGameWord = extractLatinTokens(target)
            .map(normalizeToken)
            .some(token => STRONG_ENGLISH_GAME_WORDS.has(token));
        if (!reference && !sourceHasGameplaySignal && usesLatinScript && !targetHasStrongEnglishGameWord) {
            return buildResult();
        }

        const candidateReference = reference ||
            (!usesLatinScript || sourceHasGameplaySignal ? target : '');
        const candidates = getReferenceCarryoverCandidates(source, target, candidateReference, {
            ...options,
            includeUnexpectedTargetLatin: !usesLatinScript,
            includeStrongEnglishGameWords: usesLatinScript && targetLang !== 'en'
        });
        if (!candidates.length) {
            return buildResult();
        }

        const gameplayContext = sourceHasGameplaySignal || GAMEPLAY_REFERENCE_PATTERN.test(reference);
        const targetEqualsReference = Boolean(reference) && normalizeComparable(target) === normalizeComparable(reference);
        const referenceTokenCount = extractLatinTokens(reference).length;
        const issues = candidates.map(candidate => {
            if (
                protectedRequirements.length &&
                protectedUiTokenPolicy?.isRequiredToken &&
                candidate.tokens.every(token => protectedUiTokenPolicy.isRequiredToken(token, protectedRequirements))
            ) {
                return null;
            }
            if (usesLatinScript) {
                const borrowingOnly = candidate.normalizedTokens.every(token =>
                    LATIN_TARGET_COMMON_BORROWINGS.has(token)
                );
                const clearlyGenericCopy = candidate.normalizedTokens.length >= 2 &&
                    candidate.normalizedTokens.every(token => CLEARLY_TRANSLATABLE_ENGLISH_WORDS.has(token)) &&
                    (candidate.appearsInReference || targetEqualsReference || !reference);
                if (clearlyGenericCopy) {
                    return {
                        kind: 'block',
                        code: targetEqualsReference
                            ? 'english_reference_copy'
                            : (reference ? 'english_reference_residual' : 'english_target_residual'),
                        phrase: candidate.phrase,
                        message: targetEqualsReference
                            ? `目标译文疑似照抄英文参考：${candidate.phrase}`
                            : (reference
                                ? `目标译文仍含明确的英文短语：${candidate.phrase}`
                                : `目标译文仍含明确英文：${candidate.phrase}`)
                    };
                }
                if (borrowingOnly) {
                    return {
                        kind: 'review',
                        code: 'english_borrowing_review',
                        phrase: candidate.phrase,
                        message: `目标语可能沿用游戏借词，需确认：${candidate.phrase}`
                    };
                }
                if (candidate.normalizedTokens.length === 1 || isLikelyProperNameCandidate(candidate)) {
                    return {
                        kind: 'review',
                        code: 'english_proper_name_review',
                        phrase: candidate.phrase,
                        message: `英文专名或同形词需确认：${candidate.phrase}`
                    };
                }
                if (!targetEqualsReference && candidate.appearsInSource) {
                    return {
                        kind: 'review',
                        code: 'english_source_name_review',
                        phrase: candidate.phrase,
                        message: `源文英文专名需确认：${candidate.phrase}`
                    };
                }
                return {
                    kind: 'review',
                    code: targetEqualsReference ? 'english_reference_copy_review' : 'english_target_word_review',
                    phrase: candidate.phrase,
                    message: targetEqualsReference
                        ? `目标译文疑似沿用英文参考，需确认：${candidate.phrase}`
                        : `目标语中的英文词需确认：${candidate.phrase}`
                };
            }

            if (candidate.abbreviationOnly) {
                return {
                    kind: 'review',
                    code: 'english_proper_name_review',
                    phrase: candidate.phrase,
                    message: `英文专名需确认：${candidate.phrase}`
                };
            }

            const clearlyTranslatable = candidate.normalizedTokens.every(token =>
                CLEARLY_TRANSLATABLE_ENGLISH_WORDS.has(token)
            );
            if (
                gameplayContext &&
                !candidate.appearsInSource &&
                candidate.normalizedTokens.length >= 2
            ) {
                return {
                    kind: 'block',
                    code: 'english_gameplay_copy',
                    phrase: candidate.phrase,
                    message: `玩法名疑似沿用英文：${candidate.phrase}`
                };
            }
            if (clearlyTranslatable && candidate.appearsInReference) {
                return {
                    kind: 'block',
                    code: targetEqualsReference && candidate.normalizedTokens.length >= 2
                        ? 'english_reference_copy'
                        : 'english_reference_residual',
                    phrase: candidate.phrase,
                    message: targetEqualsReference && candidate.normalizedTokens.length >= 2
                        ? `目标译文疑似照抄英文参考：${candidate.phrase}`
                        : `目标译文仍含英文参考：${candidate.phrase}`
                };
            }
            if (clearlyTranslatable && !candidate.appearsInSource) {
                return {
                    kind: 'block',
                    code: 'english_target_residual',
                    phrase: candidate.phrase,
                    message: `目标译文仍含明确英文：${candidate.phrase}`
                };
            }

            if (candidate.appearsInSource || candidate.normalizedTokens.length === 1 || isLikelyProperNameCandidate(candidate)) {
                return {
                    kind: 'review',
                    code: candidate.appearsInSource ? 'english_source_name_review' : 'english_proper_name_review',
                    phrase: candidate.phrase,
                    message: `英文专名或单词需确认：${candidate.phrase}`
                };
            }

            if (targetEqualsReference && referenceTokenCount >= 2) {
                return {
                    kind: 'block',
                    code: 'english_reference_copy',
                    phrase: candidate.phrase,
                    message: `目标译文疑似照抄英文参考：${candidate.phrase}`
                };
            }

            return candidate.appearsInReference && candidate.normalizedTokens.length >= 2 ? {
                kind: 'block',
                code: 'english_reference_residual',
                phrase: candidate.phrase,
                message: `目标译文仍含英文参考：${candidate.phrase}`
            } : {
                kind: 'block',
                code: 'english_target_residual',
                phrase: candidate.phrase,
                message: `目标译文仍含英文：${candidate.phrase}`
            };
        }).filter(Boolean);

        return buildResult(issues, candidates);
    }

    function getQaIssues(sourceText, targetText, targetLang = '', options = {}) {
        return evaluateCarryover(sourceText, targetText, targetLang, options)
            .issues
            .map(issue => issue.message);
    }

    root.NexusLanguageCarryoverGuard = Object.freeze({
        POLICY_VERSION,
        evaluateCarryover,
        evaluateScriptLeakage,
        getSupportedTargetLanguages: () => Object.keys(TARGET_SCRIPT_PROFILES),
        getQaIssues,
        getReferenceCarryoverCandidates,
        extractExplicitKeepEnglishRules,
        normalizePhrase
    });
    root.nexusLanguageCarryoverGuard = root.NexusLanguageCarryoverGuard;
})(typeof globalThis !== 'undefined' ? globalThis : window);
