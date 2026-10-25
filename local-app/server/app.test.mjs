import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { EufyAccount } from './eufy.mjs';
import { validateRtsp } from './media.mjs';
import { createAppServer } from './index.mjs';

const LoginStatus={Ok:'ok',Captcha:'captcha',TwoFactor:'two-factor'};
class FakeClient {
 constructor(options){this.options=options;this.events={};}
 on(name,fn){this.events[name]=fn;}
 async login(){return {status:LoginStatus.Captcha,image:'data:image/png;base64,AA=='};}
 async solveCaptcha(answer){assert.equal(answer,'abcd');return {status:LoginStatus.TwoFactor,method:'email'};}
 async submitVerifyCode(code){assert.equal(code,'123456');return {status:LoginStatus.Ok};}
 async getDevices(){return [{sn:'test-doorbell',name:'Fixture doorbell',productCode:'TEST'}];}
 async getDevice(){return {codec:'test',capabilities:['camera'],camera:()=>({openReadable:async()=>Readable.from([Buffer.from('fixture')])})};}
 async disconnect(){this.disconnected=true;}
}
const sdk={EufyMega:FakeClient,LoginStatus};
test('failed login reports only safe numeric diagnostics and permits retry',async()=>{
 let attempts=0;
 class Client extends FakeClient {
  async login(){if(++attempts===1)throw Object.assign(new Error('private token and password'),{code:12345,status:403});return {status:LoginStatus.Ok};}
 }
 const account=new EufyAccount({loadSdk:async()=>({...sdk,EufyMega:Client})});
 const credentials={email:'fixture@example.invalid',password:'fixture-secret',countryCode:'NL'};
 await assert.rejects(()=>account.login(credentials),e=>e.message.includes('12345')&&e.message.includes('403')&&!e.message.includes('private'));
 assert.equal(account.client,null);
 await account.login(credentials);assert.equal(account.status,'connected');
 assert.equal(account.client.options.openudid,undefined);
 await account.disconnect();
});
test('device discovery failure preserves successful authentication',async()=>{
 class Client extends FakeClient {
  async login(){return {status:LoginStatus.Ok};}
  async getDevices(){throw Object.assign(new Error('private response'),{status:503});}
 }
 const account=new EufyAccount({loadSdk:async()=>({...sdk,EufyMega:Client})});
 await assert.rejects(()=>account.login({email:'fixture@example.invalid',password:'fixture-secret',countryCode:'NL'}),/Signed in successfully.*503/);
 assert.equal(account.status,'connected');assert.ok(account.client);
 await account.disconnect();
});
test('manual captcha and verification flow discovers a camera, then clears account state',async()=>{
 const account=new EufyAccount({loadSdk:async()=>sdk});
 await account.login({email:'fixture@example.invalid',password:'fixture-secret',countryCode:'NL'});
 assert.equal(account.snapshot().status,'captcha');
 assert.ok(!JSON.stringify(account.snapshot()).includes('fixture-secret'));
 await account.answer('abcd');assert.equal(account.snapshot().status,'two-factor');
 await account.answer('123456');assert.equal(account.snapshot().status,'connected');
 assert.equal(account.devices[0].canLive,true);assert.equal(account.devices[0].model,'TEST');
 const input=await account.openVideo('test-doorbell');input.destroy();
 await assert.rejects(()=>account.openVideo('unknown'),/does not expose/);
 const client=account.client;await account.disconnect();assert.equal(client.disconnected,true);assert.deepEqual(account.devices,[]);
});
test('RTSP validation rejects non-media protocols and control characters',()=>{
 assert.equal(validateRtsp('rtsp://user:password@192.168.1.4/live'),'rtsp://user:password@192.168.1.4/live');
 for(const value of ['file:///secret','https://example.invalid','rtsp://host/live\n','not a url'])assert.throws(()=>validateRtsp(value));
});
async function withServer(options,fn){const server=await createAppServer(options);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;try{await fn(base);}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}}
test('local API rejects cross-origin writes and never exposes credentials',async()=>{
 const account=new EufyAccount({loadSdk:async()=>sdk});
 await withServer({account,ffmpegAvailable:true},async(base)=>{
  const state=await fetch(base+'/api/state').then(r=>r.json());
  assert.equal((await fetch(base+'/api/login',{method:'POST',body:'{}'})).status,403);
  assert.equal((await fetch(base+'/api/login',{method:'POST',headers:{Origin:'https://example.invalid','X-Monitor-Token':state.token},body:'{}'})).status,403);
  const res=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json','X-Monitor-Token':state.token},body:JSON.stringify({email:'fixture@example.invalid',password:'fixture-secret',countryCode:'NL'})});assert.equal(res.status,200);
  const response=await fetch(base+'/api/state').then(r=>r.text());assert.ok(!response.includes('fixture-secret'));assert.ok(!response.includes('fixture@example.invalid'));
  const evidence=await fetch(base+'/api/evidence').then(r=>r.json());assert.equal(evidence.commands.find(c=>c.command==='APP_CMD_HB3_RTSP_ENABLE').value,40003);
 });
});
test('actual FFmpeg test signal returns fragmented MP4 and stops cleanly', {timeout:30000},async()=>{
 await withServer({account:new EufyAccount({loadSdk:async()=>sdk})},async(base)=>{
  const state=await fetch(base+'/api/state').then(r=>r.json());assert.equal(state.tools.ffmpeg,true,'FFmpeg must be installed for the integration test');
  const headers={'Content-Type':'application/json','X-Monitor-Token':state.token};
  const stream=await fetch(base+'/api/streams',{method:'POST',headers,body:'{"kind":"test"}'}).then(r=>r.json());
  const abort=new AbortController();const response=await fetch(base+'/api/video/'+stream.id,{signal:abort.signal});assert.equal(response.status,200);
  const reader=response.body.getReader();let data=Buffer.alloc(0);while(data.length<20000){const chunk=await reader.read();assert.equal(chunk.done,false);data=Buffer.concat([data,Buffer.from(chunk.value)]);}
  assert.ok(data.includes(Buffer.from('ftyp')));assert.ok(data.includes(Buffer.from('moof')));assert.ok(data.includes(Buffer.from('mdat')));
  abort.abort();await fetch(base+'/api/streams/stop',{method:'POST',headers,body:'{}'});
  const end=await fetch(base+'/api/state').then(r=>r.json());assert.equal(end.stream.state,'stopped');assert.ok(end.stream.bytes>20000);
 });
});
