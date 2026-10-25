import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const dir=path.resolve('analysis/streaming');
for(const file of fs.readdirSync(dir).filter(x=>x.endsWith('.hbc'))){
 const b=fs.readFileSync(path.join(dir,file));
 if(b.readBigUInt64LE(0)!==0x1f1903c103bc1fc6n || b.readUInt32LE(8)!==96) throw Error('Unexpected HBC header');
 const functionCount=b.readUInt32LE(40),kindCount=b.readUInt32LE(44),identifierCount=b.readUInt32LE(48),stringCount=b.readUInt32LE(52),overflowCount=b.readUInt32LE(56),storageSize=b.readUInt32LE(60);
 const table=128+functionCount*16+kindCount*4+identifierCount*4;
 const overflow=table+stringCount*4, storage=overflow+overflowCount*8;
 if(storage+storageSize>b.length)throw Error('storage out of bounds');
 const strings=[];
 for(let i=0;i<stringCount;i++){
  const v=b.readUInt32LE(table+i*4),utf16=!!(v&1);let offset=(v>>>1)&0x7fffff,length=v>>>24;
  if(length===255){if(offset>=overflowCount)throw Error('overflow index');length=b.readUInt32LE(overflow+offset*8+4);offset=b.readUInt32LE(overflow+offset*8);}
  const size=length*(utf16?2:1);if(offset+size>storageSize)throw Error('string out of bounds');
  const text=b.subarray(storage+offset,storage+offset+size).toString(utf16?'utf16le':'utf8');
  strings.push({id:i,offset:storage+offset,text});
 }
 const hashOK=crypto.createHash('sha1').update(b.subarray(0,-20)).digest().equals(b.subarray(-20));
 const info={file,version:96,functionCount,stringCount,tableOffset:table,storageOffset:storage,storageSize,declaredLength:b.readUInt32LE(32),actualLength:b.length,footerSha1Matches:hashOK,strings};
 fs.writeFileSync(path.join(dir,file+'.table.json'),JSON.stringify(info,null,2));
 const hits=strings.filter(x=>/p2p|ppcs|rtsp|startliv|stopliv|connectstation|connectdevice|stream|homebase|station_sn|station_id|dsk|local_ip/i.test(x.text));
 fs.writeFileSync(path.join(dir,file+'.focused.json'),JSON.stringify(hits,null,2));
 console.log(JSON.stringify({file,functions:functionCount,strings:stringCount,footerSha1Matches:hashOK,hits:hits.length}));
}
