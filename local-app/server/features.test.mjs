import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { SavedAccount, keyedProtection } from './session.mjs';
import { Alerts, toastXml } from './alerts.mjs';
import { HistoryLog, readings } from './history.mjs';
import { EufyAccount } from './eufy.mjs';
import { EventLog, deviceKey } from './events.mjs';
import { controlFor } from './settings.mjs';

const tempDir = () => mkdtemp(path.join(tmpdir(), 'monitor-features-'));
const xorWrap = { protect: b => Buffer.from(b.map(x => x ^ 0x5a)), unprotect: b => Buffer.from(b.map(x => x ^ 0x5a)) };
const SN = 'T8214FIXTURE0000';

// A stand-in SDK: records the options each client was built with and answers a restored login.
function fakeSdk({ valid = true, status = 'ok', ownerGated = false } = {}) {
  const built = [];
  class EufyMega {
    constructor(opts) { this.opts = opts; built.push(opts); this.writes = []; }
    on() { return this; }
    get auth() { return { userId: 'me' }; }
    async login() { return { status }; }
    async getDevices() { return [{ sn: SN, name: 'Front door', model: 'T8214', raw: { member: { admin_user_id: ownerGated ? 'someone-else' : 'me' } } }]; }
    async getDevice() {
      return { camera: () => ({}), getProperties: () => ({ battery: 81, wifiRssi: -61, chimeSwitch: true }), properties: [{ name: 'chimeSwitch', writable: true }, { name: 'battery', writable: false }] };
    }
    async setProperty(sn, name, value) { if (ownerGated) throw new Error('error 20004: Only the owner can change settings.'); this.writes.push([sn, name, value]); }
    async disconnect() {}
  }
  return { built, sdk: { EufyMega, LoginStatus: { Ok: 'ok', Captcha: 'captcha', TwoFactor: '2fa' }, isSessionValid: () => valid } };
}

