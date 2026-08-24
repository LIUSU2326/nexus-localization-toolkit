import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

await import('../translation-strict-repair-policy.js');
await import('../translation-issue-policy.js');

const policy = globalThis.NexusTranslationIssuePolicy;
assert.ok(policy, 'NexusTranslationIssuePolicy should be installed');
assert.equal(policy.POLICY_VERSION, '1.3.0');
assert.deepEqual(policy.sanitizePersistableCandidateAudit({
    candidateReturned: true,
    candidateDecision: 'rejected',
    candidateRejectReason: 'new_required_finding',
    previousIssueIds: ['mixed_chinese', 'malicious-secret-text'],
    candidateIssueIds: ['number', 'number'],
    introducedHardIssueIds: ['number', 'SECRET_CANDIDATE_TRANSLATION'],
    resolvedIssueIds: ['mixed_chinese'],
    selectedText: 'SECRET_CANDIDATE_TRANSLATION'
}), {
    candidateReturned: true,
    candidateDecision: 'rejected',
    candidateRejectReason: 'new_required_finding',
    previousIssueIds: ['mixed_chinese'],
    candidateIssueIds: ['number'],
    introducedHardIssueIds: ['number'],
    resolvedIssueIds: ['mixed_chinese']
});
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(scriptDir, '..');
const descriptorById = new Map(policy.ISSUE_DESCRIPTORS.map(item => [item.id, item]));
const requiredIds = [
    'transport_or_missing',
    'mixed_chinese',
    'wrong_script',
    'format_placeholder',
    'number',
    'discount_block',
    'english_block',
    'zh_conversion',
    'manual_retry'
];
const projectIds = ['protected_ui_token', 'term_hard'];
const reviewIds = [
    'format_review',
    'number_review',
    'discount_review',
    'english_review',
    'spacing',
    'completeness_review',
    'length_review',
    'other_hard',
    'other_review'
];

for (const id of [...requiredIds, ...projectIds, ...reviewIds]) {
    assert.ok(descriptorById.has(id), `${id} should have a canonical descriptor`);
    const descriptor = descriptorById.get(id);
    assert.ok(['required', 'project', 'review'].includes(descriptor.tier));
    assert.equal(typeof descriptor.label, 'string');
    assert.equal(typeof descriptor.defaultSelected, 'boolean');
    assert.equal(descriptor.defaultSelected, descriptor.tier === 'required');
}

function ids(entry) {
    return policy.classifyEntry(entry).map(item => item.id);
}

