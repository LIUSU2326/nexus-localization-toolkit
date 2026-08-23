import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

await import('../protected-ui-token-policy.js');
await import('../language-carryover-guard.js');

const guard = globalThis.NexusLanguageCarryoverGuard;
assert.ok(guard, 'NexusLanguageCarryoverGuard should be installed');

function evaluate(sourceText, referenceText, targetText, targetLang = 'th', options = {}) {
    return guard.evaluateCarryover(sourceText, targetText, targetLang, {
        referenceText,
        ...options
    });
}

const cases = [
    {
        name: 'Thai mixed gameplay phrase',
        args: ['使用后，立即激活云中城战令', 'Used to instantly activate Cloudspire Pass', 'ใช้เพื่อเปิดใช้งาน Cloudspire Pass ทันที'],
        status: 'block',
        code: 'english_gameplay_copy'
    },
    {
        name: 'Thai mixed single gameplay name',
        args: ['云中城战令', 'Cloudspire Pass', 'บัตเติ้ลพาส Cloudspire'],
        status: 'review',
        code: 'english_proper_name_review'
    },
    {
        name: 'Thai English-only skill name',
        args: ['昆针锐意', 'Stingburst', 'Stingburst'],
        status: 'review',
        code: 'english_proper_name_review'
    },
    {
        name: 'Thai mixed item name',
        args: ['神器源尘数量不足', 'Not enough Relic Dust', 'Relic Dust ไม่เพียงพอ'],
        status: 'block',
        code: 'english_reference_residual'
    },
    {
        name: 'Thai mixed activity name',
        args: ['精灵秘境冲刺奖励', 'Spirit Realm Rush Reward', 'รางวัล Spirit Realm Rush'],
        status: 'block',
        code: 'english_gameplay_copy'
    },
    {
        name: 'Thai unexpected English token',
        args: ['当前增益状态', 'Current Buffs', 'สถานะ_buff_ปัจจุบัน'],
        status: 'block',
        code: 'english_target_residual'
    },
    {
        name: 'Thai unexpected English phrase',
        args: ['通关后可召唤高级怪物', 'Clear the stage to summon higher-tier monsters', 'เรียกมอนสเตอร์จาก Wild Area'],
        status: 'block',
        code: 'english_target_residual'
    },
    {
        name: 'Thai malformed mixed word',
        args: ['属性克制', 'Element Counter', 'การ countered ธาตุ'],
        status: 'block',
        code: 'english_target_residual'
    },
    {
        name: 'Thai generic whole-reference copy',
        args: ['确认购买', 'Confirm Purchase', 'Confirm Purchase'],
        status: 'block',
        code: 'english_reference_copy'
    },
    {
        name: 'Google Play built-in phrase',
        args: ['登录Google Play', 'Sign in with Google Play', 'เข้าสู่ระบบด้วย Google Play'],
        status: 'pass'
    },
    {
        name: 'App Store built-in phrase',
        args: ['打开应用商店', 'Open App Store', 'เปิด App Store'],
        status: 'pass'
    },
    {
        name: 'Steam built-in token',
        args: ['登录平台', 'Sign in to Steam', 'เข้าสู่ระบบ Steam'],
        status: 'pass'
    },
    {
        name: 'VIP built-in token',
        args: ['提升VIP等级', 'Upgrade VIP Level', 'เพิ่มระดับ VIP'],
        status: 'pass'
    },
    {
        name: 'Source LV marker is preserved',
        args: ['战斗号角lv%s解锁', 'Battle Horn reaches Lv.%s to unlock', 'แตรศึกปลดล็อกที่ Lv.%s'],
        status: 'pass'
    },
    {
        name: 'Source LV marker cannot be translated away',
        args: ['战斗号角lv%s解锁', 'Battle Horn reaches Lv.%s to unlock', 'แตรศึกปลดล็อกที่ระดับ %s'],
        status: 'block',
        code: 'protected_ui_token_missing'
    },
    {
        name: 'Contextual S grade marker is preserved',
        args: ['诃息专属S级神器宝箱', 'Hexi Exclusive S-rank Relic Chest', 'หีบเรลิกระดับ S เฉพาะของเฮ็กซี'],
        status: 'pass'
    },
    {
        name: 'Contextual A grade marker is not treated as English residue',
        args: ['A级英雄出现概率', 'A-Rank Hero appearance rate', 'เพิ่มโอกาสได้รับฮีโร่ระดับ A'],
        status: 'pass'
    },
    {
        name: 'Contextual S grade marker cannot become highest grade',
        args: ['诃息专属S级神器宝箱', 'Hexi Exclusive S-rank Relic Chest', 'หีบเรลิกเฉพาะระดับสูงสุดของเฮ็กซี'],
        status: 'block',
        code: 'contextual_grade_marker_mismatch'
    },
    {
        name: 'Reference-only canonical HP is optional carryover',
        args: ['恢复生命值', 'Heal HP', 'ฟื้นฟูพลังชีวิต'],
        status: 'pass'
    },
    {
        name: 'Source-authored HP must be preserved',
        args: ['HP+10%', 'HP +10%', 'พลังชีวิต +10%'],
        status: 'block',
        code: 'protected_ui_token_missing'
    },
    {
        name: 'Source-authored game abbreviation',
        args: ['开启RTA模式', 'Unlock RTA Mode', 'เปิดโหมด RTA'],
        status: 'pass'
    },
    {
        name: 'Unknown source proper name',
        args: ['与Astra对话', 'Talk to Astra', 'คุยกับ Astra'],
        status: 'review',
        code: 'english_source_name_review'
    },
    {
        name: 'Source carries English project name',
        args: ['参加Cloudspire Festival活动', 'Join Cloudspire Festival', 'เข้าร่วม Cloudspire Festival'],
        status: 'review',
        code: 'english_source_name_review'
    },
    {
        name: 'Hard glossary term is allowed',
        args: ['进入星界远征', 'Enter Astral Expedition', 'เข้าสู่ Astral Expedition', 'th', {
            allowedTerms: ['Astral Expedition']
        }],
        status: 'pass'
    },
    {
        name: 'Explicit project keep-English rule',
        args: ['云中城战令', 'Cloudspire Pass', 'Cloudspire Pass', 'th', {
            projectRules: '保留英文：Cloudspire Pass'
        }],
        status: 'pass'
    },
    {
        name: 'Protected tags and URL',
        args: [
            '访问链接',
            'Open <color=#fff>https://game.example.com</color>',
            'เปิด <color=#fff>https://game.example.com</color>'
        ],
        status: 'pass'
    },
    {
        name: 'Thai fully localized',
        args: ['云中城战令', 'Cloudspire Pass', 'บัตรผ่านการรบแห่งนครเมฆ'],
        status: 'pass'
    },
    {
        name: 'Gameplay fallback without reference',
        args: ['公会战', '', 'Guild War'],
        status: 'block',
        code: 'english_gameplay_copy'
    },
    {
        name: 'Japanese English gameplay residual',
        args: ['挑战云中城', 'Challenge Cloudspire', 'クラウドスパイアで Cloudspire に挑戦', 'ja'],
        status: 'review',
        code: 'english_proper_name_review'
    },
    {
        name: 'French sentence with an untranslated proper name is reviewed',
        args: ['挑战云中城', 'Challenge Cloudspire', 'Défiez Cloudspire', 'fr'],
        status: 'review',
        code: 'english_proper_name_review'
    },
    {
        name: 'French whole-reference project name is reviewed',
        args: ['云中城战令', 'Cloudspire Pass', 'Cloudspire Pass', 'fr'],
        status: 'review',
        code: 'english_proper_name_review'
    },
    {
        name: 'French whole generic English UI copy is blocked',
        args: ['领取奖励', 'Claim Reward', 'Claim Reward', 'fr'],
        status: 'block'
    },
    {
        name: 'Thai Xeno Bug whole-reference proper name is reviewed',
        args: ['异种虫', 'Xeno Bug', 'Xeno Bug'],
        status: 'review',
        code: 'english_proper_name_review'
    },
    {
        name: 'Thai Xeno Bug mixed proper name is reviewed',
        args: ['异种虫', 'Xeno Bug', 'ใช้เพื่อรับสัตว์เลี้ยง Xeno Bug'],
        status: 'review',
        code: 'english_proper_name_review'
    },
    {
        name: 'Source explicitly carries Xeno Bug',
        args: ['异种虫（Xeno Bug）', 'Xeno Bug', 'ใช้เพื่อรับสัตว์เลี้ยง Xeno Bug'],
        status: 'review',
        code: 'english_source_name_review'
    },
    {
        name: 'Hard glossary allows Xeno Bug',
        args: ['异种虫', 'Xeno Bug', 'ใช้เพื่อรับสัตว์เลี้ยง Xeno Bug', 'th', {
            allowedTerms: ['Xeno Bug']
        }],
        status: 'pass'
    },
    {
        name: 'Thai Excellent whole-reference copy',
        args: ['超凡', 'Excellent', 'Excellent'],
        status: 'block',
        code: 'english_reference_residual'
    },
    {
        name: 'Thai Excellent mixed target',
        args: ['超凡', 'Excellent', 'เลือก Excellent'],
        status: 'block',
        code: 'english_reference_residual'
    },
    {
        name: 'Thai bracketed Xeno Bug remains review-only',
        args: ['异种虫', 'Xeno Bug', 'ใช้เพื่อรับสัตว์เลี้ยง【Xeno Bug】'],
        status: 'review',
        code: 'english_proper_name_review'
    },
    {
        name: 'Thai bracketed localized name passes',
        args: ['异种虫', 'Xeno Bug', 'ใช้เพื่อรับสัตว์เลี้ยง【แมลงต่างดาว】'],
        status: 'pass'
    },
    {
        name: 'Italian single English reference word is reviewed',
        args: ['领取奖励', 'Claim Reward', 'Riscatta Reward', 'it'],
        status: 'review',
        code: 'english_proper_name_review'
    },
    {
        name: 'Polish single English reference word is reviewed',
        args: ['领取奖励', 'Claim Reward', 'Odbierz Reward', 'pl'],
        status: 'review',
        code: 'english_proper_name_review'
    },
    {
        name: 'Polish proper name is reviewed instead of blocking delivery',
        args: ['与Astra对话', 'Talk to Astra', 'Porozmawiaj z Astra', 'pl'],
        status: 'review',
        code: 'english_proper_name_review'
    },
    {
        name: 'Polish same-script word shared with English is reviewed',
        args: ['达到邀请上限', 'Invite limit reached', 'Osiągnięto limit zaproszeń', 'pl'],
        status: 'review',
        code: 'english_proper_name_review'
    },
    {
        name: 'Italian embedded multiword generic English copy is blocked',
        args: ['领取奖励', 'Claim Reward', 'Riscatta Claim Reward', 'it'],
        status: 'block'
    },
    {
        name: 'Italian common game borrowing remains a review',
        args: ['领取奖励', 'Claim Bonus', 'Riscatta Bonus', 'it'],
        status: 'review',
        code: 'english_borrowing_review'
    },
    {
        name: 'Italian strong English output is blocked without a reference column',
        args: ['领取奖励', '', 'Claim Reward', 'it'],
        status: 'block',
        code: 'english_target_residual'
    },
    {
        name: 'Japanese canonical ATK abbreviation is safe',
        args: ['提升攻击力', 'Increase ATK', 'ATKを上昇', 'ja'],
        status: 'pass'
    },
    {
        name: 'Korean canonical DEF abbreviation is safe',
        args: ['提升防御力', 'Increase DEF', 'DEF 증가', 'ko'],
        status: 'pass'
    },
    {
        name: 'Arabic canonical HP abbreviation is safe',
        args: ['恢复生命值', 'Restore HP', 'استعادة HP', 'ar'],
        status: 'pass'
    },
    {
        name: 'Unknown abbreviation still requires review',
        args: ['提升特殊属性', 'Increase XYZ', 'เพิ่ม XYZ'],
        status: 'review',
        code: 'english_proper_name_review'
    }
];

