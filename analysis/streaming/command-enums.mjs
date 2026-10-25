import fs from 'node:fs';const root='analysis/streaming/';
const result=[];
for(const mod of ['RN_ANDROID_zx-rnsdk','RN_ANDROID_SEC_SETTING','RN_ANDROID_SEC_ADDDEVICE','RN_ANDROID_ZX_T8030','RN_ANDROID_ZX_GLOBAL','RN_ANDROID_MEGA_PLAYER']){
 const t=JSON.parse(fs.readFileSync(root+mod+'.hbc.traces.json'));
 for(const f of t.matchedFunctions){const ins=f.instructions;for(let j=1;j<ins.length;j++){const i=ins[j],prev=ins[j-1];if(i.op==='PutById'&&/^(APP_CMD_.*(STREAM|P2P|RTSP).*|APP_IPC_HB_RTSP.*|APP_IPC_HB_GET_BIND_INFO)$/.test(i.string??'')&&/^LoadConst(Int|UInt8|Zero)$/.test(prev.op)&&prev.args[0]===i.args[1])result.push({module:mod,function:f.id,offset:i.offset,command:i.string,value:prev.op==='LoadConstZero'?0:prev.args[1]});}}
 if(mod!=='RN_ANDROID_zx-rnsdk')for(const f of t.matchedFunctions){const ss=f.instructions.filter(i=>i.string).map(i=>i.string);if(f.size<5000&&ss.some(s=>/RTSP|rtsp/.test(s)))console.log(JSON.stringify({module:mod,id:f.id,size:f.size,strings:ss}));}
}
fs.writeFileSync(root+'command-enums.json',JSON.stringify(result,null,2));
console.log(JSON.stringify(result.filter(r=>r.module==='RN_ANDROID_zx-rnsdk'),null,2));

