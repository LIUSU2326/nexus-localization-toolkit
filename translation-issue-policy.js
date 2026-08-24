/*
 * Translation issue classification and candidate-selection policy.
 *
 * This module is deliberately independent from the DOM, workbooks, and API
 * providers. It gives every translation workflow one canonical vocabulary
 * for report issues and one monotonic gate for generated replacements.
 */
(function installNexusTranslationIssuePolicy(root) {
    'use strict';

    const POLICY_VERSION = '1.3.0';

    const TIER_ORDER = Object.freeze(['required', 'project', 'review']);

    function issue(id, tier, label) {
        return Object.freeze({
            id,
            tier,
            label,
            defaultSelected: tier === 'required'
        });
    }

    const ISSUE_DESCRIPTORS = Object.freeze([
        issue('transport_or_missing', 'required', '翻译失败 / 结果缺失'),
        issue('mixed_chinese', 'required', '混入中文'),
        issue('wrong_script', 'required', '混入错误语种文字'),
        issue('format_placeholder', 'required', '占位符 / 格式标签'),
        issue('format_review', 'review', '格式符号需确认'),
        issue('protected_ui_token', 'project', '受保护 UI 标记'),
        issue('number', 'required', '数字不一致'),
        issue('number_review', 'review', '数字表达需确认'),
        issue('discount_block', 'required', '折扣语义错误'),
        issue('discount_review', 'review', '折扣表达需确认'),
        issue('term_hard', 'project', '项目术语未遵守'),
        issue('english_block', 'required', '明确英文残留'),
        issue('english_review', 'review', '英文专名 / 借词需确认'),
        issue('zh_conversion', 'required', '繁简转换问题'),
        issue('spacing', 'review', '异常逐字空格'),
        issue('completeness_review', 'review', '内容完整性需确认'),
        issue('length_review', 'review', '译文长度需确认'),
        issue('manual_retry', 'required', '明确要求重新翻译'),
        issue('other_hard', 'review', '旧版未分类阻断项'),
        issue('other_review', 'review', '其他人工确认项')
    ]);

    const DESCRIPTOR_BY_ID = new Map(ISSUE_DESCRIPTORS.map(descriptor => [descriptor.id, descriptor]));
    const ALLOWED_ENTRY_FIELDS = Object.freeze(['status', 'qaStatus', 'completenessRisk', 'error']);
    const PASS_PATTERN = /^(?:success|pass|passed|通过|成功|已通过)$/i;
    const STATUS_FAILURE_PATTERN = /^(?:failed|missing|error|失败|缺失|未返回|错误)$/i;
    const TRANSPORT_PATTERN = /模型翻译失败|翻译失败|结果缺失|报告缺失|未返回(?:结果|译文)?|返回空译文|输出被截断|请求超时|限流|网络异常|通道异常|接口(?:调用)?失败|quota|rate\s*limit|timeout|network\s*error|\bmissing\b|\bfailed\b/i;
    const FORMAT_PATTERN = /格式\s*\/\s*占位符|缺少格式|多出格式|占位符(?:顺序)?(?:缺失|多出|不一致|错误|被翻译)|(?:html|富文本|颜色|outline)?标签(?:缺失|多出|不一致|错误|被翻译)|格式标记/i;
    const FORMAT_REVIEW_PATTERN = /格式符号需确认|格式表达需确认/i;
    const PROTECTED_UI_PATTERN = /受保护\s*ui\s*标记|ui\s*标记(?:缺失|多出|不一致|被翻译)|等级\s*\/\s*ui\s*标记不一致/i;
    const NUMBER_PATTERN = /数字(?:数值)?不一致|数字区间方向不一致|数字(?:缺失|多出|错误|被改动)|倍率不一致|百分比不一致/i;
    const NUMBER_REVIEW_PATTERN = /数字表达需确认|数字符号需确认|数字比较表达需确认|数字重复约束需确认/i;
    const DISCOUNT_BLOCK_PATTERN = /折扣语义不一致|折扣翻译缺失|折扣方向错误|支付比例错误/i;
    const DISCOUNT_REVIEW_PATTERN = /折扣表达需确认|折扣.*(?:无法自动判断|占位符|范围)|裸百分比/i;
    const TERM_HARD_PATTERN = /术语未遵守|硬性术语|术语表不一致/i;
    const ENGLISH_BLOCK_PATTERN = /混入英文|目标译文仍含英文|目标译文疑似照抄英文参考|疑似照抄英文参考术语|玩法名疑似沿用英文/i;
    const ENGLISH_REVIEW_PATTERN = /英文玩法名需确认|英文专名需确认|英文专名或同形词需确认|英文专名或单词需确认|英文参考短语需确认|英文参考词需确认|源文英文专名需确认|游戏借词|英文词需确认|目标译文疑似沿用英文参考/i;
    const ZH_CONVERSION_PATTERN = /繁简转换不完整|繁中关键语义缺失|简繁转换不完整|仍含疑似简体字/i;
    const SPACING_PATTERN = /逐字空格|异常空格|被拆成逐字/i;
    const COMPLETENESS_PATTERN = /疑似内容流失|疑似译文过短|明显短于参考译文|只覆盖部分内容|括号\s*\/\s*引号结构|结构信息可能缺失|漏译|目标.+疑似未翻译成.+/i;
    const LENGTH_PATTERN = /译文长度超出建议|译文超长|长度偏长|ui\s*超框/i;
    const MANUAL_RETRY_PATTERN = /用户要求重新翻译|明确要求重新翻译|必须重译|修订译文为空/i;
    const EXPLICIT_HARD_PATTERN = MANUAL_RETRY_PATTERN;
    const WRONG_SCRIPT_PATTERN = /混入(?:日文|日语|假名|韩文|韩语|泰文|泰语|俄文|俄语|阿拉伯文|阿拉伯语|西里尔|缅甸文|高棉文|老挝文)|异种文字|错误语种/i;
    const CRITICAL_EVIDENCE_IDS = new Set([
        'mixed_chinese',
        'wrong_script',
        'format_placeholder',
        'number',
        'discount_block',
        'english_block',
        'zh_conversion'
    ]);
    const ISSUE_ID_ALIASES = Object.freeze({
        retryable: ['transport_or_missing', 'mixed_chinese', 'wrong_script', 'format_placeholder', 'number', 'discount_block', 'english_block', 'zh_conversion', 'manual_retry'],
        mixedChinese: ['mixed_chinese'],
        mixedEnglish: ['english_block', 'english_review'],
        mixedJapanese: ['wrong_script'],
        placeholder: ['format_placeholder', 'format_review', 'protected_ui_token'],
        discount: ['discount_block', 'discount_review'],
        term: ['term_hard'],
        length: ['length_review'],
        untranslated: ['transport_or_missing'],
        zhConversion: ['zh_conversion']
    });

    function normalizeSelectedIssueIds(selectedIds = []) {
        const source = selectedIds instanceof Set ? [...selectedIds] : (Array.isArray(selectedIds) ? selectedIds : []);
        const normalized = new Set();
        source.forEach(id => {
            const aliases = ISSUE_ID_ALIASES[id] || [id];
            aliases.forEach(alias => {
                if (DESCRIPTOR_BY_ID.has(alias)) normalized.add(alias);
            });
        });
        return normalized;
    }

    function normalizeIssueText(value) {
        return String(value ?? '')
            .replace(/^\s*需确认\s*[:：]\s*/i, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function normalizeEvidence(value) {
        return normalizeIssueText(value)
            .toLowerCase()
            .replace(/[“”‘’]/g, '"')
            .replace(/\s*([,，、/|:：→])\s*/g, '$1');
    }

    function splitIssueText(value) {
        return String(value ?? '')
            .split(/[；;\r\n]+/)
            .map(normalizeIssueText)
            .filter(Boolean)
            .filter(segment => !PASS_PATTERN.test(segment));
    }

    function getStrictMixedChineseMatcher() {
        const matcher = root.NexusTranslationStrictRepairPolicy?.isStrictMixedChineseIssueText;
        return typeof matcher === 'function' ? matcher : null;
    }

    function fallbackStrictMixedChineseMatcher(value) {
        return splitIssueText(value).some(segment => {
            if (/与中文原文高度一致/.test(segment) && !/完全一致/.test(segment)) return false;
            return /混入(?:简体|繁体)?中文(?:汉字|字符|文本|简体字)?|(?:简体|繁体)?中文(?:汉字|字符|文本|简体字)?(?:仍)?残留|残留(?:了)?(?:简体|繁体)?中文|仍含(?:有)?(?:简体|繁体)?中文|中文(?:汉字|字符|文本|简体字)?(?:尚未|未被|没有被)翻译|与中文原文(?:完全)?相同|与中文原文完全一致|疑似(?:照抄|复制)中文原文/.test(segment);
        });
    }

    function isStrictMixedChineseIssueText(value) {
        const matcher = getStrictMixedChineseMatcher();
        if (matcher) return Boolean(matcher(value));
        return fallbackStrictMixedChineseMatcher(value);
    }

    function getEvidenceTail(segment) {
        const text = normalizeIssueText(segment);
        const parts = text.split(/[:：]/);
        return parts.length > 1 ? parts.slice(1).join(':').trim() : text;
    }

    function uniqueNormalized(values) {
        return [...new Set(values.map(normalizeEvidence).filter(Boolean))];
    }

    function extractPlaceholderEvidence(segment) {
        const text = String(segment || '');
        const matches = text.match(/__PH_[A-Za-z0-9_]+__|\$\{[^{}]+\}|\{[^{}]+\}|%\d*\$?[A-Za-z]|\\[nr]|<\/?[A-Za-z][^>]*>|\[[A-Za-z_][A-Za-z0-9_.:-]*\]/g) || [];
        return uniqueNormalized(matches);
    }

    function extractNumberEvidence(segment) {
        const tail = getEvidenceTail(segment);
        return uniqueNormalized(tail.match(/[-+]?\d+(?:[.,]\d+)?%?/g) || []);
    }

    function extractUiEvidence(segment) {
        const tail = getEvidenceTail(segment);
        const tokens = tail.match(/\b(?:LVL?|HP|MP|SP|CP|CD|EXP|XP|VIP|S{1,3}|[A-Z])(?:\.?\d+)?\b/gi) || [];
        return uniqueNormalized(tokens.filter(token => String(token).toLowerCase() !== 'ui'));
    }

    function extractEnglishEvidence(segment) {
        const tail = getEvidenceTail(segment);
        return uniqueNormalized(tail.match(/[A-Za-z][A-Za-z0-9_.+\-]*/g) || []);
    }

    function extractQuotedEvidence(segment) {
        const matches = [];
        String(segment || '').replace(/[「『【“"]([^」』】”"]+)[」』】”"]/g, (_full, inner) => {
            matches.push(inner);
            return _full;
        });
        return uniqueNormalized(matches);
    }

    function getCompletenessSubtype(segment) {
        const text = String(segment || '');
        if (/译文过短/.test(text)) return 'too_short';
        if (/短于参考译文/.test(text)) return 'shorter_than_reference';
        if (/括号|引号|结构/.test(text)) return 'structure_loss';
        if (/分句|只覆盖部分/.test(text)) return 'partial_segments';
        return 'content_loss';
    }

    function getTransportSubtype(segment, sourceField) {
        const text = normalizeEvidence(segment);
        if (/missing|缺失|报告缺失|未返回|空译文/.test(text)) return 'missing';
        if (/截断/.test(text)) return 'truncated';
        if (/超时|timeout/.test(text)) return 'timeout';
        if (/限流|rate/.test(text)) return 'rate_limited';
        if (/网络|network/.test(text)) return 'network';
        return sourceField === 'status' ? text || 'failed' : 'failed';
    }

    function getFindingEvidence(id, segment, sourceField) {
        let evidence = [];
        if (id === 'transport_or_missing') evidence = [getTransportSubtype(segment, sourceField)];
        else if (id === 'mixed_chinese') evidence = ['presence'];
        else if (id === 'wrong_script') evidence = ['presence'];
        else if (id === 'format_placeholder' || id === 'format_review') evidence = extractPlaceholderEvidence(segment);
        else if (id === 'protected_ui_token') evidence = extractUiEvidence(segment);
        else if (id === 'number' || id === 'number_review' || id === 'discount_block' || id === 'discount_review') evidence = extractNumberEvidence(segment);
        else if (id === 'term_hard') evidence = [getEvidenceTail(segment)];
        else if (id === 'english_block' || id === 'english_review') evidence = extractEnglishEvidence(segment);
        else if (id === 'zh_conversion') evidence = extractQuotedEvidence(segment);
        else if (id === 'spacing') evidence = ['presence'];
        else if (id === 'completeness_review') evidence = [getCompletenessSubtype(segment)];
        else if (id === 'length_review') evidence = ['over_budget'];
        else if (id === 'manual_retry') evidence = ['manual'];
        else evidence = [segment];
        const normalized = uniqueNormalized(evidence);
        return normalized.length ? normalized : ['presence'];
    }

    function matchCanonicalIssue(segment) {
        if (isStrictMixedChineseIssueText(segment)) return 'mixed_chinese';
        if (FORMAT_PATTERN.test(segment)) return 'format_placeholder';
        if (FORMAT_REVIEW_PATTERN.test(segment)) return 'format_review';
        if (PROTECTED_UI_PATTERN.test(segment)) return 'protected_ui_token';
        if (NUMBER_PATTERN.test(segment)) return 'number';
        if (NUMBER_REVIEW_PATTERN.test(segment)) return 'number_review';
        if (DISCOUNT_BLOCK_PATTERN.test(segment)) return 'discount_block';
        if (DISCOUNT_REVIEW_PATTERN.test(segment)) return 'discount_review';
        if (TERM_HARD_PATTERN.test(segment)) return 'term_hard';
        if (ENGLISH_BLOCK_PATTERN.test(segment)) return 'english_block';
        if (ENGLISH_REVIEW_PATTERN.test(segment)) return 'english_review';
        if (ZH_CONVERSION_PATTERN.test(segment)) return 'zh_conversion';
        if (SPACING_PATTERN.test(segment)) return 'spacing';
        if (COMPLETENESS_PATTERN.test(segment)) return 'completeness_review';
        if (LENGTH_PATTERN.test(segment)) return 'length_review';
        if (WRONG_SCRIPT_PATTERN.test(segment) || /目标(?!.*(?:中文|英文)).+中混入/.test(segment)) return 'wrong_script';
        if (TRANSPORT_PATTERN.test(segment)) return 'transport_or_missing';
        if (MANUAL_RETRY_PATTERN.test(segment)) return 'manual_retry';
        return '';
    }

    function createFinding(id, evidence, segment, sourceField) {
        const descriptor = DESCRIPTOR_BY_ID.get(id) || DESCRIPTOR_BY_ID.get('other_review');
        const normalizedEvidence = normalizeEvidence(evidence) || 'presence';
        return Object.freeze({
            ...descriptor,
            key: `${descriptor.id}:${normalizedEvidence}`,
            evidence: normalizedEvidence,
            message: normalizeIssueText(segment),
            sourceField
        });
    }

    function classifyEntry(entry = {}) {
        const findings = [];
        const seen = new Set();
        const unclassified = [];

        ALLOWED_ENTRY_FIELDS.forEach(sourceField => {
            const rawValue = entry?.[sourceField];
            if (rawValue === undefined || rawValue === null || rawValue === '') return;
            const fragments = splitIssueText(rawValue);
            fragments.forEach(segment => {
                if (sourceField === 'status' && PASS_PATTERN.test(segment)) return;
                let id = '';
                if (sourceField === 'status' && STATUS_FAILURE_PATTERN.test(segment)) {
                    id = 'transport_or_missing';
                } else {
                    id = matchCanonicalIssue(segment);
                }
                if (id === 'transport_or_missing' && sourceField !== 'status') {
                    id = '';
                }
                if (!id) {
                    unclassified.push({ sourceField, segment });
                    return;
                }
                getFindingEvidence(id, segment, sourceField).forEach(evidence => {
                    const finding = createFinding(id, evidence, segment, sourceField);
                    if (seen.has(finding.key)) return;
                    seen.add(finding.key);
                    findings.push(finding);
                });
            });
        });

        unclassified
            .filter(item =>
                item.sourceField !== 'status' &&
                (
                    findings.length === 0 ||
                    item.sourceField === 'qaStatus' ||
                    EXPLICIT_HARD_PATTERN.test(item.segment)
                )
            )
            .forEach(({ sourceField, segment }) => {
                const id = MANUAL_RETRY_PATTERN.test(segment) ? 'manual_retry' : 'other_review';
                const finding = createFinding(id, segment, segment, sourceField);
                if (seen.has(finding.key)) return;
                seen.add(finding.key);
                findings.push(finding);
            });

        if (!findings.length) {
            const normalizedStatus = normalizeIssueText(entry?.status);
            if (normalizedStatus && !PASS_PATTERN.test(normalizedStatus)) {
                const id = STATUS_FAILURE_PATTERN.test(normalizedStatus)
                    ? 'transport_or_missing'
                    : 'other_review';
                const finding = createFinding(id, normalizedStatus, normalizedStatus, 'status');
                findings.push(finding);
            }
        }

        return findings;
    }

    function defaultEntryIdentity(entry, index) {
        const explicit = entry?.taskKey ?? entry?.id ?? entry?.key;
        if (explicit !== undefined && explicit !== null && explicit !== '') return String(explicit);
        const location = [
            entry?.sourceFile,
            entry?.sheetName,
            entry?.rowNumber,
            entry?.column,
            entry?.profile,
            entry?.model
        ].map(value => String(value ?? '').trim()).join('\u001f');
        return location.replace(/\u001f/g, '') ? location : `index:${index}`;
    }

    function makeTierStat(tier, groups, itemByIdentity) {
        const identities = new Set();
        let findingCount = 0;
        groups.forEach(group => {
            if (group.tier !== tier) return;
            findingCount += group.findingCount;
            group.items.forEach(item => identities.add(item.identity));
        });
        const entries = [...identities].map(identity => itemByIdentity.get(identity)?.entry).filter(Boolean);
        return Object.freeze({
            tier,
            count: entries.length,
            entryCount: entries.length,
            findingCount,
            issueIds: groups.filter(group => group.tier === tier && group.count > 0).map(group => group.id),
            entries
        });
    }

    function buildPlan(entries = [], getIdentity = defaultEntryIdentity) {
        const sourceEntries = Array.isArray(entries) ? entries : [];
        const identityOf = typeof getIdentity === 'function' ? getIdentity : defaultEntryIdentity;
        const allItems = [];
        const itemByIdentity = new Map();
        const groupState = new Map(ISSUE_DESCRIPTORS.map(descriptor => [descriptor.id, {
            ...descriptor,
            itemByIdentity: new Map(),
            findingCount: 0
        }]));

        sourceEntries.forEach((entry, index) => {
            if (entry?.manualResolutionValid === true) return;
            const rawIdentity = identityOf(entry, index);
            const identity = String(rawIdentity ?? `index:${index}`);
            let item = itemByIdentity.get(identity);
            if (!item) {
                item = { identity, entry, findings: [] };
                itemByIdentity.set(identity, item);
                allItems.push(item);
            }
            const existingFindingKeys = new Set(item.findings.map(finding => finding.key));
            classifyEntry(entry).forEach(finding => {
                const isNewFindingForIdentity = !existingFindingKeys.has(finding.key);
                if (isNewFindingForIdentity) {
                    item.findings.push(finding);
                    existingFindingKeys.add(finding.key);
                }
                const state = groupState.get(finding.id);
                if (isNewFindingForIdentity) state.findingCount += 1;
                if (!state.itemByIdentity.has(identity)) state.itemByIdentity.set(identity, item);
            });
        });

        const groups = ISSUE_DESCRIPTORS.map(descriptor => {
            const state = groupState.get(descriptor.id);
            const items = [...state.itemByIdentity.values()];
            return Object.freeze({
                ...descriptor,
                count: items.length,
                entryCount: items.length,
                findingCount: state.findingCount,
                entries: items.map(item => item.entry),
                items
            });
        });
        const byId = Object.freeze(Object.fromEntries(groups.map(group => [group.id, group])));
        const issueIdentitySet = new Set();
        groups.forEach(group => group.items.forEach(item => issueIdentitySet.add(item.identity)));
        const unionItems = allItems.filter(item => issueIdentitySet.has(item.identity));
        const tiers = Object.freeze(Object.fromEntries(
            TIER_ORDER.map(tier => [tier, makeTierStat(tier, groups, itemByIdentity)])
        ));
        const union = Object.freeze({
            count: unionItems.length,
            entryCount: unionItems.length,
            findingCount: groups.reduce((sum, group) => sum + group.findingCount, 0),
            entries: unionItems.map(item => item.entry),
            items: unionItems
        });

        return Object.freeze({
            groups,
            byId,
            tiers,
            stats: tiers,
            union,
            defaultSelectedIds: ISSUE_DESCRIPTORS.filter(descriptor => descriptor.defaultSelected).map(descriptor => descriptor.id),
            items: allItems
        });
    }

    function getSelectedEntryUnion(plan, selectedIds = []) {
        const ids = [...normalizeSelectedIssueIds(selectedIds)];
        if (!ids.length || !plan?.byId) return [];
        const selectedIdentitySet = new Set();
        ids.forEach(id => {
            const group = plan.byId[id];
            (group?.items || []).forEach(item => selectedIdentitySet.add(item.identity));
        });
        return (plan.items || [])
            .filter(item => selectedIdentitySet.has(item.identity))
            .map(item => item.entry);
    }

    function buildTargetedQaStatus(qaStatus = '', selectedIds = []) {
        const normalizedIds = normalizeSelectedIssueIds(selectedIds);
        if (!normalizedIds.size) return String(qaStatus || '');
        const selectedMessages = splitIssueText(qaStatus).filter(segment => {
            const id = matchCanonicalIssue(segment);
            return id && normalizedIds.has(id);
        });
        return selectedMessages.length
            ? `需确认：${selectedMessages.join('；')}`
            : String(qaStatus || '');
    }

    function getSnapshotText(snapshot = {}) {
        const value = snapshot?.text ?? snapshot?.candidateText ?? '';
        return String(value ?? '');
    }

    function getSnapshotLength(snapshot = {}, text = getSnapshotText(snapshot)) {
        const explicit = snapshot?.visibleLength ?? snapshot?.candidateLength ?? snapshot?.length;
        const numeric = Number(explicit);
        if (Number.isFinite(numeric) && numeric >= 0) return numeric;
        return String(text || '').length;
    }

    function isFailureSnapshot(snapshot, text, findings) {
        if (!String(text || '').trim()) return true;
        const status = normalizeIssueText(snapshot?.status);
        if (STATUS_FAILURE_PATTERN.test(status)) return true;
        return findings.some(finding => finding.id === 'transport_or_missing');
    }

    function findingKeySet(findings, predicate = () => true) {
        return new Set((findings || []).filter(predicate).map(finding => finding.key));
    }

    function isBlockingFinding(finding) {
        return finding?.blocking === true || finding?.tier === 'required';
    }

    function isHardFinding(finding) {
        return isBlockingFinding(finding);
    }

    function difference(left, right) {
        return [...left].filter(value => !right.has(value));
    }

    function countSelectedFindings(findings, selectedIds) {
        const selected = selectedIds instanceof Set ? selectedIds : new Set(selectedIds || []);
        if (!selected.size) return 0;
        return findingKeySet(findings, finding => selected.has(finding.id) && isBlockingFinding(finding)).size;
    }

    function getCriticalEvidenceRegressions(previousFindings, candidateFindings) {
        const previousById = new Map();
        const candidateById = new Map();
        previousFindings.forEach(finding => {
            if (!CRITICAL_EVIDENCE_IDS.has(finding.id) || !isBlockingFinding(finding)) return;
            if (!previousById.has(finding.id)) previousById.set(finding.id, new Set());
            previousById.get(finding.id).add(finding.key);
        });
        candidateFindings.forEach(finding => {
            if (!CRITICAL_EVIDENCE_IDS.has(finding.id) || !isBlockingFinding(finding)) return;
            if (!candidateById.has(finding.id)) candidateById.set(finding.id, new Set());
            candidateById.get(finding.id).add(finding.key);
        });
        const regressions = [];
        candidateById.forEach((candidateKeys, id) => {
            const previousKeys = previousById.get(id);
            if (!previousKeys) return;
            difference(candidateKeys, previousKeys).forEach(key => regressions.push({ id, key }));
        });
        return regressions;
    }

    const REASON_LABELS = Object.freeze({
        candidate_empty_or_failed: '候选译文为空或翻译失败，保留旧译文',
        missing_replacement_not_improved: '缺失译文的候选仍含新的硬问题，保留缺失状态',
        selected_issue_not_reduced: '选中的问题没有严格减少，保留旧译文',
        new_required_finding: '候选新增了必须修复的问题，保留旧译文',
        new_hard_finding: '候选新增了阻断问题，保留旧译文',
        critical_evidence_regression: '候选加重或替换了同类关键错误，保留旧译文',
        hard_findings_not_reduced: '普通修复没有让硬问题集合严格收缩，保留旧译文',
        compact_not_shorter: '精简候选没有实际缩短，保留旧译文',
        accepted_missing_replacement: '旧译文缺失，采用首个非失败候选并保留候选质检状态',
        accepted_targeted_improvement: '选中问题严格减少且未新增必须修复项，采用候选译文',
        accepted_hard_reduction: '硬问题集合严格收缩，采用候选译文',
        accepted_compact: '译文已缩短且未新增必须修复项，采用候选译文'
    });

    const PERSISTABLE_CANDIDATE_DECISIONS = new Set(['accepted', 'rejected', 'not_returned', 'not_attempted']);
    const PERSISTABLE_CANDIDATE_REASONS = new Set([
        ...Object.keys(REASON_LABELS),
        'candidate_gate_error',
        'candidate_rejected',
        'request_failed',
        'no_content',
        'not_attempted'
    ]);

    function sanitizePersistableIssueIds(values) {
        const seen = new Set();
        return Object.freeze((Array.isArray(values) ? values : [])
            .map(value => String(value || '').trim())
            .filter(id => DESCRIPTOR_BY_ID.has(id) && !seen.has(id) && seen.add(id)));
    }

    function sanitizePersistableCandidateAudit(value = {}) {
        const decision = PERSISTABLE_CANDIDATE_DECISIONS.has(value.candidateDecision)
            ? value.candidateDecision
            : '';
        const reason = PERSISTABLE_CANDIDATE_REASONS.has(value.candidateRejectReason)
            ? value.candidateRejectReason
            : '';
        return Object.freeze({
            candidateReturned: value.candidateReturned === true
                ? true
                : (value.candidateReturned === false ? false : null),
            candidateDecision: decision,
            candidateRejectReason: reason,
            previousIssueIds: sanitizePersistableIssueIds(value.previousIssueIds),
            candidateIssueIds: sanitizePersistableIssueIds(value.candidateIssueIds),
            introducedHardIssueIds: sanitizePersistableIssueIds(value.introducedHardIssueIds),
            resolvedIssueIds: sanitizePersistableIssueIds(value.resolvedIssueIds)
        });
    }

    function getUniqueIssueIds(findings, findingKeys = null) {
        const keyFilter = findingKeys instanceof Set ? findingKeys : null;
        const ids = [];
        const seen = new Set();
        (findings || []).forEach(finding => {
            if (keyFilter && !keyFilter.has(finding.key)) return;
            if (!DESCRIPTOR_BY_ID.has(finding.id) || seen.has(finding.id)) return;
            seen.add(finding.id);
            ids.push(finding.id);
        });
        return Object.freeze(ids);
    }

    function buildCandidateAudit(accept, reason, candidate, previousFindings, candidateFindings, diff) {
        const candidateText = getSnapshotText(candidate);
        const candidateReturned = !isFailureSnapshot(candidate, candidateText, candidateFindings);
        const previousFindingKeys = findingKeySet(previousFindings);
        const candidateFindingKeys = findingKeySet(candidateFindings);
        const introducedHardKeys = new Set(diff?.introducedHard || []);
        const resolvedFindingKeys = new Set(difference(previousFindingKeys, candidateFindingKeys));
        return Object.freeze({
            candidateReturned,
            candidateDecision: accept ? 'accepted' : (candidateReturned ? 'rejected' : 'not_returned'),
            candidateRejectReason: accept ? '' : String(reason || 'candidate_rejected'),
            previousIssueIds: getUniqueIssueIds(previousFindings),
            candidateIssueIds: getUniqueIssueIds(candidateFindings),
            introducedHardIssueIds: getUniqueIssueIds(candidateFindings, introducedHardKeys),
            resolvedIssueIds: getUniqueIssueIds(previousFindings, resolvedFindingKeys)
        });
    }

    function buildDecision(accept, reason, selectedText, selectedEntry, previous, candidate, previousFindings, candidateFindings, diff) {
        const selectedFindings = selectedEntry === 'candidate' ? candidateFindings : previousFindings;
        const audit = buildCandidateAudit(accept, reason, candidate, previousFindings, candidateFindings, diff);
        return {
            accept,
            reason,
            reasonLabel: REASON_LABELS[reason] || reason,
            ...audit,
            selectedText,
            selectedEntry,
            selectedSnapshot: selectedEntry === 'candidate' ? candidate : previous,
            selectedFindings,
            previousFindings,
            candidateFindings,
            diff
        };
    }

    function decideCandidate({ previous = {}, candidate = {}, selectedIssueIds = [], mode = 'ordinary' } = {}) {
        const previousText = getSnapshotText(previous);
        const candidateText = getSnapshotText(candidate);
        const previousFindings = classifyEntry(previous);
        const candidateFindings = classifyEntry(candidate);
        const previousFailed = isFailureSnapshot(previous, previousText, previousFindings);
        const candidateFailed = isFailureSnapshot(candidate, candidateText, candidateFindings);
        const selectedIds = normalizeSelectedIssueIds(selectedIssueIds);
        const previousRequired = findingKeySet(previousFindings, isBlockingFinding);
        const candidateRequired = findingKeySet(candidateFindings, isBlockingFinding);
        const previousHard = findingKeySet(previousFindings, isHardFinding);
        const candidateHard = findingKeySet(candidateFindings, isHardFinding);
        const introducedRequired = difference(candidateRequired, previousRequired);
        const introducedHard = difference(candidateHard, previousHard);
        const resolvedRequired = difference(previousRequired, candidateRequired);
        const resolvedHard = difference(previousHard, candidateHard);
        const selectedBefore = countSelectedFindings(previousFindings, selectedIds);
        const selectedAfter = countSelectedFindings(candidateFindings, selectedIds);
        const criticalEvidenceRegressions = getCriticalEvidenceRegressions(previousFindings, candidateFindings);
        const previousLength = getSnapshotLength(previous, previousText);
        const candidateLength = getSnapshotLength(candidate, candidateText);
        const diff = {
            selectedBefore,
            selectedAfter,
            introducedRequired,
            resolvedRequired,
            introducedHard,
            resolvedHard,
            criticalEvidenceRegressions,
            previousLength,
            candidateLength
        };

        if (candidateFailed) {
            return buildDecision(false, 'candidate_empty_or_failed', previousText, 'previous', previous, candidate, previousFindings, candidateFindings, diff);
        }

        if (previousFailed && introducedHard.length === 0 && candidateHard.size < previousHard.size) {
            return buildDecision(true, 'accepted_missing_replacement', candidateText, 'candidate', previous, candidate, previousFindings, candidateFindings, diff);
        }

        if (previousFailed) {
            return buildDecision(false, 'missing_replacement_not_improved', previousText, 'previous', previous, candidate, previousFindings, candidateFindings, diff);
        }

        if (selectedBefore > 0 && !(selectedAfter < selectedBefore)) {
            return buildDecision(false, 'selected_issue_not_reduced', previousText, 'previous', previous, candidate, previousFindings, candidateFindings, diff);
        }

        if (introducedRequired.length > 0) {
            return buildDecision(false, 'new_required_finding', previousText, 'previous', previous, candidate, previousFindings, candidateFindings, diff);
        }

        if (criticalEvidenceRegressions.length > 0) {
            return buildDecision(false, 'critical_evidence_regression', previousText, 'previous', previous, candidate, previousFindings, candidateFindings, diff);
        }

        if (selectedIds.size > 0 && introducedHard.length > 0) {
            return buildDecision(false, 'new_hard_finding', previousText, 'previous', previous, candidate, previousFindings, candidateFindings, diff);
        }

        const normalizedMode = String(mode || 'ordinary').trim().toLowerCase();
        if (normalizedMode === 'compact') {
            if (!(candidateLength < previousLength)) {
                return buildDecision(false, 'compact_not_shorter', previousText, 'previous', previous, candidate, previousFindings, candidateFindings, diff);
            }
            return buildDecision(true, 'accepted_compact', candidateText, 'candidate', previous, candidate, previousFindings, candidateFindings, diff);
        }

        const ordinaryModes = new Set(['ordinary', 'repair', 'retry', 'deep', 'discount', 'manual']);
        if (ordinaryModes.has(normalizedMode)) {
            const hardStrictlyShrank = candidateHard.size < previousHard.size && introducedHard.length === 0;
            if (!hardStrictlyShrank) {
                return buildDecision(false, 'hard_findings_not_reduced', previousText, 'previous', previous, candidate, previousFindings, candidateFindings, diff);
            }
            return buildDecision(true, 'accepted_hard_reduction', candidateText, 'candidate', previous, candidate, previousFindings, candidateFindings, diff);
        }

        return buildDecision(true, 'accepted_targeted_improvement', candidateText, 'candidate', previous, candidate, previousFindings, candidateFindings, diff);
    }

    root.NexusTranslationIssuePolicy = Object.freeze({
        POLICY_VERSION,
        ISSUE_DESCRIPTORS,
        TIER_ORDER,
        classifyEntry,
        buildPlan,
        getSelectedEntryUnion,
        normalizeSelectedIssueIds,
        buildTargetedQaStatus,
        decideCandidate,
        sanitizePersistableCandidateAudit,
        isBlockingFinding,
        isStrictMixedChineseIssueText
    });
})(typeof globalThis !== 'undefined' ? globalThis : window);
