import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describeVideoStart, redactString } from './diagnostics.mjs';

export function resolveFfmpeg() {
  if(process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  const winget=path.join(process.env.LOCALAPPDATA || '', 'Microsoft','WinGet','Packages');
  if(existsSync(winget)) for(const name of readdirSync(winget).filter(n=>n.startsWith('Gyan.FFmpeg_'))) {
    const root=path.join(winget,name);
    for(const version of readdirSync(root)) {const exe=path.join(root,version,'bin','ffmpeg.exe');if(existsSync(exe))return exe;}
  }
  return 'ffmpeg';
}
export const ffmpegPath=resolveFfmpeg();
export async function checkFfmpeg() {
  return new Promise(resolve=>{const child=spawn(ffmpegPath,['-version'],{windowsHide:true,stdio:'ignore'});child.once('error',()=>resolve(false));child.once('exit',code=>resolve(code===0));});
}
export function validateRtsp(value) {
  if(typeof value!=='string' || value.length>2048) throw new Error('Enter a valid RTSP URL.');
  let u;try{u=new URL(value);}catch{throw new Error('Enter a valid RTSP URL.');}
  if(u.protocol!=='rtsp:' || !u.hostname) throw new Error('The stream address must start with rtsp://.');
  if(/[\r\n\0]/.test(value)) throw new Error('Invalid stream address.');
  return value;
}
export class MediaSession {
  constructor({kind,sn,rtspUrl,openVideo,onChange=()=>{},diag={log(){}}}) {
    this.diag=diag;this.id=randomUUID();this.kind=kind;this.sn=sn;this.rtspUrl=rtspUrl;this.openVideo=openVideo;this.onChange=onChange;this.state='ready';this.startedAt=null;this.bytes=0;this.child=null;this.input=null;this.response=null;this.closed=false;this.error=null;this.claimed=false;
    this.idle=setTimeout(()=>this.stop(),30000);this.idle.unref();
  }
  info(){return {id:this.id,kind:this.kind,sn:this.sn,state:this.state,startedAt:this.startedAt,bytes:this.bytes,error:this.error};}
  fail(message,detail){this.diag.log('media',message,detail);this.error=message;this.state='error';this.onChange(message);if(this.response && !this.response.headersSent && !this.response.destroyed){this.response.writeHead(502,{'Content-Type':'application/json'});this.response.end(JSON.stringify({error:message}));}this.stop(true);}
  async serve(req,res) {
    if(this.claimed||this.closed)throw new Error('This stream has ended. Start a new live view.');
    this.claimed=true;clearTimeout(this.idle);this.response=res;this.state='connecting';this.startedAt=Date.now();
    const abort=()=>this.stop();res.once('close',abort);
    this.timeout=setTimeout(()=>this.fail('No video arrived within 45 seconds. Check the camera connection and try again.'),45000);this.timeout.unref();
    try {
      let args=['-hide_banner','-loglevel','error','-nostdin'];
      if(this.kind==='test')args.push('-re','-f','lavfi','-i','testsrc2=size=960x540:rate=15');
      else if(this.kind==='rtsp')args.push('-rtsp_transport','tcp','-rw_timeout','15000000','-i',validateRtsp(this.rtspUrl));
      else {this.input=await this.openVideo(this.sn);if(this.closed){this.input.destroy();return;}args.push('-probesize','1000000','-analyzeduration','1000000','-i','pipe:0');}
      args.push('-map','0:v:0','-an','-vf','scale=w=min(1280\\,iw):h=-2','-r','15','-c:v','libx264','-preset','ultrafast','-tune','zerolatency','-profile:v','baseline','-level:v','3.1','-pix_fmt','yuv420p','-g','15','-keyint_min','15','-sc_threshold','0','-movflags','frag_keyframe+empty_moov+default_base_moof','-frag_duration','500000','-f','mp4','pipe:1');
      this.child=spawn(ffmpegPath,args,{windowsHide:true,stdio:['pipe','pipe','pipe']});
      this.child.stdin.on('error',()=>{});
      // FFmpeg errors can contain RTSP credentials: never retain stderr for RTSP. Camera pipes carry none, so diagnostics keep it.
      this.child.stderr.on('data',chunk=>{if(this.kind==='eufy')this.diag.log('ffmpeg',redactString(chunk.toString('utf8')).trim());});
      this.child.once('error',()=>this.fail('FFmpeg could not start. Install FFmpeg or set FFMPEG_PATH.'));
      this.child.once('exit',code=>{this.diag.log('media','ffmpeg exited',{code,bytesOut:this.bytes,bytesIn:this.bytesIn||0});if(!this.closed){if(code!==0)this.fail('Video conversion ended. Check the source address or camera connection.');else this.stop();}});
      this.child.stdout.on('data',chunk=>{this.bytes+=chunk.length;if(this.state!=='streaming'){clearTimeout(this.timeout);this.state='streaming';this.onChange(this.kind==='test'?'Test signal is streaming.':'Video data is arriving.');}});
      res.writeHead(200,{'Content-Type':'video/mp4','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
      this.child.stdout.pipe(res);
      if(this.input){
        this.bytesIn=0;let first=true;
        this.input.on('data',chunk=>{this.bytesIn+=chunk.length;if(first){first=false;this.diag.log('media','first camera bytes',describeVideoStart(chunk));}});
        this.input.on('end',()=>this.diag.log('media','camera stream ended',{bytesIn:this.bytesIn}));
        this.input.on('error',e=>this.fail('The camera media connection ended. Stop and restart live view.',{error:e,bytesIn:this.bytesIn}));
        this.input.pipe(this.child.stdin);
      }
      this.lifetime=setTimeout(()=>{this.onChange('Live view stopped after five minutes. Start again to keep watching.');this.stop();},5*60*1000);this.lifetime.unref();
    }catch(e){this.fail('The camera could not open a live stream. Check device connectivity and SDK support.',{error:e});if(!res.headersSent){res.writeHead(502,{'Content-Type':'application/json'});res.end(JSON.stringify({error:this.error}));}}
  }
  stop(preserveError=false) {
    if(this.closed)return;this.closed=true;clearTimeout(this.idle);clearTimeout(this.timeout);clearTimeout(this.lifetime);
    this.input?.destroy();this.child?.kill();this.response?.end();this.rtspUrl=null;
    if(!preserveError)this.state='stopped';
  }
}
