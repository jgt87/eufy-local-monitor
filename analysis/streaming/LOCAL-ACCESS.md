# Local video access without eufy sign-in

Question: can the monitor get a camera's video on the LAN without signing in to the eufy cloud?

## eufy's own P2P stream: no

The live view the monitor uses (PPCS / P2P) is always encrypted, even when the path is local. The per-stream
keys come from the cloud at sign-in (`get_dsk_keys`, the cipher exchange, `APP_CMD_GET_ASEKEY`). The doorbell's
frames in the diagnostics run were RSA-wrapped (`signCode:1`), decoded with the session's own key. No sign-in →
no session key → no decodable video. This is by design; it is what stops anyone on the LAN or a relay from
watching the camera. The ECC key is a separate, additional key (E2E frames) and was not needed here.

## RTSP: yes, where the hardware offers it — device credentials, not the eufy login

RTSP is a HomeBase/NVR feature, not a per-camera one. From the packaged capability config
(`asset-evidence/hb_capability_config.json`):

- `media_live_rtsp` (live RTSP) and `nas_rtsp_stream` (NAS recording over RTSP) are **enabled for stations
  `T8030`, `T9000`, `T8N00`, `T8010`**, minimum station version `3.0.0.0`. **Excluded: `T8025`** (HomeBase Mini,
  hardware limit).
- So a camera gets a local RTSP URL only when it is bound to a supported HomeBase, which re-streams it. The URL
  carries its **own** username and password, set in the app — not the eufy account login. Once it exists, the
  monitor's "Open an RTSP source" box plays it straight through FFmpeg, with no eufy sign-in.
- Related screens in the app (SEC_SETTING): `storage_nas_NASRTSPSecurityScreen`, the HomeBase `ONVIF*` binding
  screens, and the Edge-Connection "RTSP connection between your camera and HomeBase" test.

### The owner's devices (from the 2026-10-26 diagnostics run)

| Model | On HomeBase 3 (T8030)? | `rtsp` capability | Local RTSP possible |
| --- | --- | --- | --- |
| T8214 (doorbell) | yes | yes | yes, via the HomeBase (battery doorbell: live RTSP may be event-only) |
| T8134 (×2) | yes | yes | yes, via the HomeBase |
| T8400 (×3) | no (own Wi-Fi session) | yes | not via this HomeBase; standalone RTSP only if the app offers it |
| T81A0, T87A0 | — | no | no |

The HomeBase is a `T8030`, which is on the supported list, so local RTSP is available for the cameras bound to
it. It is set up in the eufy app under the HomeBase's storage / NAS (RTSP) settings, per camera. ONVIF is the
other local, auth-free route on the same HomeBase.

Not verified against the live devices: whether the battery T8214 offers *continuous* RTSP (battery cameras often
stream only on an event) versus only while awake. The app toggle is the place to check.
