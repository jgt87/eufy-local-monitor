@echo off
setlocal
rem Runs the monitor without a console window, with a tray icon (Open, Start with Windows, Restart, Quit).
cd /d "%~dp0local-app"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 24.5 or newer, then run this launcher again.
  pause
  exit /b 1
)
if not exist "node_modules\@mega-yfue\eufy-sdk\package.json" (
  echo Installing dependencies...
  call npm.cmd install
  if errorlevel 1 (
    echo The monitor could not start. Review the message above.
    pause
    exit /b 1
  )
)
start "" powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "%~dp0local-app\tools\tray.ps1"
