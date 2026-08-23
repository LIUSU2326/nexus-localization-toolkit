import assert from 'node:assert/strict';

await import('../translation-strict-repair-policy.js');

const policy = globalThis.NexusTranslationStrictRepairPolicy;
assert.ok(policy, 'NexusTranslationStrictRepairPolicy should be installed');
assert.equal(policy.DEFAULT_WAVE_SIZE, 60);
assert.equal(policy.DEFAULT_MAX_ATTEMPTS, 2);
assert.equal(policy.DEFAULT_MAX_NO_PROGRESS_SWEEPS, 2);

{
    const jobs = Array.from({ length: 125 }, (_, index) => ({ taskKey: `task-${index}` }));
    const waves = policy.splitRepairWaves(jobs);
    assert.deepEqual(
        waves.map(wave => wave.length),
        [60, 60, 5],
        '125 jobs should be split into bounded 60/60/5 waves'
    );
    assert.deepEqual(
        waves.flat().map(job => job.taskKey),
        jobs.map(job => job.taskKey),
        'wave splitting should retain stable source order when attempts are equal'
    );
    assert.equal(
        policy.selectRepairWave(jobs, new Map(), { waveSize: 500 }).length,
        60,
        'a caller cannot raise one repair wave above the hard 60-job bound'
    );
}

{
    const jobs = ['a', 'b', 'c', 'd', 'e', 'f'].map(taskKey => ({ taskKey }));
    const attempts = new Map([
        ['a', 1],
        ['b', 0],
        ['c', 1],
        ['d', 2],
        ['e', 0],
        ['f', 3]
    ]);
    assert.deepEqual(
        policy.selectRepairWave(jobs, attempts).map(job => job.taskKey),
        ['b', 'e', 'a', 'c'],
        'untried jobs should go first, ties should stay stable, and two-attempt jobs should be exhausted'
    );
    assert.deepEqual(
        policy.selectRepairWave(jobs, attempts, { waveSize: 2 }).map(job => job.taskKey),
        ['b', 'e'],
        'a smaller requested wave should preserve attempt fairness'
    );
    assert.deepEqual(
        policy.selectRepairWave(jobs, attempts, { maxAttempts: 99 }).map(job => job.taskKey),
        ['b', 'e', 'a', 'c'],
        'a caller cannot raise the per-item attempt ceiling above two'
    );
    assert.deepEqual(
        policy.splitRepairWaves(jobs, attempts, { waveSize: 2 })
            .map(wave => wave.map(job => job.taskKey)),
        [['b', 'e'], ['a', 'c']],
        'fair attempt ordering should also apply when all eligible waves are materialized'
    );
}

for (const text of [
    '需确认：目标阿拉伯文中混入中文',
    '目标韩文中混入中文汉字',
    '目标日文中混入中文简体字：们',
    '译文中残留中文',
    '目标泰文与中文原文相同，疑似未翻译',
    '目标译文与中文原文完全一致'
]) {
    assert.equal(policy.isStrictMixedChineseIssueText(text), true, `${text} should be strict`);
}
for (const text of [
    '',
    '通过',
    '需确认：目标日文与中文原文高度一致，需人工确认是否为合法共用汉字',
    '需确认：英文专名需确认：RTA',
    '目标译文中混入英文'
]) {
    assert.equal(policy.isStrictMixedChineseIssueText(text), false, `${text || '(blank)'} should not be strict mixed Chinese`);
}
assert.equal(
    policy.isStrictMixedChineseIssueText('需确认：目标日文与中文原文高度一致；目标韩文中混入中文汉字'),
    true,
    'a soft Japanese source-copy review must not hide a separate strict mixed-Chinese issue'
);

for (const result of [
    { kind: 'block', code: 'target_source_copy' },
    { kind: 'block', code: 'target_chinese_residual' },
    { kind: 'BLOCK', code: 'arabic_chinese_residual' }
]) {
    assert.equal(policy.isStrictMixedChineseGuardResult(result), true);
}
for (const result of [
    { kind: 'review', code: 'japanese_source_copy_review' },
    { kind: 'review', code: 'target_chinese_residual' },
    { kind: 'block', code: 'english_reference_residual' },
    { status: 'block', code: 'target_source_copy' },
    null
]) {
    assert.equal(policy.isStrictMixedChineseGuardResult(result), false);
}

