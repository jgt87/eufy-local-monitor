# T8214 live view: app versus SDK (static comparison)

Goal: have a fix ready to try once diagnostics and netwatch logs from the owner's T8214 (Video Doorbell Dual, battery) arrive. Everything here is static: the eufy app 6.1.10 (30612) bundles and native-library strings, and the source of `@mega-yfue/eufy-sdk` 0.5.0 in `local-app/node_modules`. Nothing was run against a device. Statements about the app paraphrase its logic and quote only identifiers and command numbers.

## 1. What the app shows about a T8214 live start

### Where the logic lives

- The live view is not React Native. The RN `PlayView` components (`megaplayer_src_agent_components_PlayView.tsx`, `sec_setting_src_alarm_components_PlayView.tsx`) only pass a state enum (`none`, `start`, `pause`, `startLive`, …) to the native view `BCRNVideoPlayView`. The start command itself is built in the protected Java layer (ijiami loader, not decompilable here) and in `libmega_media_sdk.so`.
- The ~30 `isT8214` branches in SEC_SETTING are all settings screens (power, motion, night vision, chime, delivery guard, edge connection, AI). **None of them touches live view.** There is no T8214-specific live branch in any RN bundle.

### Command numbers (zx-rnsdk `CommandType.ts`, recovered enum)

