import assert from 'node:assert/strict';

await import('../language-quality-profiles.js');
await import('../translation-format-token-policy.js');
await import('../translation-number-policy.js');

const policy = globalThis.NexusTranslationNumberPolicy;
assert.ok(policy, 'NexusTranslationNumberPolicy should be installed');

function evaluate(source, target, targetLang = 'en') {
    return policy.evaluate(source, target, targetLang);
}

assert.deepEqual(evaluate('获得 10 金币', 'Zdobądź 10 monet', 'pl').hardIssues, []);

{
    const result = evaluate('10 + 10 obrażeń', '10 obrażeń', 'pl');
    assert.deepEqual(result.hardIssues, [], 'repeated source constraints must not force a repair loop');
    assert.ok(result.reviewIssues.some(issue => issue.includes('重复约束需确认')));
}

{
    const result = evaluate('等级 1', 'Poziom 1 i 2', 'pl');
    assert.deepEqual(result.hardIssues, [], 'a target-only number is review-only without proven semantic conflict');
    assert.ok(result.reviewIssues.some(issue => issue.includes('目标新增 2')));
}

assert.ok(
    evaluate('伤害 +10%', 'Obrażenia -10%', 'pl').hardIssues.some(issue => issue.includes('数字符号不一致')),
    'an explicit sign reversal must remain blocking'
);
assert.ok(
    evaluate('范围 1 至 2', 'Zakres od 2 do 1', 'pl').hardIssues.some(issue => issue.includes('数字区间方向不一致')),
    'range endpoints must retain semantic direction'
);
assert.deepEqual(evaluate('速度 1.5', 'Prędkość 1,5', 'pl').hardIssues, []);
assert.deepEqual(evaluate('金币 1,000', '1 000 monet', 'pl').hardIssues, []);

for (const [source, target, targetLang] of [
    ['升50级', 'Lv.50로 업그레이드', 'ko'],
    ['lv2.刷新更多怪物', 'Lv.2: 더 많은 몬스터 출현', 'ko'],
    ['升级技能到40级', '스킬을 Lv.40으로 업그레이드', 'ko'],
    ['步骤2', 'Instrukcja.2', 'pl']
]) {
    assert.deepEqual(
        evaluate(source, target, targetLang).hardIssues,
        [],
        `punctuation-adjacent numbers must remain visible to numeric QA: ${target}`
    );
}

assert.ok(
    evaluate('升50级', 'Lv.40로 업그레이드', 'ko').hardIssues.some(issue => issue.includes('缺少 50')),
    'recognizing a dotted UI-level number must still detect a real magnitude mismatch'
);
assert.ok(
    evaluate('步骤2', 'Instrukcja.3', 'pl').hardIssues.some(issue => issue.includes('缺少 2')),
    'recognizing punctuation-adjacent list numbers must still detect a real mismatch'
);
assert.deepEqual(evaluate('范围 1...2', 'Range 1...2', 'en').hardIssues, []);
assert.ok(
    evaluate('范围 1...2', 'Range 1...3', 'en').hardIssues.some(issue => issue.includes('缺少 2')),
    'ellipsis-adjacent range endpoints must remain enforceable'
);

assert.ok(evaluate('版本 v1.5', 'Wersja v1,5', 'pl').hardIssues.some(issue => issue.includes('缺少 1.5')));
assert.deepEqual(evaluate('版本 v1.2.3', 'Version v1.2.3', 'en').hardIssues, []);
assert.ok(evaluate('版本 v1.2.3', 'Version v1.2.4', 'en').hardIssues.some(issue => issue.includes('缺少 1.2.3')));
assert.ok(evaluate('系数 0.125', 'Coefficient 125', 'en').hardIssues.some(issue => issue.includes('缺少 0.125')));
assert.ok(evaluate('概率 0.001%', 'Chance 1%', 'en').hardIssues.some(issue => issue.includes('缺少 0.001%')));
assert.ok(evaluate('要求 >10', 'Requires <10', 'en').hardIssues.some(issue => issue.includes('数字比较方向不一致')));

{
    const result = evaluate('属性 10 -5', 'Stats 10 5', 'en');
    assert.deepEqual(result.hardIssues, [], 'an ambiguous missing sign stays review-only');
    assert.ok(result.reviewIssues.some(issue => issue.includes('数字符号需确认')));
}

for (const [targetText, targetLang] of [
    ['2 rewards, range 1 to 2', 'en'],
    ['Ab Stufe 2: Bereich 1 bis 2', 'de']
]) {
    assert.deepEqual(
        evaluate('范围 1 到 2，奖励 2 个', targetText, targetLang).hardIssues,
        [],
        `a repeated endpoint before the actual range must not create a false reversal: ${targetText}`
    );
}

assert.deepEqual(
    evaluate('七日签到，领节日好礼', '7일 연속 출석으로 축제 보상을 받으세요', 'ko').hardIssues,
    [],
    'Chinese number words versus target digits are review-only'
);
assert.deepEqual(evaluate('提升20%的伤害', '+20% obrażeń', 'pl').hardIssues, []);
assert.deepEqual(evaluate('每天8点刷新', 'Odświeżanie codziennie o 8:00', 'pl').hardIssues, []);
{
    const result = evaluate('每日0点刷新', '매일 자정에 새로고침', 'ko');
    assert.deepEqual(result.hardIssues, [], 'a clock hour rendered as a word must not trigger automatic repair');
    assert.ok(result.reviewIssues.some(issue => issue.includes('时间数字 0')));
}
assert.deepEqual(
    evaluate(
        '<outline color=#48340a width=2>激活期间享受</outline>',
        '활성화 기간 중 혜택 적용',
        'ko'
    ).hardIssues,
    [],
    'numeric attributes inside a missing format token must not create duplicate numeric blockers'
);
assert.deepEqual(evaluate('任意6及6以上难度怪物', '난이도 6 이상 몬스터', 'ko').hardIssues, []);
assert.ok(evaluate('造成220%的伤害', '240% 피해를 줍니다', 'ko').hardIssues.some(issue => issue.includes('缺少 220%')));

console.log('translation-number-qa: semantic hard checks and review-only ambiguity cases passed');
