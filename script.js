function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function setStatus(type, text, subtext = '', actionCallback = null) {
    const statusBar = document.getElementById('statusBar');
    const statusIcon = document.getElementById('statusIcon');
    const statusText = document.getElementById('statusText');
    const statusSubtext = document.getElementById('statusSubtext');
    const statusAction = document.getElementById('statusAction');

    statusBar.className = `status-bar ${type}`;
    statusText.textContent = text;
    statusSubtext.textContent = subtext;

    if (actionCallback) {
        statusAction.style.display = 'block';
        statusAction.onclick = actionCallback;
    } else {
        statusAction.style.display = 'none';
    }

    statusBar.style.display = 'flex';

    if (type === 'success') {
        if (Notification.permission === 'granted') {
            new Notification('任务完成', {
                body: subtext || text
            });
        }
    }
}

function hideStatus() {
    const statusBar = document.getElementById('statusBar');
    statusBar.style.display = 'none';
}

const TRANSLATION_STORAGE_KEY = 'nexus_translation_progress';

function saveTranslationProgress(data) {
    const progress = {
        timestamp: Date.now(),
        fileName: data.fileName,
        totalRows: data.totalRows,
        currentRow: data.currentRow,
        translatedData: data.translatedData,
        successCount: data.successCount,
        failCount: data.failCount,
        selectedColumns: data.selectedColumns,
        targetLang: data.targetLang
    };
    localStorage.setItem(TRANSLATION_STORAGE_KEY, JSON.stringify(progress));
}

function loadTranslationProgress() {
    const stored = localStorage.getItem(TRANSLATION_STORAGE_KEY);
    if (!stored) return null;

    try {
        const progress = JSON.parse(stored);
        const age = Date.now() - progress.timestamp;
        if (age > 24 * 60 * 60 * 1000) {
            clearTranslationProgress();
            return null;
        }
        return progress;
    } catch {
        return null;
    }
}

function clearTranslationProgress() {
    localStorage.removeItem(TRANSLATION_STORAGE_KEY);
}

function isOnline() {
    return navigator.onLine;
}

function waitForNetwork() {
    return new Promise(resolve => {
        if (navigator.onLine) {
            resolve();
        } else {
            window.addEventListener('online', () => resolve(), { once: true });
        }
    });
}

function initApiConfig() {
    const providerSelect = document.getElementById('apiProvider');
    const baseUrlInput = document.getElementById('baseUrl');
    const apiKeyInput = document.getElementById('apiKey');
    const saveBtn = document.getElementById('saveApiKeyBtn');
    const clearBtn = document.getElementById('clearApiKeyBtn');
    const apiStatus = document.getElementById('apiStatus');
    const toggleBtn = document.getElementById('toggleApiConfig');
    const configContent = document.getElementById('apiConfigContent');
    const baseUrlRow = document.getElementById('baseUrlRow');

    loadApiConfig();

    // 切换平台时更新 UI
    providerSelect.addEventListener('change', () => {
        if (providerSelect.value === 'deepseek') {
            baseUrlInput.value = 'https://api.deepseek.com';
            baseUrlRow.style.display = 'none';
        } else {
            baseUrlRow.style.display = 'flex';
        }
    });

    toggleBtn.addEventListener('click', () => {
        if (configContent.style.display === 'none') {
            configContent.style.display = 'block';
            toggleBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6,9 12,15 18,9"/></svg>';
        } else {
            configContent.style.display = 'none';
            toggleBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18,15 12,9 6,15"/></svg>';
        }
    });

    saveBtn.addEventListener('click', () => {
        const provider = providerSelect.value;
        const apiKey = apiKeyInput.value.trim();
        const baseUrl = baseUrlInput.value.trim();
        
        if (!apiKey) {
            apiStatus.textContent = '请输入 API Key';
            apiStatus.className = 'api-status error';
            return;
        }

        const config = { provider, apiKey, baseUrl };
        localStorage.setItem('apiConfig', JSON.stringify(config));
        apiStatus.textContent = '保存成功';
        apiStatus.className = 'api-status success';
        setTimeout(() => {
            apiStatus.textContent = '';
        }, 2000);
    });

    clearBtn.addEventListener('click', () => {
        localStorage.removeItem('apiConfig');
        apiKeyInput.value = '';
        baseUrlInput.value = '';
        providerSelect.value = 'deepseek';
        baseUrlRow.style.display = 'none';
        apiStatus.textContent = '已清除配置';
        apiStatus.className = 'api-status';
        setTimeout(() => {
            apiStatus.textContent = '';
        }, 2000);
    });

    function loadApiConfig() {
        const stored = localStorage.getItem('apiConfig');
        if (stored) {
            try {
                const config = JSON.parse(stored);
                providerSelect.value = config.provider || 'deepseek';
                apiKeyInput.value = config.apiKey || '';
                baseUrlInput.value = config.baseUrl || 'https://api.deepseek.com';
                
                if (config.provider === 'deepseek') {
                    baseUrlRow.style.display = 'none';
                } else {
                    baseUrlRow.style.display = 'flex';
                }
            } catch (e) {
                console.error('Failed to load API config:', e);
            }
        } else {
            baseUrlRow.style.display = 'none';
        }
    }
}

function getApiConfig() {
    const stored = localStorage.getItem('apiConfig');
    if (stored) {
        try {
            return JSON.parse(stored);
        } catch (e) {
            console.error('Failed to parse API config:', e);
        }
    }
    return { provider: 'deepseek', apiKey: '', baseUrl: 'https://api.deepseek.com' };
}

function getApiBaseUrl(provider, configBaseUrl) {
    if (provider === 'deepseek') {
        return 'https://api.deepseek.com';
    }
    return configBaseUrl || 'https://api.deepseek.com';
}

document.addEventListener('DOMContentLoaded', function() {
    const navItems = document.querySelectorAll('.nav-item');
    const tools = {
        split: document.getElementById('split-tool'),
        translate: document.getElementById('translate-tool'),
        convert: document.getElementById('convert-tool'),
        'l10n-check': document.getElementById('l10n-check-tool'),
        glossary: document.getElementById('glossary-tool')
    };

    navItems.forEach(item => {
        item.addEventListener('click', function() {
            const targetTool = this.dataset.tool;
            navItems.forEach(i => i.classList.remove('active'));
            this.classList.add('active');

            Object.values(tools).forEach(tool => {
                tool.style.display = 'none';
            });

            if (tools[targetTool]) {
                tools[targetTool].style.display = 'block';
            }
        });
    });

    initApiConfig();

    if ('Notification' in window) {
        Notification.requestPermission();
    }

    initSplitTool();
    initTranslateTool();
    initConvertTool();
    initL10nCheckTool();
    initGlossaryTool();
});

