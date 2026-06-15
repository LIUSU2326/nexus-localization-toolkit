@echo off
setlocal

cd /d "%~dp0"

if exist "%USERPROFILE%\.cargo\bin\cargo.exe" (
  set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm was not found. Please install Node.js first.
  echo Download: https://nodejs.org/
  pause
  exit /b 1
)

where cargo >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Cargo was not found. Please install Rust first.
  echo Download: https://www.rust-lang.org/tools/install
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Installing project dependencies...
  if exist "package-lock.json" (
    call npm ci
  ) else (
    call npm install
  )
  if errorlevel 1 goto failed
)

echo Building Windows installer...
call npm run desktop:build:windows
if errorlevel 1 goto failed

echo.
echo Build finished.
echo Installer folder:
echo %CD%\src-tauri\target\release\bundle\nsis
if exist "src-tauri\target\release\bundle\nsis" (
  start "" "src-tauri\target\release\bundle\nsis"
)
pause
exit /b 0

:failed
echo.
echo [ERROR] Windows installer build failed.
pause
exit /b 1