assert.equal(policy.isTwoCycle(['A', 'B'], 'A'), true);
assert.equal(policy.isTwoCycle(['A', 'B', 'A'], 'B'), true);
assert.equal(policy.isTwoCycle(['A', 'A'], 'A'), false);
assert.equal(policy.isTwoCycle(['A'], 'A'), false);

{
    const cleared = policy.advanceLoopState({}, 3, 0, 'none');
    assert.equal(cleared.status, 'cleared');
    assert.equal(cleared.noProgressSweeps, 0);

    const firstStall = policy.advanceLoopState({ fingerprintHistory: ['start'] }, 3, 3, 'same-1');
    assert.equal(firstStall.status, 'continue');
    assert.equal(firstStall.noProgressSweeps, 1);
    const secondStall = policy.advanceLoopState(firstStall, 3, 3, 'same-2');
    assert.equal(secondStall.status, 'stalled');
    assert.equal(secondStall.noProgressSweeps, 2);

    const recovered = policy.advanceLoopState(secondStall, 3, 2, 'progress');
    assert.equal(recovered.status, 'continue');
    assert.equal(recovered.noProgressSweeps, 0, 'real progress should reset the stall counter');

    const oscillating = policy.advanceLoopState(
        { fingerprintHistory: ['translation-A', 'translation-B'] },
        2,
        2,
        'translation-A'
    );
    assert.equal(oscillating.status, 'oscillating');
}

const acceptanceCases = [
    {
        name: 'strict issue clears completely',
        previous: '需确认：目标阿拉伯文中混入中文',
        next: '通过',
        expected: true
    },
    {
        name: 'hard to hard is accepted when only the target issue clears',
        previous: '需确认：目标阿拉伯文中混入中文；缺少格式/占位符：{0}',
        next: '需确认：缺少格式/占位符：{0}',
        expected: true
    },
    {
        name: 'target category still present is not accepted on text-count alone',
        previous: '需确认：目标阿拉伯文中混入中文；目标译文与中文原文完全一致',
        next: '需确认：目标阿拉伯文中混入中文',
        expected: false
    },
    {
        name: 'same target issue remains',
        previous: '需确认：目标阿拉伯文中混入中文',
        next: '需确认：目标阿拉伯文中混入中文',
        expected: false
    },
    {
        name: 'one target issue merely changes into another',
        previous: '需确认：目标阿拉伯文中混入中文',
        next: '需确认：目标译文与中文原文完全一致',
        expected: false
    },
    {
        name: 'target clears but a new hard issue appears',
        previous: '需确认：目标阿拉伯文中混入中文',
        next: '需确认：数字不一致：1 → 2',
        expected: false
    },
    {
        name: 'target reduces but a second non-target issue is introduced',
        previous: '需确认：目标阿拉伯文中混入中文；缺少格式/占位符：{0}',
        next: '需确认：缺少格式/占位符：{0}；数字不一致：1 → 2',
        expected: false
    },
    {
        name: 'existing hard category may change evidence without becoming a new regression',
        previous: '需确认：目标阿拉伯文中混入中文；缺少格式/占位符：{0}',
        next: '需确认：缺少格式/占位符：{1}',
        expected: true
    },
    {
        name: 'a new soft length review does not block a strict target improvement',
        previous: '需确认：目标阿拉伯文中混入中文',
        next: '需确认：译文长度超出建议',
        expected: true
    },
    {
        name: 'no previous target issue cannot qualify',
        previous: '需确认：数字不一致：1 → 2',
        next: '通过',
        expected: false
    }
];
for (const testCase of acceptanceCases) {
    assert.equal(
        policy.shouldAcceptMixedChineseCandidate(testCase.previous, testCase.next),
        testCase.expected,
        testCase.name
    );
}

assert.equal(
    policy.shouldAcceptMixedChineseCandidate(
        [
            { kind: 'block', code: 'target_source_copy', message: '目标泰文与中文原文相同' },
            { kind: 'block', code: 'placeholder_missing', message: '缺少占位符' }
        ],
        [{ kind: 'block', code: 'placeholder_missing', message: '缺少占位符' }]
    ),
    true,
    'structured guard results should support the same hard-to-hard acceptance rule'
);
assert.equal(
    policy.shouldAcceptMixedChineseCandidate(
        [{ kind: 'review', code: 'japanese_source_copy_review', message: '目标日文与中文原文高度一致' }],
        []
    ),
    false,
    'a soft Japanese source-copy review is never a strict repair target'
);

console.log('translation-strict-repair-policy: bounded waves, loop exits, matchers, and candidate matrix passed');
