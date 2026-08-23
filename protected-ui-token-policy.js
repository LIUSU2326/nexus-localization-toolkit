/*
 * Protected game UI token policy.
 *
 * Source-authored UI abbreviations, platform names, control labels, technical
 * identifiers, version strings, and file extensions are structural content,
 * not ordinary English prose. Source-authored tokens must survive translation.
 * Canonical uppercase game/UI abbreviations found only in a reference column
 * are safe to retain, but are not silently promoted to hard terminology.
 * Project rules can additionally require exact English phrases with
 * "保留英文：..." / "keep in English: ...".
 */
(function installNexusProtectedUiTokenPolicy(root) {
    'use strict';

    const TOKEN_GROUPS = Object.freeze({
        progression: ['ILVL', 'LVL', 'LV', 'EXP', 'XP', 'MAX'],
        combat: [
            'HP', 'MP', 'SP', 'AP', 'CP', 'BP', 'PWR', 'ATK', 'PATK', 'MATK',
            'DEF', 'PDEF', 'MDEF', 'DPS', 'CRIT', 'CD', 'CDR', 'GCD', 'DMG',
            'RES', 'ACC', 'EVA', 'SPD', 'ASPD', 'MSPD', 'STR', 'DEX', 'INT',
            'VIT', 'AGI', 'LUK', 'HIT', 'PEN', 'HASTE'
        ],
        gameplay: [
            'PVP', 'PVE', 'RTA', 'MMR', 'MVP', 'NPC', 'BOSS', 'AOE', 'AFK',
            'BUFF', 'DEBUFF', 'DOT', 'HOT', 'CC', 'KO', 'VFX'
        ],
        rarity: ['SSR', 'SR', 'UR'],
        identifiers: ['ID', 'UID', 'GUID', 'UUID', 'VIP', 'GM', 'CDK'],
        technical: [
            'API', 'SDK', 'UI', 'URL', 'HTTP', 'HTTPS', 'IP', 'PC', 'CPU',
            'GPU', 'FPS', 'QR', 'AI', 'AR', 'VR', 'APP', 'OS', 'MAC', 'RAM',
            'ROM', 'BGM', 'SFX', 'VO', 'OTP', 'SMS', 'PIN', 'DNS', 'VPN',
            'LAN', 'WAN', 'AM', 'PM', 'KB', 'MB', 'GB', 'TB', 'MS'
        ],
        controls: [
            'WASD', 'ESC', 'CTRL', 'SHIFT', 'ALT', 'TAB', 'ENTER', 'LMB', 'RMB'
        ]
    });

    const PLATFORM_TOKEN_LABELS = Object.freeze([
        'iOS', 'Android', 'Facebook', 'Huawei', 'Apple', 'Steam', 'Discord',
        'YouTube', 'WeChat', 'TapTap', 'Wi-Fi'
    ]);

    const PLATFORM_PHRASES = Object.freeze([
        'Google Play Games',
        'Google Play',
        'App Store',
        'Game Center'
    ]);
    const REFERENCE_PRESERVE_TOKEN_KEYS = new Set([
        'ILVL', 'LVL', 'LV', 'EXP', 'XP',
        'HP', 'MP', 'SP', 'AP', 'CP', 'BP', 'PWR', 'ATK', 'PATK', 'MATK',
        'DEF', 'PDEF', 'MDEF', 'DPS', 'CRIT', 'CD', 'CDR', 'GCD', 'DMG',
        'RES', 'ACC', 'EVA', 'SPD', 'ASPD', 'MSPD', 'STR', 'DEX', 'INT',
        'VIT', 'AGI', 'LUK', 'HIT', 'PEN',
        'PVP', 'PVE', 'RTA', 'MMR', 'MVP', 'NPC', 'AOE', 'AFK', 'DOT', 'HOT',
        'CC', 'KO', 'VFX', 'SSR', 'SR', 'UR',
        'ID', 'UID', 'GUID', 'UUID', 'VIP', 'GM', 'CDK',
        'API', 'SDK', 'UI', 'URL', 'HTTP', 'HTTPS', 'IP', 'PC', 'CPU', 'GPU',
        'FPS', 'QR', 'AI', 'AR', 'VR', 'APP', 'OS', 'RAM', 'ROM', 'BGM',
        'SFX', 'VO', 'OTP', 'SMS', 'PIN', 'DNS', 'VPN', 'LAN', 'WAN',
        'KB', 'MB', 'GB', 'TB', 'WASD', 'ESC', 'CTRL', 'SHIFT', 'ALT', 'TAB',
        'ENTER', 'LMB', 'RMB'
    ].map(token => token === 'LV' || token === 'LVL' ? 'level_marker' : normalizeKey(token)));

    const FILE_EXTENSION_PATTERN = String.raw`\.(?:png|jpe?g|webp|gif|svg|mp3|wav|ogg|mp4|json|csv|xlsx?|apk|ipa)`;
    const TIME_ZONE_PATTERN = String.raw`(?:UTC|GMT)\s*[+-]\s*\d{1,2}(?::?\d{2})?`;
    const VERSION_PATTERN = String.raw`v\d+(?:\.\d+){1,3}`;
    const CODE_IDENTIFIER_PATTERN = String.raw`[A-Z][A-Z0-9]*_[A-Z0-9_]+`;
    const MULTIPLIER_PATTERN = String.raw`[x×]\s*\d+(?:\.\d+)?`;
    const ROMAN_TIER_PATTERN = String.raw`(?:XX|XIX|XVIII|XVII|XVI|XV|XIV|XIII|XII|XI|X|IX|VIII|VII|VI|V|IV|III|II)`;
    const CONTEXTUAL_GRADE_MARKERS = Object.freeze([
        'SSS', 'SS', 'EX', 'S', 'R', 'N', 'A', 'B', 'C', 'D', 'E', 'F'
    ]);
    const CONTEXTUAL_GRADE_MARKER_PATTERN = CONTEXTUAL_GRADE_MARKERS.join('|');
    const CONTEXTUAL_GRADE_SEQUENCE_PATTERN =
        `(?:${CONTEXTUAL_GRADE_MARKER_PATTERN})(?:\\s*[/／、,，]\\s*(?:${CONTEXTUAL_GRADE_MARKER_PATTERN}))*`;
    const ENGLISH_GRADE_LABEL_PATTERN =
        '(?:[Gg]rade|[Rr]ank|[Tt]ier|[Cc]lass|[Rr]arity)';
    const CONTEXTUAL_GRADE_PATTERNS = Object.freeze([
        new RegExp(
            `(?<![A-Za-z])(?<sequence>${CONTEXTUAL_GRADE_SEQUENCE_PATTERN})\\s*` +
            '(?:级|級|阶|階|档|檔|品质|品質|品阶|品階|等级|等級|评级|評級)(?:别|別)?',
            'gu'
        ),
        new RegExp(
            '(?:等级|等級|品级|品級|品阶|品階|品质|品質|稀有度|评级|評級)' +
            `\\s*(?:为|為|是|[:：])?\\s*(?<sequence>${CONTEXTUAL_GRADE_SEQUENCE_PATTERN})(?![A-Za-z])`,
            'gu'
        ),
        new RegExp(
            `\\b(?<sequence>(?:SSS|SS|EX|S|R|N))\\s*(?:[-–—]\\s*|\\s+)${ENGLISH_GRADE_LABEL_PATTERN}\\b`,
            'g'
        ),
        new RegExp(
            `\\b(?<sequence>[A-F])\\s*[-–—]\\s*${ENGLISH_GRADE_LABEL_PATTERN}\\b`,
            'g'
        ),
        new RegExp(
            `\\b${ENGLISH_GRADE_LABEL_PATTERN}\\s*(?:[:：\\-–—]\\s*|\\s+)` +
            `(?<sequence>${CONTEXTUAL_GRADE_MARKER_PATTERN})\\b`,
            'g'
        )
    ]);

    function escapeRegExp(value) {
        return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function normalizeKey(value) {
        return String(value || '')
            .toLowerCase()
            .replace(/[\s._-]+/g, '');
    }

    function createContextualGradeDefinition(marker) {
        return Object.freeze({
            key: `contextual_grade_${normalizeKey(marker)}`,
            label: `等级标记 ${marker}`,
            group: 'progression',
            pattern: escapeRegExp(marker),
            caseSensitive: true
        });
    }

    const CONTEXTUAL_GRADE_DEFINITIONS = Object.freeze(
        Object.fromEntries(
            CONTEXTUAL_GRADE_MARKERS.map(marker => [
                marker,
                createContextualGradeDefinition(marker)
            ])
        )
    );

    function collectContextualGradeMatches(value) {
        const text = String(value || '');
        const matches = [];
        CONTEXTUAL_GRADE_PATTERNS.forEach(pattern => {
            pattern.lastIndex = 0;
            for (const match of text.matchAll(pattern)) {
                const sequence = String(match.groups?.sequence || '');
                if (!sequence) continue;
                const sequenceOffset = match[0].indexOf(sequence);
                if (sequenceOffset < 0) continue;
                const markerPattern = new RegExp(CONTEXTUAL_GRADE_MARKER_PATTERN, 'g');
                for (const markerMatch of sequence.matchAll(markerPattern)) {
                    const marker = markerMatch[0];
                    const index = Number(match.index || 0) + sequenceOffset + Number(markerMatch.index || 0);
                    matches.push({
                        marker,
                        text: marker,
                        contextText: match[0],
                        index,
                        end: index + marker.length,
                        definition: CONTEXTUAL_GRADE_DEFINITIONS[marker]
                    });
                }
            }
        });
        matches.sort((left, right) => left.index - right.index || right.text.length - left.text.length);
        const seen = new Set();
        return matches.filter(match => {
            const key = `${match.index}:${match.end}:${match.marker}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    function createTokenDefinition(token, group) {
        const escaped = escapeRegExp(token);
        const pattern = token === 'LV' || token === 'LVL'
            ? String.raw`(?:LVL|LV)\.?`
            : escaped;
        return Object.freeze({
            key: token === 'LVL' || token === 'LV' ? 'level_marker' : normalizeKey(token),
            label: token === 'LVL' || token === 'LV' ? 'LV / Lv. / LVL' : token,
            group,
            pattern
        });
    }

    const TOKEN_DEFINITIONS = (() => {
        const definitions = [];
        const seen = new Set();
        Object.entries(TOKEN_GROUPS).forEach(([group, tokens]) => {
            tokens.forEach(token => {
                const definition = createTokenDefinition(token, group);
                if (seen.has(definition.key)) return;
                seen.add(definition.key);
                definitions.push(definition);
            });
        });
        PLATFORM_TOKEN_LABELS.forEach(token => {
            const definition = Object.freeze({
                key: normalizeKey(token),
                label: token,
                group: 'platform',
                pattern: token === 'Wi-Fi' ? String.raw`Wi-?Fi` : escapeRegExp(token)
            });
            if (seen.has(definition.key)) return;
            seen.add(definition.key);
            definitions.push(definition);
        });
        PLATFORM_PHRASES.forEach(phrase => {
            const definition = Object.freeze({
                key: normalizeKey(phrase),
                label: phrase,
                group: 'platform',
                pattern: escapeRegExp(phrase).replace(/\\ /g, String.raw`\s+`)
            });
            if (seen.has(definition.key)) return;
            seen.add(definition.key);
            definitions.push(definition);
        });
        definitions.push(
            Object.freeze({ key: 'code_identifier', label: '代码标识符（如 SLG_ID）', group: 'technical', pattern: CODE_IDENTIFIER_PATTERN }),
            Object.freeze({ key: 'multiplier', label: '倍率标记（如 x10）', group: 'technical', pattern: MULTIPLIER_PATTERN }),
            Object.freeze({ key: 'roman_tier', label: '罗马数字等级（如 II / IV / X）', group: 'progression', pattern: ROMAN_TIER_PATTERN }),
            Object.freeze({ key: 'timezone', label: 'UTC / GMT 时区', group: 'technical', pattern: TIME_ZONE_PATTERN }),
            Object.freeze({ key: 'version', label: '版本号（如 v1.2.0）', group: 'technical', pattern: VERSION_PATTERN }),
            Object.freeze({ key: 'file_extension', label: '文件扩展名', group: 'technical', pattern: FILE_EXTENSION_PATTERN })
        );
        return Object.freeze(definitions);
    })();

    function buildPattern(definition, global = true) {
        const flags = definition.caseSensitive
            ? (global ? 'gu' : 'u')
            : (global ? 'giu' : 'iu');
        return new RegExp(
            `(?<![A-Za-z])(?:${definition.pattern})(?![A-Za-z])`,
            flags
        );
    }

    function getExactTokenDefinition(value) {
        const raw = String(value || '').trim();
        if (!raw) return null;
        const direct = collectMatches(raw).find(match => match.index === 0 && match.end === raw.length);
        if (direct) return direct.definition;

        const compactMatch = raw.match(/^([A-Za-z][A-Za-z0-9_]*)(?:[+.-]\d+(?:\.\d+)?)$/);
        if (!compactMatch) return null;
        const base = compactMatch[1];
        return collectMatches(base).find(match => match.index === 0 && match.end === base.length)?.definition || null;
    }

    function isSafeCarryoverToken(value) {
        const raw = String(value || '').trim();
        const definition = getExactTokenDefinition(raw);
        if (!definition) return false;
        if (definition.group === 'platform') return true;
        if (definition.group === 'controls') return /^[A-Z][A-Z0-9_+-]{1,11}$/.test(raw);
        if (definition.key === 'level_marker') return /^(?:LVL|LV)\.?(?:\d+)?$/i.test(raw);
        if ([
            'code_identifier',
            'multiplier',
            'roman_tier',
            'timezone',
            'version',
            'file_extension'
        ].includes(definition.key)) {
            return true;
        }
        return /^[A-Z][A-Z0-9_+-]{1,11}(?:[+.-]\d+(?:\.\d+)?)?$/.test(raw);
    }

    function isReferencePreserveToken(value) {
        const raw = String(value || '').trim();
        const definition = getExactTokenDefinition(raw);
        return Boolean(
            definition &&
            REFERENCE_PRESERVE_TOKEN_KEYS.has(definition.key) &&
            isSafeCarryoverToken(raw)
        );
    }

    function collectSafeCarryoverTokens(value) {
        const tokens = String(value || '').match(/[A-Za-z][A-Za-z0-9_.+-]*/g) || [];
        return [...new Set(tokens.filter(isSafeCarryoverToken))];
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
        return [...new Set(phrases)];
    }

    function collectMatches(value, definitions = TOKEN_DEFINITIONS) {
        const text = String(value || '');
        const matches = [];
        definitions.forEach(definition => {
            for (const match of text.matchAll(buildPattern(definition))) {
                matches.push({
                    key: definition.key,
                    label: definition.label,
                    group: definition.group,
                    text: match[0],
                    index: match.index,
                    end: Number(match.index || 0) + match[0].length,
                    definition
                });
            }
        });
        matches.sort((left, right) => left.index - right.index || right.text.length - left.text.length);
        const accepted = [];
        matches.forEach(match => {
            if (accepted.some(item => match.index < item.end && match.end > item.index)) return;
            accepted.push(match);
        });
        return accepted;
    }

    function countDefinitionMatches(value, definition) {
        return [...String(value || '').matchAll(buildPattern(definition))].length;
    }

    function countLiteralMatches(value, phrase) {
        if (!phrase) return 0;
        const pattern = new RegExp(
            `(?<![A-Za-z0-9])${escapeRegExp(phrase).replace(/\\ /g, String.raw`\s+`)}(?![A-Za-z0-9])`,
            'giu'
        );
        return [...String(value || '').matchAll(pattern)].length;
    }

    function getRequirements(sourceText, referenceText = '', options = {}) {
        const source = String(sourceText || '');
        const reference = String(referenceText || '');
        const grouped = new Map();
        collectMatches(source).forEach(match => {
            const current = grouped.get(match.key) || {
                key: match.key,
                label: match.label,
                group: match.group,
                kind: 'builtin',
                definition: match.definition,
                requiredCount: 0,
                sourceForms: []
            };
            current.requiredCount += 1;
            current.sourceForms.push(match.text);
            grouped.set(match.key, current);
        });
        collectContextualGradeMatches(source).forEach(match => {
            const current = grouped.get(match.definition.key) || {
                key: match.definition.key,
                label: match.definition.label,
                group: match.definition.group,
                kind: 'contextual-grade',
                marker: match.marker,
                definition: match.definition,
                requiredCount: 0,
                sourceForms: []
            };
            current.requiredCount += 1;
            current.sourceForms.push(match.contextText);
            grouped.set(match.definition.key, current);
        });

        extractExplicitKeepEnglishRules(options.projectRules).forEach(phrase => {
            const sourceCount = countLiteralMatches(source, phrase);
            const referenceCount = countLiteralMatches(reference, phrase);
            const requiredCount = Math.max(sourceCount, referenceCount);
            if (!requiredCount) return;
            const key = `rule:${normalizeKey(phrase)}`;
            const current = grouped.get(key);
            if (current) {
                current.requiredCount = Math.max(current.requiredCount, requiredCount);
                return;
            }
            grouped.set(key, {
                key,
                label: phrase,
                group: 'project-rule',
                kind: 'literal',
                literal: phrase,
                requiredCount,
                sourceForms: [phrase]
            });
        });

        return [...grouped.values()].map(requirement => ({
            ...requirement,
            sourceForms: [...new Set(requirement.sourceForms)]
        }));
    }

    function countRequirementMatches(value, requirement) {
        if (requirement.kind === 'literal') return countLiteralMatches(value, requirement.literal);
        return countDefinitionMatches(value, requirement.definition);
    }

    function isRequiredToken(value, requirements = []) {
        return (requirements || []).some(requirement => countRequirementMatches(value, requirement) > 0);
    }

    function getIssues(sourceText, targetText, options = {}) {
        const target = String(targetText || '');
        const requirements = getRequirements(sourceText, options.referenceText || '', options);
        const issues = [];
        requirements.forEach(requirement => {
            const actualCount = countRequirementMatches(target, requirement);
            if (actualCount >= requirement.requiredCount) return;
            const contextualGrade = requirement.kind === 'contextual-grade';
            issues.push({
                kind: 'block',
                code: contextualGrade
                    ? 'contextual_grade_marker_mismatch'
                    : 'protected_ui_token_missing',
                phrase: requirement.label,
                requiredCount: requirement.requiredCount,
                actualCount,
                message: `受保护UI标记缺失或被翻译：${requirement.label}`
            });
        });
        return issues;
    }

    function replaceProtectedTokens(value, requirements, createReplacement) {
        const text = String(value || '');
        if (!text || !requirements?.length || typeof createReplacement !== 'function') return text;
        const matches = [];
        requirements.forEach(requirement => {
            if (requirement.kind === 'contextual-grade') {
                collectContextualGradeMatches(text)
                    .filter(match => match.marker === requirement.marker)
                    .forEach(match => {
                        matches.push({
                            text: match.text,
                            index: match.index,
                            end: match.end
                        });
                    });
                return;
            }
            if (requirement.kind === 'literal') {
                const pattern = new RegExp(
                    `(?<![A-Za-z0-9])${escapeRegExp(requirement.literal).replace(/\\ /g, String.raw`\s+`)}(?![A-Za-z0-9])`,
                    'giu'
                );
                for (const match of text.matchAll(pattern)) {
                    matches.push({ text: match[0], index: match.index, end: match.index + match[0].length });
                }
                return;
            }
            for (const match of text.matchAll(buildPattern(requirement.definition))) {
                matches.push({ text: match[0], index: match.index, end: match.index + match[0].length });
            }
        });
        matches.sort((left, right) => left.index - right.index || right.text.length - left.text.length);
        const accepted = [];
        matches.forEach(match => {
            if (accepted.some(item => match.index < item.end && match.end > item.index)) return;
            accepted.push(match);
        });
        if (!accepted.length) return text;

        let cursor = 0;
        let output = '';
        accepted.forEach(match => {
            output += text.slice(cursor, match.index);
            output += createReplacement(match.text);
            cursor = match.end;
        });
        return output + text.slice(cursor);
    }

    function buildPromptInstruction(sourceText, referenceText = '', options = {}) {
        const requirements = getRequirements(sourceText, referenceText, options);
        const labels = [...new Set(requirements.map(item => item.label))];
        const referenceOnlyTokens = collectSafeCarryoverTokens(referenceText)
            .filter(token => !isRequiredToken(token, requirements));
        const instructions = [];
        if (labels.length) {
            instructions.push(`受保护UI标记必须原样保留，不得翻译、音译、删除或改变用途：${labels.join('、')}。`);
        }
        if (referenceOnlyTokens.length) {
            instructions.push(
                `英文参考中的通用游戏/UI缩写可按界面语境原样保留，不算英文残留：${referenceOnlyTokens.join('、')}；此规则不适用于普通英文名称或词组。`
            );
        }
        return instructions.join(' ');
    }

    function getSafeCarryoverTokens() {
        return [...new Set(
            Object.values(TOKEN_GROUPS)
                .flat()
                .filter(token => isSafeCarryoverToken(token))
                .map(token => token.toLowerCase())
        )];
    }

    function getSafeCarryoverPhrases() {
        return [...PLATFORM_PHRASES];
    }

    root.NexusProtectedUiTokenPolicy = Object.freeze({
        TOKEN_GROUPS,
        getRequirements,
        getIssues,
        isRequiredToken,
        replaceProtectedTokens,
        buildPromptInstruction,
        isSafeCarryoverToken,
        isReferencePreserveToken,
        collectSafeCarryoverTokens,
        getSafeCarryoverTokens,
        getSafeCarryoverPhrases,
        extractExplicitKeepEnglishRules
    });
})(typeof globalThis !== 'undefined' ? globalThis : window);
