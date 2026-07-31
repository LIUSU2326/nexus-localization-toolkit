import assert from 'node:assert/strict';

await import('../protected-ui-token-policy.js');

const policy = globalThis.NexusProtectedUiTokenPolicy;
assert.ok(policy, 'NexusProtectedUiTokenPolicy should be installed');

function issueCodes(source, target, referenceText = '', projectRules = '') {
    return policy.getIssues(source, target, { referenceText, projectRules }).map(issue => issue.code);
}

assert.deepEqual(issueCodes('战斗号角lv%s解锁', 'แตรศึกปลดล็อกที่ระดับ %s'), ['protected_ui_token_missing']);
assert.deepEqual(issueCodes('战斗号角lv%s解锁', 'แตรศึกปลดล็อกที่ Lv.%s'), []);
assert.deepEqual(issueCodes('交易所LV.10开放', 'ตลาดเปิดที่ LV10'), []);
assert.deepEqual(issueCodes('交易所LVL10开放', 'ตลาดเปิดที่ Lv.10'), []);

assert.deepEqual(
    issueCodes(
        '诃息专属S级神器宝箱',
        'หีบเรลิกเฉพาะระดับสูงสุดของเฮ็กซี',
        'Hexi Exclusive S-rank Relic Chest'
    ),
    ['contextual_grade_marker_mismatch']
);
assert.deepEqual(
    issueCodes(
        '诃息专属S级神器宝箱',
        'หีบเรลิกระดับ S เฉพาะของเฮ็กซี',
        'Hexi Exclusive S-rank Relic Chest'
    ),
    []
);
assert.deepEqual(issueCodes('SSS级奖励', 'รางวัลระดับ S'), ['contextual_grade_marker_mismatch']);
assert.deepEqual(issueCodes('SSS级奖励', 'รางวัลระดับ SSS'), []);
assert.deepEqual(issueCodes('S级与S级奖励', 'รางวัลระดับ S'), ['contextual_grade_marker_mismatch']);
assert.deepEqual(issueCodes('S级与S级奖励', 'รางวัลระดับ S และ S'), []);
assert.deepEqual(issueCodes('A/B级宝箱', 'หีบระดับ B'), ['contextual_grade_marker_mismatch']);
assert.deepEqual(issueCodes('A/B级宝箱', 'หีบระดับ A/B'), []);
assert.deepEqual(issueCodes('品階：SS', 'ระดับ SS'), []);
assert.deepEqual(issueCodes('等級：SS', 'ระดับสูงสุด'), ['contextual_grade_marker_mismatch']);

for (const marker of ['S', 'SS', 'SSS', 'EX', 'R', 'N', 'A', 'B', 'C', 'D', 'E', 'F']) {
    assert.deepEqual(
        issueCodes(`${marker}级宝箱`, 'หีบระดับสูง'),
        ['contextual_grade_marker_mismatch'],
        `${marker} grade should block when the exact marker is missing`
    );
    assert.deepEqual(
        issueCodes(`${marker}级宝箱`, `หีบระดับ ${marker}`),
        [],
        `${marker} grade should pass when the exact marker is preserved`
    );
}

assert.deepEqual(issueCodes('S-rank Relic Chest', 'หีบเรลิกระดับสูง'), ['contextual_grade_marker_mismatch']);
assert.deepEqual(issueCodes('S-rank Relic Chest', 'หีบเรลิกระดับ S'), []);
assert.deepEqual(issueCodes('Grade A Chest', 'หีบระดับ A'), []);
assert.deepEqual(issueCodes('A Tier 2 Hero', 'ฮีโร่ระดับ 2'), [], 'English article A must not become a grade marker');
assert.deepEqual(
    issueCodes('专属神器宝箱', 'หีบเรลิกระดับสูง', 'Exclusive S-rank Relic Chest'),
    [],
    'an old English reference must not invent a grade absent from the primary source'
);
assert.deepEqual(
    issueCodes('A级宝箱', 'หีบระดับ S', 'S-rank Chest'),
    ['contextual_grade_marker_mismatch'],
    'the primary source grade must win over a conflicting English reference'
);
assert.deepEqual(issueCodes('%s级奖励', 'รางวัลตามระดับ'), [], 'lowercase format placeholder %s is not S grade');
assert.deepEqual(issueCodes('S形路线', 'เส้นทางรูปตัวเอส'), []);
assert.deepEqual(issueCodes('A/B测试', 'การทดสอบ A/B'), []);

