# Changelog

## [Unreleased]

## [0.3.1] - 2026-10-26

### Added
- A personal data check (`tools/check-private.mjs`) for tracked files and the whole commit history: public IP addresses, email addresses, home-folder paths, MAC addresses, device serials, keys and tokens, plus owner-specific strings from a git-ignored `.private-terms.txt`. It runs in CI.
- Shared (non-owner) eufy accounts: the Settings page is shown read-only, with a note, instead of offering changes the eufy cloud will refuse. Detected from the device owner at sign-in, and confirmed if a change is ever refused.
- Local-access analysis (`analysis/streaming/LOCAL-ACCESS.md`): why eufy's own stream needs sign-in, and that local RTSP/ONVIF is available through a supported HomeBase (the owner's HomeBase 3 qualifies) with device credentials, no eufy login.

### Changed
- Live view uses less than a tenth of the bandwidth: the picture is fit to 1280 px on its longest side with even dimensions (so a tall doorbell frame stays within H.264 level 3.1), and the bitrate is capped (CRF 23, 3 Mbit/s ceiling) instead of the old unbounded "ultrafast" encode.
- Diagnostics logs are far smaller and no longer carry public addresses: repeated low-level P2P lines are collapsed to the first few plus a periodic count, the file stops at a size cap (`EUFY_DIAG_MAX_BYTES`), and public IP addresses and push tokens are masked while LAN addresses are kept. The network watcher masks public IPs too.
- A background camera connection error (for example a camera that is offline or asleep) names the camera by model and no longer suggests refreshing the device list; repeats within a minute are dropped. Non-essential cloud endpoints (app-store review and push checks, feedback and log reporting) no longer appear as connection errors — they fail harmlessly and stay in the diagnostics log only.
- `Start Monitor.cmd` and `Start Monitor (diagnostics).cmd` stop with a clear message when another monitor already uses port 4287, instead of quitting with a line that is easy to miss.
- T8214 live view analysis: outcome of the first working run. The doorbell streams through its HomeBase 3 and sends RSA-wrapped frames, which the SDK decodes by itself, so the ECC key option is not needed for it and stays opt-in (kept as a fallback for key rotation on longer streams).
- Example values in tests and docs use documentation addresses and a placeholder repository path.

## [0.3.0] - 2026-10-25

### Added
- Background mode: `Start Monitor (background).cmd` runs the monitor without a console, with a tray icon (Open monitor, Start with Windows, Restart monitor, Quit), one copy per user and automatic restart after a crash. The server stops when its tray process is gone.
- Keep me signed in: the session token, push credentials, email and country are saved in `.runtime/account/`, encrypted with AES-256-GCM under a DPAPI-protected key, so the monitor signs in by itself at startup. The password is never stored. Signing out deletes the saved sign-in.
- Alerts on this PC: Windows notifications for chosen rings and detections, shown with no browser open and opening the Events page when clicked, with optional sound and a test button. Without Windows notifications the open page plays a chime.
- Battery and Wi-Fi signal history: readings at sign-in, every 15 minutes and on reported changes, kept 60 days in `.runtime/history.json` and charted on the Settings page with hover values and a readings table.
- Settings changes: motion detection, chime and mechanical chime switches, and the ringtone and motion sensitivity when the SDK offers choices, each confirmed before it is sent. Free numbers are never written.
- Live view preparation for the T8214: a static comparison of the app's and the SDK's live start with ranked failure causes and the log lines that confirm each (`analysis/streaming/T8214-LIVE.md`). Live view asks the SDK for a five-minute battery budget instead of stopping after about 55 s. `EUFY_LIVE_ECC=1`, on in the diagnostics launcher, hands the SDK the session's ECC key so end-to-end encrypted frames can be decoded.
- UI atlas: text search across all screens by displayed text (in the preview language), text key or file name (`#/search/<query>` and the header box).
- UI atlas: preview language switch with the 38 languages from the React Native bundles' own tables, Dutch included, with English fallback, remembered per browser.
- UI atlas: every build writes a version manifest. `build-all.mjs --apk <dir>` builds another APK set without touching the main data, and `tools/diff-versions.mjs` and the `#/diff` page compare two versions: added, removed and changed screens, texts, T8214 tags and strings.
- CI runs the browser test in Google Chrome and keeps its screenshots.

### Changed
- Diagnostics keep `signCode` in live-start traces readable and log the device's channel and station relationship.

## [0.2.0] - 2026-10-25

### Added
- UI atlas: screen map (`#/map`) showing which screens open which, per bundle and as a per-screen link graph. Links also follow `NavigationKeys` route names through the bundles' route registries.
- UI atlas: T8214 variants page (`#/t8214`), plus a T8214 tag and filter in the bundle lists. Elements inside `isT8214` branches are marked in previews and can be filtered by device model on the screen page.
- Doorbell and camera events: rings and detections from the SDK's realtime push appear in the activity list and as a banner, and are kept on a new Events page with the event picture. History stays on this PC in `.runtime/events/`, without device serials.
- Latest picture: shows the most recent picture a camera sent with an event.
- Read-only Settings page for the selected device, grouped like the app's settings screens, with key material, serials and MAC addresses left out.
- GitHub Actions CI: front-end build, unit tests and a check that no vendor material is tracked.
- Project agent notes in `AGENTS.md`: commands, monitor architecture and the UI atlas pipeline.

### Fixed
- UI atlas: all 963 screens and modals now render. View models named `*ViewModal.ts`, hooks and a native dialog wrapper are no longer counted as screens, and re-export screens preview the screen they re-export.

## [0.1.0] - 2026-10-25

### Added
- UI atlas (`analysis/ui`): Metro module tables, element-tree recovery from Hermes v96 bytecode, a browser renderer for React Native screens and native layouts, and eufy design tokens (bc-rnuikit defColor, aiot-sdk UFColor, OneAnker oa colours, spacing, radius and type).
- Single-command rebuild from a local APK (`node analysis/ui/tools/build-all.mjs`), plus screenshot and full-render smoke tests.
- Local monitor diagnostics: opt-in SDK trace logging with redaction, real error details for failed live views, FFmpeg stderr for camera streams, video codec detection, a network endpoint watcher and an optional `pktmon` capture script.
- `Start UI Atlas.cmd` and `Start Monitor (diagnostics).cmd` launchers.

### Changed
- Local monitor restyled after the eufy app's OneAnker design, in monochrome: MontForAnker type, grouped cards, pill buttons, a live view with round controls, and a mobile tab bar. The front end is split into components, hooks and stylesheets.
- APK evidence files are optional at monitor startup.

### Removed
- The green "connected" status pill. Account state is now plain text.
