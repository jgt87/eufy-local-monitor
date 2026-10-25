# Initial Android investigation

Target: Anker eufy 6.1.10_30612, package com.oceanwing.battery.cam.

## Evidence and outputs

- Original APKs are preserved in APKDownload.
- package-inventory.json records SHA-256, size, DEX members, libraries and bounded asset samples for all five packages.
- decoded/resources/AndroidManifest.xml and decoded/resources/res/xml/network_security_config.xml were decoded with the existing JADX 1.5.6 installation and JDK 21.
- decompiled/sources contains 6,896 Java files. JADX completed with 25 errors: this is partial decompiler output, not original source or complete recovery.
- asset-evidence contains selected original security-setting, onboarding, HomeBase and shared RN SDK ZIPs, plus module and capability JSON.
- REA base archive inventory parent evidence: ev_4943edcf8e3470f9b1d59763c99fed97778a3a04edff77e019156d2f6108573c. No inventory integrity contradictions were reported. This is not APK signing-certificate verification.
- Base APK SHA-256: 8381200dba7cbe728d4af9c700236562891b0a6ec21810bbd1641f132670efa8.

## Observed findings

1. Manifest confirms versionCode 30612, minSdk 26 and targetSdk 36. The application class is s.h.e.l.l.S and the component factory is s.h.e.l.l.A. Loader sources call native methods and load exec/execmain libraries. Assets include ijiami.dat and IJMDal.Data. These are evidence of protection/loading machinery; complete application logic has not been recovered.
2. Base package contains three DEX files; native libraries reside in the arm64 split. Filenames include libNDT_API_PPCS.so, libeufy_link.so, libeufyplayer.so, libcrypto-security.so, libecc-encryption.so, libThingP2PSDK.so and libhermes.so. Names are analysis leads, not proof of active runtime use.
3. The feature asset pack contains separate RN_ANDROID_SEC_SETTING, SEC_ADDDEVICE, ZX_T8030 and zx-rnsdk ZIPs. Inspection of the shared SDK ZIP confirms index.android.hbc (7,021,213 bytes): compiled Hermes bytecode rather than plain JavaScript. Further format inspection is required before choosing a decoder.
4. hb_capability_config.json declares NAS and RTSP capabilities, including station model lists and firmware requirements. These are packaged declarations, not verified device support.
5. IDomainService.java declares Retrofit POST api/estimate/estimate_domain. The base host, actual request and authentication behavior are not established.
6. Network configuration has base-config cleartextTrafficPermitted=true, explicit cleartext prohibitions for two eufy-security S3 domains, and user/system trust anchors under debug-overrides. The manifest itself declares usesCleartextTraffic=false; the XML must be considered when evaluating effective Android policy. Debug overrides do not establish release-build trust of user certificates. No conclusion about certificate pinning has been made.

## Remaining work

- Verify APK signatures and signer consistency across splits; package names and inventory hashes alone do not establish vendor authenticity.
- Inspect Hermes module headers and recover focused security-settings/HomeBase code paths where supported.
- Trace specific authentication, device-command or streaming workflows; inspect native libraries if required.
- Protected core Java logic may require authorized runtime observation on an Android device/emulator. No app was installed or executed, no account used, and no backend/device endpoint contacted.

The connected REA server was 6.5.0 and its JADX MCP provider was missing. Existing standalone JADX allowed resource decoding and partial decompilation without configuration changes. Native ARM64 ELF deep analysis is not established by the current Windows Ghidra provider.

## Camera streaming and HomeBase follow-up
See streaming/FINDINGS.md for bytecode traces, native symbol evidence, command IDs and remaining gaps.

## Mobile app interface
See ui/README.md. The security RN bundles keep their Metro module table with original source paths. Element trees, English text, design tokens (bc-rnuikit and OneAnker), images and fonts are recovered into a browsable UI atlas (`Start UI Atlas.cmd`), alongside rendered native layouts. The Compose app shell in the protected DEX is not covered.

