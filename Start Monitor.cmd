@echo off
setlocal
cd /d "%~dp0local-app"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 24.5 or newer, then run this launcher again.
  pause
  exit /b 1
)
powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalPort 4287 -State Listen -ErrorAction SilentlyContinue) { exit 1 }"
if errorlevel 1 (
  echo Another monitor is already running on port 4287. Close that window or quit it from the tray icon, then run this launcher again.
  pause
  exit /b 1
)
if not exist "node_modules\@mega-yfue\eufy-sdk\package.json" (
  echo Installing dependencies...
  call npm.cmd install
  if errorlevel 1 goto failed
)
call npm.cmd run build
if errorlevel 1 goto failed
echo Open http://127.0.0.1:4287 in Edge or Chrome.
echo Keep this window open while using the monitor. Press Ctrl+C to stop.
call npm.cmd start
if errorlevel 1 goto failed
exit /b 0
:failed
echo The monitor could not start. Review the message above.
pause
exit /b 1
