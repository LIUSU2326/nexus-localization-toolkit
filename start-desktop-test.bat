@echo off
setlocal

cd /d "%~dp0"

for %%I in ("%~dp0.") do set "NEXUS_PROJECT_ROOT=%%~fI\"
set "NEXUS_PYTHON=C:\Users\yuanp\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
set "NEXUS_PYTHONW=C:\Users\yuanp\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\pythonw.exe"
set "NEXUS_PREVIEW=%NEXUS_PROJECT_ROOT%desktop-preview.py"
set "NEXUS_PREVIEW_DEPS=%NEXUS_PROJECT_ROOT%.desktop-preview-deps"
set "PYTHONPATH=%NEXUS_PREVIEW_DEPS%;%PYTHONPATH%"

if not exist "%NEXUS_PYTHON%" (
  echo [ERROR] The bundled desktop runtime was not found.
  echo See run-logs\desktop-preview.log for details.
  pause
  exit /b 1
)

if not exist "%NEXUS_PREVIEW%" (
  echo [ERROR] desktop-preview.py was not found.
  echo Expected: "%NEXUS_PREVIEW%"
  pause
  exit /b 1
)

if not exist "%NEXUS_PREVIEW_DEPS%\webview\__init__.py" (
  echo [ERROR] The local desktop window dependency was not found.
  echo See run-logs\desktop-preview.log for details.
  pause
  exit /b 1
)

if /I "%NEXUS_DESKTOP_TEST_CHECK_ONLY%"=="1" (
  "%NEXUS_PYTHON%" "%NEXUS_PREVIEW%" --check
  exit /b %errorlevel%
)

if exist "%NEXUS_PYTHONW%" (
  start "NEXUS Desktop Test" /b "%NEXUS_PYTHONW%" "%NEXUS_PREVIEW%"
) else (
  start "NEXUS Desktop Test" /b "%NEXUS_PYTHON%" "%NEXUS_PREVIEW%"
)

exit /b 0
