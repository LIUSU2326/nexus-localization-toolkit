const qs = (selector, parent = document) => parent.querySelector(selector);
const qsa = (selector, parent = document) => [...parent.querySelectorAll(selector)];

const aiModal = qs('#aiModal');
const aiButton = qs('#aiButton');
const toast = qs('#toast');

function openAi() {
  aiModal.classList.add('open');
  aiModal.setAttribute('aria-hidden', 'false');
  qs('#closeAi').focus();
}

function closeAi() {
  aiModal.classList.remove('open');
  aiModal.setAttribute('aria-hidden', 'true');
  aiButton.focus();
}

function showToast(title, message) {
  qs('b', toast).textContent = title;
  qs('small', toast).textContent = message;
  toast.classList.add('show');
  window.clearTimeout(window.toastTimer);
  window.toastTimer = window.setTimeout(() => toast.classList.remove('show'), 4200);
}

aiButton.addEventListener('click', openAi);
qs('#closeAi').addEventListener('click', closeAi);
aiModal.addEventListener('click', (event) => {
  if (event.target === aiModal) closeAi();
});

qsa('.collapse-toggle').forEach((button) => {
  button.addEventListener('click', () => {
    const group = button.closest('[data-collapsible]');
    const collapsed = group.classList.toggle('collapsed');
    button.setAttribute('aria-expanded', String(!collapsed));
    qs('b', button).textContent = collapsed ? '⌄' : '⌃';
  });
});

qsa('.filter-chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    qsa('.filter-chip').forEach((other) => other.classList.remove('active'));
    chip.classList.add('active');
    showToast('已切换处理范围', `当前筛选：${chip.textContent.trim()}。`);
  });
});

qsa('.translation-grid tbody tr').forEach((row) => {
  row.addEventListener('click', (event) => {
    if (event.target.matches('input')) return;
    qsa('.translation-grid tbody tr').forEach((other) => other.classList.remove('selected'));
    row.classList.add('selected');
  });
});

function updateSelection() {
  const rows = qsa('.translation-grid tbody input[type="checkbox"]');
  const checked = rows.filter((box) => box.checked).length;
  qs('#selectedCount').textContent = checked;
  qs('#selectAll').checked = checked === rows.length;
  qs('#selectAll').indeterminate = checked > 0 && checked < rows.length;
}

qs('#selectAll').addEventListener('change', (event) => {
  qsa('.translation-grid tbody input[type="checkbox"]').forEach((box) => { box.checked = event.target.checked; });
  updateSelection();
});
qsa('.translation-grid tbody input[type="checkbox"]').forEach((box) => box.addEventListener('change', updateSelection));

qs('#runButton').addEventListener('click', () => {
  const count = qsa('.translation-grid tbody input[type="checkbox"]').filter((box) => box.checked).length;
  showToast('已准备好翻译任务', `${count || 112} 条文本将使用 Google Gemini 处理。`);
});

qs('#testAi').addEventListener('click', () => showToast('连接成功', 'Gemini 已响应，延迟 326 ms。'));
qs('#saveAi').addEventListener('click', () => { closeAi(); showToast('AI 配置已保存', '新的引擎配置将在下一批任务中使用。'); });
qs('#commandButton').addEventListener('click', () => showToast('命令面板', '可用快捷操作：翻译所选、打开术语库、导出报告。'));
qs('.toast button').addEventListener('click', () => toast.classList.remove('show'));

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && aiModal.classList.contains('open')) closeAi();
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    showToast('命令面板', '可用快捷操作：翻译所选、打开术语库、导出报告。');
  }
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') qs('#runButton').click();
});
