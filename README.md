# TransMate · AI 游戏本地化助手

![TransMate](assets/transmate-logo.svg)

TransMate 是一款专为游戏本地化工作流设计的 AI 桌面助手，支持文件拆分、文本翻译、格式转换、本地化检测和术语表管理。

## 品牌图标

`assets/transmate-mark.svg` 是唯一需要人工维护的品牌图形源文件。网页标志、横版 Logo、PNG、ICO 和 ICNS 均由它生成，避免多套轮廓逐渐产生偏差。

```bash
npm run icons
```

图标生成使用项目自带的 Tauri CLI，不调用图片生成模型。

## ✨ 功能特性

### 📄 文件拆分
- 支持 CSV/XLSX 文件上传
- 自动识别编码（GBK/UTF-8）
- 自定义拆分行数
- 批量打包下载（ZIP）

### 🌍 文本翻译
- AI 驱动的游戏文本翻译
- 支持多种目标语言
- 项目管理与翻译标准配置
- 实时翻译进度显示
- 多通道按逻辑单元格分担任务，每个单元格只保留一份当前最佳译文；执行通道仅写入审计报告，不再生成重复输出列
- 一键复用旧报告：只处理高置信阻断项，建议复核不会重复调用 AI
- 每个单元格使用有界修复账本，候选未改善时自动保留当前最佳译文
- 翻译结束后自动保存干净的 `translated` / `_unverified` 译文文件和独立 `translation_report` 报告，译文文件不再嵌入报告工作表

### 🔄 格式转换
- 编码格式转换（UTF-8, GBK, GB2312, UTF-16）
- 分隔符转换（逗号、分号、制表符）
- 换行符转换

### ✅ 本地化检测
- 双语对比检测
- 语法、拼写、单复数、时态检测
- 术语一致性检查
- 生成检测报告和术语表

### 📚 术语表
- 自动提取术语
- 术语管理
- 支持上传已有术语表

## 🎨 界面风格

采用 **Retro-Futurism（复古未来主义）** 设计风格：
- 玻璃态毛玻璃效果
- CRT 扫描线特效
- 霓虹发光动画
- 紫色渐变配色

## 🚀 快速开始

### 1. 直接使用网页版本

本项目无需后端，直接打开 `index.html` 即可使用。

### 2. 使用 Tauri 桌面版本

本项目已加入 Tauri 桌面应用骨架，可以在保留现有网页界面的基础上打包成桌面软件。

#### 环境要求

- Node.js
- Rust / Cargo
- Tauri 所需系统依赖

#### 安装依赖

```bash
npm install
```

#### 开发模式启动桌面应用

```bash
npm run desktop
```

macOS 也可以直接双击项目根目录下的 `start-nexus.command` 一键启动桌面应用。

#### 构建安装包

```bash
npm run desktop:build
```

构建输出位于 `src-tauri/target/release/bundle/`。

> 注意：macOS 通常在 macOS 上构建 `.app/.dmg`，Windows 通常在 Windows 上构建 `.exe/.msi`。

#### Windows 桌面端

如果把项目放到 Windows 电脑上：

- 双击 `start-nexus-windows.bat`：开发/调试模式启动桌面应用。
- 双击 `build-windows-installer.bat`：生成 Windows `.exe` 安装包。
- 安装包输出目录：`src-tauri\target\release\bundle\nsis\`。

如果没有 Windows 电脑，也可以把代码推送到 GitHub 的 `master` 分支，然后在 GitHub Actions 里手动运行 `Build Windows Desktop App`，下载生成的 `TransMate-Windows-Installer`，里面就是 Windows `.exe` 安装包。

### 3. 配置 API Key

1. 在顶部 API 配置面板选择平台
2. 输入您的 DeepSeek API Key
3. 点击保存

### 4. 运行

直接在浏览器中打开 `index.html` 即可。

## 🛠️ 技术栈

- **前端**: HTML5, CSS3, JavaScript (ES6+)
- **图标**: SVG
- **库**: SheetJS (XLSX), JSZip
- **字体**: Poppins, Open Sans

## 📝 使用说明

### 文件拆分
1. 点击上传区域选择 CSV/XLSX 文件
2. 设置每个文件的行数
3. 点击"开始拆分"
4. 下载拆分后的文件或打包下载

### 文本翻译
1. 选择游戏项目（可选）
2. 上传文件
3. 选择要翻译的列
4. 设置源语言和目标语言
5. 选择 AI 模型
6. 点击"开始翻译"

### 本地化检测
1. 上传文件
2. 选择原文列和译文列
3. 设置场景类型和检测严格度
4. 点击"开始检测"
5. 查看结果并下载报告

## 🔧 API 配置

### DeepSeek 官方
- **Base URL**: `https://api.deepseek.com`
- **模型**: `deepseek-v4-pro`, `deepseek-v4-flash`

### 自定义平台
支持任何 OpenAI 兼容的 API。

## 📄 支持的文件格式

- `.csv` - CSV 文件
- `.xlsx` - Excel 2007+ 文件
- `.xls` - 旧版 Excel 文件

## 📖 License

MIT License

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

涉及文本翻译、检测、自动修复、交付门禁或任务流程的开发，必须先阅读 [产品原则](PRODUCT.md) 与 [开发守则](DEVELOPMENT.md)。守则要求默认流程保持一键化，并禁止通过逐词、逐语言补丁或无限重译来追求问题数量清零。

---

**Made with ❤️ for Game Localization**
