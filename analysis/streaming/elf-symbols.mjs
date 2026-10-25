import fs from 'node:fs';
import path from 'node:path';
const dir=path.resolve('analysis/streaming');
for(const file of fs.readdirSync(dir).filter(x=>x.endsWith('.so'))){
 const b=fs.readFileSync(path.join(dir,file));if(b.readUInt32LE(0)!==0x464c457f||b[4]!==2||b[5]!==1)throw Error('ELF64 LE required');
 const sh=Number(b.readBigUInt64LE(40)),size=b.readUInt16LE(58),count=b.readUInt16LE(60),namesIdx=b.readUInt16LE(62);
 const sec=[];for(let i=0;i<count;i++){const p=sh+i*size;sec.push({nameIndex:b.readUInt32LE(p),type:b.readUInt32LE(p+4),offset:Number(b.readBigUInt64LE(p+24)),size:Number(b.readBigUInt64LE(p+32)),link:b.readUInt32LE(p+40),entrySize:Number(b.readBigUInt64LE(p+56))});}
 const str=sec[namesIdx]; const cstr=(p)=>b.toString('utf8',p,b.indexOf(0,p));for(const s of sec)s.name=cstr(str.offset+s.nameIndex);
 const symbols=[];for(const s of sec.filter(s=>s.type===11||s.type===2)){const st=sec[s.link];for(let p=s.offset;p<s.offset+s.size;p+=s.entrySize){const name=cstr(st.offset+b.readUInt32LE(p));if(name)symbols.push({table:s.name,name,defined:b.readUInt16LE(p+6)!==0,value:'0x'+b.readBigUInt64LE(p+8).toString(16),size:Number(b.readBigUInt64LE(p+16))});}}
 fs.writeFileSync(path.join(dir,file+'.symbols.json'),JSON.stringify({file,machine:b.readUInt16LE(18),sections:sec,symbols},null,2));
 console.log(file,JSON.stringify(symbols.filter(s=>/eufy|Java_|PPCS|BIND_|ikcp/.test(s.name)).slice(0,70)));
}
