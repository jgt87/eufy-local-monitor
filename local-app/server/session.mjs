// "Keep me signed in": the SDK's session token, push credentials and the account email + country are
// stored in .runtime/account/, encrypted with a key that Windows DPAPI protects for the current user.
// The password is never stored. Stores are synchronous because the SDK's SessionStore/FcmStore contracts are.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const dpapi = mode => data => {
  const script = `Add-Type -AssemblyName System.Security; $b=[Convert]::FromBase64String([Console]::In.ReadToEnd().Trim()); [Console]::Out.Write([Convert]::ToBase64String([Security.Cryptography.ProtectedData]::${mode}($b,$null,'CurrentUser')))`;
  return Buffer.from(execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { input: data.toString('base64'), windowsHide: true, timeout: 20000 }).toString().trim(), 'base64');
};
export const windowsProtection = { protect: dpapi('Protect'), unprotect: dpapi('Unprotect') };
// Elsewhere (CI, tests) files are plain JSON with owner-only permissions.
export const noProtection = { protect: b => b, unprotect: b => b };

// A DPAPI call takes about a second and the push store saves on every notification, so DPAPI protects
// one random AES key (key.dat) and the stores are AES-256-GCM sealed with it in-process.
export function keyedProtection(keyFile, wrap = windowsProtection) {
  let key = null;
  const getKey = () => {
    if (key) return key;
    try { key = wrap.unprotect(readFileSync(keyFile)); } catch { key = null; }
    if (key?.length !== 32) { key = randomBytes(32); mkdirSync(path.dirname(keyFile), { recursive: true }); writeFileSync(keyFile, wrap.protect(key), { mode: 0o600 }); }
    return key;
  };
  return {
    protect: data => { const iv = randomBytes(12); const c = createCipheriv('aes-256-gcm', getKey(), iv); const body = Buffer.concat([c.update(data), c.final()]); return Buffer.concat([iv, c.getAuthTag(), body]); },
    unprotect: data => { const d = createDecipheriv('aes-256-gcm', getKey(), data.subarray(0, 12)); d.setAuthTag(data.subarray(12, 28)); return Buffer.concat([d.update(data.subarray(28)), d.final()]); },
  };
}

export class ProtectedStore {
  constructor(file, protection = noProtection) { this.file = file; this.protection = protection; this.cached = undefined; }
  load() {
    if (this.cached !== undefined) return this.cached;
    try { this.cached = JSON.parse(this.protection.unprotect(readFileSync(this.file)).toString('utf8')); } catch { this.cached = null; }
    return this.cached;
  }
  save(value) {
    this.cached = value;
    try { mkdirSync(path.dirname(this.file), { recursive: true }); writeFileSync(this.file, this.protection.protect(Buffer.from(JSON.stringify(value))), { mode: 0o600 }); } catch { /* keep in memory */ }
  }
  clear() { this.cached = null; rmSync(this.file, { force: true }); }
}

export class SavedAccount {
  constructor(dir, protection = process.platform === 'win32' ? keyedProtection(path.join(dir, 'key.dat')) : noProtection) {
    this.dir = dir;
    this.account = new ProtectedStore(path.join(dir, 'account.dat'), protection);
    this.session = new ProtectedStore(path.join(dir, 'session.dat'), protection);
    this.push = new ProtectedStore(path.join(dir, 'push.dat'), protection);
  }
  remembered() { const a = this.account.load(); return a?.email && /^[A-Z]{2}$/.test(a.countryCode || '') ? a : null; }
  remember({ email, countryCode }) { this.account.save({ email, countryCode }); }
  forget() { for (const s of [this.account, this.session, this.push]) s.clear(); }
}
