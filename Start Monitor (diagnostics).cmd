@echo off
setlocal
rem Same as Start Monitor.cmd, with diagnostics on and the network watcher in a second window.
rem Logs go to local-app\.runtime (serials, MAC addresses, emails and keys are redacted).
cd /d "%~dp0local-app"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 24.5 or newer, then run this launcher again.
  pause
  exit /b 1
)
if not exist "node_modules\@mega-yfue\eufy-sdk\package.json" (
  call npm.cmd install
  if errorlevel 1 goto failed
)
call npm.cmd run build
if errorlevel 1 goto failed
set EUFY_DIAG=1
start "Monitor network watch" powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Sleep 3; & '%~dp0local-app\tools\netwatch.ps1' -Port 4287 -Seconds 1800"
echo Open http://127.0.0.1:4287 and open a camera. Keep this window open. Press Ctrl+C to stop.
call npm.cmd start
if errorlevel 1 goto failed
exit /b 0
:failed
echo The monitor could not start. Review the message above.
pause
exit /b 1
