# Eufy Local Monitor

A local Windows camera viewer with manual Eufy sign-in, device discovery, live video, an RTSP input and a labelled synthetic test signal. APK evidence is available in the interface.

## Start

Install Node.js 24.5 or newer and FFmpeg with the `libx264` encoder. Double-click `../Start Monitor.cmd`, keep its console open and visit http://127.0.0.1:4287 in current Edge or Chrome.

The launcher installs missing dependencies and builds the interface. The server listens only on this computer. Set `FFMPEG_PATH` to the full path of `ffmpeg.exe` if it is not on PATH; the app also checks the standard WinGet Gyan.FFmpeg installation. Set `PORT` to change the default port.

Sign in with your Eufy email, password and two-letter country code. Complete any captcha or verification code manually. Select a discovered camera and start live view. Streams stop after five minutes. Use **Other ways to test → Run test signal** to check local playback before signing in.

## Events and settings

While you are signed in, the monitor records rings and detections (doorbell press, motion, person, pet, vehicle, package and sound) from the SDK's realtime push. Each one appears in the activity list and as a banner, and is kept on the **Events** page with the picture the camera sent, which is fetched a few seconds after the event. History is stored only on this PC, in `.runtime/events/` (the 200 most recent events). Records name the device by its display name and a short hash, never its serial. Events are only collected while the monitor runs; the eufy app keeps its own history. **Latest picture** shows the most recent picture the camera sent with an event; it is not a fresh capture.

The **Settings** page shows what the selected device last reported to the eufy cloud, grouped like the app's settings screens: power, detection, doorbell and sound, notifications, video and network. It is read only and never writes to the device. Battery devices report some values only when they wake. Key material, serials and MAC addresses are left out.

## Limits and credentials

Real device support depends on the community `@mega-yfue/eufy-sdk` client and must be checked with the actual doorbell. Successful test-pattern playback verifies the local conversion and browser pipeline only. APK model declarations do not prove a device exposes RTSP. Audio and talkback are not implemented.

The SDK is pinned to 0.5.0. It supplies Windows-compatible protocol implementations; the decompiled Android ARM64 libraries have not been ported. APK findings are loaded from the parent `analysis` folder, so keep the app beside that folder. This app does not send raw undocumented commands from the findings table. A HomeBase association is account metadata, not a claim of an active P2P connection.

The interface does not persist account credentials in browser storage; only the selected country is remembered. Account credentials and sessions are held by the backend client in memory while running. Sign out when finished. RTSP addresses may contain credentials and are passed to FFmpeg as process arguments, which local process inspection tools can read.

## Development and checks

Run commands from this folder:

```powershell
npm.cmd install
npm.cmd test
npm.cmd run build
npm.cmd start
```

With the server running on port 4287, run `node test/browser.mjs`. Install Chromium using `npx.cmd playwright install chromium` if required. This check verifies decoded test video, stopping playback, the evidence table, mobile overflow and browser errors. Screenshots are written to `test/screenshots`.

To use installed Edge instead, set `$env:PLAYWRIGHT_CHANNEL='msedge'` before running the browser check. Set `MONITOR_URL` when testing a different server address. The check expects a freshly started server, because it looks for the startup line in the activity list. Use a separate instance such as `$env:PORT=4288` rather than a server with a long session.

## Diagnostics

`../Start Monitor (diagnostics).cmd` starts the monitor with `EUFY_DIAG=1` and opens a second window running `tools/netwatch.ps1`. Both write to `.runtime/`, which git ignores:

- `diagnostics-*.log` (JSON lines): the SDK's debug and live-start trace (cloud, P2P lookup, key exchange, media start and keepalive), the real errors behind "could not open a live stream" and "media connection ended", FFmpeg stderr for camera streams, and the first video bytes, which show H.264 or H.265. Serials keep only their model prefix. MAC addresses, emails, account IDs, tokens and key material are redacted. RTSP streams never record FFmpeg output.
- `netwatch-*.log`: each TCP connection and UDP port the monitor process opens or closes, with names from the local DNS cache. No admin rights are needed.
- Optional: `tools/capture.ps1` in an administrator PowerShell records UDP and TCP/443 with the built-in `pktmon` and saves a `.pcapng`.

## Look

The interface follows the eufy app's own design tokens, recovered from the APK (see `../DESIGN.md` and `../analysis/ui`), in monochrome. The build copies the MontForAnker fonts from `../analysis/ui/fonts` into `dist/fonts`. If they are missing, run `node ../analysis/ui/tools/build-all.mjs` first; otherwise the app falls back to Segoe UI. The fonts come from the APK, so keep `dist` local.