test('saved sign-in is sealed, never holds the password and is removed on forget', async () => {
  const dir = await tempDir();
  try {
    const saved = new SavedAccount(dir, keyedProtection(path.join(dir, 'key.dat'), xorWrap));
    saved.remember({ email: 'owner@example.com', countryCode: 'NL' });
    saved.session.save({ authToken: 'abc' });
    assert.ok(!(await readFile(path.join(dir, 'account.dat'))).toString('latin1').includes('example.com'));
    const again = new SavedAccount(dir, keyedProtection(path.join(dir, 'key.dat'), xorWrap));
    assert.deepEqual(again.remembered(), { email: 'owner@example.com', countryCode: 'NL' });
    assert.deepEqual(again.session.load(), { authToken: 'abc' });
    again.forget();
    assert.equal(again.remembered(), null);
    assert.deepEqual(await readdir(dir), ['key.dat']);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('a remembered sign-in is restored without a password; an invalid one is forgotten', async () => {
  const dir = await tempDir();
  try {
    const saved = new SavedAccount(dir, keyedProtection(path.join(dir, 'key.dat'), xorWrap));
    const { sdk, built } = fakeSdk();
    const account = new EufyAccount({ loadSdk: async () => sdk, saved });
    assert.equal(await account.resume(), false, 'nothing saved yet');
    await account.login({ email: 'owner@example.com', password: 'pw', countryCode: 'NL', remember: true });
    assert.equal(built[0].store, saved.session);
    assert.equal(account.snapshot().remembered, true);
    await account.disconnect();
    assert.ok(saved.remembered(), 'a shutdown keeps the saved sign-in');
    assert.equal(await account.resume(), true);
    assert.equal(built[1].password, '');
    assert.equal(account.status, 'connected');
    await account.disconnect({ forget: true });
    assert.equal(saved.remembered(), null);

    saved.remember({ email: 'owner@example.com', countryCode: 'NL' });
    const expired = fakeSdk({ valid: false });
    const other = new EufyAccount({ loadSdk: async () => expired.sdk, saved });
    assert.equal(await other.resume(), false);
    assert.equal(expired.built.length, 0, 'no sign-in is attempted with an expired session');
    assert.equal(saved.remembered(), null);

    saved.remember({ email: 'owner@example.com', countryCode: 'NL' });
    const challenged = fakeSdk({ status: 'captcha' });
    const third = new EufyAccount({ loadSdk: async () => challenged.sdk, saved });
    assert.equal(await third.resume(), false);
    assert.equal(third.status, 'signed-out');
    assert.equal(saved.remembered(), null);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('alerts follow the preferences and escape the toast text', async () => {
  const dir = await tempDir();
  try {
    const shown = [];
    const alerts = new Alerts(path.join(dir, 'alerts.json'), { notifier: async t => { shown.push(t); return true; } });
    const ring = { kind: 'doorbellPress', label: 'Doorbell pressed', deviceName: 'Front door', time: new Date().toISOString() };
    assert.equal(await alerts.notify(ring), true);
    assert.equal(shown[0].ring, true);
    assert.equal(await alerts.notify({ ...ring, kind: 'motion' }), false, 'motion is off by default');
    await alerts.update({ sound: false, kinds: { motion: true, bogus: true } });
    assert.equal(await alerts.notify({ ...ring, kind: 'motion' }), true);
    assert.equal(shown[1].sound, false);
    await alerts.update({ desktop: false });
    assert.equal(await alerts.notify(ring), false);
    assert.equal(await alerts.notify(ring, { test: true }), true);
    const reloaded = new Alerts(path.join(dir, 'alerts.json'), { notifier: null });
    await reloaded.ready;
    assert.equal(reloaded.snapshot().kinds.motion, true);
    assert.equal(reloaded.snapshot().kinds.bogus, undefined);
    assert.equal(reloaded.snapshot().available, false);
    const xml = toastXml({ title: 'A<b>', body: 'x & "y"', url: 'http://127.0.0.1:4287/#events', sound: false });
    assert.ok(xml.includes('A&#60;b&#62;') && xml.includes('&#38;') && xml.includes('silent="true"'));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('history keeps changes and hourly samples only', async () => {
  const dir = await tempDir();
  try {
    let now = 1_000_000;
    const h = new HistoryLog(path.join(dir, 'history.json'), { now: () => now });
    assert.deepEqual(readings({ battery: '77', wifiRssi: -58 }), { battery: 77, rssi: -58 });
    assert.deepEqual(readings({ battery: 140, rssi: 3 }), { battery: null, rssi: null });
    assert.equal(await h.sample('k', { battery: 80 }), true);
    now += 60000; assert.equal(await h.sample('k', { battery: 80 }), false);
    now += 60000; assert.equal(await h.sample('k', { battery: 79 }), true);
    now += 3600000; assert.equal(await h.sample('k', { battery: 79 }), true);
    assert.equal(await h.sample('k', {}), false);
    const again = new HistoryLog(path.join(dir, 'history.json'));
    await again.ready;
    assert.deepEqual(again.series('k').map(s => s.battery), [80, 79, 79]);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('settings writes are limited to offered switches and choices', async () => {
  const dir = await tempDir();
  try {
    assert.deepEqual(controlFor('chimeSwitch', true, { writable: true }), { type: 'switch' });
    assert.equal(controlFor('chimeSwitch', true, { writable: false }), null);
    assert.equal(controlFor('wifiRssi', -50, { writable: true }), null);
    assert.equal(controlFor('motionSensitivity', 3, { writable: true }), null, 'a number without choices is never editable');
    assert.deepEqual(controlFor('dingdongRingtone', 1, { writable: true, enumValues: { 0: 'Default', 1: 'Ding' } }).options, [[0, 'Default'], [1, 'Ding']]);

    const { sdk } = fakeSdk();
    const messages = [];
    const history = new HistoryLog(path.join(dir, 'history.json'));
    const account = new EufyAccount({ loadSdk: async () => sdk, onChange: m => messages.push(m), history, events: new EventLog(dir) });
    await account.login({ email: 'owner@example.com', password: 'pw', countryCode: 'NL' });
    assert.deepEqual(history.series(deviceKey(SN)).map(s => [s.battery, s.rssi]), [[81, -61]], 'a reading is taken when devices load');
    await account.record({ eventName: 'propertyChanged', deviceSn: SN, property: 'battery', value: 79 });
    assert.equal(history.series(deviceKey(SN)).at(-1).battery, 79);
    await assert.rejects(() => account.setSetting(SN, 'battery', 50), /cannot be changed/);
    await assert.rejects(() => account.setSetting(SN, 'chimeSwitch', 'off'), /offered values/);
    const r = await account.setSetting(SN, 'chimeSwitch', false);
    assert.equal(r.shown, 'Off');
    assert.deepEqual(account.client.writes, [[SN, 'chimeSwitch', false]]);
    assert.ok(messages.includes('Chime switch set to Off on Front door.'));
    await account.disconnect();
    assert.equal(account.sampler, null);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('a shared (non-owner) account marks settings read-only', async () => {
  const dir = await tempDir();
  try {
    const { sdk } = fakeSdk({ ownerGated: true });
    const account = new EufyAccount({ loadSdk: async () => sdk, events: new EventLog(dir) });
    await account.login({ email: 'member@example.com', password: 'pw', countryCode: 'NL' });
    assert.equal(account.ownerGated, true, 'detected from the device owner at discovery');
    assert.equal(account.snapshot().ownerGated, true);
    assert.equal((await account.settings(SN)).ownerGated, true);
    await assert.rejects(() => account.setSetting(SN, 'chimeSwitch', false), /only the owner/i);
    assert.deepEqual(account.client.writes, [], 'nothing was written');
    await account.disconnect();
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('alert, history and settings-write routes', async () => {
  const dir = await tempDir();
  const { createAppServer } = await import('./index.mjs');
  const alerts = new Alerts(path.join(dir, 'alerts.json'), { notifier: async () => true });
  const history = new HistoryLog(path.join(dir, 'history.json'));
  await history.sample('0123456789ab', { battery: 64 });
  const account = new EufyAccount({ events: new EventLog(dir), loadSdk: async () => { throw new Error('no sdk'); } });
  const server = await createAppServer({ account, alerts, history, saved: null, ffmpegAvailable: false });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (route, data, token) => fetch(base + route, { method: 'POST', headers: token ? { 'X-Monitor-Token': token } : {}, body: JSON.stringify(data) });
  try {
    const state = await fetch(base + '/api/state').then(r => r.json());
    assert.equal(state.alerts.kinds.doorbellPress, true);
    assert.equal((await post('/api/alerts', { sound: false })).status, 403);
    const updated = await post('/api/alerts', { sound: false, kinds: { motion: true } }, state.token).then(r => r.json());
    assert.equal(updated.sound, false);
    assert.equal(updated.kinds.motion, true);
    assert.equal((await post('/api/alerts/test', {}, state.token)).status, 200);
    assert.equal((await fetch(base + '/api/history?key=../x')).status, 400);
    assert.deepEqual((await fetch(base + '/api/history?key=0123456789ab').then(r => r.json())).samples.map(s => s.battery), [64]);
    const write = await post('/api/settings/set', { sn: 'x', name: 'chimeSwitch', value: true }, state.token);
    assert.equal(write.status, 400);
    assert.match((await write.json()).error, /Select a device/);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await rm(dir, { recursive: true, force: true }); }
});