assert.deepEqual(
    issueCodes('恢复生命值', 'ฟื้นฟูพลังชีวิต', 'Heal HP'),
    ['protected_ui_token_missing'],
    'reference-only canonical combat abbreviations should remain stable'
);
assert.deepEqual(issueCodes('恢复生命值', 'ฟื้นฟู HP', 'Heal HP'), []);
assert.deepEqual(issueCodes('HP+10%', 'พลังชีวิต +10%'), ['protected_ui_token_missing']);
assert.deepEqual(issueCodes('HP+10%', 'HP +10%'), []);
assert.deepEqual(issueCodes('CD中', 'อยู่ในช่วงพัก'), ['protected_ui_token_missing']);
assert.deepEqual(issueCodes('CD中', 'CD อยู่'), []);
assert.deepEqual(issueCodes('HP与HP各恢复10%', 'ฟื้นฟู HP 10%'), ['protected_ui_token_missing']);
assert.deepEqual(issueCodes('HP与HP各恢复10%', 'ฟื้นฟู HP และ HP อย่างละ 10%'), []);

for (const token of [
    'ILVL', 'EXP', 'XP', 'MAX', 'MP', 'SP', 'AP', 'CP', 'BP', 'PWR', 'ATK',
    'PATK', 'MATK', 'DEF', 'PDEF', 'MDEF', 'DPS', 'CRIT', 'CDR', 'GCD',
    'DMG', 'RES', 'ACC', 'EVA', 'SPD', 'ASPD', 'MSPD', 'STR', 'DEX', 'INT',
    'VIT', 'AGI', 'LUK', 'HIT', 'PEN', 'HASTE', 'PVP', 'PVE', 'RTA', 'MMR',
    'MVP', 'NPC', 'BOSS', 'AOE', 'AFK', 'BUFF', 'DEBUFF', 'DOT', 'HOT', 'CC',
    'KO', 'VFX', 'SSR', 'SR', 'UR', 'ID', 'UID', 'GUID', 'UUID', 'VIP', 'GM',
    'CDK', 'API', 'SDK', 'UI', 'URL', 'HTTP', 'HTTPS', 'IP', 'PC', 'CPU',
    'GPU', 'FPS', 'QR', 'AI', 'AR', 'VR', 'APP', 'OS', 'MAC', 'RAM', 'ROM',
    'BGM', 'SFX', 'VO', 'OTP', 'SMS', 'PIN', 'DNS', 'VPN', 'LAN', 'WAN',
    'AM', 'PM', 'KB', 'MB', 'GB', 'TB', 'MS', 'WASD', 'ESC', 'CTRL',
    'SHIFT', 'ALT', 'TAB', 'ENTER', 'LMB', 'RMB'
]) {
    assert.deepEqual(
        issueCodes(`显示${token}数值`, 'แสดงค่า'),
        ['protected_ui_token_missing'],
        `${token} should be protected when it is authored in the source`
    );
    assert.deepEqual(
        issueCodes(`显示${token}数值`, `แสดงค่า ${token}`),
        [],
        `${token} should pass when preserved`
    );
    assert.deepEqual(
        issueCodes('显示数值', 'แสดงค่า', `Show ${token}`),
        policy.isReferencePreserveToken(token) ? ['protected_ui_token_missing'] : [],
        `${token} reference behavior should follow the canonical abbreviation policy`
    );
    assert.deepEqual(
        issueCodes('显示数值', `แสดงค่า ${token}`, `Show ${token}`),
        [],
        `${token} should pass when retained from the reference`
    );
}

