(() => {
  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];

  const aiButton = $('#aiButton');
  const aiPopover = $('#aiPopover');
  const closeAi = $('#closeAi');
  const commandButton = $('#commandButton');
  const commandPalette = $('#commandPalette');
  const inspector = $('#inspector');
  const inspectorToggle = $('#inspectorToggle');
  const closeInspector = $('#closeInspector');
  const filterButton = $('#filterButton');
  const filterStrip = $('#filterStrip');
  const searchInput = $('#searchInput');
  const rows = $$('#translationRows tr');
  const selectAll = $('#selectAll');
  const selectionCount = $('#selectionCount');
  const actionCount = $('#actionCount');
  const toast = $('#toast');
  let toastTimer;

  function setPopover(open) {
    aiPopover.hidden = !open;
    aiButton.setAttribute('aria-expanded', String(open));
    if (open) commandPalette.hidden = true;
  }

  function setCommand(open) {
    commandPalette.hidden = !open;
    if (open) {
      setPopover(false);
      $('input', commandPalette)?.focus();
    }
  }

  function showToast(message) {
    $('#toastText').textContent = message;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 2600);
  }

  function updateSelection() {
    const checked = $$('#translationRows input[type="checkbox"]:checked');
    const count = checked.length;
    selectionCount.textContent = `已选择 ${count} 项`;
    actionCount.textContent = count;
    selectAll.checked = count === rows.length;
    selectAll.indeterminate = count > 0 && count < rows.length;
    rows.forEach(row => row.classList.toggle('selected', $('input', row).checked));
  }

  aiButton.addEventListener('click', (event) => {
    event.stopPropagation();
    setPopover(aiPopover.hidden);
  });
  closeAi.addEventListener('click', () => setPopover(false));
  $('#saveConnection').addEventListener('click', () => { setPopover(false); showToast('AI 连接设置已保存'); });
  $('#testConnection').addEventListener('click', () => showToast('Google Gemini 连接正常'));

  commandButton.addEventListener('click', () => setCommand(commandPalette.hidden));
  document.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      setCommand(commandPalette.hidden);
    }
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      $('#translateButton').click();
    }
    if (event.key === 'Escape') { setPopover(false); setCommand(false); }
  });

  function setInspector(open) {
    inspector.classList.toggle('is-hidden', !open);
    inspectorToggle.classList.toggle('is-active', open);
    inspectorToggle.setAttribute('aria-pressed', String(open));
  }
  inspectorToggle.addEventListener('click', () => setInspector(inspector.classList.contains('is-hidden')));
  closeInspector.addEventListener('click', () => setInspector(false));

  filterButton.addEventListener('click', () => {
    const open = filterStrip.hidden;
    filterStrip.hidden = !open;
    filterButton.classList.toggle('is-active', open);
    filterButton.setAttribute('aria-pressed', String(open));
  });
  $('#clearFilters').addEventListener('click', () => {
    $$('.filter-pill').forEach((pill, index) => pill.classList.toggle('active', index === 0));
    showToast('已恢复默认视图');
  });
  $$('.filter-pill').forEach(pill => pill.addEventListener('click', () => pill.classList.toggle('active')));

  $$('.segment').forEach(segment => segment.addEventListener('click', () => {
    $$('.segment').forEach(item => { item.classList.remove('active'); item.setAttribute('aria-selected', 'false'); });
    segment.classList.add('active');
    segment.setAttribute('aria-selected', 'true');
    const mode = segment.dataset.mode;
    const captions = { translate: 'Dialogue · 显示待翻译条目', review: 'Dialogue · 显示已译文本与待审校项', check: 'Dialogue · 显示本地化检测结果' };
    $('#tableCaption').textContent = captions[mode];
    showToast(`${segment.textContent}模式已切换`);
  }));

  $$('.file-row').forEach(file => file.addEventListener('click', () => {
    $$('.file-row').forEach(item => { item.classList.remove('selected'); item.removeAttribute('aria-current'); });
    file.classList.add('selected'); file.setAttribute('aria-current', 'page');
    $('#documentTitle').textContent = $('.file-meta strong', file).textContent;
    $('#documentSubline').textContent = `${$('.file-meta small', file).textContent} · 已在本地保存`;
    showToast(`已打开 ${$('.file-meta strong', file).textContent}`);
  }));

  rows.forEach(row => {
    const checkbox = $('input', row);
    checkbox.addEventListener('change', updateSelection);
    row.addEventListener('click', (event) => {
      if (event.target.matches('input')) return;
      $$('.row-number-badge').forEach(badge => { badge.textContent = row.dataset.row; });
      if (inspector.classList.contains('is-hidden')) setInspector(true);
    });
  });
  selectAll.addEventListener('change', () => {
    rows.forEach(row => { $('input', row).checked = selectAll.checked; });
    updateSelection();
  });

  searchInput.addEventListener('input', () => {
    const query = searchInput.value.trim().toLowerCase();
    rows.forEach(row => { row.hidden = Boolean(query) && !row.textContent.toLowerCase().includes(query); });
    $('#viewStatus').textContent = query ? '显示匹配的条目' : '行 188–195 / 1,975';
  });

  $('#translateButton').addEventListener('click', () => {
    const count = $$('#translationRows input:checked').length;
    showToast(count ? `${count} 条文本已加入翻译任务` : '请先选择需要翻译的文本');
  });
  $('#previewButton').addEventListener('click', () => showToast('预览仅展示会发生的更改，不写入文件'));
  $('#addFile').addEventListener('click', () => showToast('导入文件…（预览交互）'));

  document.addEventListener('click', (event) => {
    if (!aiPopover.hidden && !aiPopover.contains(event.target) && !aiButton.contains(event.target)) setPopover(false);
    if (!commandPalette.hidden && !commandPalette.contains(event.target) && !commandButton.contains(event.target)) setCommand(false);
  });

  updateSelection();
})();