for (const testCase of cases) {
    const result = evaluate(...testCase.args);
    assert.equal(result.status, testCase.status, `${testCase.name}: status`);
    if (testCase.status === 'pass') {
        assert.deepEqual(result.issues, [], `${testCase.name}: pass should not contain issues`);
    } else {
        assert.equal(result.issues[0]?.kind, testCase.status === 'block' ? 'block' : 'review', `${testCase.name}: issue kind`);
        if (testCase.code) assert.equal(result.issues[0]?.code, testCase.code, `${testCase.name}: issue code`);
    }
}

for (const [targetLang, localizedWithoutAtk] of [
    ['it', "Aumenta l'attacco"],
    ['ja', '攻撃力を上昇'],
    ['ko', '공격력 증가'],
    ['pl', 'Zwiększa atak'],
    ['ar', 'زيادة قوة الهجوم']
]) {
    const result = evaluate('提升攻击力', 'Increase ATK', localizedWithoutAtk, targetLang);
    assert.equal(result.status, 'pass', `${targetLang}: reference-only ATK may be localized`);
    assert.deepEqual(result.issues, [], `${targetLang}: localized reference-only ATK should not create issues`);
}

const scriptLeakageCases = [
    {
        name: 'Italian Chinese residue',
        args: ['领取奖励', 'Riscatta 奖励', 'it'],
        status: 'block',
        code: 'target_chinese_residual'
    },
    {
        name: 'Polish Chinese residue',
        args: ['领取奖励', 'Odbierz 奖励', 'pl'],
        status: 'block',
        code: 'target_chinese_residual'
    },
    {
        name: 'Japanese simplified Chinese residue',
        args: ['领取奖励', '领取奖励', 'ja'],
        status: 'block',
        code: 'japanese_simplified_chinese_residual'
    },
    {
        name: 'Japanese valid localized text',
        args: ['领取奖励', '報酬を受け取る', 'ja'],
        status: 'pass'
    },
    {
        name: 'Japanese shared Han exact copy is reviewed',
        args: ['物理防御', '物理防御', 'ja'],
        status: 'review',
        code: 'japanese_source_copy_review'
    },
    {
        name: 'Japanese established shared Han UI term passes',
        args: ['防御力', '防御力', 'ja'],
        status: 'pass'
    },
    {
        name: 'Korean Chinese residue',
        args: ['领取奖励', '보상领取', 'ko'],
        status: 'block',
        code: 'korean_chinese_residual'
    },
    {
        name: 'Korean abbreviation-only UI is valid',
        args: ['HP', 'HP', 'ko'],
        status: 'pass'
    },
    {
        name: 'Arabic Chinese residue',
        args: ['领取奖励', 'استلم 奖励', 'ar'],
        status: 'block',
        code: 'arabic_chinese_residual'
    },
    {
        name: 'Arabic abbreviation-only UI is valid',
        args: ['ATK+10%', 'ATK+10%', 'ar'],
        status: 'pass'
    }
];

