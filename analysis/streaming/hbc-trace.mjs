import fs from 'node:fs';
import path from 'node:path';
const dir=path.resolve('analysis/streaming');
const src=fs.readFileSync(path.join(dir,'BytecodeList.def'),'utf8').split('#ifdef HERMES_RUN_WASM')[0];
const ops=[],strArgs=new Map(),funcArgs=new Map();
for(const line of src.split(/\r?\n/)){
 let m=line.match(/^DEFINE_OPCODE_\d\(([^,)]+)(?:,\s*(.*))?\)/);if(m)ops.push({name:m[1],types:m[2]?m[2].split(/,\s*/):[]});
 m=line.match(/^DEFINE_JUMP_(\d)\((\w+)\)/);if(m){const rest=Array(+m[1]-1).fill('Reg8');ops.push({name:m[2],types:['Addr8',...rest]},{name:m[2]+'Long',types:['Addr32',...rest]});}
 m=line.match(/^OPERAND_(STRING|FUNCTION)_ID\((\w+),\s*(\d)\)/);if(m)(m[1]==='STRING'?strArgs:funcArgs).set(m[2],+m[3]-1);
}
const sizes={Reg8:1,Reg32:4,UInt8:1,UInt16:2,UInt32:4,Addr8:1,Addr32:4,Imm32:4,Double:8};
const target=/^(connectDevice|isP2PConnected|addP2PConnectListener|cancelP2PConnectListener|p2pSendRequestWithCmd|p2pSendRequestWithPayload|p2pSendRequestWithCustomCmd|openLiveStream|startLive|p2p_didCompleteNetworkResponse|APP_CMD_(?:.*RTSP.*|.*STREAM.*|.*P2P.*)|APP_IPC_HB_RTSP.*|station_sn|stationSn|p2p_did.*)$/;
for(const file of fs.readdirSync(dir).filter(x=>x.endsWith('.hbc'))){
 const b=fs.readFileSync(path.join(dir,file)),table=JSON.parse(fs.readFileSync(path.join(dir,file+'.table.json'),'utf8')),strings=table.strings.map(s=>s.text);
 const functions=[],hits=[],errors=[];
 for(let i=0;i<table.functionCount;i++){
  const h=128+i*16,w0=b.readUInt32LE(h),w1=b.readUInt32LE(h+4),w2=b.readUInt32LE(h+8),flag=b[h+15];
  let offset=w0&0x1ffffff,size=w1&0x7fff,name=w1>>>15,frame=w2>>>25;
  if(flag&32){const large=((w2&0x1ffffff)<<16)|(offset&65535);if(large<0||large+32>b.length){errors.push({i,reason:'large header bounds'});continue;}offset=b.readUInt32LE(large);size=b.readUInt32LE(large+8);name=b.readUInt32LE(large+12);frame=b.readUInt32LE(large+20);}
  const fn={id:i,name:strings[name],offset,size,frame};functions.push(fn);
  if(offset+size>b.length){errors.push({i,reason:'function bounds'});continue;}
  const instructions=[];let matched=target.test(fn.name??'');
  try{for(let p=offset;p<offset+size;){const at=p,op=ops[b[p++]];if(!op)throw Error('unknown opcode at '+at);const args=[];for(const type of op.types){const n=sizes[type];if(p+n>offset+size)throw Error('operand bounds');let v=type==='Double'?b.readDoubleLE(p):type==='Addr8'?b.readInt8(p):type==='Addr32'||type==='Imm32'?b.readInt32LE(p):b.readUIntLE(p,n);args.push(v);p+=n;}
   const sidx=strArgs.get(op.name),fidx=funcArgs.get(op.name);const inst={offset:at,op:op.name,args};if(sidx!==undefined){if(args[sidx]>=strings.length)throw Error('string id out of range');inst.stringId=args[sidx];inst.string=strings[args[sidx]];if(target.test(inst.string))matched=true;}if(fidx!==undefined)inst.functionId=args[fidx];instructions.push(inst);
  }}catch(e){errors.push({i,reason:e.message});continue;}
  if(matched)hits.push({...fn,instructions});
 }
 fs.writeFileSync(path.join(dir,file+'.functions.json'),JSON.stringify(functions,null,2));
 fs.writeFileSync(path.join(dir,file+'.traces.json'),JSON.stringify({file,opcodeCount:ops.length,totalFunctions:table.functionCount,decodeErrors:errors,matchedFunctions:hits},null,2));
 console.log(JSON.stringify({file,opcodes:ops.length,total:table.functionCount,errors:errors.length,matches:hits.length,firstErrors:errors.slice(0,2)}));
}
