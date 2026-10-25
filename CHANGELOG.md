# Changelog

## [Unreleased]

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
