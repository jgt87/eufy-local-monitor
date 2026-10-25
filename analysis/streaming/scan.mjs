import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const root = path.resolve('analysis/streaming');
const relevant = /p2p|ppcs|station|homebase|rtsp|livestream|live_stream|startstream|stopstream|startlive|stoplive|connectdevice|connectstation|video.?stream|webrtc|rendezvous|relay|udp|tcp|iotc|tunnel|handshake|auth|camera|channel/i;
const index=[];
for (const file of fs.readdirSync(root).filter(x=>/\.(so|hbc)$/.test(x))) {
 const b=fs.readFileSync(path.join(root,file));
 const strings=[...b.toString('latin1').matchAll(/[\x20-\x7e]{5,}/g)].filter(m=>relevant.test(m[0])).map(m=>({offset:m.index,text:m[0]}));
 const info={file,sha256:crypto.createHash('sha256').update(b).digest('hex'),bytes:b.length,header:b.subarray(0,32).toString('hex'),matches:strings};
 if(file.endsWith('.hbc')) info.header_version_candidate=b.readUInt32LE(8);
 fs.writeFileSync(path.join(root,file+'.strings.json'),JSON.stringify(info,null,2));
 index.push({file,matches:strings.length,version:info.header_version_candidate});
}
console.log(JSON.stringify(index,null,2));