assert.deepEqual(ids({ status: 'missing' }), ['transport_or_missing']);
assert.deepEqual(ids({ status: 'failed', error: '请求超时' }), ['transport_or_missing']);
assert.ok(ids({ status: 'qa_failed', qaStatus: '需确认：目标阿拉伯文中混入中文' }).includes('mixed_chinese'));
assert.ok(ids({ status: 'qa_failed', qaStatus: '需确认：目标韩文中混入日文假名' }).includes('wrong_script'));
assert.ok(ids({ status: 'qa_failed', qaStatus: '需确认：目标阿拉伯文疑似未翻译成阿拉伯文' }).includes('completeness_review'));
assert.ok(ids({ status: 'qa_failed', qaStatus: '需确认：缺少格式/占位符：{0}、{1}' }).includes('format_placeholder'));
assert.ok(ids({ status: 'qa_failed', qaStatus: '需确认：受保护UI标记缺失或被翻译：LV / HP' }).includes('protected_ui_token'));
assert.ok(ids({ status: 'qa_failed', qaStatus: '需确认：数字不一致：1, 2' }).includes('number'));
assert.ok(ids({ status: 'qa_failed', qaStatus: '需确认：数字区间方向不一致：应保持 1 → 2' }).includes('number'));
assert.ok(ids({ status: 'qa_failed', qaStatus: '需确认：折扣语义不一致：30%' }).includes('discount_block'));
assert.ok(ids({ status: 'qa_failed', qaStatus: '需确认：折扣表达需确认：%s折' }).includes('discount_review'));
assert.ok(ids({ status: 'qa_failed', qaStatus: '需确认：术语未遵守：金币 应译为 Gold' }).includes('term_hard'));
assert.ok(ids({ status: 'qa_failed', qaStatus: '需确认：目标译文仍含英文：Excellent' }).includes('english_block'));
assert.ok(ids({ status: 'qa_failed', qaStatus: '需确认：英文专名需确认：RTA' }).includes('english_review'));
assert.ok(ids({ status: 'qa_failed', qaStatus: '需确认：繁简转换不完整：仍含疑似简体字「们」' }).includes('zh_conversion'));
assert.ok(ids({ status: 'qa_failed', qaStatus: '需确认：目标译文疑似被拆成逐字空格' }).includes('spacing'));
assert.ok(ids({ status: 'qa_failed', qaStatus: '需确认：疑似内容流失：译文只覆盖部分内容' }).includes('completeness_review'));
assert.equal(descriptorById.get('completeness_review').tier, 'review', 'heuristic content-loss findings should require review instead of automatic repair');
assert.equal(descriptorById.get('completeness_review').defaultSelected, false, 'heuristic completeness review must not enter the default repair queue');
assert.ok(ids({ status: 'qa_failed', qaStatus: '需确认：译文长度超出建议：20/10 字符' }).includes('length_review'));
assert.ok(ids({ status: 'qa_failed', qaStatus: '需确认：旧版未分类硬错误' }).includes('other_review'));
assert.ok(ids({ status: 'success', qaStatus: '需确认：风格略显生硬' }).includes('other_review'));
assert.deepEqual(
    ids({
        status: 'qa_failed',
        qaStatus: '需确认：目标阿拉伯文中混入中文；语气需要人工确认'
    }),
    ['mixed_chinese', 'other_review'],
    'an unknown review must not disappear merely because the same row has a canonical issue'
);

assert.equal(
    policy.isStrictMixedChineseIssueText('需确认：目标日文与中文原文高度一致，需人工确认是否合法共用汉字'),
    false,
    'the strict matcher should preserve the Japanese shared-kanji review exception'
);
assert.equal(
    policy.isStrictMixedChineseIssueText('需确认：目标阿拉伯文中混入中文'),
    true
);

{
    const requiredCases = [
        {
            label: 'empty or missing translation',
            entry: { status: 'missing', qaStatus: '译文为空，疑似未返回结果' },
            expectedId: 'transport_or_missing'
        },
        {
            label: 'model failure',
            entry: { status: 'failed', error: '模型翻译失败' },
            expectedId: 'transport_or_missing'
        },
        {
            label: 'strict untranslated source copy',
            entry: { status: 'qa_failed', qaStatus: '目标阿拉伯文与中文原文相同，疑似未翻译' },
            expectedId: 'mixed_chinese'
        },
        {
            label: 'Chinese residue',
            entry: { status: 'qa_failed', qaStatus: '目标阿拉伯文中混入中文' },
            expectedId: 'mixed_chinese'
        },
        {
            label: 'wrong-script residue',
            entry: { status: 'qa_failed', qaStatus: '目标韩文中混入日文假名' },
            expectedId: 'wrong_script'
        }
    ];

    requiredCases.forEach(({ label, entry, expectedId }) => {
        const finding = policy.classifyEntry(entry).find(item => item.id === expectedId);
        assert.ok(finding, `${label} should remain classified as ${expectedId}`);
        assert.equal(finding.tier, 'required', `${label} must continue to block delivery`);
        assert.equal(finding.defaultSelected, true, `${label} must remain selected for required repair`);
    });

    const heuristicPlan = policy.buildPlan([{
        taskKey: 'heuristic-completeness',
        status: 'qa_failed',
        qaStatus: '需确认：疑似译文过短：4/12 字符，可能存在内容流失'
    }], entry => entry.taskKey);
    assert.equal(heuristicPlan.byId.completeness_review.count, 1);
    assert.equal(heuristicPlan.tiers.required.count, 0, 'heuristic completeness alone must not become a required item');
    assert.equal(heuristicPlan.tiers.review.count, 1, 'heuristic completeness should remain visible for review');
    assert.equal(
        heuristicPlan.defaultSelectedIds.includes('completeness_review'),
        false,
        'heuristic completeness must stay out of the default repair selection'
    );
}

