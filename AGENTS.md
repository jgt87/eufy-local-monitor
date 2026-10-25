# EufySecurity: agent notes

- `APKDownload/` holds the original eufy 6.1.10 (30612) APK set. Treat it as read-only source data; tools only read it.
- `analysis/` holds static findings. `FINDINGS.md` and `streaming/FINDINGS.md` cover protocol and streaming; `ui/README.md` covers the recovered mobile interface (UI atlas).
- `local-app/` is the Windows camera monitor (React + Node, `Start Monitor.cmd`, port 4287). The front end is split into `src/components`, `src/hooks` and `src/styles` (tokens from the eufy OneAnker system, monochrome; see `DESIGN.md`). The server reads `dist` fresh, but route and content-type changes in `server/` need a restart. Run `test/browser.mjs` against a fresh instance (`PORT=4288`, `MONITOR_URL`, `PLAYWRIGHT_CHANNEL=msedge`). Avoid the class name `.main` on components, because the mobile layout reorders `.main`.

## UI atlas

- Launch: `Start UI Atlas.cmd`, or `node analysis/ui/atlas/serve.mjs 4291` → <http://127.0.0.1:4291/ui/atlas/>. The server reads files fresh, so a page reload picks up changes to the JS, CSS and data.
- Rebuild data after changing any tool in `analysis/ui/tools`: `node analysis/ui/tools/build-all.mjs`, which takes under a minute. It uses Windows' `System32\tar.exe` to read zip files; GNU tar from Git Bash cannot.
- After renderer changes, run `analysis/ui/atlas/test/smoke.mjs`. It renders every screen in light and dark mode and must print PASS. It needs `PLAYWRIGHT_MODULE_URL` pointing at `local-app/node_modules/playwright/index.mjs` and uses the installed Edge (`msedge` channel), because Playwright's own browsers are not downloaded.
- In Git Bash, prefix test commands with `MSYS_NO_PATHCONV=1` so `#/` routes are not rewritten as paths.
- The atlas chrome is monochrome. App colours appear only inside previews and swatches.
