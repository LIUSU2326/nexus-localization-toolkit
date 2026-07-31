@echo off
setlocal

cd /d "%~dp0"

if exist "%USERPROFILE%\.cargo\bin\cargo.exe" (
  set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"
)

where npm >nul 2>nul
if errorlevel 1 (
  if exist "%~dp0start-desktop-test.bat" (
    echo System npm was not found. Opening the local desktop test window instead...
    call "%~dp0start-desktop-test.bat"
    if errorlevel 1 exit /b 1
    exit /b 0
  )
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

echo Starting TransMate for Windows...
call npm run desktop
if errorlevel 1 goto failed

echo.
echo TransMate has stopped. You can close this window.
pause
exit /b 0

:failed
echo.
echo [ERROR] TransMate failed to start.
pause
exit /b 1
