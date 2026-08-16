import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(scriptDir, '..');
const source = fs.readFileSync(path.join(projectDir, 'script.js'), 'utf8');
const rustSource = fs.readFileSync(path.join(projectDir, 'src-tauri', 'src', 'lib.rs'), 'utf8');

function extractFunction(functionSource, signature) {
    const start = functionSource.indexOf(signature);
    assert.ok(start >= 0, `${signature} should exist`);
    let parameterDepth = 0;
    let bodyStart = -1;
    for (let index = functionSource.indexOf('(', start); index < functionSource.length; index++) {
        if (functionSource[index] === '(') parameterDepth += 1;
        if (functionSource[index] === ')') parameterDepth -= 1;
        if (parameterDepth === 0 && functionSource[index] === '{') {
            bodyStart = index;
            break;
        }
    }
    assert.ok(bodyStart >= 0, `${signature} body should exist`);
    let depth = 0;
    for (let index = bodyStart; index < functionSource.length; index++) {
        if (functionSource[index] === '{') depth += 1;
        if (functionSource[index] === '}') depth -= 1;
        if (depth === 0) return functionSource.slice(start, index + 1);
    }
    throw new Error(`Could not extract ${signature}`);
}

const policySource = extractFunction(source, 'function shouldSignalTaskbarAttention(');
const signalSource = extractFunction(source, 'function signalTaskbarAttentionForCompletedTask(');
const startTimerSource = extractFunction(source, 'function startInspectorTaskTimer(');
const finishSource = extractFunction(source, 'function finishInspectorTaskTimer(');
const initSource = extractFunction(source, 'function initTaskbarAttention(');
const multiTargetSource = extractFunction(source, 'async function startMultiTargetTranslate(');
const shouldSignal = new Function(`
    const TASKBAR_ATTENTION_MIN_DURATION_MS = 30_000;
    ${policySource}
    return shouldSignalTaskbarAttention;
`)();

assert.equal(shouldSignal('success', '翻译完成', 30_000, { hidden: true, hasFocus: false }), true);
assert.equal(shouldSignal('warning', '仍有阻断问题', 90_000, { hidden: false, hasFocus: false }), true);
assert.equal(shouldSignal('error', '翻译失败', 90_000, { hidden: true, hasFocus: false }), true);
assert.equal(shouldSignal('success', '翻译完成', 29_999, { hidden: true, hasFocus: false }), false);
assert.equal(shouldSignal('success', '翻译完成', 90_000, { hidden: false, hasFocus: true }), false);
assert.equal(shouldSignal('warning', '翻译任务已取消', 90_000, { hidden: true, hasFocus: false }), false);

assert.match(finishSource, /isRunning[\s\S]*signalTaskbarAttentionForCompletedTask\(type, phase, taskDurationMs\)/);
assert.match(startTimerSource, /clearTaskbarAttention\(\)[\s\S]*inspectorTaskStartedAt = Date\.now\(\)/);
assert.match(signalSource, /taskbarAttentionSuppressionDepth > 0[\s\S]*return/);
assert.match(multiTargetSource, /const multiTargetStartedAt = Date\.now\(\)[\s\S]*setTaskbarAttentionSuppressed\(true\)[\s\S]*finally[\s\S]*setTaskbarAttentionSuppressed\(false\)[\s\S]*signalTaskbarAttentionForCompletedTask\([\s\S]*Date\.now\(\) - multiTargetStartedAt/);
assert.match(multiTargetSource, /stoppedByCancellation[\s\S]*result\?\.status === 'cancelled'[\s\S]*if \(!stoppedByCancellation\)[\s\S]*'多语言翻译异常中止'/);
assert.match(initSource, /window\.addEventListener\('focus', clearTaskbarAttention\)/);
assert.match(initSource, /visibilitychange[\s\S]*setTaskbarAttention\(false, \{ force: true \}\)/);
assert.match(rustSource, /fn set_taskbar_attention\([\s\S]*set_overlay_icon\([\s\S]*request_user_attention\(/);
assert.match(rustSource, /Image::new_owned\(rgba, SIZE, SIZE\)/);
assert.match(rustSource, /abort_binary_report_save,\s*set_taskbar_attention/);

console.log('taskbar-attention-policy: background completion badge and clear behavior passed');
