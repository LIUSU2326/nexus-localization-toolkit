# NEXUS 当前稳定版快照

当前稳定版已保存在：

```text
E:\codexapp\snapshots\current-ui-20260515-002446
```

包含文件：

```text
index.html
styles.css
script.js
dev-server.js
```

如果后续 UI/UX 升级不满意，可以把快照里的文件复制回项目根目录：

```text
E:\codexapp\index.html
E:\codexapp\styles.css
E:\codexapp\script.js
E:\codexapp\scripts\dev-server.js
```

注意：快照里的 `dev-server.js` 需要复制到 `E:\codexapp\scripts\dev-server.js`。

新版 UX 方案目前是独立预览稿，不会覆盖当前工具：

```text
E:\codexapp\design-preview-ux-upgrade.html
```

Git 分支说明：

当前环境的 `.git` 目录对 Codex 当前用户有写入限制，所以 Codex 可以读取 Git 状态，但不能直接执行 `git add`、`git commit`、`git branch`。如果要用分支方式上传 GitHub，需要在你本机 PowerShell 执行 Git 命令，或者调整 `.git` 目录权限后再让 Codex 操作。
