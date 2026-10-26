# EufySecurity: agent notes

Static research into the eufy Security Android app 6.1.10 (build 30612), plus `local-app`, a local Windows monitor for eufy cameras. Public repository: `jgt87/eufy-local-monitor` (MIT).

## Hard rules

- **Vendor material never goes into git.** That covers `APKDownload/` (the original APK set, read-only source data), anything extracted or decompiled from it, `.so`/`.hbc` files, fonts, drawables, and the derived `analysis/ui/{rn,modules,trees,fonts,versions,atlas/data}` and `analysis/asset-evidence/`. The root `.gitignore` enforces this. Run `git add -A --dry-run` before every push to check.
- The owner's doorbell is a **T8214**. Never write its full serial or MAC address into files, commits or logs; use the model prefix only.
- **No personal data in git**: no IP addresses (use 192.0.2.x), real emails (use example.com/.invalid), home-folder paths, MACs, serials, tokens or screenshots of real accounts. `node tools/check-private.mjs` checks tracked files and `--history` every commit; both run in CI. Owner-specific strings (full serial, MAC, username, public IP) go in the git-ignored `.private-terms.txt`, which the check also reads.
- Nothing in this repo (code, docs, commits, file names) names an AI assistant, and commits carry no AI attribution. Commits use the repo-local noreply email that is already configured.
- A release means: add the change to `CHANGELOG.md` under Unreleased, bump `local-app/package.json`, tag `vX.Y.Z`, and run `gh release create` with a `git archive` source zip.

## Commands

Windows, Node 24.5+. Tests use the Playwright copy in `local-app/node_modules` with installed Edge (`msedge` channel), because Playwright's own browsers are not downloaded. In Git Bash, prefix commands that take `#/…` routes with `MSYS_NO_PATHCONV=1`.

| Task | Command (from the repo root unless noted) |
| --- | --- |
| Monitor: build / start | `cd local-app && npm.cmd run build && npm.cmd start` (port 4287; `Start Monitor.cmd` does both) |
| Monitor: unit tests | `cd local-app && npm.cmd test` (node:test over `server/*.test.mjs`) |
| Monitor: one test file | `cd local-app && node --test server/diagnostics.test.mjs` (also `events.test.mjs`, `features.test.mjs`, `app.test.mjs`) |
| Monitor: browser test | Start a **fresh** instance (`PORT=4288 node server/index.mjs`), then `PLAYWRIGHT_CHANNEL=msedge MONITOR_URL=http://127.0.0.1:4288 node test/browser.mjs`. It looks for the startup line in the activity list, so a long-running instance fails it. |
| Monitor in the background | `Start Monitor (background).cmd` → `local-app/tools/tray.ps1` (Windows PowerShell 5.1, WinForms tray; test on another port with `-NoBrowser -Port 4289`) |
| Monitor with diagnostics | `Start Monitor (diagnostics).cmd` (`EUFY_DIAG=1`, `EUFY_LIVE_ECC=1` plus `local-app/tools/netwatch.ps1`); logs go to `local-app/.runtime/` |
| UI atlas: rebuild all data from the APK | `node analysis/ui/tools/build-all.mjs` (under a minute) |
| UI atlas: build another APK set | `node analysis/ui/tools/build-all.mjs --apk <dir> [--version <label>]` (work files in `analysis/ui/versions/<id>/`, manifest in `atlas/data/versions/`; never writes into the APK folder) |
| UI atlas: compare versions | `node analysis/ui/tools/diff-versions.mjs [<old> <new>] [--all] [--json <file>]` (or `#/diff` in the atlas) |
| UI atlas: serve | `node analysis/ui/atlas/serve.mjs 4291` → `http://127.0.0.1:4291/ui/atlas/` (or `Start UI Atlas.cmd`) |
| UI atlas: render every screen | `PLAYWRIGHT_MODULE_URL=file:///<repo>/local-app/node_modules/playwright/index.mjs node analysis/ui/atlas/test/smoke.mjs` (must print PASS) |
| UI atlas: screenshots | same env, then `node analysis/ui/atlas/test/shots.mjs <outDir> "#/b/SEC_SETTING/190" "#/tokens" "#/map" "#/t8214"` |

