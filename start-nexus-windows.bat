@echo off
setlocal

cd /d "%~dp0"

if exist "%USERPROFILE%\.cargo\bin\cargo.exe" (
  set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"
)

set "VSWHERE=%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe"
set "VS_DEV_CMD="
if exist "%VSWHERE%" (
  for /f "usebackq delims=" %%i in (`"%VSWHERE%" -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath`) do (
    set "VS_DEV_CMD=%%i\Common7\Tools\VsDevCmd.bat"
  )
)

if not defined VS_DEV_CMD (
  if exist "%ProgramFiles(x86)%\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat" (
    set "VS_DEV_CMD=%ProgramFiles(x86)%\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat"
  )
)

if defined VS_DEV_CMD (
  echo Loading Visual Studio C++ build tools...
  call "%VS_DEV_CMD%" -arch=x64 -host_arch=x64 >nul
) else (
  echo [WARN] Visual Studio C++ build tools were not found.
  echo [WARN] If startup fails with "link.exe not found", install Visual Studio Build Tools with the C++ workload.
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

echo Starting NEXUS Localization Toolkit for Windows...
call npm run desktop
if errorlevel 1 goto failed

echo.
echo NEXUS has stopped. You can close this window.
pause
exit /b 0

:failed
echo.
echo [ERROR] NEXUS failed to start.
pause
exit /b 1
