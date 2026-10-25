@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 24 or newer, then run this launcher again.
  pause
  exit /b 1
)
if not exist "analysis\ui\atlas\data\bundles.json" (
  echo Building the UI atlas from APKDownload. This takes a few minutes...
  node analysis\ui\tools\build-all.mjs
  if errorlevel 1 goto failed
)
echo Open http://127.0.0.1:4291/ui/atlas/ in Edge or Chrome.
echo Keep this window open while browsing. Press Ctrl+C to stop.
start "" "http://127.0.0.1:4291/ui/atlas/"
node analysis\ui\atlas\serve.mjs 4291
if errorlevel 1 goto failed
exit /b 0
:failed
echo The UI atlas could not start. Review the message above.
pause
exit /b 1