function initSplitTool() {
    const uploadArea = document.getElementById('splitUploadArea');
    const fileInput = document.getElementById('splitFileInput');
    const fileInfo = document.getElementById('splitFileInfo');
    const progressSection = document.getElementById('splitProgressSection');
    const downloadSection = document.getElementById('splitDownloadSection');
    const downloadList = document.getElementById('splitDownloadList');
    const rowsPerFileInput = document.getElementById('rowsPerFile');
    const splitBtn = document.getElementById('splitBtn');
    const resetBtn = document.getElementById('splitResetBtn');
    const downloadAllBtn = document.getElementById('splitDownloadAllBtn');

    let sheetData = null;
    let originalFileName = '';
    let splitFiles = [];

    uploadArea.addEventListener('click', () => fileInput.click());

    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });

    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
    });

    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleSplitFile(files[0]);
        }
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleSplitFile(e.target.files[0]);
        }
    });

    rowsPerFileInput.addEventListener('input', updateSplitEstimate);
    splitBtn.addEventListener('click', startSplit);
    resetBtn.addEventListener('click', resetSplitTool);
    downloadAllBtn.addEventListener('click', downloadAllAsZip);

    async function handleSplitFile(file) {
        originalFileName = file.name.replace(/\.(csv|xlsx|xls)$/i, '');
        const extension = file.name.split('.').pop().toLowerCase();

        document.getElementById('splitFileName').textContent = file.name;
        document.getElementById('splitFileSize').textContent = formatFileSize(file.size);

        if (extension === 'csv') {
            const { text, encoding } = await readCSVWithEncoding(file);
            document.getElementById('splitFileEncoding').textContent = encoding;

            const result = XLSX.read(text, { type: 'string', cellDates: true });
            const sheetName = result.SheetNames[0];
            sheetData = XLSX.utils.sheet_to_json(result.Sheets[sheetName], { header: 1 });
        } else {
            document.getElementById('splitFileEncoding').textContent = 'N/A (Excel)';
            const arrayBuffer = await file.arrayBuffer();
            const result = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
            const sheetName = result.SheetNames[0];
            sheetData = XLSX.utils.sheet_to_json(result.Sheets[sheetName], { header: 1 });
        }

        document.getElementById('splitTotalRows').textContent = sheetData.length;
        document.getElementById('splitTotalCols').textContent = sheetData[0] ? sheetData[0].length : 0;

        updateSplitEstimate();
        fileInfo.style.display = 'block';
        downloadSection.style.display = 'none';
    }

    function updateSplitEstimate() {
        const totalRows = parseInt(document.getElementById('splitTotalRows').textContent) || 0;
        const rowsPerFile = parseInt(rowsPerFileInput.value) || 1;
        const estimated = Math.ceil(totalRows / rowsPerFile);
        document.getElementById('splitEstimatedFiles').textContent = estimated + ' 个文件';
    }

    async function startSplit() {
        const rowsPerFile = parseInt(rowsPerFileInput.value) || 1;
        const totalRows = sheetData.length;
        const totalFiles = Math.ceil(totalRows / rowsPerFile);

        progressSection.style.display = 'block';
        hideStatus();

        setStatus('processing', '正在拆分文件...', `预计生成 ${totalFiles} 个文件`);

        splitFiles = [];
        let currentRow = 0;
        let fileIndex = 1;

        try {
            while (currentRow < totalRows) {
                const endRow = Math.min(currentRow + rowsPerFile, totalRows);
                const chunkData = sheetData.slice(currentRow, endRow);

                const ws = XLSX.utils.aoa_to_sheet(chunkData);
                const csvContent = XLSX.utils.sheet_to_csv(ws);
                const utf8Bytes = new TextEncoder().encode(csvContent);
                const blob = new Blob([utf8Bytes], { type: 'text/csv;charset=utf-8' });

                const fileName = `${originalFileName}_${fileIndex}.csv`;
                splitFiles.push({ name: fileName, blob: blob });

                currentRow = endRow;
                fileIndex++;

                const progress = Math.round(((fileIndex - 1) / totalFiles) * 100);
                updateSplitProgress(fileIndex - 1, totalFiles, progress);
                await new Promise(resolve => setTimeout(resolve, 10));
            }

            progressSection.style.display = 'none';
            downloadSection.style.display = 'block';

            downloadList.innerHTML = '';
            splitFiles.forEach((file) => {
                const item = document.createElement('div');
                item.className = 'download-item';
                
                const downloadBtn = document.createElement('button');
                downloadBtn.textContent = '下载';
                downloadBtn.addEventListener('click', () => downloadFile(file.blob, file.name));
                
                item.innerHTML = `<span>${file.name}</span>`;
                item.appendChild(downloadBtn);
                downloadList.appendChild(item);
            });

            setStatus('success', '拆分完成！', `已成功生成 ${splitFiles.length} 个文件`, function() {
                document.getElementById('split-tool').scrollIntoView({ behavior: 'smooth' });
            });

        } catch (error) {
            console.error('Split error:', error);
            setStatus('error', '拆分失败', error.message);
            progressSection.style.display = 'none';
        }
    }

    function updateSplitProgress(current, total, percent) {
        document.getElementById('splitProgressText').textContent = `${current} / ${total}`;
        document.getElementById('splitProgressPercent').textContent = `${percent}%`;
        document.getElementById('splitProgressFill').style.width = `${percent}%`;
    }

    function downloadFile(blob, fileName) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    async function downloadAllAsZip() {
        if (splitFiles.length === 0) {
            alert('没有文件可下载');
            return;
        }

        setStatus('processing', '正在打包文件...', '请稍候');

        try {
            const zip = new JSZip();
            
            for (const file of splitFiles) {
                const content = await file.blob.arrayBuffer();
                zip.file(file.name, content);
            }

            const zipBlob = await zip.generateAsync({ type: 'blob' });
            const zipFileName = `${originalFileName}_split.zip`;
            
            downloadFile(zipBlob, zipFileName);
            
            setStatus('success', '打包完成！', `已生成 ${zipFileName}`);
        } catch (error) {
            console.error('Zip error:', error);
            setStatus('error', '打包失败', error.message);
        }
    }

    function resetSplitTool() {
        sheetData = null;
        originalFileName = '';
        splitFiles = [];

        fileInput.value = '';
        rowsPerFileInput.value = '5000';

        document.getElementById('splitTotalRows').textContent = '-';
        document.getElementById('splitTotalCols').textContent = '-';
        document.getElementById('splitEstimatedFiles').textContent = '-';

        downloadList.innerHTML = '';
        document.getElementById('splitProgressFill').style.width = '0%';

        fileInfo.style.display = 'none';
        progressSection.style.display = 'none';
        downloadSection.style.display = 'none';
    }
}