{
    const scriptDir = path.dirname(fileURLToPath(import.meta.url));
    const projectDir = path.resolve(scriptDir, '..');
    const source = fs.readFileSync(path.join(projectDir, 'translation-issue-policy.js'), 'utf8');
    assert.ok(!source.includes('.translatedText'), 'classification must never read translated output fields implicitly');
    assert.ok(!source.includes('.actionSuggestion'), 'classification must never read UI suggestion fields');
    const ignored = policy.classifyEntry({
        status: 'success',
        qaStatus: '通过',
        translatedText: '目标阿拉伯文中混入中文',
        actionSuggestion: '数字不一致'
    });
    assert.deepEqual(ignored, [], 'only status/QA/risk/error fields may drive classification');
}

{
    const duplicateA = {
        taskKey: 'A',
        status: 'qa_failed',
        qaStatus: '需确认：目标阿拉伯文中混入中文；缺少格式/占位符：{0}'
    };
    const duplicateASecondRow = {
        ...duplicateA,
        qaStatus: '需确认：目标阿拉伯文中混入中文；数字不一致：7'
    };
    const projectB = {
        taskKey: 'B',
        status: 'qa_failed',
        qaStatus: '需确认：受保护UI标记缺失或被翻译：LV'
    };
    const reviewC = {
        taskKey: 'C',
        status: 'qa_failed',
        qaStatus: '需确认：译文长度超出建议：30/20 字符'
    };
    const plan = policy.buildPlan(
        [duplicateA, duplicateASecondRow, projectB, reviewC],
        entry => entry.taskKey
    );

    assert.equal(plan.byId.mixed_chinese.count, 1, 'each category should deduplicate the same logical row');
    assert.equal(plan.byId.mixed_chinese.findingCount, 1, 'finding stats should also deduplicate repeated report rows');
    assert.equal(plan.byId.format_placeholder.count, 1);
    assert.equal(plan.byId.number.count, 1);
    assert.equal(plan.tiers.required.count, 1, 'tier stats should be a union, not the sum of categories');
    assert.equal(plan.tiers.project.count, 1);
    assert.equal(plan.tiers.review.count, 1);
    assert.equal(plan.union.count, 3, 'the all-category union should also deduplicate logical rows');
    assert.deepEqual(policy.getSelectedEntryUnion(plan, []), [], 'empty issue selection must run nothing');
    assert.deepEqual(
        policy.getSelectedEntryUnion(plan, ['mixed_chinese', 'number']).map(entry => entry.taskKey),
        ['A'],
        'selected categories should produce one unioned row'
    );
    assert.deepEqual(
        policy.getSelectedEntryUnion(plan, new Set(['protected_ui_token', 'length_review'])).map(entry => entry.taskKey),
        ['B', 'C']
    );
}

{
    const acceptedPlan = policy.buildPlan([{
        taskKey: 'accepted-project-item',
        status: 'success',
        qaStatus: '需确认：受保护UI标记缺失或被翻译：LV',
        manualResolutionValid: true
    }], entry => entry.taskKey);
    assert.equal(acceptedPlan.union.count, 0, 'a valid file-level decision should not reappear in the live repair plan');
}

function decide(previous, candidate, options = {}) {
    return policy.decideCandidate({ previous, candidate, ...options });
}

