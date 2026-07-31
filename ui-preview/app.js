(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  const state = {
    view: "translate",
    running: false,
    progress: 72,
    toastTimer: null,
  };

  const viewMeta = {
    translate: {
      context: "文本翻译",
      eyebrow: "WORKFLOW / 01",
      title: "文本翻译",
      summary: "把原文变成可交付的本地化文本，过程保持可追踪。",
      runLabel: "开始翻译",
      detail: "3 个选择 · 69 条待处理 · 将生成新文件",
    },
    check: {
      context: "本地化检测",
      eyebrow: "WORKFLOW / 02",
      title: "本地化检测",
      summary: "先筛出真正影响交付的问题，再按优先级完成复核。",
      runLabel: "开始检测",
      detail: "3 类问题 · 111 条待处理 · 将生成检测报告",
    },
  };

  function showToast(message) {
    const toast = $("#toast");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("show");
    window.clearTimeout(state.toastTimer);
    state.toastTimer = window.setTimeout(() => toast.classList.remove("show"), 2200);
  }

  function setView(view) {
    if (!viewMeta[view]) return;
    state.view = view;
    const meta = viewMeta[view];

    $$(".rail-item[data-view]").forEach((button) => {
      const active = button.dataset.view === view;
      button.classList.toggle("active", active);
      button.setAttribute("aria-current", active ? "page" : "false");
    });
    $$(".mode-tab[data-mode]").forEach((button) => {
      const active = button.dataset.mode === view;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    });

    $("#translateView").hidden = view !== "translate";
    $("#checkView").hidden = view !== "check";
    $("#contextLabel").textContent = meta.context;
    $("#pageEyebrow").textContent = meta.eyebrow;
    $("#pageTitle").textContent = meta.title;
    $("#pageSummary").textContent = meta.summary;
    $("#runTaskLabel").textContent = meta.runLabel;
    $("#dockDetail").textContent = meta.detail;
    $("#dockStatusLabel").textContent = state.running ? "任务运行中" : "配置已就绪";
    if (!state.running) $("#runTaskBtn").classList.remove("is-running");
  }

  function openDrawer() {
    const drawer = $("#apiDrawer");
    const backdrop = $("#drawerBackdrop");
    if (!drawer || !backdrop) return;
    backdrop.hidden = false;
    drawer.setAttribute("aria-hidden", "false");
    requestAnimationFrame(() => drawer.classList.add("open"));
    document.body.classList.add("drawer-visible");
  }

  function closeDrawer() {
    const drawer = $("#apiDrawer");
    const backdrop = $("#drawerBackdrop");
    if (!drawer || !backdrop) return;
    drawer.classList.remove("open");
    drawer.setAttribute("aria-hidden", "true");
    window.setTimeout(() => {
      if (!drawer.classList.contains("open")) backdrop.hidden = true;
    }, 260);
    document.body.classList.remove("drawer-visible");
  }

  function openCommand() {
    const dialog = $("#commandDialog");
    const backdrop = $("#commandBackdrop");
    if (!dialog || !backdrop) return;
    backdrop.hidden = false;
    dialog.setAttribute("aria-hidden", "false");
    requestAnimationFrame(() => dialog.classList.add("open"));
    const input = $("#commandInput");
    window.setTimeout(() => input?.focus(), 80);
  }

  function closeCommand() {
    const dialog = $("#commandDialog");
    const backdrop = $("#commandBackdrop");
    if (!dialog || !backdrop) return;
    dialog.classList.remove("open");
    dialog.setAttribute("aria-hidden", "true");
    window.setTimeout(() => {
      if (!dialog.classList.contains("open")) backdrop.hidden = true;
    }, 180);
  }

  function toggleCollapse(button) {
    const target = document.getElementById(button.dataset.collapse);
    if (!target) return;
    const collapsed = target.classList.toggle("is-collapsed");
    button.setAttribute("aria-expanded", String(!collapsed));
    button.textContent = collapsed ? "展开⌄" : "收起⌃";
  }

  function toggleAdvanced(button) {
    const target = document.getElementById(button.dataset.expand);
    if (!target) return;
    const expanded = button.getAttribute("aria-expanded") !== "true";
    button.setAttribute("aria-expanded", String(expanded));
    target.hidden = !expanded;
    const mark = button.querySelector(".chevron");
    if (mark) mark.textContent = expanded ? "－" : "＋";
  }

  function updateIssueCount() {
    const selected = $$(".rule-chip.active");
    const values = selected.map((chip) => Number(chip.querySelector("span")?.textContent || 0));
    const count = values.reduce((sum, value) => sum + value, 0);
    $("#issueFilterCount").textContent = String(count || 0);
  }

  function simulateRun() {
    const button = $("#runTaskBtn");
    if (!button) return;
    if (state.running) {
      state.running = false;
      state.progress = 0;
      button.classList.remove("is-running");
      $("#runTaskLabel").textContent = viewMeta[state.view].runLabel;
      $("#dockStatusLabel").textContent = "任务已暂停";
      showToast("任务已暂停，可从任务记录继续");
      return;
    }

    state.running = true;
    state.progress = 8;
    button.classList.add("is-running");
    $("#runTaskLabel").textContent = "运行中…";
    $("#dockStatusLabel").textContent = "任务运行中";
    showToast(state.view === "translate" ? "翻译任务已开始，结果会持续写入本地记录" : "检测任务已开始，正在建立问题队列");

    const interval = window.setInterval(() => {
      if (!state.running) {
        window.clearInterval(interval);
        return;
      }
      state.progress = Math.min(100, state.progress + Math.round(Math.random() * 17 + 7));
      const track = $(".task-progress .progress-track i");
      const percent = $(".task-progress .progress-meta b");
      if (track) track.style.width = `${state.progress}%`;
      if (percent) percent.textContent = `${state.progress}%`;
      if (state.progress >= 100) {
        window.clearInterval(interval);
        state.running = false;
        button.classList.remove("is-running");
        $("#runTaskLabel").textContent = "查看报告";
        $("#dockStatusLabel").textContent = "任务已完成";
        showToast(state.view === "translate" ? "翻译完成：69 条已写入新文件" : "检测完成：111 条问题已加入复核队列");
      }
    }, 700);
  }

  function bindEvents() {
    $$(".rail-item[data-view], .mode-tab[data-mode]").forEach((button) => {
      button.addEventListener("click", () => setView(button.dataset.view || button.dataset.mode));
    });

    $$("#openApiBtn, #openApiTopBtn, #routeSettingsBtn").forEach((button) => {
      button.addEventListener("click", openDrawer);
    });
    $("#closeApiBtn")?.addEventListener("click", closeDrawer);
    $("#drawerBackdrop")?.addEventListener("click", closeDrawer);

    $("#openCommandBtn")?.addEventListener("click", openCommand);
    $("#commandBackdrop")?.addEventListener("click", closeCommand);
    $("#runTaskBtn")?.addEventListener("click", simulateRun);

    $$("[data-collapse]").forEach((button) => button.addEventListener("click", () => toggleCollapse(button)));
    $$("[data-expand]").forEach((button) => button.addEventListener("click", () => toggleAdvanced(button)));

    $$("[data-chip-toggle]").forEach((chip) => {
      chip.addEventListener("click", () => {
        if (chip.classList.contains("reference")) {
          chip.classList.remove("reference");
          chip.classList.add("selected");
        } else if (chip.classList.contains("selected")) {
          chip.classList.remove("selected");
        } else {
          chip.classList.add("selected");
        }
        showToast("列映射已更新");
      });
    });

    $$("[data-export-choice]").forEach((choice) => {
      choice.addEventListener("click", () => {
        $$("[data-export-choice]").forEach((item) => item.classList.remove("selected"));
        choice.classList.add("selected");
        showToast(`导出方式：${choice.querySelector("b")?.textContent || "已更新"}`);
      });
    });

    $$("[data-rule-filter]").forEach((chip) => {
      chip.addEventListener("click", () => {
        if (chip.dataset.ruleFilter === "all") {
          const shouldSelect = !chip.classList.contains("active");
          $$("[data-rule-filter]").forEach((item) => item.classList.toggle("active", shouldSelect));
        } else {
          chip.classList.toggle("active");
          const allChip = $('[data-rule-filter="all"]');
          const nonAll = $$("[data-rule-filter]:not([data-rule-filter='all'])");
          allChip?.classList.toggle("active", nonAll.every((item) => item.classList.contains("active")));
        }
        updateIssueCount();
      });
    });

    $$("[data-queue]").forEach((segment) => {
      segment.addEventListener("click", () => {
        $$("[data-queue]").forEach((item) => item.classList.remove("active"));
        segment.classList.add("active");
        const filter = segment.dataset.queue;
        $$(".issue-item").forEach((issue) => {
          const show = filter === "all" || (filter === "high" && issue.dataset.issue === "missing") || (filter === "mine" && issue.classList.contains("selected"));
          issue.style.display = show ? "" : "none";
        });
      });
    });

    $$(".issue-check").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        const item = button.closest(".issue-item");
        item?.classList.toggle("resolved");
        if (item?.classList.contains("resolved")) {
          button.textContent = "✓";
          showToast("问题已标记为已处理");
        } else {
          showToast("问题已恢复到待处理");
        }
      });
    });

    $$(".issue-item").forEach((item) => {
      item.addEventListener("click", () => {
        $$(".issue-item").forEach((entry) => entry.classList.remove("selected"));
        item.classList.add("selected");
      });
    });

    $$(".drawer-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        const target = tab.dataset.drawerTab;
        $$(".drawer-tab").forEach((item) => item.classList.toggle("active", item === tab));
        $$(".drawer-panel").forEach((panel) => {
          const active = panel.id === `drawer${target[0].toUpperCase()}${target.slice(1)}`;
          panel.hidden = !active;
          panel.classList.toggle("active", active);
        });
      });
    });

    $$(".profile-card").forEach((profile) => {
      profile.addEventListener("click", () => {
        $$(".profile-card").forEach((item) => item.classList.remove("active"));
        profile.classList.add("active");
        showToast(`已切换到：${profile.querySelector("b")?.textContent || "通道"}`);
      });
    });

    $$("[data-command]").forEach((command) => {
      command.addEventListener("click", () => {
        const action = command.dataset.command;
        closeCommand();
        if (action === "api") openDrawer();
        else setView(action);
      });
    });

    $("#commandInput")?.addEventListener("input", (event) => {
      const query = event.target.value.trim().toLowerCase();
      $$(".command-body > button").forEach((item) => {
        item.hidden = query && !item.textContent.toLowerCase().includes(query);
      });
    });

    $$("[data-toast]").forEach((element) => {
      element.addEventListener("click", () => {
        const message = element.dataset.toast;
        if (message) showToast(`${message}（预览交互）`);
      });
    });

    $("#newTaskBtn")?.addEventListener("click", () => showToast("已创建空白任务，可从数据范围开始"));
    $("#addProfileBtn")?.addEventListener("click", () => showToast("新通道表单已准备（预览）"));

    document.addEventListener("keydown", (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        openCommand();
      }
      if (event.key === "Escape") {
        closeDrawer();
        closeCommand();
      }
    });
  }

  setView("translate");
  bindEvents();
})();
