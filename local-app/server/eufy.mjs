export function accountFailure(error,stage='sign-in') {
  const message=typeof error?.message==='string'?error.message:'';
  if(['EACCES','EPERM'].includes(error?.cause?.code))return `Eufy ${stage} failed: this server process is denied network access. Close it and run Start Monitor.cmd directly from Windows. If it persists, check firewall permissions for Node.js.`;
  const exchange=message.match(/^key\/exchange failed \((\d{3})\/(\d+)\)/);
  if(exchange)return `Eufy ${stage} failed during secure key exchange. HTTP ${exchange[1]}. Eufy code ${exchange[2]}.`;
  if(message.startsWith('login returned no session:'))return `Eufy ${stage} failed: the cloud response contained no authenticated session.`;
  if(/fetch failed|network|timed? ?out/i.test(message) || error?.cause?.code)return `Eufy ${stage} failed: a network or TLS connection could not be established. Check internet access, DNS, firewall and the system clock.`;
  if(error instanceof TypeError)return `Eufy ${stage} failed inside the SDK (TypeError). This does not confirm a credential rejection.`;
  if(error instanceof SyntaxError)return `Eufy ${stage} failed: the SDK could not parse the cloud response.`;
  const code=Number.isSafeInteger(error?.code)?` Eufy code ${error.code}.`:'';
  const status=Number.isSafeInteger(error?.status)?` HTTP ${error.status}.`:'';
  const network=error?.cause?.code || error?.code;
  const hint=['ENOTFOUND','EAI_AGAIN','ECONNREFUSED','ETIMEDOUT','UND_ERR_CONNECT_TIMEOUT'].includes(network)?' Check your internet connection, DNS and firewall.':' Check your account country and credentials.';
  return `Eufy ${stage} failed.${code}${status}${hint}`;
}

export class EufyAccount {
  constructor({loadSdk = () => import('@mega-yfue/eufy-sdk'), onChange = () => {}, diag = {log() {}}} = {}) {
    this.loadSdk = loadSdk; this.onChange = onChange; this.diag = diag; this.status = 'signed-out'; this.devices = []; this.client = null; this.busy = false; this.challenge = null;
  }
  async available() { try { await this.loadSdk(); return true; } catch { return false; } }
  snapshot() { return {status:this.status, devices:this.devices, challenge:this.challenge}; }
  async login({email,password,countryCode}) {
    if(this.busy) throw new Error('A sign-in is already in progress.');
    if(!email || !password || !/^[A-Z]{2}$/.test(countryCode)) throw new Error('Enter your email, password and a two-letter country code.');
    if(this.client) throw new Error('Sign out before starting another sign-in.');
    this.busy=true;
    try {
      let sdk;
      try { sdk=await this.loadSdk(); } catch { throw new Error('The Eufy SDK is missing. Run npm.cmd install in the local-app folder, then restart the app.'); }
      this.sdk=sdk;
      this.client=new sdk.EufyMega({email,password,countryCode,...(this.diag.logger?{logger:this.diag.logger}:{})});
      this.client.on('error', e => {this.diag.log('sdk:event','client error',e);this.onChange('Eufy reported a connection error. Try refreshing the device list.');});
      this.client.on('sessionExpired', () => {this.status='expired';this.onChange('Session expired. Sign out and sign in again.');});
      this.status='signing-in'; this.onChange('Signing in to Eufy.');
      return await this.accept(await this.client.login());
    } catch(e) {
      this.diag.log('account','sign-in failed',e);
      if(this.status==='connected')throw e;
      this.status='error';this.challenge=null;
      const old=this.client;this.client=null;
      try{await old?.disconnect();}catch{}
      const message=/^(The Eufy SDK is missing|Eufy rejected)/.test(e.message)?e.message:accountFailure(e);
      this.onChange(message);throw new Error(message);
    } finally { this.busy=false; }
  }
  async answer(answer) {
    if(!this.client || !['captcha','two-factor'].includes(this.status)) throw new Error('There is no pending verification step.');
    if(this.busy) throw new Error('Verification is already in progress.');
    if(!answer?.trim()) throw new Error('Enter the verification answer.');
    this.busy=true;
    try { return await this.accept(await (this.status==='captcha' ? this.client.solveCaptcha(answer) : this.client.submitVerifyCode(answer))); }
    finally {this.busy=false;}
  }
  async accept(result) {
    const {LoginStatus}=this.sdk;
    if(result.status===LoginStatus.Ok) {
      this.status='connected';this.challenge=null;
      try{await this.refresh();this.onChange('Signed in. Device list loaded.');}
      catch(e){const message=accountFailure(e,'device discovery');this.onChange(message);throw new Error(`Signed in successfully. ${message} Use Refresh devices to try loading your cameras again.`);}
    } else if(result.status===LoginStatus.Captcha) {
      this.status='captcha';this.challenge={kind:'captcha',image:typeof result.image==='string' && /^data:image\/(png|jpeg);base64,/.test(result.image) ? result.image : null};
      this.onChange('Eufy requires a captcha answer.');
    } else if(result.status===LoginStatus.TwoFactor) {
      this.status='two-factor';this.challenge={kind:'two-factor',method:typeof result.method==='string'?result.method:'verification code'};this.onChange('Eufy requires a verification code.');
    } else {this.status='error';throw new Error('Eufy rejected the sign-in. Check your credentials and country; avoid repeated retries.');}
    return this.snapshot();
  }
  async refresh() {
    if(!this.client || this.status!=='connected') throw new Error('Sign in to load your devices.');
    const records=await this.client.getDevices();
    this.devices=await Promise.all(records.map(async r=>{
      const d=await this.client.getDevice(r.sn); const cam=d.camera?.();
      const info={sn:r.sn,name:r.name || r.sn,model:String(r.model || r.productCode || r.product_code || ''),codec:d.codec || '',capabilities:Array.isArray(d.capabilities)?d.capabilities:[],canLive:typeof cam?.openReadable==='function',stationSn:r.stationSn && r.stationSn!==r.sn?r.stationSn:null};
      this.diag.log('account','device',{model:info.model,codec:info.codec,canLive:info.canLive,homeBase:!!info.stationSn,capabilities:info.capabilities,recordKeys:Object.keys(r),deviceType:r.deviceType ?? r.device_type});
      return info;
    }));
    return this.devices;
  }
  async openVideo(sn) {
    if(this.status!=='connected') throw new Error('Sign in before opening a camera.');
    if(!this.devices.some(d=>d.sn===sn && d.canLive)) throw new Error('This device does not expose live video through the SDK.');
    const d=await this.client.getDevice(sn); const camera=d.camera?.();
    if(!camera?.openReadable) throw new Error('Live viewing is not available for this device.');
    this.diag.log('media','openReadable start',{model:this.devices.find(x=>x.sn===sn)?.model});
    const started=Date.now();
    let input;
    try{input=await camera.openReadable();}catch(e){this.diag.log('media','openReadable failed',{ms:Date.now()-started,error:e});throw e;}
    this.diag.log('media','openReadable returned',{ms:Date.now()-started,ok:!!input});
    if(!input) throw new Error('The camera did not open a media stream.');
    return input;
  }
  async disconnect() {
    if(this.busy) throw new Error('Wait for the current sign-in or verification request to finish.');
    const old=this.client; this.client=null;this.status='signed-out';this.devices=[];this.challenge=null;
    if(old) await old.disconnect();
    this.onChange('Signed out.');
  }
}