{
    const decision = decide(
        { text: '旧译文', status: 'qa_failed', qaStatus: '需确认：目标阿拉伯文中混入中文' },
        { text: 'New translation', status: 'success', qaStatus: '通过' },
        { selectedIssueIds: ['mixed_chinese'], mode: 'targeted' }
    );
    assert.equal(decision.accept, true);
    assert.equal(decision.selectedText, 'New translation');
    assert.equal(decision.diff.selectedBefore, 1);
    assert.equal(decision.diff.selectedAfter, 0);
    assert.equal(decision.candidateReturned, true);
    assert.equal(decision.candidateDecision, 'accepted');
    assert.equal(decision.candidateRejectReason, '');
    assert.deepEqual(decision.previousIssueIds, ['mixed_chinese']);
    assert.deepEqual(decision.candidateIssueIds, []);
    assert.deepEqual(decision.introducedHardIssueIds, []);
    assert.deepEqual(decision.resolvedIssueIds, ['mixed_chinese']);
}

{
    const decision = decide(
        { text: '旧译文', status: 'qa_failed', qaStatus: '需确认：目标阿拉伯文中混入中文' },
        { text: 'New 2', status: 'qa_failed', qaStatus: '需确认：数字不一致：2' },
        { selectedIssueIds: ['mixed_chinese'], mode: 'targeted' }
    );
    assert.equal(decision.accept, false, 'fixing Chinese may not introduce a required number error');
    assert.equal(decision.reason, 'new_required_finding');
    assert.equal(decision.selectedText, '旧译文');
    assert.equal(decision.candidateReturned, true, 'a QA-rejected content candidate must still be recorded as returned');
    assert.equal(decision.candidateDecision, 'rejected');
    assert.equal(decision.candidateRejectReason, 'new_required_finding');
    assert.deepEqual(decision.previousIssueIds, ['mixed_chinese']);
    assert.deepEqual(decision.candidateIssueIds, ['number']);
    assert.deepEqual(decision.introducedHardIssueIds, ['number']);
    assert.deepEqual(decision.resolvedIssueIds, ['mixed_chinese']);
}

{
    const previous = {
        text: '旧译文',
        status: 'qa_failed',
        qaStatus: '需确认：目标阿拉伯文中混入中文；缺少格式/占位符：{0}、{1}'
    };
    const improved = {
        text: 'New {1}',
        status: 'qa_failed',
        qaStatus: '需确认：缺少格式/占位符：{1}'
    };
    const decision = decide(previous, improved, {
        selectedIssueIds: ['mixed_chinese'],
        mode: 'targeted'
    });
    assert.equal(decision.accept, true, 'an existing hard evidence set may shrink while the target clears');
}

{
    const previous = {
        text: '旧译文',
        status: 'qa_failed',
        qaStatus: '需确认：目标阿拉伯文中混入中文；缺少格式/占位符：{0}'
    };
    const swappedEvidence = {
        text: 'New {1}',
        status: 'qa_failed',
        qaStatus: '需确认：缺少格式/占位符：{1}'
    };
    const decision = decide(previous, swappedEvidence, {
        selectedIssueIds: ['mixed_chinese'],
        mode: 'targeted'
    });
    assert.equal(decision.accept, false, 'clearing Chinese must not swap one missing placeholder for another');
    assert.equal(decision.reason, 'new_required_finding');
}

{
    const notReduced = decide(
        { text: 'A', status: 'qa_failed', qaStatus: '需确认：目标阿拉伯文中混入中文' },
        { text: 'B', status: 'qa_failed', qaStatus: '需确认：目标阿拉伯文中混入中文' },
        { selectedIssueIds: ['mixed_chinese'], mode: 'targeted' }
    );
    assert.equal(notReduced.accept, false);
    assert.equal(notReduced.reason, 'selected_issue_not_reduced');
}