function initTranslateTool() {
    const uploadArea = document.getElementById('translateUploadArea');
    const fileInput = document.getElementById('translateFileInput');
    const fileInfo = document.getElementById('translateFileInfo');
    const columnSelectSection = document.getElementById('translateColumnSelect');
    const translateBtn = document.getElementById('translateBtn');
    const downloadBtn = document.getElementById('translateDownloadBtn');
    const resetBtn = document.getElementById('translateResetBtn');
    const confirmColumnBtn = document.getElementById('translateConfirmColumnBtn');
    const projectList = document.getElementById('projectList');
    const addProjectBtn = document.getElementById('addProjectBtn');
    const projectModal = document.getElementById('projectModal');
    const closeModalBtn = document.getElementById('closeModalBtn');
    const saveProjectBtn = document.getElementById('saveProjectBtn');
    const cancelProjectBtn = document.getElementById('cancelProjectBtn');
    const progressSection = document.getElementById('translateProgressSection');
    const downloadSection = document.getElementById('translateDownloadSection');

    const DEFAULT_PROJECTS = [
        {
            id: 'yongbingxiaozhen',
            name: '佣兵小镇',
            rules: `翻译标准：
1. 翻译后的文本需要和ID完全对应
2. 如果出现^符号，可认为是,号（翻译后可用逗号代替）
3. 如果出现引用""''符号，翻译时不能使用英文的双引""符号，否则将出现报错，可使用英文、中文单引号，或中文双引号
4. 所有的%s%d文本都是代文本，实际游戏内根据功能有不同的正式文本，则翻译时，%s%d不可被替换，需要按照语义用在对应且正确的位置
5. 所有的色号代码不可被替换（如<color=#34cd3f>、</color>、<outline color=#2B183D width=2>等），只翻译文本即可
6. 所有的\\n都是代表游戏中换行，\\n不可被替换
7. 界面文本限制翻译后字数，尽量简短翻译，避免超框、显示不全等问题，可适当进行精简，只保留重要信息
8. 所有文本翻译为英文时最多乘中文字数3倍，即2字文本英文字符小于6，10字文本英文字符小于30，其他语言同理。`
        }
    ];

    let projects = [];
    let currentProject = null;
    let sheetData = null;
    let originalFileName = '';
    let translatedData = null;
    let selectedColumns = [];

    loadProjects();
    renderProjects();

    uploadArea.addEventListener('click', () => fileInput.click());

    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });

    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
    });

    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleTranslateFile(files[0]);
        }
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleTranslateFile(e.target.files[0]);
        }
    });

    addProjectBtn.addEventListener('click', () => openModal());
    closeModalBtn.addEventListener('click', () => closeModal());
    cancelProjectBtn.addEventListener('click', () => closeModal());
    saveProjectBtn.addEventListener('click', saveProject);
    translateBtn.addEventListener('click', startTranslate);
    downloadBtn.addEventListener('click', downloadTranslated);
    resetBtn.addEventListener('click', resetTranslateTool);
    confirmColumnBtn.addEventListener('click', confirmColumnSelection);

    projectModal.addEventListener('click', (e) => {
        if (e.target === projectModal) closeModal();
    });

    function loadProjects() {
        const stored = localStorage.getItem('translationProjects');
        if (stored) {
            projects = JSON.parse(stored);
        } else {
            projects = [...DEFAULT_PROJECTS];
            saveProjectsToStorage();
        }
        if (projects.length > 0 && !currentProject) {
            currentProject = projects[0];
        }
    }

    function saveProjectsToStorage() {
        localStorage.setItem('translationProjects', JSON.stringify(projects));
    }

    function renderProjects() {
        projectList.innerHTML = '';
        projects.forEach(project => {
            const div = document.createElement('div');
            div.className = `project-item ${currentProject && currentProject.id === project.id ? 'active' : ''}`;
            div.innerHTML = `
                <div class="project-info">
                    <span class="project-name">${project.name}</span>
                </div>
                <div class="project-actions">
                    <button class="icon-btn-small edit-btn" data-id="${project.id}" title="编辑">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                    </button>
                    <button class="icon-btn-small delete-btn ${project.id === 'yongbingxiaozhen' ? 'disabled' : ''}" data-id="${project.id}" title="删除">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        </svg>
                    </button>
                </div>
            `;

            div.addEventListener('click', (e) => {
                if (e.target.closest('.edit-btn')) {
                    editProject(project.id);
                } else if (e.target.closest('.delete-btn') && project.id !== 'yongbingxiaozhen') {
                    deleteProject(project.id);
                } else if (!e.target.closest('.project-actions')) {
                    selectProject(project.id);
                }
            });

            projectList.appendChild(div);
        });
    }

    function selectProject(id) {
        currentProject = projects.find(p => p.id === id);
        renderProjects();
    }

    function openModal(project = null) {
        document.getElementById('modalTitle').textContent = project ? '编辑项目' : '添加项目';
        document.getElementById('projectName').value = project ? project.name : '';
        document.getElementById('projectRules').value = project ? project.rules : '';
        projectModal.dataset.editId = project ? project.id : '';
        projectModal.style.display = 'flex';
    }

    function closeModal() {
        projectModal.style.display = 'none';
        document.getElementById('projectName').value = '';
        document.getElementById('projectRules').value = '';
        projectModal.dataset.editId = '';
    }

    function editProject(id) {
        const project = projects.find(p => p.id === id);
        if (project) {
            openModal(project);
        }
    }

    function deleteProject(id) {
        if (id === 'yongbingxiaozhen') return;
        projects = projects.filter(p => p.id !== id);
        if (currentProject && currentProject.id === id) {
            currentProject = projects[0] || null;
        }
        saveProjectsToStorage();
        renderProjects();
    }

    function saveProject() {
        const name = document.getElementById('projectName').value.trim();
        const rules = document.getElementById('projectRules').value.trim();

        if (!name) {
            alert('请输入项目名称');
            return;
        }

        const editId = projectModal.dataset.editId;
        if (editId) {
            const project = projects.find(p => p.id === editId);
            if (project) {
                project.name = name;
                project.rules = rules;
            }
        } else {
            const id = 'project_' + Date.now();
            projects.push({ id, name, rules });
        }

        saveProjectsToStorage();
        renderProjects();
        closeModal();
    }

    async function handleTranslateFile(file) {
        originalFileName = file.name.replace(/\.(csv|xlsx|xls)$/i, '');
        const extension = file.name.split('.').pop().toLowerCase();

        document.getElementById('translateFileName').textContent = file.name;

        if (extension === 'csv') {
            const { text, encoding } = await readCSVWithEncoding(file);
            document.getElementById('translateFileEncoding').textContent = encoding;

            const result = XLSX.read(text, { type: 'string', cellDates: true });
            const sheetName = result.SheetNames[0];
            sheetData = XLSX.utils.sheet_to_json(result.Sheets[sheetName], { header: 1 });
        } else {
            document.getElementById('translateFileEncoding').textContent = 'N/A (Excel)';
            const arrayBuffer = await file.arrayBuffer();
            const result = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
            const sheetName = result.SheetNames[0];
            sheetData = XLSX.utils.sheet_to_json(result.Sheets[sheetName], { header: 1 });
        }

        document.getElementById('translateTotalRows').textContent = sheetData.length;
        document.getElementById('translateTotalCols').textContent = sheetData[0] ? sheetData[0].length : 0;

        selectedColumns = [];
        renderColumnList();

        fileInfo.style.display = 'block';
        columnSelectSection.style.display = 'block';
        downloadSection.style.display = 'none';
    }

    function renderColumnList() {
        const columnList = document.getElementById('translateColumnList');
        columnList.innerHTML = '';

        if (!sheetData || sheetData.length === 0 || !sheetData[0]) {
            columnList.innerHTML = '<p class="column-hint">无法读取列信息</p>';
            return;
        }

        const headers = sheetData[0];
        headers.forEach((header, index) => {
            const div = document.createElement('div');
            const isSelected = selectedColumns.includes(index);
            div.className = `column-item ${isSelected ? 'selected' : ''}`;
            div.innerHTML = `
                <span class="column-index">列 ${index + 1}</span>
                <span class="column-name">${header || '(空列名)'}</span>
                <span class="column-preview">${getColumnPreview(index)}</span>
            `;
            div.addEventListener('click', () => toggleColumn(index));
            columnList.appendChild(div);
        });
    }

    function getColumnPreview(colIndex) {
        if (sheetData.length <= 1) return '无数据';
        const previewRows = sheetData.slice(1, 4);
        const values = previewRows.map(row => {
            const val = row[colIndex];
            if (val === undefined || val === null) return '';
            const str = String(val);
            return str.length > 15 ? str.substring(0, 15) + '...' : str;
        }).filter(v => v);
        return values.join(' | ') || '无数据';
    }

    function toggleColumn(index) {
        const idx = selectedColumns.indexOf(index);
        if (idx > -1) {
            selectedColumns.splice(idx, 1);
        } else {
            selectedColumns.push(index);
        }
        renderColumnList();
    }

    function confirmColumnSelection() {
        if (selectedColumns.length === 0) {
            alert('请至少选择一列进行翻译');
            return;
        }
        columnSelectSection.style.display = 'none';
    }

    async function startTranslate() {
        const targetLang = document.getElementById('targetLang').value;

        if (!currentProject) {
            alert('请先选择游戏项目');
            return;
        }

        if (selectedColumns.length === 0) {
            alert('请先选择要翻译的列');
            return;
        }

        progressSection.style.display = 'block';
        hideStatus();

        const translationList = document.getElementById('translationList');
        translationList.innerHTML = '';

        const totalRows = sheetData.length;
        const totalCells = (totalRows - 1) * selectedColumns.length;

        // 创建新的数据结构：保留原文，在旁边添加译文列
        let translatedDataLocal = [];
        const langNames = {
            'en': '英文',
            'ja': '日文',
            'ko': '韩文',
            'zh-TW': '繁体中文',
            'fr': '法文',
            'de': '德文',
            'es': '西班牙文',
            'pt': '葡萄牙文',
            'ru': '俄文',
            'th': '泰文',
            'vi': '越南文',
            'id': '印尼文'
        };
        const targetLangName = langNames[targetLang] || targetLang;

        // 处理表头：在每个选中的列后面添加译文列
        const headerRow = [...sheetData[0]];
        const newHeaderRow = [];
        let columnOffset = 0; // 因为添加新列，需要记录偏移量
        const translatedColIndices = []; // 记录译文列的索引

        for (let colIndex = 0; colIndex < headerRow.length; colIndex++) {
            newHeaderRow.push(headerRow[colIndex]);
            
            if (selectedColumns.includes(colIndex)) {
                newHeaderRow.push(`${headerRow[colIndex]} (${targetLangName})`);
                translatedColIndices.push(colIndex + columnOffset + 1);
                columnOffset++;
            }
        }
        translatedDataLocal.push(newHeaderRow);

        // 处理数据行
        for (let i = 1; i < totalRows; i++) {
            const row = sheetData[i];
            const newRow = [];
            let rowOffset = 0;
            
            for (let colIndex = 0; colIndex < row.length; colIndex++) {
                newRow.push(row[colIndex]);
                
                if (selectedColumns.includes(colIndex)) {
                    newRow.push(''); // 先留空
                    rowOffset++;
                }
            }
            translatedDataLocal.push(newRow);
        }

        let startRow = 1;
        let successCount = 0;
        let failCount = 0;
        let translateCount = 0;

        const savedProgress = loadTranslationProgress();
        if (savedProgress && savedProgress.fileName === originalFileName) {
            const shouldResume = confirm(`检测到未完成的翻译任务，已翻译 ${savedProgress.successCount} 个，失败 ${savedProgress.failCount} 个。是否继续？`);
            if (shouldResume) {
                translatedDataLocal = savedProgress.translatedData;
                startRow = savedProgress.currentRow;
                successCount = savedProgress.successCount;
                failCount = savedProgress.failCount;
                translateCount = successCount + failCount;
            } else {
                clearTranslationProgress();
                startRow = 1;
            }
        }

        setStatus('processing', '正在翻译文本...', `预计翻译 ${totalCells} 个单元格`);

        try {
            for (let i = startRow; i < totalRows; i++) {
                await waitForNetwork();

                const row = sheetData[i];

                for (let j = 0; j < selectedColumns.length; j++) {
                    const originalColIndex = selectedColumns[j];
                    const cell = row[originalColIndex];
                    
                    // 计算译文列的位置
                    let targetColIndex = originalColIndex;
                    for (let k = 0; k < selectedColumns.length; k++) {
                        if (selectedColumns[k] < originalColIndex) {
                            targetColIndex++;
                        }
                        if (selectedColumns[k] === originalColIndex) {
                            targetColIndex++;
                            break;
                        }
                    }
                    
                    if (typeof cell === 'string' && cell.trim() && !isSpecialCode(cell)) {
                        const translated = await translateTextWithRetry(cell, 'zh-CN', targetLang, currentProject.rules);
                        if (!translated.startsWith('[翻译失败]')) {
                            successCount++;
                        } else {
                            failCount++;
                        }
                        translatedDataLocal[i][targetColIndex] = translated;
                        translateCount++;

                        addTranslationItem(translationList, cell, translated, i, originalColIndex);
                    }
                }

                const progress = Math.round(((i + 1) / totalRows) * 100);
                updateTranslateProgress(i + 1, totalRows, progress);
                document.getElementById('translateProgressInfo').textContent = `正在翻译第 ${i + 1} 行... (已翻译 ${translateCount} 个)`;

                if (i % 10 === 0) {
                    saveTranslationProgress({
                        fileName: originalFileName,
                        totalRows: totalRows,
                        currentRow: i + 1,
                        translatedData: translatedDataLocal,
                        successCount: successCount,
                        failCount: failCount,
                        selectedColumns: selectedColumns,
                        targetLang: targetLang
                    });
                }
            }

            clearTranslationProgress();
            translatedData = translatedDataLocal;

            progressSection.style.display = 'none';
            downloadSection.style.display = 'block';
            document.getElementById('translatedCount').textContent = translateCount;

            setStatus('success', '翻译完成！', `成功 ${successCount} 个，失败 ${failCount} 个`, function() {
                document.getElementById('translate-tool').scrollIntoView({ behavior: 'smooth' });
            });

        } catch (error) {
            console.error('Translate error:', error);
            setStatus('error', '翻译失败', error.message);
            progressSection.style.display = 'none';
        }
    }

    function addTranslationItem(list, original, translated, row, col) {
        const item = document.createElement('div');
        item.className = 'translation-item';
        
        const truncatedOriginal = original.length > 50 ? original.substring(0, 50) + '...' : original;
        const truncatedTranslated = translated.length > 50 ? translated.substring(0, 50) + '...' : translated;
        
        item.innerHTML = `
            <div class="translation-row-info">行 ${row + 1}, 列 ${col + 1}</div>
            <div class="translation-content">
                <div class="translation-original">${escapeHtml(truncatedOriginal)}</div>
                <div class="translation-arrow">→</div>
                <div class="translation-result ${translated.startsWith('[翻译失败]') ? 'error' : ''}">${escapeHtml(truncatedTranslated)}</div>
            </div>
        `;
        
        list.insertBefore(item, list.firstChild);
        
        if (list.children.length > 100) {
            list.removeChild(list.lastChild);
        }
    }

    function updateTranslateProgress(current, total, percent) {
        document.getElementById('translateProgressText').textContent = `${current} / ${total}`;
        document.getElementById('translateProgressPercent').textContent = `${percent}%`;
        document.getElementById('translateProgressFill').style.width = `${percent}%`;
    }

    function downloadTranslated() {
        if (!translatedData) {
            alert('没有可下载的翻译结果');
            return;
        }

        const ws = XLSX.utils.aoa_to_sheet(translatedData);
        const csvContent = XLSX.utils.sheet_to_csv(ws);
        const utf8Bytes = new TextEncoder().encode(csvContent);
        const blob = new Blob([utf8Bytes], { type: 'text/csv;charset=utf-8' });

        const fileName = `${originalFileName}_translated.csv`;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function resetTranslateTool() {
        sheetData = null;
        originalFileName = '';
        translatedData = null;
        selectedColumns = [];

        fileInput.value = '';

        document.getElementById('translateTotalRows').textContent = '-';
        document.getElementById('translateTotalCols').textContent = '-';
        document.getElementById('translateProgressFill').style.width = '0%';
        document.getElementById('translateProgressInfo').textContent = '';

        fileInfo.style.display = 'none';
        columnSelectSection.style.display = 'none';
        progressSection.style.display = 'none';
        downloadSection.style.display = 'none';
    }

    function isSpecialCode(text) {
        const specialPatterns = [
            /^<color=.*?>.*?<\/color>$/i,
            /^<outline.*?>.*?<\/outline>$/i,
            /^<b>.*?<\/b>$/i,
            /^<i>.*?<\/i>$/i,
            /^(图|技能|物品|任务|成就)等[一二三四五六七八九十\d]+$/i,
            /^[A-Z]+$/i
        ];
        return specialPatterns.some(pattern => pattern.test(text.trim()));
    }

    async function translateTextWithRetry(text, sourceLang, targetLang, rules, retries = 3) {
        const model = document.getElementById('aiModel').value;
        const apiConfig = getApiConfig();
        const baseUrl = getApiBaseUrl(apiConfig.provider, apiConfig.baseUrl);
        
        if (!apiConfig.apiKey) {
            return '[错误] 请先在顶部配置 API Key';
        }
        
        console.log(`🤖 正在使用模型: ${model}`);
        
        for (let attempt = 0; attempt < retries; attempt++) {
            try {
                await waitForNetwork();

                const prompt = buildTranslatePrompt(text, sourceLang, targetLang, rules);
                const response = await fetch(`${baseUrl}/v1/chat/completions`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiConfig.apiKey}`
                    },
                    body: JSON.stringify({
                        model: model,
                        messages: [{ role: 'user', content: prompt }],
                        temperature: 0.3
                    })
                });

                if (!response.ok) {
                    throw new Error(`API error: ${response.status}`);
                }

                const data = await response.json();
                let translated = data.choices[0].message.content.trim();
                translated = translated.replace(/^["'""']+|["'""']+$/g, '');
                return translated;

            } catch (error) {
                console.error(`Translate attempt ${attempt + 1} failed:`, error);
                if (attempt === retries - 1) {
                    return '[翻译失败] ' + text;
                }
                await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
            }
        }
        return '[翻译失败] ' + text;
    }

    function buildTranslatePrompt(text, sourceLang, targetLang, rules) {
        const langNames = {
            'en': 'English',
            'ja': 'Japanese',
            'ko': 'Korean',
            'zh-TW': 'Traditional Chinese',
            'fr': 'French',
            'de': 'German',
            'es': 'Spanish',
            'pt': 'Portuguese',
            'ru': 'Russian',
            'th': 'Thai',
            'vi': 'Vietnamese',
            'id': 'Indonesian'
        };

        return `作为专业的游戏本地化翻译，请将以下中文游戏文本翻译成${langNames[targetLang] || targetLang}。

重要要求：
1. 必须完整翻译所有中文内容，不得遗漏或保留任何中文
2. 保持游戏风格，自然流畅，符合游戏本地化习惯
3. 占位符 %s、%d 等必须保留在正确位置
4. 颜色标签 <color=...>、<outline=...> 等必须保持原样
5. 换行符 \\n 必须保留

翻译标准：
${rules}

待翻译文本：
${text}

请直接输出翻译结果，不要添加任何解释或说明。`;
    }
}

function initConvertTool() {
    const uploadArea = document.getElementById('convertUploadArea');
    const fileInput = document.getElementById('convertFileInput');
    const fileInfo = document.getElementById('convertFileInfo');
    const convertBtn = document.getElementById('convertBtn');
    const downloadBtn = document.getElementById('convertDownloadBtn');
    const resetBtn = document.getElementById('convertResetBtn');
    const downloadSection = document.getElementById('convertDownloadSection');

    let sheetData = null;
    let originalFileName = '';

    uploadArea.addEventListener('click', () => fileInput.click());

    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });

    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
    });

    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleConvertFile(files[0]);
        }
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleConvertFile(e.target.files[0]);
        }
    });

    convertBtn.addEventListener('click', startConvert);
    downloadBtn.addEventListener('click', downloadConverted);
    resetBtn.addEventListener('click', resetConvertTool);

    async function handleConvertFile(file) {
        originalFileName = file.name.replace(/\.(csv|xlsx|xls)$/i, '');
        const extension = file.name.split('.').pop().toLowerCase();

        document.getElementById('convertFileName').textContent = file.name;
        document.getElementById('convertFileSize').textContent = formatFileSize(file.size);

        if (extension === 'csv') {
            const { text, encoding } = await readCSVWithEncoding(file);
            document.getElementById('convertFileEncoding').textContent = encoding;

            const result = XLSX.read(text, { type: 'string', cellDates: true });
            const sheetName = result.SheetNames[0];
            sheetData = XLSX.utils.sheet_to_json(result.Sheets[sheetName], { header: 1 });
        } else {
            document.getElementById('convertFileEncoding').textContent = 'N/A (Excel)';
            const arrayBuffer = await file.arrayBuffer();
            const result = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
            const sheetName = result.SheetNames[0];
            sheetData = XLSX.utils.sheet_to_json(result.Sheets[sheetName], { header: 1 });
        }

        document.getElementById('convertTotalRows').textContent = sheetData.length;
        document.getElementById('convertTotalCols').textContent = sheetData[0] ? sheetData[0].length : 0;

        fileInfo.style.display = 'block';
        downloadSection.style.display = 'none';
    }

    function startConvert() {
        const outputFormat = document.getElementById('outputFormat').value;
        const delimiter = document.getElementById('delimiter').value;
        const newline = document.getElementById('newline').value;

        hideStatus();
        setStatus('processing', '正在转换文件...', `目标格式: ${getFormatName(outputFormat)}`);

        try {
            const csvContent = convertToFormat(sheetData, delimiter, newline);
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });

            const fileName = `${originalFileName}_converted.csv`;
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            document.getElementById('convertOutputFormat').textContent = getFormatName(outputFormat);
            downloadSection.style.display = 'block';

            setStatus('success', '转换完成！', `已转换为 ${getFormatName(outputFormat)}`);

        } catch (error) {
            console.error('Convert error:', error);
            setStatus('error', '转换失败', error.message);
        }
    }

    function convertToFormat(data, delimiter, newline) {
        const rows = data.map(row => {
            return row.map(cell => {
                if (cell === null || cell === undefined) return '';
                const str = String(cell);
                if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                    return '"' + str.replace(/"/g, '""') + '"';
                }
                return str;
            }).join(delimiter);
        });

        return rows.join(newline);
    }

    function getFormatName(format) {
        const names = {
            'utf8': 'UTF-8（无 BOM）',
            'utf8-bom': 'UTF-8（带 BOM）',
            'gbk': 'GBK',
            'gb2312': 'GB2312',
            'utf16': 'UTF-16 LE'
        };
        return names[format] || format;
    }

    function downloadConverted() {
        alert('文件已下载');
    }

    function resetConvertTool() {
        sheetData = null;
        originalFileName = '';
        fileInput.value = '';

        document.getElementById('convertTotalRows').textContent = '-';
        document.getElementById('convertTotalCols').textContent = '-';
        document.getElementById('outputFormat').value = 'utf8';
        document.getElementById('delimiter').value = ',';
        document.getElementById('newline').value = '\n';

        fileInfo.style.display = 'none';
        downloadSection.style.display = 'none';
        hideStatus();
    }
}

function initL10nCheckTool() {
    const uploadArea = document.getElementById('l10nUploadArea');
    const fileInput = document.getElementById('l10nFileInput');
    const fileInfo = document.getElementById('l10nFileInfo');
    const columnSelectSection = document.getElementById('l10nColumnSelect');
    const checkBtn = document.getElementById('l10nCheckBtn');
    const downloadBtn = document.getElementById('l10nDownloadBtn');
    const downloadGlossaryBtn = document.getElementById('l10nDownloadGlossaryBtn');
    const resetBtn = document.getElementById('l10nResetBtn');
    const confirmColumnBtn = document.getElementById('l10nConfirmColumnBtn');
    const progressSection = document.getElementById('l10nProgressSection');
    const resultsSection = document.getElementById('l10nResults');

    let sheetData = null;
    let originalFileName = '';
    let sourceColumn = null;
    let targetColumn = null;
    let checkResults = [];
    let glossaryData = [];

    const L10N_PROGRESS_KEY = 'l10n_check_progress';

    uploadArea.addEventListener('click', () => fileInput.click());

    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });

    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
    });

    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleL10nFile(files[0]);
        }
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleL10nFile(e.target.files[0]);
        }
    });

    confirmColumnBtn.addEventListener('click', confirmColumnSelection);
    checkBtn.addEventListener('click', startCheck);
    downloadBtn.addEventListener('click', downloadReport);
    downloadGlossaryBtn.addEventListener('click', downloadGlossary);
    resetBtn.addEventListener('click', resetTool);

    async function handleL10nFile(file) {
        originalFileName = file.name.replace(/\.(csv|xlsx|xls)$/i, '');
        const extension = file.name.split('.').pop().toLowerCase();

        document.getElementById('l10nFileName').textContent = file.name;

        if (extension === 'csv') {
            const { text } = await readCSVWithEncoding(file);
            const result = XLSX.read(text, { type: 'string', cellDates: true });
            const sheetName = result.SheetNames[0];
            sheetData = XLSX.utils.sheet_to_json(result.Sheets[sheetName], { header: 1 });
        } else {
            const arrayBuffer = await file.arrayBuffer();
            const result = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
            const sheetName = result.SheetNames[0];
            sheetData = XLSX.utils.sheet_to_json(result.Sheets[sheetName], { header: 1 });
        }

        document.getElementById('l10nTotalRows').textContent = sheetData.length;
        document.getElementById('l10nTotalCols').textContent = sheetData[0] ? sheetData[0].length : 0;

        sourceColumn = null;
        targetColumn = null;
        renderColumnLists();

        fileInfo.style.display = 'block';
        columnSelectSection.style.display = 'block';
        resultsSection.style.display = 'none';
        checkResults = [];
        glossaryData = [];
    }

    function detectLanguage(text) {
        if (!text || typeof text !== 'string') return 'unknown';
        
        const chineseRegex = /[\u4e00-\u9fa5]/g;
        const englishRegex = /[a-zA-Z]/g;
        const japaneseRegex = /[\u3040-\u309f\u30a0-\u30ff]/g;
        const koreanRegex = /[\uac00-\ud7af]/g;
        
        const chineseMatches = text.match(chineseRegex);
        const englishMatches = text.match(englishRegex);
        const japaneseMatches = text.match(japaneseRegex);
        const koreanMatches = text.match(koreanRegex);
        
        const chineseCount = chineseMatches ? chineseMatches.length : 0;
        const englishCount = englishMatches ? englishMatches.length : 0;
        const japaneseCount = japaneseMatches ? japaneseMatches.length : 0;
        const koreanCount = koreanMatches ? koreanMatches.length : 0;
        
        const total = chineseCount + englishCount + japaneseCount + koreanCount;
        
        if (total === 0) return 'unknown';
        
        if (chineseCount / total > 0.3) return 'chinese';
        if (japaneseCount / total > 0.3) return 'japanese';
        if (koreanCount / total > 0.3) return 'korean';
        if (englishCount / total > 0.3) return 'english';
        
        return 'unknown';
    }

    function detectColumnLanguage(colIndex) {
        if (sheetData.length <= 1) return 'unknown';
        
        const sampleRows = sheetData.slice(1, Math.min(11, sheetData.length));
        const languages = [];
        
        for (const row of sampleRows) {
            const cell = row[colIndex];
            if (cell && typeof cell === 'string' && cell.trim()) {
                languages.push(detectLanguage(cell));
            }
        }
        
        if (languages.length === 0) return 'unknown';
        
        const languageCounts = {};
        for (const lang of languages) {
            languageCounts[lang] = (languageCounts[lang] || 0) + 1;
        }
        
        let maxLang = 'unknown';
        let maxCount = 0;
        for (const [lang, count] of Object.entries(languageCounts)) {
            if (count > maxCount) {
                maxCount = count;
                maxLang = lang;
            }
        }
        
        return maxLang;
    }

    function renderColumnLists() {
        const sourceColumnList = document.getElementById('l10nSourceColumnList');
        const targetColumnList = document.getElementById('l10nTargetColumnList');
        sourceColumnList.innerHTML = '';
        targetColumnList.innerHTML = '';

        if (!sheetData || sheetData.length === 0 || !sheetData[0]) {
            const hint = '<p class="column-hint">无法读取列信息</p>';
            sourceColumnList.innerHTML = hint;
            targetColumnList.innerHTML = hint;
            return;
        }

        const headers = sheetData[0];
        const columnLanguages = [];
        
        headers.forEach((header, index) => {
            const lang = detectColumnLanguage(index);
            columnLanguages.push(lang);
        });

        if (sourceColumn === null || targetColumn === null) {
            let chineseCol = null;
            let otherCol = null;
            
            for (let i = 0; i < columnLanguages.length; i++) {
                if (columnLanguages[i] === 'chinese' && chineseCol === null) {
                    chineseCol = i;
                } else if (columnLanguages[i] !== 'chinese' && columnLanguages[i] !== 'unknown' && otherCol === null) {
                    otherCol = i;
                }
            }
            
            if (chineseCol !== null) {
                sourceColumn = chineseCol;
            }
            if (otherCol !== null) {
                targetColumn = otherCol;
            }
        }

        const languageNames = {
            'chinese': '中文',
            'english': '英文',
            'japanese': '日文',
            'korean': '韩文',
            'unknown': '未知'
        };

        headers.forEach((header, index) => {
            const isSourceSelected = sourceColumn === index;
            const isTargetSelected = targetColumn === index;
            const lang = columnLanguages[index];
            const langName = languageNames[lang] || '未知';

            const sourceDiv = document.createElement('div');
            sourceDiv.className = `column-item ${isSourceSelected ? 'selected' : ''}`;
            sourceDiv.innerHTML = `
                <span class="column-index">列 ${index + 1}</span>
                <span class="column-name">${header || '(空列名)'}</span>
                <span class="column-lang">${langName}</span>
                <span class="column-preview">${getColumnPreview(index)}</span>
            `;
            sourceDiv.addEventListener('click', () => selectSourceColumn(index));
            sourceColumnList.appendChild(sourceDiv);

            const targetDiv = document.createElement('div');
            targetDiv.className = `column-item ${isTargetSelected ? 'selected' : ''}`;
            targetDiv.innerHTML = `
                <span class="column-index">列 ${index + 1}</span>
                <span class="column-name">${header || '(空列名)'}</span>
                <span class="column-lang">${langName}</span>
                <span class="column-preview">${getColumnPreview(index)}</span>
            `;
            targetDiv.addEventListener('click', () => selectTargetColumn(index));
            targetColumnList.appendChild(targetDiv);
        });
    }

    function getColumnPreview(colIndex) {
        if (sheetData.length <= 1) return '无数据';
        const previewRows = sheetData.slice(1, 4);
        const values = previewRows.map(row => {
            const val = row[colIndex];
            if (val === undefined || val === null) return '';
            const str = String(val);
            return str.length > 15 ? str.substring(0, 15) + '...' : str;
        }).filter(v => v);
        return values.join(' | ') || '无数据';
    }

    function selectSourceColumn(index) {
        sourceColumn = index;
        renderColumnLists();
    }

    function selectTargetColumn(index) {
        targetColumn = index;
        renderColumnLists();
    }

    function confirmColumnSelection() {
        if (sourceColumn === null) {
            alert('请选择原文列');
            return;
        }
        if (targetColumn === null) {
            alert('请选择译文列');
            return;
        }
        if (sourceColumn === targetColumn) {
            alert('原文列和译文列不能相同');
            return;
        }
        columnSelectSection.style.display = 'none';
    }

    async function startCheck() {
        const scene = document.getElementById('l10nScene').value;
        const strictness = document.getElementById('l10nStrictness').value;

        progressSection.style.display = 'block';
        hideStatus();

        const checkList = document.getElementById('l10nCheckList');
        checkList.innerHTML = '';

        const totalRows = sheetData.length - 1;

        let startRow = 1;
        checkResults = [];
        glossaryData = [];
        let checkedCount = 0;

        const savedProgress = loadL10nProgress();
        if (savedProgress && savedProgress.fileName === originalFileName) {
            const shouldResume = confirm(`检测到未完成的任务，已检测 ${savedProgress.checkedCount} 条文本。是否继续？`);
            if (shouldResume) {
                startRow = savedProgress.currentRow + 1;
                checkResults = savedProgress.checkResults;
                glossaryData = savedProgress.glossaryData;
                checkedCount = savedProgress.checkedCount;
            } else {
                clearL10nProgress();
            }
        }

        setStatus('processing', '正在检测文本...', `预计检测 ${totalRows} 条文本`);

        try {
            for (let i = startRow; i < sheetData.length; i++) {
                await waitForNetwork();

                const row = sheetData[i];
                const sourceText = row[sourceColumn];
                const targetText = row[targetColumn];

                if (sourceText && targetText && 
                    typeof sourceText === 'string' && sourceText.trim() &&
                    typeof targetText === 'string' && targetText.trim()) {

                    const result = await checkTextPair(sourceText, targetText, scene, strictness);
                    const hasIssues = result && result.issues && result.issues.length > 0;
                    
                    if (hasIssues) {
                        result.issues.forEach(issue => {
                            checkResults.push({
                                source: sourceText,
                                target: targetText,
                                issue: issue.issue,
                                corrected: issue.corrected,
                                reason: issue.reason
                            });
                        });
                    }

                    addToGlossary(sourceText, targetText);
                    checkedCount++;

                    addCheckItem(checkList, sourceText, targetText, hasIssues, i);
                }

                if (i % 10 === 0) {
                    saveL10nProgress({
                        fileName: originalFileName,
                        currentRow: i,
                        checkResults: checkResults,
                        glossaryData: glossaryData,
                        checkedCount: checkedCount
                    });
                }

                const progress = Math.round(((i) / totalRows) * 100);
                updateProgress(i, totalRows, progress);
                document.getElementById('l10nProgressInfo').textContent = `正在检测第 ${i} 行... (已检测 ${checkedCount} 条，发现 ${checkResults.length} 个问题)`;
            }

            clearL10nProgress();
            displayResults(checkedCount);

        } catch (error) {
            console.error('L10n check error:', error);
            saveL10nProgress({
                fileName: originalFileName,
                currentRow: startRow,
                checkResults: checkResults,
                glossaryData: glossaryData,
                checkedCount: checkedCount
            });
            setStatus('error', '检测失败', error.message);
            progressSection.style.display = 'none';
        }
    }

    function addCheckItem(list, source, target, hasIssues, row) {
        const item = document.createElement('div');
        item.className = `check-item ${hasIssues ? 'has-issues' : 'passed'}`;
        
        const truncatedSource = source.length > 30 ? source.substring(0, 30) + '...' : source;
        const truncatedTarget = target.length > 30 ? target.substring(0, 30) + '...' : target;
        
        item.innerHTML = `
            <div class="check-row-info">行 ${row + 1}</div>
            <div class="check-content">
                <div class="check-source">${escapeHtml(truncatedSource)}</div>
                <div class="check-arrow">→</div>
                <div class="check-target">${escapeHtml(truncatedTarget)}</div>
                <div class="check-status ${hasIssues ? 'error' : 'success'}">${hasIssues ? '⚠️ 问题' : '✓ 通过'}</div>
            </div>
        `;
        
        list.insertBefore(item, list.firstChild);
        
        if (list.children.length > 100) {
            list.removeChild(list.lastChild);
        }
    }

    function guessTermType(text) {
        const lowerText = text.toLowerCase();
        
        if (lowerText.includes('按钮') || lowerText.includes('button') || lowerText.includes('btn')) {
            return 'UI控件';
        } else if (lowerText.includes('任务') || lowerText.includes('quest') || lowerText.includes('mission')) {
            return '任务系统';
        } else if (lowerText.includes('道具') || lowerText.includes('物品') || lowerText.includes('item') || lowerText.includes('equipment')) {
            return '道具装备';
        } else if (lowerText.includes('角色') || lowerText.includes('npc') || lowerText.includes('character')) {
            return '角色NPC';
        } else if (lowerText.includes('技能') || lowerText.includes('skill') || lowerText.includes('spell')) {
            return '技能法术';
        } else if (lowerText.includes('系统') || lowerText.includes('system') || lowerText.includes('error') || lowerText.includes('warning')) {
            return '系统提示';
        } else if (lowerText.includes('剧情') || lowerText.includes('story') || lowerText.includes('dialog') || lowerText.includes('conversation')) {
            return '剧情对白';
        } else {
            return '其他';
        }
    }

    function addToGlossary(source, target) {
        const cleanSource = source.trim();
        const cleanTarget = target.trim();

        const exists = glossaryData.find(g => 
            g.source.toLowerCase() === cleanSource.toLowerCase() &&
            g.target.toLowerCase() === cleanTarget.toLowerCase()
        );

        if (!exists) {
            glossaryData.push({
                source: cleanSource,
                target: cleanTarget,
                type: guessTermType(cleanSource)
            });
        }
    }

    async function checkTextPair(sourceText, targetText, scene, strictness) {
        const model = document.getElementById('l10nAiModel').value;
        const apiConfig = getApiConfig();
        const baseUrl = getApiBaseUrl(apiConfig.provider, apiConfig.baseUrl);
        const maxRetries = 3;
        
        if (!apiConfig.apiKey) {
            return { issues: [{ issue: '请先在顶部配置 API Key', corrected: '', reason: '' }] };
        }
        
        console.log(`🤖 正在使用模型: ${model}`);
        
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                const prompt = buildCheckPrompt(sourceText, targetText, scene, strictness);
                const response = await fetch(`${baseUrl}/v1/chat/completions`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiConfig.apiKey}`
                    },
                    body: JSON.stringify({
                        model: model,
                        messages: [{ role: 'user', content: prompt }],
                        temperature: 0.2
                    })
                });

                if (!response.ok) {
                    throw new Error(`API error: ${response.status}`);
                }

                const data = await response.json();
                const content = data.choices[0].message.content.trim();

                try {
                    return JSON.parse(content);
                } catch {
                    return parseResults(content);
                }
            } catch (error) {
                if (attempt === maxRetries - 1) {
                    return null;
                }
                await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
            }
        }
    }

    function buildCheckPrompt(source, target, scene, strictness) {
        const sceneNames = {
            'all': '全部场景',
            'ui': 'UI 按钮',
            'popup': '弹窗提示',
            'story': '剧情对白',
            'quest': '任务描述',
            'item': '道具说明',
            'system': '系统提示'
        };
        const strictnessLevel = strictness === 'strict' ? '严格' : strictness === 'lenient' ? '宽松' : '标准';

        return `你是游戏本地化专家，请对比检测以下原文和译文的质量：

检测要求：
1. 译文准确性：检查译文是否准确传达原文含义，没有漏译、误译
2. 译文语法：检查译文中的语法错误、拼写错误、单复数、时态、介词搭配、句式语病
3. 译文流畅度：检查译文是否符合目标语言表达习惯，避免生硬直译
4. 术语一致性：检查是否有专业术语前后不一致的情况（需要结合上下文，但这里只检查本次提供的文本）
5. 风格一致性：检查译文风格是否与场景${sceneNames[scene]}匹配
6. 统一规范：英文大小写、标点、空格标准化
7. 避免中式英语、直译感、歧义句
8. 禁止网络俚语、低俗用词，符合 App Store/Google Play 审核规范
9. 使用美式英语，不用英式拼写

检测严格度：${strictnessLevel}

原文：
${source}

译文：
${target}

请以 JSON 格式输出检测结果，包含 issues 数组，每个 issue 包含：
- issue: 错误问题说明
- corrected: 修正后标准文本
- reason: 优化理由

如果没有问题，请输出：{"issues": []}`;
    }

    function parseResults(content) {
        const issues = [];
        const lines = content.split('\n');

        for (const line of lines) {
            if (line.includes('问题：')) {
                issues.push({
                    issue: line.replace(/.*问题：/, '').trim(),
                    corrected: '',
                    reason: ''
                });
            }
        }

        return { issues };
    }

    function displayResults(checkedCount) {
        progressSection.style.display = 'none';
        resultsSection.style.display = 'block';

        const passCount = checkedCount - checkResults.length;
        const passRate = checkedCount > 0 ? Math.round((passCount / checkedCount) * 100) : 0;

        document.getElementById('l10nTotalChecked').textContent = checkedCount;
        document.getElementById('l10nTotalIssues').textContent = checkResults.length;
        document.getElementById('l10nPassRate').textContent = `${passRate}%`;

        const tbody = document.getElementById('l10nResultsBody');
        tbody.innerHTML = '';

        if (checkResults.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 20px;">未发现问题</td></tr>';
        } else {
            checkResults.forEach((result) => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${escapeHtml(result.source)}</td>
                    <td>${escapeHtml(result.target)}</td>
                    <td><span class="issue-tag">${escapeHtml(result.issue)}</span></td>
                    <td>${escapeHtml(result.corrected)}</td>
                    <td>${escapeHtml(result.reason)}</td>
                `;
                tbody.appendChild(tr);
            });
        }

        setStatus('success', '检测完成！', `发现 ${checkResults.length} 个问题，生成 ${glossaryData.length} 条术语`, function() {
            document.getElementById('l10n-check-tool').scrollIntoView({ behavior: 'smooth' });
        });
    }

    function updateProgress(current, total, percent) {
        document.getElementById('l10nProgressText').textContent = `${current} / ${total}`;
        document.getElementById('l10nProgressPercent').textContent = `${percent}%`;
        document.getElementById('l10nProgressFill').style.width = `${percent}%`;
    }

    function downloadReport() {
        if (checkResults.length === 0) {
            alert('没有检测结果可下载');
            return;
        }

        const headers = ['原文', '译文', '错误问题说明', '修正后标准文本', '优化理由'];
        const rows = checkResults.map(r => [r.source, r.target, r.issue, r.corrected, r.reason]);
        rows.unshift(headers);

        const csvContent = rows.map(row => row.map(cell => {
            if (cell === null || cell === undefined) return '';
            const str = String(cell);
            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                return '"' + str.replace(/"/g, '""') + '"';
            }
            return str;
        }).join(',')).join('\n');

        const utf8Bytes = new TextEncoder().encode(csvContent);
        const blob = new Blob([utf8Bytes], { type: 'text/csv;charset=utf-8' });

        const fileName = `${originalFileName}_l10n_report.csv`;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function downloadGlossary() {
        if (glossaryData.length === 0) {
            alert('没有术语可下载');
            return;
        }

        const headers = ['原文', '译文', '类型'];
        const rows = glossaryData.map(g => [g.source, g.target, g.type]);
        rows.unshift(headers);

        const csvContent = rows.map(row => row.map(cell => {
            if (cell === null || cell === undefined) return '';
            const str = String(cell);
            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                return '"' + str.replace(/"/g, '""') + '"';
            }
            return str;
        }).join(',')).join('\n');

        const utf8Bytes = new TextEncoder().encode(csvContent);
        const blob = new Blob([utf8Bytes], { type: 'text/csv;charset=utf-8' });

        const fileName = `${originalFileName}_glossary.csv`;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function saveL10nProgress(data) {
        localStorage.setItem(L10N_PROGRESS_KEY, JSON.stringify({
            ...data,
            timestamp: Date.now()
        }));
    }

    function loadL10nProgress() {
        const stored = localStorage.getItem(L10N_PROGRESS_KEY);
        if (!stored) return null;

        try {
            const progress = JSON.parse(stored);
            const age = Date.now() - progress.timestamp;
            if (age > 24 * 60 * 60 * 1000) {
                clearL10nProgress();
                return null;
            }
            return progress;
        } catch {
            return null;
        }
    }

    function clearL10nProgress() {
        localStorage.removeItem(L10N_PROGRESS_KEY);
    }

    function resetTool() {
        sheetData = null;
        originalFileName = '';
        sourceColumn = null;
        targetColumn = null;
        checkResults = [];
        glossaryData = [];

        fileInput.value = '';
        document.getElementById('l10nScene').value = 'all';
        document.getElementById('l10nStrictness').value = 'normal';

        fileInfo.style.display = 'none';
        columnSelectSection.style.display = 'none';
        progressSection.style.display = 'none';
        resultsSection.style.display = 'none';
        hideStatus();
        clearL10nProgress();
    }
}

function initGlossaryTool() {
    const extractArea = document.getElementById('glossaryExtractArea');
    const extractInput = document.getElementById('glossaryExtractInput');
    const uploadArea = document.getElementById('glossaryUploadArea');
    const uploadInput = document.getElementById('glossaryUploadInput');
    const infoSection = document.getElementById('glossaryInfo');
    const termsSection = document.getElementById('glossaryTerms');
    const progressSection = document.getElementById('glossaryProgressSection');
    const downloadBtn = document.getElementById('glossaryDownloadBtn');
    const resetBtn = document.getElementById('glossaryResetBtn');

    let terms = [];
    let sourceFileName = '';

    extractArea.addEventListener('click', () => extractInput.click());
    uploadArea.addEventListener('click', () => uploadInput.click());

    extractArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        extractArea.classList.add('dragover');
    });

    extractArea.addEventListener('dragleave', () => {
        extractArea.classList.remove('dragover');
    });

    extractArea.addEventListener('drop', (e) => {
        e.preventDefault();
        extractArea.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            extractTerms(files[0]);
        }
    });

    extractInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            extractTerms(e.target.files[0]);
        }
    });

    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });

    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
    });

    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            uploadGlossary(files[0]);
        }
    });

    uploadInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            uploadGlossary(e.target.files[0]);
        }
    });

    downloadBtn.addEventListener('click', downloadGlossary);
    resetBtn.addEventListener('click', resetTool);

    async function extractTerms(file) {
        sourceFileName = file.name;

        progressSection.style.display = 'block';
        hideStatus();

        setStatus('processing', '正在提取术语...', `处理文件: ${file.name}`);

        try {
            const extension = file.name.split('.').pop().toLowerCase();
            let text = '';

            if (extension === 'csv') {
                const { text: csvText } = await readCSVWithEncoding(file);
                text = csvText;
            } else {
                const arrayBuffer = await file.arrayBuffer();
                const result = XLSX.read(arrayBuffer, { type: 'array' });
                const sheetName = result.SheetNames[0];
                const sheet = result.Sheets[sheetName];
                text = XLSX.utils.sheet_to_csv(sheet);
            }

            terms = extractTermsFromText(text);

            displayTerms();
            setStatus('success', '术语提取完成！', `共提取 ${terms.length} 个术语`);

        } catch (error) {
            console.error('Extract error:', error);
            setStatus('error', '提取失败', error.message);
            progressSection.style.display = 'none';
        }
    }

    function extractTermsFromText(text) {
        const termMap = new Map();

        const lines = text.split(/\r?\n/);
        for (const line of lines) {
            const words = line.split(/[,;\t|]+/).map(w => w.trim());

            for (const word of words) {
                if (word.length < 2 || word.length > 50) continue;
                if (/^\d+$/.test(word)) continue;

                const cleanWord = word.replace(/^["'""']+|["'""']+$/g, '').trim();
                if (cleanWord.length < 2) continue;

                const normalized = cleanWord.toLowerCase();

                if (!termMap.has(normalized)) {
                    termMap.set(normalized, {
                        term: cleanWord,
                        count: 0,
                        type: guessTermType(cleanWord)
                    });
                }
                termMap.get(normalized).count++;
            }
        }

        return Array.from(termMap.values())
            .filter(t => t.count >= 1)
            .sort((a, b) => b.count - a.count);
    }

    function guessTermType(word) {
        if (/^[A-Z][a-z]+(?:[A-Z][a-z]+)*$/.test(word)) return '专有名词';
        if (/^[A-Z]+$/.test(word)) return '缩写词';
        if (/^[a-z]+$/.test(word)) return '普通名词';
        if (/^[\u4e00-\u9fa5]+$/.test(word)) return '中文术语';
        if (word.includes('_') || word.includes('-')) return '复合词';
        return '其他';
    }

    async function uploadGlossary(file) {
        sourceFileName = file.name;

        try {
            const extension = file.name.split('.').pop().toLowerCase();
            let data = [];

            if (extension === 'csv') {
                const { text } = await readCSVWithEncoding(file);
                const result = XLSX.read(text, { type: 'string' });
                const sheetName = result.SheetNames[0];
                data = XLSX.utils.sheet_to_json(result.Sheets[sheetName], { header: 1 });
            } else {
                const arrayBuffer = await file.arrayBuffer();
                const result = XLSX.read(arrayBuffer, { type: 'array' });
                const sheetName = result.SheetNames[0];
                data = XLSX.utils.sheet_to_json(result.Sheets[sheetName], { header: 1 });
            }

            if (data.length > 0) {
                const header = data[0];
                const termIndex = header.findIndex(h => String(h).toLowerCase().includes('术语') || String(h).toLowerCase().includes('term'));
                const typeIndex = header.findIndex(h => String(h).toLowerCase().includes('类型') || String(h).toLowerCase().includes('type'));

                terms = data.slice(1).map(row => ({
                    term: termIndex >= 0 ? row[termIndex] : row[0],
                    type: typeIndex >= 0 ? row[typeIndex] : guessTermType(row[termIndex >= 0 ? row[termIndex] : row[0]]),
                    count: 1,
                    translation: ''
                })).filter(t => t.term);
            }

            displayTerms();
            setStatus('success', '术语表加载完成！', `共加载 ${terms.length} 个术语`);

        } catch (error) {
            console.error('Upload error:', error);
            setStatus('error', '加载失败', error.message);
        }
    }

    function displayTerms() {
        progressSection.style.display = 'none';
        infoSection.style.display = 'block';
        termsSection.style.display = 'block';

        document.getElementById('glossaryTermCount').textContent = terms.length;
        document.getElementById('glossarySourceFile').textContent = sourceFileName;

        const tbody = document.getElementById('glossaryTermsBody');
        tbody.innerHTML = '';

        terms.forEach(term => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${escapeHtml(term.term)}</td>
                <td><span class="term-type-tag">${escapeHtml(term.type)}</span></td>
                <td>${term.count}</td>
                <td><input type="text" class="translation-input" placeholder="输入翻译" value="${escapeHtml(term.translation || '')}"></td>
            `;
            tbody.appendChild(tr);
        });
    }

    function downloadGlossary() {
        if (terms.length === 0) {
            alert('没有术语可下载');
            return;
        }

        const translationInputs = document.querySelectorAll('.translation-input');
        const termsWithTranslation = terms.map((term, index) => ({
            ...term,
            translation: translationInputs[index]?.value || ''
        }));

        const headers = ['术语', '类型', '出现次数', '翻译'];
        const rows = termsWithTranslation.map(t => [t.term, t.type, t.count, t.translation]);
        rows.unshift(headers);

        const csvContent = rows.map(row => row.map(cell => {
            if (cell === null || cell === undefined) return '';
            const str = String(cell);
            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                return '"' + str.replace(/"/g, '""') + '"';
            }
            return str;
        }).join(',')).join('\n');

        const utf8Bytes = new TextEncoder().encode(csvContent);
        const blob = new Blob([utf8Bytes], { type: 'text/csv;charset=utf-8' });

        const fileName = `${sourceFileName.replace(/\.(csv|xlsx|xls)$/i, '')}_glossary.csv`;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function resetTool() {
        terms = [];
        sourceFileName = '';

        extractInput.value = '';
        uploadInput.value = '';

        infoSection.style.display = 'none';
        termsSection.style.display = 'none';
        progressSection.style.display = 'none';
        hideStatus();
    }
}

