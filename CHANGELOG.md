# Changelog

## [Unreleased]

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