for (const testCase of scriptLeakageCases) {
    const result = guard.evaluateScriptLeakage(...testCase.args);
    assert.equal(result.status, testCase.status, `${testCase.name}: status`);
    if (testCase.code) assert.equal(result.issues[0]?.code, testCase.code, `${testCase.name}: issue code`);
}

const indexHtml = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const targetLanguageSelectHtml = indexHtml.match(
    /<select\s+id="targetLang"[^>]*>([\s\S]*?)<\/select>/
)?.[1] || '';
const expectedSupportedTargetLanguages = [
    ...targetLanguageSelectHtml.matchAll(/<option\s+value="([^"]+)"/g)
].map(match => match[1]);
assert.ok(
    expectedSupportedTargetLanguages.length > 0,
    'desktop target-language selector should expose at least one language'
);
assert.deepEqual(
    [...guard.getSupportedTargetLanguages()].sort(),
    [...expectedSupportedTargetLanguages].sort(),
    'script guard language coverage must match the desktop target-language selector'
);

const localizedSamples = {
    en: 'Claim reward',
    ja: '報酬を受け取る',
    ko: '보상 받기',
    'zh-TW': '領取獎勵',
    fr: 'Récupérer la récompense',
    de: 'Belohnung abholen',
    es: 'Reclamar recompensa',
    pt: 'Resgatar recompensa',
    ru: 'Получить награду',
    th: 'รับรางวัล',
    vi: 'Nhận phần thưởng',
    id: 'Klaim hadiah',
    it: 'Riscatta la ricompensa',
    ar: 'استلم المكافأة',
    tr: 'Ödülü al',
    hi: 'इनाम प्राप्त करें',
    fil: 'Kunin ang gantimpala',
    ms: 'Tuntut ganjaran',
    nl: 'Beloning ophalen',
    pl: 'Odbierz nagrodę',
    uk: 'Отримати нагороду',
    fa: 'دریافت پاداش',
    ur: 'انعام حاصل کریں',
    bn: 'পুরস্কার নিন',
    my: 'ဆုလာဘ်ရယူပါ',
    km: 'ទទួលរង្វាន់',
    lo: 'ຮັບລາງວັນ'
};

