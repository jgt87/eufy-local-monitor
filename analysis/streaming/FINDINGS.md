# Camera streaming and HomeBase connection: static findings

## Result

The Android app contains multiple connection/media implementations. The strongest security-camera leads are the native libmega_media_sdk.so and libeufy_link.so libraries, and the React Native RNIotModule bridge. Packaged RTSP support is separate from the proprietary live-media interfaces. The exact path selected for a particular HomeBase/camera is not yet established.

All findings below are offline observations of the supplied 6.1.10_30612 APK set. No app execution, account login, device connection, key recovery or streaming was performed. APK signer authenticity remains unverified.

## Connection map and evidence strength

| Stage | Evidence | What it establishes |
| --- | --- | --- |
| App onboarding / device facade | SEC_ADDDEVICE HBC function 1044 at file offset 5935369 references NativeModules.RNIotModule and exports getHubInfo, getParentSn, getDeviceChannel, connectDevice, connectSubDevice, isInSameLAN, isP2PConnected and pairing operations | Actual bytecode references to a native bridge and exported operations. Does not establish their protected Java implementations. |
| P2P status | SEC_ADDDEVICE function 1161 at 5952717 logs a device SN and invokes IOTSDK.isP2PConnected with its first parameter; function 1164 at 5953028 forwards the first parameter to IOTSDK.addP2PConnectListener | These wrappers are callable code paths rather than names found only in strings. |
| HomeBase setup progress | SEC_ADDDEVICE function 7115 at 7114282 invokes isP2PConnected and references ConnectToHBScreenState.SyncWait and stop | A HomeBase onboarding path consumes P2P status. Exact timing/state transitions need further tracing. |
| Shared facade | zx-rnsdk functions 13552, 13564, 13566 at offsets 3819432, 3819746, 3819788 | Each forwards a single parameter to connectDevice, addP2PConnectListener or isP2PConnected on an environment-bound implementation. The complete implementation binding has not been traced. |
| Native P2P/media | Defined ELF symbols in libmega_media_sdk.so include zx_p2p_connect_by_mode (0x1ef9f8), zx_set_p2p_connect_info (0x1e5930), PPCS_Connect, PPCS_Read and PPCS_Write | These functions exist in the library. No caller relationship from RNIotModule to these functions is established yet. Some PPCS exports are four-byte stubs; export names do not reveal their full implementation. |
| Additional link implementation | libeufy_link.so defines eufyLink_Discovery (0xc7ce0), eufyLink_Connect (0xc133c), eufyLink_ConnectV2 (0xc26f4), eufyLink_SendByDevCh (0xc64e0), eufyLink_RecvByDevCh (0xc6584), eufylink_client_getLiveChannel (0xdb0a4), and ikcp_* functions | Discovery, per-device-channel I/O and KCP-related functionality are present. Selection and fallback order are unknown. |
| Decryption / playback | libmega_media_sdk.so defines LiveMediaDecrypt::setCryptoKey (0x2bc8cc), processEccVideoFrame (0x2bdf2c), and JNI ZMediaJNI_aesGcm256Decrypt (0x1dafc4). Eufy/Ijk player interfaces are present in libeufyplayer.so | Media crypto and player interfaces exist. Actual negotiated algorithms, key derivation and the full frame pipeline are not established by symbols. |

Working hypothesis: device/HomeBase metadata and native bridge operations feed a native P2P or EufyLink session, which supplies media to decryption and playback. These edges remain hypotheses where the table does not explicitly identify bytecode calls. There is no basis yet to claim one mandatory transport or a universal RTSP URL.

## Concrete command IDs recovered

The shared SDK HBC function 5382 contains direct numeric enum assignments. Offsets below are offsets in RN_ANDROID_zx-rnsdk.hbc, not native virtual addresses. Full provenance is in command-enums.json.

| Name | ID | Assignment offset |
| --- | ---: | ---: |
| APP_CMD_P2P_DISCONNECT | 1044 | 2913684 |
| APP_CMD_P2P_CONNECT_BREAK | 1055 | 2913904 |
| APP_CMD_GET_P2P_CONN_STATUS | 1130 | 2914824 |
| APP_CMD_SET_HUB_FORBID_LIVE_STREAM | 1285 | 2917524 |
| APP_CMD_STREAM_MSG | 1302 | 2917804 |
| APP_CMD_HB3_RTSP_ENABLE | 40003 | 2922406 |
| APP_CMD_HB3_RTSP_ENABLE_TYPE | 40004 | 2922426 |
| APP_IPC_HB_RTSP_SUPPORT | 40005 | 2922446 |
| APP_IPC_HB_RTSP_TEST | 40006 | 2922466 |
| APP_IPC_HB_GET_BIND_INFO | 40007 | 2922486 |

These are enum values, not complete wire messages. Payload schema, authorization, framing, channel and model applicability must be established before implementing requests.

## RTSP and HomeBase capabilities

