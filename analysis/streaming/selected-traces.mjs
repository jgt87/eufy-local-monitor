import fs from 'node:fs'; const root='analysis/streaming/';
for(const [mod,ids] of [['RN_ANDROID_zx-rnsdk',[13552,13564,13566]],['RN_ANDROID_SEC_ADDDEVICE',[7115,1161,1164]],['RN_ANDROID_SEC_SETTING',[7789]]]){
 const t=JSON.parse(fs.readFileSync(root+mod+'.hbc.traces.json'));for(const f of t.matchedFunctions.filter(f=>ids.includes(f.id)))console.log(JSON.stringify(f));
}
const t=JSON.parse(fs.readFileSync(root+'RN_ANDROID_zx-rnsdk.hbc.traces.json'));
for(const f of t.matchedFunctions)for(let i=0;i<f.instructions.length;i++)if(/^(APP_CMD_(HB3_RTSP_ENABLE.*|P2P_DISCONNECT|GET_P2P_CONN_STATUS|STREAM_MSG)|APP_IPC_HB_RTSP.*)$/.test(f.instructions[i].string??''))console.log(JSON.stringify({function:f.id,window:f.instructions.slice(Math.max(0,i-2),i+4)}));