{
    const partialImprovement = decide(
        {
            text: 'A',
            status: 'qa_failed',
            qaStatus: '需确认：目标阿拉伯文中混入中文；缺少格式/占位符：{0}'
        },
        {
            text: 'B',
            status: 'qa_failed',
            qaStatus: '需确认：缺少格式/占位符：{0}'
        },
        { mode: 'ordinary' }
    );
    assert.equal(partialImprovement.accept, true, 'ordinary deep repair should retain a strict hard-set reduction');
    assert.equal(partialImprovement.reason, 'accepted_hard_reduction');

    const sideways = decide(
        {
            text: 'A',
            status: 'qa_failed',
            qaStatus: '需确认：目标阿拉伯文中混入中文；缺少格式/占位符：{0}'
        },
        {
            text: 'B',
            status: 'qa_failed',
            qaStatus: '需确认：缺少格式/占位符：{0}；数字不一致：9'
        },
        { mode: 'ordinary' }
    );
    assert.equal(sideways.accept, false, 'A+B to B+C is not monotonic');
}

{
    const candidateFailure = decide(
        { text: 'usable', status: 'qa_failed', qaStatus: '需确认：目标阿拉伯文中混入中文' },
        { text: '', status: 'failed', error: '请求超时' },
        { selectedIssueIds: ['mixed_chinese'], mode: 'targeted' }
    );
    assert.equal(candidateFailure.accept, false);
    assert.equal(candidateFailure.reason, 'candidate_empty_or_failed');
    assert.equal(candidateFailure.selectedText, 'usable');
    assert.equal(candidateFailure.candidateReturned, false);
    assert.equal(candidateFailure.candidateDecision, 'not_returned');
    assert.equal(candidateFailure.candidateRejectReason, 'candidate_empty_or_failed');
    assert.deepEqual(candidateFailure.previousIssueIds, ['mixed_chinese']);
    assert.deepEqual(candidateFailure.candidateIssueIds, ['transport_or_missing']);
    assert.deepEqual(candidateFailure.introducedHardIssueIds, ['transport_or_missing']);
    assert.deepEqual(candidateFailure.resolvedIssueIds, ['mixed_chinese']);

    const unsafeMissingReplacement = decide(
        { text: '', status: 'missing', qaStatus: '未返回结果' },
        { text: 'partial', status: 'qa_failed', qaStatus: '需确认：缺少格式/占位符：{0}' },
        { mode: 'ordinary' }
    );
    assert.equal(unsafeMissingReplacement.accept, false, 'missing output must not be replaced by a different hard failure');
    assert.equal(unsafeMissingReplacement.reason, 'missing_replacement_not_improved');
    assert.equal(unsafeMissingReplacement.selectedEntry, 'previous');
    assert.equal(unsafeMissingReplacement.diff.introducedHard.length > 0, true);

    const fillMissing = decide(
        { text: '', status: 'missing', qaStatus: '未返回结果' },
        { text: 'complete translation', status: 'success', qaStatus: '通过' },
        { mode: 'ordinary' }
    );
    assert.equal(fillMissing.accept, true, 'a clean candidate may replace a missing translation');
    assert.equal(fillMissing.reason, 'accepted_missing_replacement');

    const fillMissingWithProjectReview = decide(
        { text: '', status: 'missing', qaStatus: '未返回结果' },
        { text: 'Pokonaj bossa', status: 'success', qaStatus: '需确认：受保护UI标记缺失或被翻译：BOSS' },
        { mode: 'ordinary' }
    );
    assert.equal(
        fillMissingWithProjectReview.accept,
        true,
        'a project-level UI warning must not preserve an old missing/failure placeholder'
    );
}