const wrongScriptSamples = {
    en: 'पुरस्कार लें',
    ja: '보상 받기',
    ko: '報酬を受け取る',
    'zh-TW': 'รับรางวัล',
    fr: 'पुरस्कार लें',
    de: 'পুরস্কার নিন',
    es: 'ဆုလာဘ်ရယူပါ',
    pt: 'ទទួលរង្វាន់',
    ru: 'รับรางวัล',
    th: 'Получить награду',
    vi: 'ຮັບລາງວັນ',
    id: 'استلم المكافأة',
    it: '보상 받기',
    ar: 'Получить награду',
    tr: '報酬を受け取る',
    hi: 'استلم المكافأة',
    fil: 'รับรางวัล',
    ms: 'Получить награду',
    nl: '보상 받기',
    pl: 'รับรางวัล',
    uk: 'ទទួលរង្វាន់',
    fa: 'Получить награду',
    ur: 'รับรางวัล',
    bn: 'इनाम प्राप्त करें',
    my: 'ទទួលរង្វាន់',
    km: 'ຮັບລາງວັນ',
    lo: '보상 받기'
};

for (const targetLang of expectedSupportedTargetLanguages) {
    const localized = localizedSamples[targetLang];
    assert.ok(localized, `${targetLang}: localized sample should exist`);

    const validScript = guard.evaluateScriptLeakage('领取奖励', localized, targetLang);
    assert.equal(validScript.status, 'pass', `${targetLang}: valid target script should pass`);

    const wrongScript = guard.evaluateScriptLeakage(
        '领取奖励',
        wrongScriptSamples[targetLang],
        targetLang
    );
    assert.equal(wrongScript.status, 'block', `${targetLang}: wrong writing system should block`);

    const validWithProtectedAtk = evaluate(
        '提升攻击力',
        'Increase ATK',
        targetLang === 'en' ? 'Increase ATK' : `${localized} ATK`,
        targetLang
    );
    assert.equal(validWithProtectedAtk.status, 'pass', `${targetLang}: canonical ATK should remain valid`);

    const missingProtectedAtk = evaluate(
        '提升攻击力',
        'Increase ATK',
        localized,
        targetLang
    );
    assert.equal(missingProtectedAtk.status, 'pass', `${targetLang}: reference-only ATK may be translated away`);
    assert.deepEqual(missingProtectedAtk.issues, [], `${targetLang}: translated reference-only ATK should not create issues`);

    if (targetLang !== 'en') {
        const englishResidual = evaluate(
            '领取奖励',
            'Claim Reward',
            'Claim Reward',
            targetLang
        );
        assert.equal(englishResidual.status, 'block', `${targetLang}: copied English reference should block`);
    }
}

