/*
 * Declarative target-language quality profiles.
 *
 * Keep project terms, character names, brands, and one-report exceptions out
 * of this file. Profiles describe writing systems and locale mechanics only.
 */
(function installNexusLanguageQualityProfiles(root) {
    'use strict';

    const PROFILE_VERSION = '1.0.0';
    const DEFAULT_PROFILE = Object.freeze({
        profileVersion: PROFILE_VERSION,
        scripts: Object.freeze([]),
        tokenizer: 'unicode-word',
        numberSeparators: Object.freeze({ decimal: Object.freeze(['.']), grouping: Object.freeze([',', ' ', '\u00a0']) }),
        units: Object.freeze(['ms', 's', 'min', 'h', 'K', 'M', 'B']),
        placeholderPolicy: 'format-v2',
        standardLexiconVersion: 'none',
        unknownBehavior: 'review'
    });

    const commaDecimal = (scripts, tokenizer = 'unicode-word') => Object.freeze({
        ...DEFAULT_PROFILE,
        scripts: Object.freeze(scripts),
        tokenizer,
        numberSeparators: Object.freeze({ decimal: Object.freeze([',']), grouping: Object.freeze(['.', ' ', '\u00a0']) })
    });
    const dotDecimal = (scripts, tokenizer = 'unicode-word') => Object.freeze({
        ...DEFAULT_PROFILE,
        scripts: Object.freeze(scripts),
        tokenizer
    });

    const PROFILES = Object.freeze({
        en: dotDecimal(['Latin']),
        fr: commaDecimal(['Latin']),
        de: commaDecimal(['Latin']),
        es: commaDecimal(['Latin']),
        pt: commaDecimal(['Latin']),
        ru: commaDecimal(['Cyrillic']),
        uk: commaDecimal(['Cyrillic']),
        vi: commaDecimal(['Latin']),
        id: commaDecimal(['Latin']),
        it: commaDecimal(['Latin']),
        tr: commaDecimal(['Latin']),
        nl: commaDecimal(['Latin']),
        pl: commaDecimal(['Latin']),
        fil: dotDecimal(['Latin']),
        ms: dotDecimal(['Latin']),
        ja: dotDecimal(['Han', 'Hiragana', 'Katakana'], 'cjk'),
        ko: dotDecimal(['Hangul', 'Han'], 'cjk'),
        'zh-TW': dotDecimal(['Han'], 'cjk'),
        ar: dotDecimal(['Arabic']),
        fa: dotDecimal(['Arabic']),
        ur: dotDecimal(['Arabic']),
        hi: dotDecimal(['Devanagari']),
        bn: dotDecimal(['Bengali']),
        th: dotDecimal(['Thai']),
        my: dotDecimal(['Myanmar']),
        km: dotDecimal(['Khmer']),
        lo: dotDecimal(['Lao'])
    });

    function getProfile(targetLang = '') {
        return PROFILES[targetLang] || DEFAULT_PROFILE;
    }

    function getProfileAuditKey(targetLang = '') {
        const profile = getProfile(targetLang);
        return [targetLang || 'unknown', profile.profileVersion, profile.placeholderPolicy, profile.standardLexiconVersion].join(':');
    }

    root.NexusLanguageQualityProfiles = Object.freeze({
        PROFILE_VERSION,
        DEFAULT_PROFILE,
        PROFILES,
        getProfile,
        getProfileAuditKey
    });
})(typeof globalThis !== 'undefined' ? globalThis : window);