{
    const previousText = 'SECRET_PREVIOUS_TRANSLATION';
    const candidateText = 'SECRET_CANDIDATE_TRANSLATION';
    const decision = decide(
        { text: previousText, status: 'qa_failed', qaStatus: '需确认：目标阿拉伯文中混入中文' },
        { text: candidateText, status: 'success', qaStatus: '通过' },
        { selectedIssueIds: ['mixed_chinese'], mode: 'targeted' }
    );
    const persistableAudit = {
        candidateReturned: decision.candidateReturned,
        candidateDecision: decision.candidateDecision,
        candidateRejectReason: decision.candidateRejectReason,
        previousIssueIds: decision.previousIssueIds,
        candidateIssueIds: decision.candidateIssueIds,
        introducedHardIssueIds: decision.introducedHardIssueIds,
        resolvedIssueIds: decision.resolvedIssueIds
    };
    const serializedAudit = JSON.stringify(persistableAudit);
    assert.doesNotMatch(serializedAudit, /SECRET_(?:PREVIOUS|CANDIDATE)_TRANSLATION/);
    assert.deepEqual(JSON.parse(serializedAudit), {
        candidateReturned: true,
        candidateDecision: 'accepted',
        candidateRejectReason: '',
        previousIssueIds: ['mixed_chinese'],
        candidateIssueIds: [],
        introducedHardIssueIds: [],
        resolvedIssueIds: ['mixed_chinese']
    });
}

{
    const compactOk = decide(
        { text: 'a very long translation', visibleLength: 23, status: 'qa_failed', qaStatus: '需确认：译文长度超出建议' },
        { text: 'short translation', visibleLength: 17, status: 'success', qaStatus: '通过' },
        { selectedIssueIds: ['length_review'], mode: 'compact' }
    );
    assert.equal(compactOk.accept, true);
    assert.equal(compactOk.reason, 'accepted_compact');

    const notShorter = decide(
        { text: 'long', visibleLength: 20, status: 'qa_failed', qaStatus: '需确认：译文长度超出建议' },
        { text: 'also long', visibleLength: 20, status: 'success', qaStatus: '通过' },
        { selectedIssueIds: ['length_review'], mode: 'compact' }
    );
    assert.equal(notShorter.accept, false);
    assert.equal(notShorter.reason, 'compact_not_shorter');

    const compactRegression = decide(
        { text: 'long', visibleLength: 20, status: 'qa_failed', qaStatus: '需确认：译文长度超出建议' },
        { text: '短中文', visibleLength: 3, status: 'qa_failed', qaStatus: '需确认：目标阿拉伯文中混入中文' },
        { selectedIssueIds: ['length_review'], mode: 'compact' }
    );
    assert.equal(compactRegression.accept, false, 'shorter output cannot introduce Chinese or other required issues');
    assert.equal(compactRegression.reason, 'new_required_finding');
}

{
    const discountFixed = decide(
        { text: '30% off', status: 'qa_failed', qaStatus: '需确认：折扣语义不一致：30%' },
        { text: '70% off', status: 'success', qaStatus: '通过' },
        { selectedIssueIds: ['discount_block'], mode: 'targeted' }
    );
    assert.equal(discountFixed.accept, true);

    const discountWithChinese = decide(
        { text: '30% off', status: 'qa_failed', qaStatus: '需确认：折扣语义不一致：30%' },
        { text: '70% 折扣', status: 'qa_failed', qaStatus: '需确认：目标英文中混入中文' },
        { selectedIssueIds: ['discount_block'], mode: 'targeted' }
    );
    assert.equal(discountWithChinese.accept, false);
}

{
    const projectEvidenceRegression = decide(
        {
            text: 'A',
            status: 'qa_failed',
            qaStatus: '需确认：目标阿拉伯文中混入中文；受保护UI标记缺失或被翻译：LV'
        },
        {
            text: 'B',
            status: 'qa_failed',
            qaStatus: '需确认：受保护UI标记缺失或被翻译：HP'
        },
        { selectedIssueIds: ['mixed_chinese'], mode: 'targeted' }
    );
    assert.equal(projectEvidenceRegression.accept, true, 'project-level UI evidence is review-only unless explicitly enforced');
}

console.log('translation-issue-policy: classification, deduplicated plans, and monotonic candidate decisions passed');
