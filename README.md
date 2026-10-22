# TransMate · AI Game Localization Assistant

**English** | [简体中文](README.zh-CN.md)

![TransMate](assets/transmate-logo.svg)

TransMate is an AI desktop assistant designed for game localization workflows. It supports file splitting, text translation, format conversion, localization QA, and glossary management.

## Brand Icons

`assets/transmate-mark.svg` is the single brand artwork source maintained by hand. The web mark, horizontal logo, PNG, ICO, and ICNS assets are generated from it to keep their shapes consistent.

```bash
npm run icons
```

Icon generation uses the project's bundled Tauri CLI and does not call an image generation model.

## ✨ Features

### 📄 File Splitting

- Upload CSV/XLSX files
- Automatically detect GBK/UTF-8 encoding
- Set the number of rows per output file
- Download files together as a ZIP archive

### 🌍 Text Translation

- AI-powered translation of game text
- Multiple target languages
- Project management and translation standards configuration
- Live translation progress
- Distribute tasks across API channels by logical cell, keeping one current best translation per cell. Execution channels are recorded only in the audit report and do not create duplicate output columns.
- Reuse previous reports in one click: process only high-confidence blockers. Review-only findings do not trigger additional AI calls.
- Track a limited number of repair attempts per cell and retain the current best translation when a candidate does not improve it.
- Automatically save a clean `translated` or `_unverified` translation file and a separate `translation_report` when translation finishes. Translation files do not contain embedded report worksheets.

### 🔄 Format Conversion

- Convert encodings: UTF-8, GBK, GB2312, and UTF-16
- Convert delimiters: commas, semicolons, and tabs
- Convert line endings

### ✅ Localization QA

- Compare source and translated text
- Check grammar, spelling, singular/plural forms, and tense
- Check terminology consistency
- Generate QA reports and glossaries

### 📚 Glossaries

- Automatically extract terms
- Manage terminology
- Upload existing glossaries

## 🎨 Interface Style

The interface uses a **Retro-Futurism** design style:

- Frosted-glass effects
- CRT scanline effects
- Animated neon glows
- Purple gradients

## 🚀 Quick Start

### 1. Run the Web Version

With Node.js installed, run the following commands from the project root:

```bash
npm install
npm run dev:web
```

Open `http://127.0.0.1:1420` in your browser. You do not need to set up your own backend.

You can also open `index.html` directly. In browser mode, AI API requests depend on the provider's cross-origin policy (CORS). The desktop app accesses the API through native requests.

### 2. Run the Tauri Desktop Version

The project includes a Tauri desktop application setup, allowing the existing web interface to be packaged as desktop software.

#### Requirements

- Node.js
- Rust / Cargo
- System dependencies required by Tauri

#### Install Dependencies

```bash
npm install
```

#### Start the Desktop App in Development Mode

```bash
npm run desktop
```

On macOS, you can also double-click `start-nexus.command` in the project root to launch the desktop app.

#### Build Installers

```bash
npm run desktop:build
```

Build output is saved to `src-tauri/target/release/bundle/`.

> macOS `.app`/`.dmg` packages are normally built on macOS, and Windows `.exe`/`.msi` packages are normally built on Windows.

#### Windows Desktop App

After copying the project to a Windows computer:

- Double-click `start-nexus-windows.bat` to launch the desktop app in development/debug mode.
- Double-click `build-windows-installer.bat` to generate a Windows `.exe` installer.
- Find the installer in `src-tauri\target\release\bundle\nsis\`.

If you do not have a Windows computer, select **Build Windows Installer** in GitHub Actions and click **Run workflow**. When the build finishes, download the `TransMate-Windows-Installer` artifact, which contains the Windows `.exe` installer. Pushing to `master` also triggers this workflow automatically.

### 3. Configure an API Key

1. Select a provider in the API configuration panel at the top.
2. Enter your DeepSeek API key.
3. Click Save.

## 🛠️ Technology Stack

- **Frontend**: HTML5, CSS3, JavaScript (ES6+)
- **Icons**: SVG
- **Libraries**: SheetJS (XLSX), JSZip

## 📝 Usage

### File Splitting

1. Click the upload area to select a CSV/XLSX file.
2. Set the number of rows per output file.
3. Click “开始拆分” (Start Splitting).
4. Download the split files individually or as a ZIP archive.

### Text Translation

1. Select a game project (optional).
2. Upload a file.
3. Select the column to translate.
4. Set the source and target languages.
5. Select an AI model.
6. Click “开始翻译” (Start Translation).

### Localization QA

1. Upload a file.
2. Select the source and translation columns.
3. Set the scenario type and QA strictness.
4. Click “开始检测” (Start QA).
5. Review the results and download the report.

## 🔧 API Configuration

### DeepSeek

- **Base URL**: `https://api.deepseek.com`
- **Built-in model presets**: `deepseek-v4-pro`, `deepseek-v4-flash`

These model IDs are presets included in the app. Actual availability depends on your provider and account.

### Custom Providers

The app supports OpenAI-compatible APIs.

## 📄 Supported File Formats

- `.csv` — CSV files
- `.xlsx` — Excel 2007+ files
- `.xls` — Legacy Excel files

## 📖 License

[MIT License](LICENSE) © 2026 LIUSU2326.

## 🤝 Contributing

Issues and pull requests are welcome!

Before working on text translation, QA, automatic repair, delivery gates, or task workflows, read the [product principles](PRODUCT.md) and [development guidelines](DEVELOPMENT.md). The guidelines require the default workflow to remain one-click and prohibit per-word or per-language patches and unlimited retranslations aimed at driving the issue count to zero.

---

**Made with ❤️ for Game Localization**