| ID | App name | Role for a doorbell |
| ---: | --- | --- |
| 1003 / 1004 | `APP_CMD_START_REALTIME_MEDIA` / `STOP_REALTIME_MEDIA` | HomeBase-style start/stop |
| 1350 / 1351 | `APP_CMD_SET_PAYLOAD` / `NOTIFY_PAYLOAD` | JSON envelope (HomeBase path) |
| **1700 / 1701** | **`APP_CMD_DOORBELL_SET_PAYLOAD` / `DOORBELL_NOTIFY_PAYLOAD`** | JSON envelope for doorbells |
| 1000 (in `IDCP2PCommandType`) | `COMMAND_INDOOR_START_LIVE` | inner command inside the 1700 envelope |
| 1139 | `APP_CMD_PING` | keepalive |
| 1100 | `APP_CMD_GET_ASEKEY` | session key exchange (the SDK's `CMD_GATEWAYINFO`) |
| 1054 | `APP_CMD_BIND_SYNC_ACCOUNT_INFO_EX` | native code logs "encryptkey 1054" next to "encryptkey 1001" |
| 1300 / 1301 | `APP_CMD_VIDEO_FRAME` / `AUDIO_FRAME` | media |
| 6202 | `APP_CMD_SWITCH_DUAL_CAM_STREAM` | dual-lens stream switch (T8214 has two lenses) |
| 6243 / 2700 | dual view mode (SDK names `CMD_DOORBELL_DUAL_VIEW_MODE2` / `…VIEW_MODE`) | picture layout of the two lenses |
| 6246 | `APP_CMD_MULTI_TERMINAL_LIVE` | several viewers |

The SDK's choice of 1700 wrapping inner 1000 for an own-session doorbell matches the app's own naming: 1700 is literally the doorbell payload command, and 1000 is the IDC start-live inner command.

### Transport (libmega_media_sdk.so)

- Two channel types share one `DeviceSessionManager`: `P2PSessionChannel` (PPCS) and `RTCChannel` (eufy WebRTC with a signalling server, used by the NVR/HomeBase 3 class). `RTCChannel` logs "RTC does not support Live type (type=1)" for its media decrypt, so live media decryption runs on the **PPCS path**; the RTC channel carries 1700 commands for some devices ("RTC_LIVE_STREAM sendCmd 1700 cmdValue, channel_value"). The hb_capability_config scope `media_live_rtc` is HomeBase 3 class only.
- The PPCS connect is `PPCS_ConnectByServer(did, initString, 0x3F, …)`: mode mask 0x3F, which allows LAN, P2P punch and relay. Its parameters are `finalInitStr`, `didMergeDsk` (the DID merged with the DSK key from the cloud), `hubSn` and `uuid`. The connect fails early if `didMergeDsk` is empty.
- After connecting, the app gets the session key (`APP_CMD_GET_ASEKEY` 1100, cipher id, sign_code). Commands then go out as "V8" (`sendP2PSessionCommandV8`, sign_code + version in the header) or ECC-encrypted (`zx_ecc_encrypt`).
- **Live video frame formats** the native receiver handles, by header version and sign code: "V2 Encrypted", "RSA V3", "**E2E V5**", "V8" and plaintext. Downloads and history add ECC "V9". `LiveMediaDecrypt::setCryptoKey` can generate an RSA key *or* an ECC key (`GenerateKeyForECC`), so the live decrypt type depends on the device.
- Both `[h264]` and `[h265]` keyframe decrypt paths exist for live, so a T8214 may send either codec. The stream type comes from the device (frame header `streamType`).
- Audio: an FDK AAC decoder (`AudioFDKDecode`) with a configurable audio type. The SDK knows AAC-LC and AAC-ELD.

### Topology hints for the T8214

- `BCDeviceDoorBellBatteryT8214` is a battery doorbell (`BCDeviceType` 94; the SDK's `BATTERY_DOORBELL_PLUS_E340`). It can run on its own Wi-Fi session, or be added to a HomeBase 3. The HomeBase 3 bundle (`homebase3_src_utils_DeviceUtils.tsx`) knows T8214 as a sub-device.
- It also takes part in **Edge Connection** (`EdgeConnectionViewModel` lists `isT8214`): pairing with a HomeBase 3 or NAS for storage (`hb_connect_*` actions). That changes which station the cloud reports for the device, and so which session the SDK picks (cause B below).

## 2. What the SDK does (0.5.0, `dist/index.js`)

Chain: `camera().openReadable(opts)` → `MediaProvider.openReadable({powered, ...opts})` → `P2PCommandRouter.sharedLiveSourceFor` → `resolveSession` → `SharedLiveSource` → `LiveStream` → `P2PSession.startLiveMedia`.

| Aspect | SDK behaviour | Compared with the app |
| --- | --- | --- |
| Topology | `homeBaseAttached = stationOf(dev) !== sn`, where `stationOf` prefers `raw.parent_sn`, then `stationSn`, then `raw.station_sn` | The app chooses per device type and connection. A doorbell edge-connected to an HB3 or NAS may report the HB3 as parent or station while it still streams on its own session. |
| Attached start | 1350 at level 2 wrapping `{account_id, cmd:1003, mChannel, mValue3:1003, payload:{…, streamtype:2}}`. Needs the level-2 key, which `requireLevel2ForAttached` waits for (25 s grace, one re-prompt). | Same family as the app's HomeBase path |
| Own-session start | 1700 wrapping `{commandType:1000, data:{cmd:1000, account_id, accountId, mValueStrSub, mChannel, mValue3:0, mValue5:0, msg_id:1, camera_type:0, entrytype:0, extValue:1000, ivalue:1, restore:0, streamtype:2, video_type:12, timestamp, transaction, encryptkey:<RSA-1024 modulus>}}`. Level 2 (GCM, signCode 8, frame type 10) once a key exists, level 1 (AES-ECB, signCode 1, frame type 11) before that, or in the clear (signCode 0, short body) when the gateway cipher id is 0. | IDs match. The field set is "byte-verified" in SDK comments against *some* own-session camera, not the T8214. `camera_type:0` picks one lens of the dual doorbell. |
| Retries | Start resent every 150 ms until acknowledged, for up to 3 s (`media-command-unacknowledged`). Warm-up resends every 2 s, deadline **20 s** (`warmTimeoutMs`). Keepalive 1139 every 3 s. | App timings unknown |
| Connect | Own PPCS-compatible UDP client: LAN broadcast to port 32108, cloud lookup with `get_dsk_keys` DSK and `p2p_conn`/`app_conn` servers, relay fallback. Connect timeout 45 s. | Same three modes as the app's 0x3F |
| Media decrypt | `session.decodeVideoFrame`: RSA-wrapped AES key in bytes 22–150, first 128 body bytes AES-ECB (the app's "RSA V3"), or plaintext. **E2E frames (ECIES envelope at 22, GCM tag at 151, nonce at 167, body at 179; the app's "E2E V5") decode only when `eccPrivateKey` is passed.** Otherwise the SDK drops them and logs `video-decode-empty`. | The app handles V2, V3, V5, V8 and plaintext. **`local-app` passes no `eccPrivateKey`.** |
| Codec | Sniffs H.264 or H.265 from the keyframe and defaults to `h264`. The readable carries raw Annex-B with no container. | The app handles both |
| Battery | `powered:"battery"` (T8214 has the `battery` capability). The pull is **auto-stopped 45 s + 10 s after the first keyframe** unless `extend()` is called. `openReadableFromConsumer` does not forward the budget notice. | `local-app` expects up to 5 minutes |
| Dual lens | No 6202 / 6243 handling in the live path. An own-session stream does not filter frames by channel. | The app can switch the lens or layout |

`local-app` side: `MediaSession` starts a 45 s "no video" timer **before** `openVideo`. So a slow P2P connect (up to 45 s) plus the SDK's 20 s warm-up can trip the local timer first. FFmpeg reads the pipe with no `-f`, so it probes the format from 1 MB.

## 3. Ranked likely causes and the log lines that settle each

Diagnostics lines are JSON with `source` `sdk:debug` (`"message":"[live] start trace"` and `data.phase`), `media`, `account` and `ffmpeg`. Serials appear as `T8214<sn>`.

**A. E2E frames that the SDK drops without an ECC key (most likely).** The T8214 is a recent device, and the app has a dedicated "E2E V5" live path.
- Confirm: `phase:"first-video-command"` appears, then `phase:"video-decode-empty"` (up to the traced limit), never `first-video-unit` or `first-keyframe`, then `phase:"start-failed","stage":"awaiting-first-frame","reason":"warm-timeout"` about 20 s after `warming`. There is no `media` / `first camera bytes` line. Today `first-video-command` shows `"signCode":"<redacted>"` because of a redaction bug (fixed in the patch). After the fix, a non-zero signCode on first-video-command together with video-decode-empty confirms the cause.
- Reject: `first-keyframe` appears, or `first camera bytes` shows `annexB:true`.
- Fix: patch below, run with `EUFY_LIVE_ECC=1`. Expect `media` `ecc lookup {cipherId, found:true}`, then `first-keyframe`.

**B. Wrong topology: the doorbell is treated as attached to a HomeBase or edge station, or not.**
- Confirm: the `account` / `device` line for T8214 shows `homeBase:true` (with the patch also `parentDiffers` / `stationDiffers`), and `phase:"station-resolved","topology":"attached"`, then `media-command` with `topology:"attached"`. Then either `level2-unavailable` / `StationKeyUnavailableError` ("could not open a live stream"), or `first-foreign-media-command`, or silence until `start-failed`. The opposite case is `topology:"own"` while the doorbell is in fact on a HomeBase 3: start acknowledged, no video.
- Reject: `topology:"own"` plus `homeBase:false`, and the owner confirms the doorbell is not on a HomeBase.
- Fix: none prepared, because the right direction depends on the log. If edge connection misleads the topology, a local override would remap `parent_sn` before `getDevices` results reach the router. That means changing SDK input, so it waits for evidence.

**C. The P2P session never connects, or connects too late (battery wake, NAT).**
- Confirm: `phase:"lookup-channels"` with `cloudMissing:"dsk-key"` or `"cloud-addresses"`; `session-connect-wait`, then `session-unreachable` (around 45 000 ms), or `P2P connect timeout … (relay …)`; `media` / `openReadable failed` with `StationUnreachableError`. In netwatch: UDP ports bound but the session closes; no `[p2p] … connected <ip>:<port>` debug line. A LAN IP there means a LAN path, a public IP a punched or relay path.
- A late connect shows as `openReadable returned {ms: >25000}`, then the local "No video arrived within 45 seconds" before the SDK's own `start-failed`.
- Fix if late: in `local-app/server/media.mjs`, start the 45 s timer after `openVideo` returns, or raise it to about 70 s for battery cameras. Not in the diff.

**D. The start is never acknowledged (wrong encryption level or body for this firmware).**
- Confirm: `media-command {topology:"own",action:"start",level2:false}` before `level2-ready`, then repeated `media-command-retry`, then `media-command-unacknowledged`. Also `level2-unavailable` with `no-cipher-key` or `derivation-failed`, or `level2-set-payload-only` (an RSA cipher, so level 2 is never GCM).
- Reject: `media-command-ack {action:"start"}` appears.
- Fix: if level 2 arrives late, the SDK already re-issues the start. If the device acknowledges and still sends nothing, try `camera_type` and `streamtype` variants. That needs an SDK-side change, so it waits for a log.

**E. The stream works, then stops after about 55 s (battery budget).** This is not the reported failure, but it will show as soon as video works.
- Confirm: an `sdk:debug` line `[live …] battery budget elapsed — notifying consumers, 10000ms grace`, then `media` / `camera stream ended`, then `ffmpeg exited {code:0}`.
- Fix: `batteryBudgetMs: 300000` (in the patch).

**F. Codec or container probing in FFmpeg (H.265, or two lenses interleaved).**
- Confirm: `first camera bytes` with `annexB:true` and `h265NalType:32` (VPS), and `ffmpeg` stderr such as "Invalid data found when processing input", "Could not find codec parameters", "PPS id out of range" or a resolution change. The SDK line `first keyframe — live (WxH hevc …)` shows the size and codec. Two different WxH values point at dual-lens interleaving.
- Fix: pass `-f hevc` or `-f h264` from the first chunk's NAL type (small change in `media.mjs`). For dual lens, see 6243 / 2700 view mode. Not in the diff.

## 4. Proposed patch (not applied)

The diff is kept outside the repository, in the session scratchpad, as `t8214-live-options.diff`. It applies cleanly with `git apply --check` from the repo root. It touches only `local-app/server/*`; nothing in `node_modules` changes.

1. `eufy.mjs`: `openVideo` passes `await this.liveOptions(sn)` to `openReadable`:
   - It always sets `batteryBudgetMs: 300000` (cause E).
   - With `EUFY_LIVE_ECC=1`, it resolves the P2P session (`waitLevel2:'settle'`, at most 8 s), reads the negotiated `gatewayCipherId` and gets that cipher's ECC key through the router's own cached `cipherKeysFor` (the same `get_ciphers` call the SDK already makes for level 2). It then passes the key as `eccPrivateKey` (cause A).
   - The key is used only by the SDK's fallback decoder, after the RSA and plaintext paths fail, so RSA cameras are not affected.
   - It reads the SDK internals `client.p2p`, `resolveSession`, `cipherKeysFor` and `session.gatewayCipherId` with feature checks, and falls back to the plain options.
   - Assumption to verify: E2E live frames are wrapped for the session's gateway cipher. If `ecc lookup found:true` is logged and `video-decode-empty` still repeats, the frames use a different cipher id.
2. `eufy.mjs`: the device diagnostics line also records `channel`, `parentDiffers` and `stationDiffers` (cause B).
3. `diagnostics.mjs`: `sign` in the secret-key pattern becomes `sign(?!_?code)`, so `signCode` in live traces stays readable. A new test in `diagnostics.test.mjs` covers it (4/4 pass on a copy).

## 5. Open points

- The exact Java-built start body for the T8214 (lens selection, `video_type`, codec request) cannot be recovered statically, because the Java layer is protected. A capture or the diagnostics log is the next source.
- Whether the owner's T8214 is standalone, on a HomeBase 3, or edge-connected decides between causes B and C.