assert.deepEqual(issueCodes('登录Steam', 'เข้าสู่ระบบ'), ['protected_ui_token_missing']);
assert.deepEqual(issueCodes('登录Steam', 'เข้าสู่ระบบ Steam'), []);
assert.deepEqual(issueCodes('打开Google Play Games', 'เปิดระบบเกม'), ['protected_ui_token_missing']);
assert.deepEqual(issueCodes('打开Google Play Games', 'เปิด Google Play Games'), []);
assert.deepEqual(issueCodes('支持iOS与Android', 'รองรับ iOS และ Android'), []);
assert.deepEqual(issueCodes('按Ctrl+S保存', 'กด Ctrl+S เพื่อบันทึก'), []);
assert.deepEqual(issueCodes('按Ctrl+S保存', 'กดปุ่มเพื่อบันทึก'), ['protected_ui_token_missing']);
assert.deepEqual(issueCodes('版本v1.2.3', 'เวอร์ชัน v1.2.3'), []);
assert.deepEqual(issueCodes('版本v1.2.3', 'เวอร์ชัน 1.2.3'), ['protected_ui_token_missing']);
assert.deepEqual(issueCodes('时区UTC+8', 'เขตเวลา UTC+8'), []);
assert.deepEqual(issueCodes('头像.png', 'รูปประจำตัว.png'), []);
assert.deepEqual(issueCodes('奖励x10', 'รางวัลสิบเท่า'), ['protected_ui_token_missing']);
assert.deepEqual(issueCodes('奖励x10', 'รางวัล x10'), []);
assert.deepEqual(issueCodes('等阶IV', 'ระดับ 4'), ['protected_ui_token_missing']);
assert.deepEqual(issueCodes('等阶IV', 'ระดับ IV'), []);
assert.deepEqual(issueCodes('字段SLG_ID不可修改', 'ห้ามแก้ไขฟิลด์'), ['protected_ui_token_missing']);
assert.deepEqual(issueCodes('字段SLG_ID不可修改', 'ห้ามแก้ไขฟิลด์ SLG_ID'), []);

assert.deepEqual(
    issueCodes('云中城战令', 'บัตรผ่านการรบ', 'Cloudspire Pass', '保留英文：Cloudspire Pass'),
    ['protected_ui_token_missing']
);
assert.deepEqual(
    issueCodes('云中城战令', 'บัตรผ่านการรบ Cloudspire Pass', 'Cloudspire Pass', '保留英文：Cloudspire Pass'),
    []
);

const requirements = policy.getRequirements('战斗号角lv%s，HP+10%', '');
let placeholderIndex = 0;
const replaced = policy.replaceProtectedTokens(
    '战斗号角lv%s，HP+10%',
    requirements,
    () => `__UI_${++placeholderIndex}__`
);
assert.equal(replaced, '战斗号角__UI_1__%s，__UI_2__+10%');

const gradeRequirements = policy.getRequirements('按Ctrl+S后领取S级与SS级宝箱', '');
placeholderIndex = 0;
const gradeReplaced = policy.replaceProtectedTokens(
    '按Ctrl+S后领取S级与SS级宝箱',
    gradeRequirements,
    () => `__UI_${++placeholderIndex}__`
);
assert.equal(
    gradeReplaced,
    '按__UI_1__+S后领取__UI_2__级与__UI_3__级宝箱',
    'only grade-context S/SS markers should be protected in addition to existing Ctrl'
);

assert.ok(policy.getSafeCarryoverTokens().includes('lv'));
assert.ok(policy.getSafeCarryoverTokens().includes('hp'));
assert.ok(policy.getSafeCarryoverTokens().includes('atk'));
assert.ok(policy.getSafeCarryoverTokens().includes('def'));
assert.equal(policy.isSafeCarryoverToken('ATK'), true);
assert.equal(policy.isSafeCarryoverToken('ATK+10'), true);
assert.equal(policy.isSafeCarryoverToken('Atk'), false);
assert.equal(policy.isSafeCarryoverToken('S'), false);
assert.equal(policy.isSafeCarryoverToken('A'), false);
assert.equal(policy.isSafeCarryoverToken('Cloudspire'), false);
assert.equal(policy.isReferencePreserveToken('ATK'), true);
assert.equal(policy.isReferencePreserveToken('DEF'), true);
assert.equal(policy.isReferencePreserveToken('HP'), true);
assert.equal(policy.isReferencePreserveToken('BOSS'), false);
assert.equal(policy.isReferencePreserveToken('Cloudspire'), false);
assert.ok(policy.getSafeCarryoverPhrases().includes('Google Play'));

console.log('protected-ui-token-policy: all cases passed');