const greekMixedIntoThai = guard.evaluateScriptLeakage(
    '领取奖励',
    'รับรางวัล Αλφα',
    'th'
);
assert.equal(greekMixedIntoThai.status, 'block', 'unlisted foreign writing systems should block');
assert.equal(greekMixedIntoThai.issues[0]?.code, 'target_greek_residual');

const unknownAbbreviationScriptCheck = guard.evaluateScriptLeakage(
    '提升特殊属性',
    'XYZ',
    'th'
);
assert.equal(
    unknownAbbreviationScriptCheck.status,
    'pass',
    'an unknown uppercase abbreviation alone should be left to the carryover review'
);
const unknownAbbreviationCarryoverCheck = evaluate(
    '提升特殊属性',
    'Increase XYZ',
    'XYZ',
    'th'
);
assert.equal(unknownAbbreviationCarryoverCheck.status, 'review');
assert.equal(
    unknownAbbreviationCarryoverCheck.issues[0]?.code,
    'english_proper_name_review'
);

const latinTargetNoReferenceEnglish = evaluate(
    '立即购买',
    '',
    'Buy now',
    'it'
);
assert.equal(
    latinTargetNoReferenceEnglish.status,
    'block',
    'clear English UI text should block even when a Latin target has no reference text'
);

console.log(
    `language-carryover-guard: ${cases.length} focused cases + ` +
    `${expectedSupportedTargetLanguages.length}-language matrix passed`
);
