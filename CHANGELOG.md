# Changelog

## [Unreleased]

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
