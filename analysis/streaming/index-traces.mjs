import fs from 'node:fs';const root='analysis/streaming/';
for(const mod of ['RN_ANDROID_zx-rnsdk','RN_ANDROID_SEC_SETTING','RN_ANDROID_SEC_ADDDEVICE','RN_ANDROID_ZX_T8030']){
 const t=JSON.parse(fs.readFileSync(root+mod+'.hbc.traces.json'));
 const lines=t.matchedFunctions.map(f=>({id:f.id,name:f.name,offset:f.offset,size:f.size,strings:f.instructions.filter(i=>i.string!==undefined).map(i=>i.string)}));
 fs.writeFileSync(root+mod+'.trace-index.json',JSON.stringify(lines,null,2));
 if(mod==='RN_ANDROID_zx-rnsdk')for(const f of t.matchedFunctions.filter(f=>f.id<5382))console.log(JSON.stringify(f));
}