function readCSVWithEncoding(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = function(e) {
            const bytes = new Uint8Array(e.target.result);

            if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
                const text = new TextDecoder('UTF-8').decode(bytes);
                resolve({ text, encoding: 'UTF-8 (BOM)' });
                return;
            }

            if (isValidUTF8(bytes)) {
                const text = new TextDecoder('UTF-8').decode(bytes);
                resolve({ text, encoding: 'UTF-8' });
                return;
            }

            try {
                const text = new TextDecoder('GBK').decode(bytes);
                resolve({ text, encoding: 'GBK' });
            } catch {
                const text = new TextDecoder('UTF-8').decode(bytes);
                resolve({ text, encoding: 'UTF-8' });
            }
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
}

function isValidUTF8(bytes) {
    let i = 0;
    while (i < bytes.length) {
        if (bytes[i] <= 0x7F) {
            i++;
        } else if ((bytes[i] & 0xE0) === 0xC0) {
            if (i + 1 >= bytes.length || (bytes[i + 1] & 0xC0) !== 0x80) return false;
            i += 2;
        } else if ((bytes[i] & 0xF0) === 0xE0) {
            if (i + 2 >= bytes.length || (bytes[i + 1] & 0xC0) !== 0x80 || (bytes[i + 2] & 0xC0) !== 0x80) return false;
            i += 3;
        } else if ((bytes[i] & 0xF8) === 0xF0) {
            if (i + 3 >= bytes.length || (bytes[i + 1] & 0xC0) !== 0x80 || (bytes[i + 2] & 0xC0) !== 0x80 || (bytes[i + 3] & 0xC0) !== 0x80) return false;
            i += 4;
        } else {
            return false;
        }
    }
    return true;
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function createDownloadLink(blob, fileName) {
    const url = URL.createObjectURL(blob);
    return url;
}