There is no linter. CI (`.github/workflows/ci.yml`, Ubuntu) runs the build, the unit tests, the browser test in Google Chrome (`PLAYWRIGHT_CHANNEL=chrome`; Playwright's Chromium has no H.264) a check that no vendor files are tracked and the personal data check (`tools/check-private.mjs`, files and history). The atlas smoke test needs the APK-derived data, so it runs only locally.

## local-app architecture

- `server/index.mjs` is a plain `node:http` server bound to 127.0.0.1. It rejects other Host or Origin values, requires the `X-Monitor-Token` from `/api/state` on POST requests, and serves `dist/` by reading it fresh on every request. Rebuilding the front end therefore needs no restart, but changes in `server/` do.
- `server/eufy.mjs` (`EufyAccount`) wraps `@mega-yfue/eufy-sdk` (pinned 0.5.0): sign-in with captcha and 2FA, device discovery (`canLive` = the SDK camera exposes `openReadable`), and `openVideo`, which returns the SDK's raw video Readable.
- `server/media.mjs` (`MediaSession`) pipes that stream, an RTSP URL or a lavfi test pattern through FFmpeg into fragmented MP4. The browser plays it with MediaSource (`src/components/LiveVideo.jsx`). Sessions time out after 45 s without video and stop after 5 minutes. For RTSP, FFmpeg stderr is never kept, because it can contain credentials. The encode fits the longest side to 1280 px with even dimensions (`force_original_aspect_ratio=decrease:force_divisible_by=2`, so a tall doorbell frame stays within H.264 level 3.1) and caps the bitrate (`veryfast`, CRF 23, `-maxrate 3M -bufsize 6M`); do not go back to unbounded `ultrafast`, which inflated the output ~8×.
- `server/diagnostics.mjs` is opt-in (`EUFY_DIAG=1`). It passes a redacting logger to the SDK (`new EufyMega({logger})`), whose `logger.debug` also carries its live-start trace phases. It records swallowed errors, FFmpeg stderr for camera streams, and the first video bytes (H.264 or H.265 NAL type). Redaction keeps a serial's 4-character model prefix (`T8214<sn>`) and LAN addresses, but masks public IPs (RFC1918/loopback/link-local/CGNAT stay) and Firebase push tokens. Repeated `[p2p]` debug lines are coalesced (first few per shape, then a periodic `suppressedSince` count) and the file stops at `EUFY_DIAG_MAX_BYTES` (32 MB default). Its rules are covered by `diagnostics.test.mjs`. `check-private.mjs` shares the same public-vs-private IP policy.
- `server/events.mjs` (`EventLog`) keeps rings and detections in `.runtime/events/` (`events.json` plus `<id>.jpg`, newest 200). `EufyAccount.record` takes the SDK's catch-all `event` stream, keeps only the names in `EVENT_LABELS`, and attaches the picture from `camera().snapshotStored()` a few seconds later, because the push thumbnail arrives after the event. Records carry `deviceKey` (a short SHA-256 of the serial), never the serial. `/api/state` carries `latestEvent` and `eventCount`; the page shows a banner when `latestEvent` changes.
- `server/settings.mjs` turns `device.properties` and `device.getProperties()` into grouped, labelled rows (`POST /api/settings`). Names that look like keys, serials or MACs are dropped, and strings pass through `redactString`. Only names in `EDITABLE` that the SDK marks writable get a `control` (a switch for booleans, a select for `enumValues`); `EufyAccount.setSetting` re-validates against that control before `client.setProperty` (`POST /api/settings/set`). A shared (non-owner) account gets eufy error 20004 "Only the owner can change settings" on per-device params; `EufyAccount.ownerGated` is set (passively from `raw.member.admin_user_id` vs `client.auth.userId` at refresh, or on the first refused write) and surfaced in `/api/state` and the settings response, so `SettingsPage` renders read-only. Never add free numeric writes: the SDK has no ranges.
- `server/session.mjs`: "Keep me signed in". `SavedAccount` holds three `ProtectedStore`s (account email + country, the SDK `store` session, the SDK `pushStore`) in `.runtime/account/`, AES-256-GCM sealed under `key.dat`, which DPAPI protects (one PowerShell call, about 1 s, so DPAPI is never used per save). `EufyAccount.resume()` restores at startup with an empty password only when `sdk.isSessionValid` passes and treats a non-Ok login as a rejected session; `server.resumeAccount()` retries while the network comes up. `disconnect({forget:true})` is a user sign-out; a shutdown keeps the saved sign-in.
- `server/alerts.mjs`: preferences in `.runtime/alerts.json` (in `/api/state` as `alerts`), Windows toasts through Windows PowerShell's WinRT bridge under PowerShell's AppUserModelID with a protocol launch to `/#events`. `record()` calls `alerts.notify`. When `alerts.available` is false the page plays `src/lib/chime.js`.
- `server/history.mjs`: battery and RSSI per device key in `.runtime/history.json` (change or hourly, 60 days), fed by `sampleAll` after `refresh` and every 15 min, and by `propertyChanged` events. `GET /api/history?key=`; charted by `src/components/HistoryChart.jsx`.
- `tools/tray.ps1` starts `server/index.mjs` hidden with `MONITOR_PARENT_PID`; the server exits when that process is gone. Keep the script ASCII (Windows PowerShell 5.1 reads BOM-less files as ANSI) and never call a native command with `$ErrorActionPreference='Stop'` and redirected stderr: esbuild writes to stderr and that throws.
- APK evidence (`analysis/streaming/command-enums.json`, `analysis/asset-evidence/hb_capability_config.json`) is optional at startup, because the capability file is vendor data and is not in git.
- Front end: `src/App.jsx` holds the state, `src/hooks/useMonitor.js` polls `/api/state` every 1.5 s, and components and styles are split. The design follows the eufy OneAnker tokens in monochrome (`src/styles/tokens.css`, `DESIGN.md`). Don't use the cyan brand colour, coloured status pills or a "connected" badge. Avoid the class name `.main` on components: the mobile layout reorders `.main` and it once broke the control row. The build copies MontForAnker from `analysis/ui/fonts` into `dist/fonts` when present.
- Live view on the T8214 works since 2026-10-26 (behind a HomeBase 3, T8030: the SDK starts it through the station, first keyframe H.264 1600x2200 about 2 s after opening). The SDK picks its start by topology: `homeBaseAttached` sends 1350 wrapping `{cmd: 1003}`; the doorbell's own session sends 1700 wrapping START_LIVE 1000, then keepalive 1139. Background is in `analysis/streaming/FINDINGS.md`; the static comparison, ranked causes and the outcome are in `analysis/streaming/T8214-LIVE.md`; local RTSP/ONVIF options are in `analysis/streaming/LOCAL-ACCESS.md`. `openVideo` passes `liveOptions(sn)`: a five-minute `batteryBudgetMs`, plus the `eccPrivateKey` looked up through SDK internals with `EUFY_LIVE_ECC=1`. The T8214 sends RSA-wrapped frames (`first-video-command signCode:1`), which the SDK decodes without that key.

## UI atlas pipeline (`analysis/ui`)

`tools/build-all.mjs` runs these steps. Every tool shares `tools/hbc.mjs`, a Hermes **v96** reader for strings, function headers and instruction streams, driven by `analysis/streaming/BytecodeList.def`.

1. **Unpack** the security RN bundles (`RN_ANDROID_SEC_*`, `ZX_*`, `MEGA_PLAYER`, `zx-rnsdk`) and the fonts from `feature_asset_pack.apk` into `ui/rn/<bundle>/`.
2. **`hbc-modules.mjs`** recovers the Metro module table from the global function's `__d(factory, "<source path>", [deps])` calls. Module IDs are original source paths such as `sec_setting_src_motionDetection_MotionDetectionScreen.tsx`. It also decodes literal buffers: array buffer, object key buffer, object value buffer. The section starts come from header fields at offsets 80, 84 and 88.
3. **`rn-tree.mjs`** evaluates each module symbolically: the factory first, then its closures in creation order, sharing environment objects. Control flow is ignored (straight-line, last write wins), except for T8214 model checks.
   - Calls to `jsx`/`jsxs` become elements.
   - `translate(key)` becomes a text key.
   - `require(deps[k])` becomes a module reference.
   - `Construct`/`Call` arguments are the registers written since the previous call, because the frame-size heuristic was wrong.
   - `isT8214()` / `x.isT8214`, `=== 'T8214…'` and `startsWith('T8214…')` checks are followed through their conditional jump: elements built in the fall-through range get `$c: ["T8214"]` or `["!T8214"]`, and the range skipped by a trailing `Jmp` gets the opposite label. Branch elements lost before the return are kept per component as `branches: [{c, tree}]`.
   - Per module it emits the element trees (`comps`), `exports`, `texts` (a constant table: i18n proxies `{t: key}`, enums, `#asset` image-loader entries, `@[light,dark]` DynamicValue pairs, `^alias` getters, `=literal`), `getters` (class getter tables for theme modules) and `routes` (`[name, module, export]` from exported `{name, component}` route tables).
4. **`theme-tokens.mjs`** extracts the bc-rnuikit getter classes (`defColor`, `defFont`, radius).
5. **`build-atlas-data.mjs`** writes `atlas/data/`: per-bundle catalogues, the asset map, language tables, native resources and `tokens.json`.
   - It also writes `lang/<code>/<bundle>.json` + `langs.json` (38 languages from the bundles' `res/language/*.js`, English fallback; native `strings.xml` is English only), `search.json` (`{keys, entries}`, resolved per language in the browser) and the version manifest `versions/<id>.json` + `versions/index.json`. The manifest is keyed by source path, its tree hash ignores `$f` ids and component names, and it does not depend on `analysis/decoded`.
   - Asset modules map to drawables using React Native's Android resource-name rule.
   - Theme scale classes are ordered by builder function ID: the first backs `fixed`/`relative`, the second `ratio`.
   - Kinds: plain `.ts` files and `use*` hooks are logic even when named `*Screen`/`*Modal` (the `*ViewModal.ts` view models). A screen without a tree that re-exports another screen gets `alias`.
   - `navigates` = screen names in the strings, plus registry route names (`routes`, `<Stack.Screen name component>` in `Navigator`/`App`) when the file imports `NavigationKeys` or the name ends in Screen/Page. Registries get `registry: true`.
   - `t8214` = `{refs, branches, via}`: own T8214 strings, recovered branch elements, and same-feature logic deps that call `isT8214`.

The viewer (`atlas/js`) is plain ES modules with no build step:
- `rn-render.js` maps trees to DOM: RN styles become flexbox at 1 px = 1 dp; tokens resolve as `defColor.*`, `UFColor.*`, `oa.*`, `UFSpace`, `UFRadius`, `UFFont` and `oa.font`; props pass as `arg1.x` or `this.props.x`; components resolve directly or through a barrel by export or file name, and must never resolve to `App`, `Navigator` or `NavigationConfig` modules; FlatList `renderItem` gets `{item, index}`; react-native-svg renders as SVG.
- Model branches: `createRenderer(rc, {variant})` with `all` (marked with a dotted outline), `T8214` or `other`; `renderComponent(comp, 'b<n>')` renders a separated branch tree. Pages `#/map[/<bundle>[/<index>]]` (views/map.js), `#/t8214` (views/t8214.js), `#/search/<q>` (views/search.js) and `#/diff[/<old>/<new>]` (views/diff.js; the logic is in `js/version-diff.js`, shared with the command-line tool).
- The preview language lives in `data.getLanguage()` / `setLanguage()` (localStorage `atlas.lang`); `shots.mjs` takes `ATLAS_LANG=<code>`.
- `native-render.js` renders decoded layout XML in the browser, converting vector drawables to SVG and shape drawables to CSS. Relative and Constraint layouts become stacks.

The atlas chrome is monochrome; app colours appear only inside previews and swatches.
