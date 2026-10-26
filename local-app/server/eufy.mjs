import { EVENT_LABELS, deviceKey } from './events.mjs';
import { describeSettings } from './settings.mjs';
import { redactString } from './diagnostics.mjs';

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
  constructor({loadSdk = () => import('@mega-yfue/eufy-sdk'), onChange = () => {}, diag = {log() {}}, events = null, alerts = null, history = null, saved = null, thumbnailDelayMs = 4000, sampleMs = 900000} = {}) {
    this.loadSdk = loadSdk; this.onChange = onChange; this.diag = diag; this.events = events; this.alerts = alerts; this.history = history; this.saved = saved; this.thumbnailDelayMs = thumbnailDelayMs; this.sampleMs = sampleMs;
    this.status = 'signed-out'; this.devices = []; this.client = null; this.busy = false; this.challenge = null; this.remember = false; this.values = new Map(); this.sampler = null;
    this.ownerGated = false; this.userId = null; this.lastErrorAt = 0; this.lastErrorText = '';
  }
  async available() { try { await this.loadSdk(); return true; } catch { return false; } }
  // A background SDK error. A P2P connect timeout is usually a camera that is offline or asleep, not an
  // account problem, so name the device by model and do not suggest refreshing the list (which won't help).
  // Non-essential cloud endpoints (app-store review nags, push/feedback/log reporting) fail harmlessly and
  // are kept out of the activity list — the full detail is still in the diagnostics log. Repeats within a
  // minute are dropped so one noisy source can't flood the list.
  reportClientError(e) {
    const raw = typeof e?.message==='string' ? e.message : '';
    if(/\/(review|feedback)\/|app_push_check|upload_log|event_report|collect_|\/log\//i.test(raw)) return;
    let text;
    if(/P2P connect timeout|StationUnreachable|relay/i.test(raw)) {
      const model = raw.match(/\bT(8[0-9A-Z]{3})/)?.[0];
      text = `A camera could not be reached${model?` (${model})`:''}. It may be offline or asleep.`;
    } else {
      text = `Eufy reported a connection error: ${redactString(raw).slice(0,120) || 'unknown'}.`;
    }
    const now = Date.now();
    if(text===this.lastErrorText && now-this.lastErrorAt < 60000) return;
    this.lastErrorText=text; this.lastErrorAt=now; this.onChange(text);
  }
  snapshot() { return {status:this.status, devices:this.devices, challenge:this.challenge, remembered:this.remember && this.status==='connected', ownerGated:this.ownerGated}; }
  // Restore a saved session at startup without a password. Returns false when there is nothing usable,
  // so no sign-in with an empty password is ever sent.
  async resume() {
    const remembered=this.saved?.remembered();
    if(!remembered || this.client || this.busy) return false;
    let sdk; try { sdk=await this.loadSdk(); } catch { return false; }
    if(typeof sdk.isSessionValid==='function' && !sdk.isSessionValid(this.saved.session.load())) { this.onChange('The saved sign-in has expired. Sign in again.'); this.saved.forget(); return false; }
    // A rejected session is forgotten; a network failure keeps it so a later attempt can succeed.
    try { await this.login({...remembered,password:'',remember:true,resuming:true}); return this.status==='connected'; }
    catch(e) { if(/needs a new password/.test(e.message)) this.saved.forget(); return false; }
  }
  async login({email,password,countryCode,remember=false,resuming=false}) {
    if(this.busy) throw new Error('A sign-in is already in progress.');
    if(!email || (!password && !resuming) || !/^[A-Z]{2}$/.test(countryCode)) throw new Error('Enter your email, password and a two-letter country code.');
    if(this.client) throw new Error('Sign out before starting another sign-in.');
    this.busy=true;
    try {
      let sdk;
      try { sdk=await this.loadSdk(); } catch { throw new Error('The Eufy SDK is missing. Run npm.cmd install in the local-app folder, then restart the app.'); }
      this.sdk=sdk;
      this.remember=!!(remember && this.saved);
      if(this.saved && !resuming) this.saved.forget();
      const stores=this.remember?{store:this.saved.session,pushStore:this.saved.push}:{};
      this.client=new sdk.EufyMega({email,password,countryCode,...stores,...(this.diag.logger?{logger:this.diag.logger}:{})});
      this.client.on('error', e => {this.diag.log('sdk:event','client error',e);this.reportClientError(e);});
      this.client.on('event', e => void this.record(e).catch(err => this.diag.log('events','record failed',err)));
      this.client.on('sessionExpired', () => {this.status='expired';this.onChange('Session expired. Sign out and sign in again.');});
      this.diag.log('account','sign-in requested',{remember:this.remember,resuming});
      this.status='signing-in'; this.onChange(resuming?'Restoring the saved sign-in.':'Signing in to Eufy.');
      const result=await this.client.login();
      if(resuming && result.status!==sdk.LoginStatus.Ok) throw new Error('The saved sign-in needs a new password or verification.');
      if(this.remember) this.saved.remember({email,countryCode});
      return await this.accept(result);
    } catch(e) {
      this.diag.log('account','sign-in failed',e);
      if(this.status==='connected')throw e;
      this.status='error';this.challenge=null;
      const old=this.client;this.client=null;
      try{await old?.disconnect();}catch{}
      if(resuming){this.status='signed-out';this.onChange('The saved sign-in could not be restored. Sign in again.');throw e;}
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
    try { this.userId=this.client.auth?.userId ?? this.userId; } catch { /* auth not exposed */ }
    const records=await this.client.getDevices();
    // Shared (member) accounts cannot change per-device settings; eufy refuses with code 20004. Detect it
    // up front when the device records name an owner other than this account, so the page starts read-only.
    try {
      if(this.userId && records.some(r=>{const a=r?.raw?.member?.admin_user_id;return typeof a==='string' && a && a!==this.userId;})) this.ownerGated=true;
    } catch { /* member field absent; fall back to the first refused write */ }
    this.devices=await Promise.all(records.map(async r=>{
      const d=await this.client.getDevice(r.sn); const cam=d.camera?.();
      const info={sn:r.sn,key:deviceKey(r.sn),name:r.name || r.sn,model:String(r.model || r.productCode || r.product_code || ''),codec:d.codec || '',capabilities:Array.isArray(d.capabilities)?d.capabilities:[],canLive:typeof cam?.openReadable==='function',stationSn:r.stationSn && r.stationSn!==r.sn?r.stationSn:null};
      this.diag.log('account','device',{model:info.model,codec:info.codec,canLive:info.canLive,homeBase:!!info.stationSn,capabilities:info.capabilities,recordKeys:Object.keys(r),deviceType:r.deviceType ?? r.device_type,channel:r.channel ?? r.raw?.device_channel ?? null,parentDiffers:!!(r.raw?.parent_sn && r.raw.parent_sn!==r.sn),stationDiffers:!!(r.raw?.station_sn && r.raw.station_sn!==r.sn)});
      return info;
    }));
    await this.sampleAll();
    if(this.history && !this.sampler){this.sampler=setInterval(()=>void this.sampleAll(),this.sampleMs);this.sampler.unref?.();}
    return this.devices;
  }
  // Battery and signal readings for the history chart, from the SDK's cached property values.
  async sampleAll() {
    if(!this.history || !this.client) return;
    for(const d of this.devices) {
      try { const values=(await this.client.getDevice(d.sn)).getProperties?.() || {}; this.values.set(d.sn,values); await this.history.sample(d.key,values); }
      catch(e) { this.diag.log('history','sample failed',e); }
    }
  }
  async sampleChange(e) {
    const device=this.devices.find(d=>d.sn===e.deviceSn);
    if(!this.history || !device || !['battery','wifiRssi','rssi'].includes(e.property)) return;
    const values={...this.values.get(device.sn),[e.property]:e.value};this.values.set(device.sn,values);
    await this.history.sample(device.key,values);
  }
  async setSetting(sn,name,value) {
    if(this.status!=='connected' || !this.devices.some(d=>d.sn===sn)) throw new Error('Select a device on this account.');
    const row=describeSettings(await this.client.getDevice(sn)).groups.flatMap(g=>g.rows).find(r=>r.name===name);
    if(!row?.control) throw new Error('This setting cannot be changed here.');
    const ok=row.control.type==='switch'?typeof value==='boolean':row.control.options.some(([v])=>v===value);
    if(!ok) throw new Error('Choose one of the offered values.');
    const device=this.devices.find(d=>d.sn===sn);
    this.diag.log('settings','write',{model:device.model,name,value});
    try { await this.client.setProperty(sn,name,value); }
    catch(e){ if(/only the owner|20004/i.test(String(e?.message))){ this.ownerGated=true; throw new Error('Only the owner of this device can change its settings.'); } throw e; }
    const shown=row.control.type==='switch'?(value?'On':'Off'):row.control.options.find(([v])=>v===value)[1];
    this.onChange(`${row.label} set to ${shown} on ${device.name}.`);
    return {name,value,label:row.label,shown};
  }
  async openVideo(sn) {
    if(this.status!=='connected') throw new Error('Sign in before opening a camera.');
    if(!this.devices.some(d=>d.sn===sn && d.canLive)) throw new Error('This device does not expose live video through the SDK.');
    const d=await this.client.getDevice(sn); const camera=d.camera?.();
    if(!camera?.openReadable) throw new Error('Live viewing is not available for this device.');
    this.diag.log('media','openReadable start',{model:this.devices.find(x=>x.sn===sn)?.model});
    const started=Date.now();
    let input;
    try{input=await camera.openReadable(await this.liveOptions(sn));}catch(e){this.diag.log('media','openReadable failed',{ms:Date.now()-started,error:e});throw e;}
    this.diag.log('media','openReadable returned',{ms:Date.now()-started,ok:!!input});
    if(!input) throw new Error('The camera did not open a media stream.');
    return input;
  }
  // Options for the SDK's live pull. On a battery camera the SDK ends the pull 45 s (+10 s grace) after the
  // first keyframe unless the budget is raised; the page allows five minutes. With EUFY_LIVE_ECC=1 it also
  // looks up the ECC private key of the cipher the P2P session negotiated, so the SDK can decode E2E frames
  // (ECIES envelope + AES-GCM), which it otherwise drops. The key only reaches the SDK's fallback decoder.
  // The T8214 (behind a HomeBase 3) and a T8400 send RSA-wrapped frames (signCode 1) and do not need it.
  // This reads SDK internals (p2p router, session cipher id) and degrades to the plain options when absent.
  async liveOptions(sn) {
    const opts={batteryBudgetMs:5*60*1000};
    if(process.env.EUFY_LIVE_ECC!=='1') return opts;
    try {
      const router=this.client?.p2p;
      if(typeof router?.resolveSession!=='function' || typeof router?.cipherKeysFor!=='function') {this.diag.log('media','ecc lookup: SDK internals not found');return opts;}
      const {session,parentSn,accountId}=await router.resolveSession(sn,{waitLevel2:'settle'});
      const cipherId=session?.gatewayCipherId;
      if(!Number.isInteger(cipherId) || cipherId===0) {this.diag.log('media','ecc lookup: no cipher on session',{cipherId:cipherId ?? null});return opts;}
      const keys=await router.cipherKeysFor(session,cipherId,accountId,parentSn);
      const ecc=typeof keys?.ecc==='string' && /^[0-9a-f]{64}$/i.test(keys.ecc) ? Buffer.from(keys.ecc,'hex') : null;
      this.diag.log('media','ecc lookup',{cipherId,found:!!ecc});
      if(ecc) opts.eccPrivateKey=ecc;
    } catch(e) { this.diag.log('media','ecc lookup failed',e); }
    return opts;
  }
  // A semantic event from push or P2P. Only detections are kept; the push thumbnail is read from the
  // SDK's retained snapshot a few seconds later, because it is fetched after the event itself arrives.
  async record(e) {
    if(e?.eventName==='propertyChanged') { await this.sampleChange(e); return null; }
    if(!this.events || !EVENT_LABELS[e?.eventName]) return null;
    const device=this.devices.find(d=>d.sn===e.deviceSn) || this.devices.find(d=>d.sn===e.stationSn) || {};
    const event=await this.events.add({kind:e.eventName,device});
    this.diag.log('events','event',{kind:e.eventName,model:device.model,eventType:e.eventType,thumbnail:!!e.thumbnailUrl});
    this.onChange(`${event.label}: ${event.deviceName}.`);
    if(this.alerts) void this.alerts.notify(event).catch(err=>this.diag.log('alerts','notify failed',err));
    if(device.sn) setTimeout(()=>void this.fetchThumbnail(device.sn,event.id),this.thumbnailDelayMs).unref?.();
    return event;
  }
  async fetchThumbnail(sn,id) {
    try {
      const shot=(await this.client?.getDevice(sn))?.camera?.()?.snapshotStored;
      if(typeof shot!=='function') return false;
      const jpeg=await shot();
      return Buffer.isBuffer(jpeg) ? await this.events.attach(id,jpeg) : false;
    } catch(e) { this.diag.log('events','thumbnail failed',e); return false; }
  }
  async latestPicture(sn) {
    if(this.status!=='connected' || !this.devices.some(d=>d.sn===sn)) throw new Error('Select a device on this account.');
    const shot=(await this.client.getDevice(sn)).camera?.()?.snapshotStored;
    if(typeof shot!=='function') return null;
    try { const jpeg=await shot(); return Buffer.isBuffer(jpeg) && jpeg.length ? jpeg : null; } catch(e) { this.diag.log('events','stored picture failed',e); return null; }
  }
  async settings(sn) {
    if(this.status!=='connected' || !this.devices.some(d=>d.sn===sn)) throw new Error('Select a device on this account.');
    const result=describeSettings(await this.client.getDevice(sn));
    result.ownerGated=this.ownerGated;
    this.diag.log('settings','read',{model:this.devices.find(d=>d.sn===sn)?.model,reported:result.reported,capabilities:result.capabilities,ownerGated:this.ownerGated});
    return result;
  }
  // forget: the user signed out, so the saved sign-in goes too. A shutdown keeps it.
  async disconnect({forget=false}={}) {
    if(this.busy) throw new Error('Wait for the current sign-in or verification request to finish.');
    if(forget){this.saved?.forget();this.remember=false;}
    clearInterval(this.sampler);this.sampler=null;this.values.clear();
    const old=this.client; this.client=null;this.status='signed-out';this.devices=[];this.challenge=null;
    if(old) await old.disconnect();
    this.onChange('Signed out.');
  }
}
