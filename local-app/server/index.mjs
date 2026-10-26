import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { EufyAccount } from './eufy.mjs';
import { MediaSession,checkFfmpeg,validateRtsp } from './media.mjs';
import { createDiagnostics } from './diagnostics.mjs';
import { EventLog } from './events.mjs';
import { Alerts } from './alerts.mjs';
import { HistoryLog } from './history.mjs';
import { SavedAccount } from './session.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export async function createAppServer({account:injectedAccount,mediaFactory=options=>new MediaSession(options),ffmpegAvailable,diagnostics=createDiagnostics(root),eventLog,alerts:injectedAlerts,history:injectedHistory,saved=new SavedAccount(path.join(root,'.runtime','account'))}={}) {
  const token=randomBytes(32).toString('hex');const logs=[];let session=null;const diag=diagnostics;
  const log=message=>{logs.unshift({time:new Date().toISOString(),message});logs.splice(50);diag.log('app',message);};
  let server;
  const alerts=injectedAlerts || new Alerts(path.join(root,'.runtime','alerts.json'),{diag,url:()=>`http://127.0.0.1:${server?.address()?.port || 4287}/#events`});
  const history=injectedHistory || new HistoryLog(path.join(root,'.runtime','history.json'));
  const account=injectedAccount || new EufyAccount({onChange:log,diag,alerts,history,saved,events:eventLog || new EventLog(path.join(root,'.runtime','events'))});
  const events=account.events || eventLog || new EventLog(path.join(root,'.runtime','events'));
  const ffmpeg=ffmpegAvailable ?? await checkFfmpeg();const sdk=await account.available();
  // APK evidence is optional: the capability file is vendor data that is regenerated locally, not shipped.
  const optionalJson=async file=>{try{return JSON.parse(await readFile(path.join(root,'..',file),'utf8'));}catch{return null;}};
  const commands=await optionalJson('analysis/streaming/command-enums.json') || [];
  const capabilities=await optionalJson('analysis/asset-evidence/hb_capability_config.json');
  log('Local monitor is ready. Sign in or run the test signal.');
  const send=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  const body=async req=>{let text='';for await(const chunk of req){text+=chunk;if(text.length>16384)throw new Error('Request too large.');}try{return JSON.parse(text || '{}');}catch{throw new Error('Invalid JSON.');}};
  server=http.createServer(async(req,res)=>{
    const host=req.headers.host || '';const port=server.address()?.port;
    if(![`127.0.0.1:${port}`,`localhost:${port}`].includes(host)){send(res,403,{error:'Use the local monitor address.'});return;}
    const origin=req.headers.origin;
    if(origin && ![`http://127.0.0.1:${port}`,`http://localhost:${port}`].includes(origin)){send(res,403,{error:'Cross-origin requests are not allowed.'});return;}
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Cross-Origin-Resource-Policy','same-origin');
    const url=new URL(req.url,'http://127.0.0.1');
    if(req.method==='POST' && req.headers['x-monitor-token']!==token){send(res,403,{error:'Refresh the page before trying again.'});return;}
    try {
      if(req.method==='GET' && url.pathname==='/api/state'){send(res,200,{token,account:account.snapshot(),tools:{ffmpeg,sdk,diagnostics:diag.enabled?path.basename(diag.file):null},stream:session?.info() || null,logs,latestEvent:events.latest(),eventCount:events.events.length,alerts:alerts.snapshot()});return;}
      if(req.method==='POST' && url.pathname==='/api/alerts'){const b=await body(req);send(res,200,await alerts.update({desktop:b.desktop,sound:b.sound,kinds:b.kinds}));return;}
      if(req.method==='POST' && url.pathname==='/api/alerts/test'){const shown=await alerts.notify({kind:'doorbellPress',label:'Test alert',deviceName:'eufy Local Monitor',time:new Date().toISOString()},{test:true});send(res,shown?200:503,shown?{ok:true}:{error:'Windows did not show the notification. Check that notifications are on for Windows PowerShell.'});return;}
      if(req.method==='GET' && url.pathname==='/api/history'){const key=url.searchParams.get('key') || '';if(!/^[0-9a-f]{12}$/.test(key)){send(res,400,{error:'Unknown device.'});return;}await history.ready;send(res,200,{samples:history.series(key)});return;}
      if(req.method==='POST' && url.pathname==='/api/settings/set'){const b=await body(req);try{send(res,200,await account.setSetting(String(b.sn || ''),String(b.name || ''),b.value));}catch(e){diag.log('settings','write failed',e);send(res,400,{error:/^(Select a device|This setting cannot|Choose one of)/.test(e.message)?e.message:/only the owner|20004/i.test(String(e?.message))?'Only the owner of this device can change its settings. Sign in with the owner’s account, or ask them to change it.':'The device did not accept the change. It may be asleep; try again after it wakes.'});}return;}
      if(req.method==='GET' && url.pathname==='/api/events'){await events.ready;send(res,200,{events:events.list()});return;}
      const pic=req.method==='GET' && url.pathname.match(/^\/api\/events\/([0-9a-z-]+)\.jpg$/);
      if(pic){const data=await events.image(pic[1]);if(!data){send(res,404,{error:'Picture not found.'});return;}res.writeHead(200,{'Content-Type':'image/jpeg','Cache-Control':'private, max-age=86400'});res.end(data);return;}
      if(req.method==='POST' && url.pathname==='/api/events/clear'){await events.clear();log('Event history cleared.');send(res,200,{ok:true});return;}
      if(req.method==='POST' && url.pathname==='/api/settings'){const b=await body(req);try{send(res,200,await account.settings(String(b.sn || '')));}catch(e){diag.log('settings','read failed',e);send(res,400,{error:/^Select a device/.test(e.message)?e.message:'Could not read this device’s settings.'});}return;}
      if(req.method==='POST' && url.pathname==='/api/picture'){const b=await body(req);let jpeg;try{jpeg=await account.latestPicture(String(b.sn || ''));}catch(e){send(res,400,{error:/^Select a device/.test(e.message)?e.message:'Could not read the stored picture.'});return;}if(!jpeg){send(res,404,{error:'No stored picture is available for this device yet.'});return;}send(res,200,{image:`data:image/jpeg;base64,${jpeg.toString('base64')}`});return;}
      if(req.method==='GET' && url.pathname==='/api/evidence'){send(res,200,{commands:commands.filter(c=>c.module==='RN_ANDROID_zx-rnsdk'),capabilities,apkVersion:'6.1.10_30612'});return;}
      if(req.method==='POST' && url.pathname==='/api/login'){
        const b=await body(req);try{await account.login({email:String(b.email || '').trim(),password:String(b.password || ''),countryCode:String(b.countryCode || 'NL').trim().toUpperCase(),remember:b.remember===true});}catch(e){const safe=/^(The Eufy SDK is missing|Enter your email|A sign-in|Sign out before|Eufy rejected|Eufy sign-in failed|Signed in successfully)/.test(e.message);send(res,400,{error:safe?e.message:'Eufy sign-in failed. Check your credentials and region, then sign out before retrying.'});return;}send(res,200,account.snapshot());return;
      }
      if(req.method==='POST' && url.pathname==='/api/challenge'){const b=await body(req);try{await account.answer(String(b.answer || ''));}catch{send(res,400,{error:'Verification failed. Check the answer and try again.'});return;}send(res,200,account.snapshot());return;}
      if(req.method==='POST' && url.pathname==='/api/refresh'){try{await account.refresh();}catch{send(res,502,{error:'Could not refresh devices. Check your Eufy connection or sign in again.'});return;}send(res,200,account.snapshot());return;}
      if(req.method==='POST' && url.pathname==='/api/logout'){session?.stop();await account.disconnect({forget:true});send(res,200,{ok:true});return;}
      if(req.method==='POST' && url.pathname==='/api/streams'){
        const b=await body(req);if(!ffmpeg){send(res,503,{error:'FFmpeg is unavailable. Install it or set FFMPEG_PATH, then restart.'});return;}
        if(!['test','rtsp','eufy'].includes(b.kind)){send(res,400,{error:'Choose an Eufy camera, RTSP input or test signal.'});return;}
        if(b.kind==='rtsp')validateRtsp(b.url);
        if(b.kind==='eufy' && !account.snapshot().devices.some(d=>d.sn===b.sn && d.canLive)){send(res,400,{error:'Select a device with live-view support.'});return;}
        session?.stop();session=mediaFactory({kind:b.kind,sn:b.sn,rtspUrl:b.url,openVideo:sn=>account.openVideo(sn),onChange:log,diag});
        log(b.kind==='test'?'Starting a synthetic test signal.':b.kind==='rtsp'?'Opening the supplied RTSP source.':'Opening the selected Eufy camera.');send(res,201,session.info());return;
      }
      if(req.method==='POST' && url.pathname==='/api/streams/stop'){session?.stop();log('Live view stopped.');send(res,200,{ok:true});return;}
      if(req.method==='GET' && url.pathname.startsWith('/api/video/')){if(!session || url.pathname!==`/api/video/${session.id}`){send(res,404,{error:'Stream not found.'});return;}await session.serve(req,res);return;}
      if(url.pathname.startsWith('/api/')){send(res,404,{error:'Not found.'});return;}
      if(req.method!=='GET'){send(res,405,{error:'Method not allowed.'});return;}
      const dist=path.join(root,'dist');const filename=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname).replace(/^\/+/, '');const target=path.resolve(dist,filename);
      if(!target.startsWith(dist+path.sep)){send(res,404,{error:'Not found.'});return;}
      let data;try{data=await readFile(target);}catch{send(res,404,{error:'Build files not found. Run npm.cmd run build.'});return;}
      const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.map':'application/json','.ttf':'font/ttf'};
      res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
      res.writeHead(200,{'Content-Type':types[path.extname(target)] || 'application/octet-stream','Cache-Control':'no-cache'});res.end(data);
    }catch(e){if(!res.headersSent)send(res,400,{error:/^(Enter a valid RTSP|The stream address|Invalid stream|Request too large|Invalid JSON|Wait for the current)/.test(e.message)?e.message:'The request could not be completed. Stop the stream and try again.'});else res.end();}
  });
  server.on('close',()=>{session?.stop();void account.disconnect().catch(()=>{});diag.close();});
  // A saved sign-in is restored at startup, retried while the network comes up (start at Windows login).
  server.resumeAccount=async({attempts=6,delayMs=30000}={})=>{
    for(let i=0;i<attempts;i++){
      if(!saved?.remembered() || account.status!=='signed-out') return account.status==='connected';
      if(await account.resume()) return true;
      await new Promise(r=>setTimeout(r,delayMs).unref?.());
    }
    return false;
  };
  return server;
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const server=await createAppServer();const port=Number(process.env.PORT || 4287);
  server.listen(port,'127.0.0.1',()=>{console.log(`Eufy Local Monitor: http://127.0.0.1:${port}`);if(process.env.EUFY_DIAG==='1')console.log(`Diagnostics on: see the .runtime folder (PID ${process.pid}).`);void server.resumeAccount();});
  server.on('error',error=>{const busy=error.code==='EADDRINUSE';console.error(busy?`Port ${port} is busy: another monitor is probably running. Close it, or set PORT.`:'Could not start the local monitor.');process.exitCode=1;});
  const shutdown=()=>{server.close();server.closeAllConnections();};process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
  // Started by the tray (tools/tray.ps1): stop when the tray process is gone, so no server is left behind.
  const parent=Number(process.env.MONITOR_PARENT_PID);if(parent)setInterval(()=>{try{process.kill(parent,0);}catch{shutdown();setTimeout(()=>process.exit(0),2000).unref();}},5000).unref();
}
