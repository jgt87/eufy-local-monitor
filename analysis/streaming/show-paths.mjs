import fs from 'node:fs';const root='analysis/streaming/';
for(const mod of ['RN_ANDROID_zx-rnsdk','RN_ANDROID_SEC_SETTING','RN_ANDROID_SEC_ADDDEVICE','RN_ANDROID_ZX_T8030']){
 const t=JSON.parse(fs.readFileSync(root+mod+'.hbc.traces.json'));
 console.log('\nMODULE '+mod);
 for(const f of t.matchedFunctions){const ss=f.instructions.filter(i=>i.string).map(i=>i.string);if(ss.some(s=>/^(connectDevice|isP2PConnected|openLiveStream|startLive|addP2PConnectListener|APP_CMD_HB3_RTSP_ENABLE|APP_IPC_HB_RTSP_SUPPORT|APP_IPC_HB_RTSP_TEST)$/.test(s))&&f.size<4000)console.log(JSON.stringify({id:f.id,offset:f.offset,size:f.size,strings:ss}));}
 if(mod==='RN_ANDROID_zx-rnsdk')for(const f of t.matchedFunctions.filter(f=>f.id>=13552))console.log(JSON.stringify(f));
}
