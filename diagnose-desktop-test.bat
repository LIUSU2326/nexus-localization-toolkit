@echo off
setlocal

cd /d "%~dp0"
for %%I in ("%~dp0.") do set "NEXUS_PROJECT_ROOT=%%~fI\"
set "NEXUS_PYTHON=C:\Users\yuanp\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
set "NEXUS_PREVIEW=%NEXUS_PROJECT_ROOT%desktop-preview.py"
set "NEXUS_PREVIEW_DEPS=%NEXUS_PROJECT_ROOT%.desktop-preview-deps"
set "PYTHONPATH=%NEXUS_PREVIEW_DEPS%;%PYTHONPATH%"

if not exist "%NEXUS_PYTHON%" (
  echo [ERROR] The bundled desktop runtime was not found.
  pause
  exit /b 1
)

"%NEXUS_PYTHON%" "%NEXUS_PREVIEW%" --check
if errorlevel 1 (
  echo.
  echo [ERROR] Desktop test launcher check failed. Open run-logs\desktop-preview.log for details.
) else (
  echo.
  echo [OK] Desktop test launcher is ready. You can close this window and run start-desktop-test.bat.
)
pause