The packaged hb_capability_config.json declares media_live_rtc for all stations in its own HB3-style capability scope, with a minimum version of 3.0.0.0. Its NAS/RTSP configuration lists T8030, T9000, T8N00 and T8010 and excludes T8025. It also declares separate playback/download capabilities. These are app-side configuration declarations, not tests of those products or a guarantee that a particular camera exports RTSP. Top-level defaultSupport=true means this file alone should not be treated as an exhaustive compatibility check.

## Connection and encryption clues requiring further work

At libmega_media_sdk.so file offset 783040, a diagnostic format mentions P2PSessionChannel::dataChannelConnect parameters finalInitStr, didMergeDsk, hubSn and uuid. At offset 750673, another format names server_init_str, server_uid and server_sn. These are labels in packaged diagnostics, not recovered credentials or a verified handshake schema.

The library also contains STUN/TURN/relay and RTC symbols/messages. This supports investigating multiple transport modes, but it does not prove a fallback order or which mode a specific device uses. Native media symbols and ECC/AES interfaces indicate crypto support; key negotiation and E2EE properties require caller/data-flow analysis or controlled runtime observation.

## Reproducibility and validation

- Extracted six selected index.android.hbc files without running them: SEC_ADDDEVICE, SEC_SETTING, ZX_T8030, zx-rnsdk, ZX_GLOBAL and MEGA_PLAYER.
- All six match the Hermes magic, report bytecode version 96, and pass their embedded SHA-1 footer checks. These checks establish internal consistency, not vendor authenticity.
- hbc-strings.mjs decodes bounded string tables; hbc-trace.mjs decodes function instruction streams using the upstream version-96 opcode definitions. All 93,124 function instruction streams decoded without unknown opcodes or out-of-range operands. This is structural validation of an analyst-written parser, not independent verification of all reconstructed semantics.
- Decoded counts by module: SEC_ADDDEVICE 10,413; SEC_SETTING 42,407; zx-rnsdk 20,078; ZX_T8030 7,472; ZX_GLOBAL 7,538; MEGA_PLAYER 5,216. Outputs retain function IDs, byte offsets, operands and string references. A successful decode does not imply every function was semantically analyzed.
- elf-symbols.mjs reads ELF64 little-endian section/symbol tables, separating defined and undefined symbols. Addresses are relative ELF virtual addresses, not live-process addresses.
- Native ARM64 machine code has not been decompiled. Core Java is protected by the loader previously documented in ../FINDINGS.md.

Parser reference: Meta Hermes BytecodeFileFormat.h, BytecodeVersion.h and BytecodeList.def at https://github.com/facebook/hermes/tree/main/include/hermes/BCGen/HBC . The upstream version file reports 96; the fetched opcode definition is retained locally. Hermes is MIT licensed, copyright Meta Platforms, Inc. and affiliates. The local excerpt is used as a parser definition, not executed app content.

## Target device: T8214

- In the app bundles the T8214 is `BCDeviceDoorBellBatteryT8214` (internal `BCDeviceType` 94), a battery doorbell with its own `isT8214` branch in about 30 settings screens: power, motion detection, night vision, chime, delivery guard, edge connection and AI protection. Wired-install variants appear as `DoorbellWiredDirected_T8214` and `DoorbellWiredWithMechanicalChime_T8214`. A `T8214C` variant shares the model files.
- `hb_capability_config.json` lists T8214 among the devices for `setting_motion_detection_advanced`.
- The community SDK pinned by `local-app` (`@mega-yfue/eufy-sdk` 0.5.0) treats it as a doorbell model and documents several settings as wire-verified on a T8214 ("Doorbell Dual"). It picks its live start by topology. A HomeBase-attached camera gets `CMD_SET_PAYLOAD` 1350 wrapping `{cmd: 1003, mChannel}`. A camera with its own session gets `CMD_CONTROL_PAYLOAD` 1700 wrapping the START_LIVE (1000) JSON, then keepalive 1139, level-2 encrypted once a key is negotiated. Video arrives as `CMD_VIDEO_FRAME` 1300.
- Live view on the user's unit fails at runtime ("could not open a live stream" or "no video within 45 seconds"). `local-app` now has an opt-in diagnostics mode (`Start Monitor (diagnostics).cmd`) to record which stage fails.

## Questions still unresolved

1. Which HomeBase and camera models are the actual target, and which transport does that pair select?
2. Where does the app obtain the connection parameters, and how are they validated/refreshed?
3. What exact start/stop-live command and payload does this device generation use?
4. How do camera SN, station SN and camera channel map into the native session?
5. What is the negotiated stream encryption/frame format, and how do reconnects work?
6. Does the desired camera expose a supported RTSP route that avoids reconstructing the proprietary media path?

The next pass should use the user's device models to trace the relevant setting/onboarding branch and native entry points, then use a controlled capture if static evidence cannot establish the handshake. Nothing in this report demonstrates a working custom stream client yet.

