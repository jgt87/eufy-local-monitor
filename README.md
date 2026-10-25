# eufy app research and local monitor

Independent research into the eufy Security Android app (6.1.10, build 30612), plus a local Windows monitor for eufy cameras. Not affiliated with, endorsed by or supported by Anker or eufy.

**No vendor files are included.** The APKs, their extracted bundles, decompiled code, native libraries, fonts and images are excluded. The tools here rebuild everything from your own copy of the APK, placed in `APKDownload/`.

## What's here

| Folder | Contents |
| --- | --- |
| `local-app/` | A local camera monitor (React + Node): eufy sign-in through the community [`@mega-yfue/eufy-sdk`](https://www.npmjs.com/package/@mega-yfue/eufy-sdk), live view through FFmpeg, an RTSP input, a labelled test signal, and an opt-in diagnostics mode (SDK trace, network watcher, optional `pktmon` capture). Start it with `Start Monitor.cmd`. |
| `analysis/ui/` | A UI atlas: recovers the app's React Native screens, text, design tokens and native layouts from the Hermes bytecode and renders them in the browser. Build with `node analysis/ui/tools/build-all.mjs`, open with `Start UI Atlas.cmd`. |
| `analysis/streaming/` | Notes on live streaming and HomeBase connections, bytecode and ELF parsers, and recovered command IDs. |
| `analysis/FINDINGS.md` | Overview of what was examined and how. |

## Requirements

Windows 10 or 11, Node.js 24.5 or newer, and FFmpeg with `libx264` for live view. Tests use Playwright with installed Edge.

## Notes

- Everything runs on `127.0.0.1`. The monitor keeps credentials in process memory only.
- Diagnostics logs redact serial numbers (keeping only the model prefix), MAC addresses, emails, tokens and key material. Review a log before sharing it.
- `analysis/streaming/BytecodeList.def` is the Hermes opcode list from [facebook/hermes](https://github.com/facebook/hermes) (MIT licence, © Meta Platforms, Inc. and affiliates), used as a parser definition.
- These are static observations of one app version. They are not a supported or complete protocol description.
