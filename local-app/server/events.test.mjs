import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { EventLog, deviceKey } from './events.mjs';
import { EufyAccount } from './eufy.mjs';
import { describeSettings, formatValue } from './settings.mjs';

const tempDir = () => mkdtemp(path.join(tmpdir(), 'monitor-events-'));
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);

test('event log keeps pictures, survives a reload and never stores the serial', async () => {
  const dir = await tempDir();
  try {
    const log = new EventLog(dir, { max: 2 });
    const device = { sn: 'T8214FIXTURE0000', key: deviceKey('T8214FIXTURE0000'), name: 'Front door', model: 'T8214' };
    const first = await log.add({ kind: 'doorbellPress', device, image: JPEG });
    assert.equal(first.label, 'Doorbell pressed');
    assert.deepEqual(await log.image(first.id), JPEG);
    assert.equal(await log.image('../events'), null);
    const second = await log.add({ kind: 'motion', device });
    assert.equal(await log.attach(second.id, JPEG), true);
    await log.add({ kind: 'personDetected', device });
    assert.equal(log.events.length, 2);
    assert.equal(await log.image(first.id), null, 'the oldest picture is removed with its event');
    const stored = await readFile(path.join(dir, 'events.json'), 'utf8');
    assert.ok(!stored.includes('FIXTURE'));
    const reloaded = new EventLog(dir);
    await reloaded.ready;
    assert.deepEqual(reloaded.list().map(e => e.kind), ['personDetected', 'motion']);
    assert.equal(reloaded.list()[1].image, `/api/events/${second.id}.jpg`);
    await reloaded.clear();
    assert.equal(reloaded.list().length, 0);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('account records detections from the SDK event stream and fetches the stored thumbnail', async () => {
  const dir = await tempDir();
  try {
    const events = new EventLog(dir);
    const messages = [];
    const account = new EufyAccount({ events, onChange: m => messages.push(m), thumbnailDelayMs: 0 });
    account.status = 'connected';
    account.devices = [{ sn: 'T8214FIXTURE0000', key: deviceKey('T8214FIXTURE0000'), name: 'Front door', model: 'T8214' }];
    account.client = { getDevice: async () => ({ camera: () => ({ snapshotStored: async () => JPEG }) }) };
    assert.equal(await account.record({ eventName: 'propertyChanged', deviceSn: 'T8214FIXTURE0000' }), null);
    const event = await account.record({ eventName: 'doorbellPress', deviceSn: 'T8214FIXTURE0000', eventType: 3101 });
    assert.equal(event.deviceName, 'Front door');
    assert.ok(messages.includes('Doorbell pressed: Front door.'));
    assert.equal(await account.fetchThumbnail('T8214FIXTURE0000', event.id), true);
    assert.deepEqual(await events.image(event.id), JPEG);
    assert.deepEqual(await account.latestPicture('T8214FIXTURE0000'), JPEG);
    await assert.rejects(() => account.latestPicture('unknown'), /Select a device/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('settings are grouped, labelled and redacted', () => {
  const device = {
    name: 'Front door', model: 'T8214', modelName: 'Video Doorbell', capabilities: ['camera', 'doorbell'],
    properties: [
      { name: 'battery', unit: '%', writable: false },
      { name: 'dingdongRingtone', enumValues: { 0: 'Default', 7: 'Ding' }, writable: true },
      { name: 'wdrSwitch', writable: true },
    ],
    getProperties: () => ({ battery: 82, dingdongRingtone: 7, wdrSwitch: true, notificationMode: '{"motion":1,"ring":1}', wifiMac: '00:11:22:33:44:55', note: 'unit T8214FIXTURE0000', dskKey: 'abc' }),
  };
  const s = describeSettings(device);
  const rows = Object.fromEntries(s.groups.flatMap(g => g.rows.map(r => [r.name, r])));
  assert.equal(rows.battery.value, '82%');
  assert.equal(rows.battery.group, 'Power');
  assert.equal(rows.dingdongRingtone.value, 'Ding');
  assert.equal(rows.wdrSwitch.label, 'WDR switch');
  assert.equal(rows.notificationMode.value, 'Motion: 1 · Ring: 1');
  assert.equal(rows.wifiMac, undefined);
  assert.equal(rows.dskKey, undefined);
  assert.equal(rows.note.value, 'unit T8214<sn>');
  assert.equal(formatValue(null), '—');
});

test('event routes list, serve and clear pictures', async () => {
  const dir = await tempDir();
  const { createAppServer } = await import('./index.mjs');
  const events = new EventLog(dir);
  const account = new EufyAccount({ events, loadSdk: async () => { throw new Error('no sdk'); } });
  const event = await events.add({ kind: 'motion', device: { name: 'Garden', model: 'T8214' }, image: JPEG });
  const server = await createAppServer({ account, ffmpegAvailable: false });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const state = await fetch(base + '/api/state').then(r => r.json());
    assert.equal(state.latestEvent.id, event.id);
    const list = await fetch(base + '/api/events').then(r => r.json());
    assert.equal(list.events[0].image, `/api/events/${event.id}.jpg`);
    const pic = await fetch(base + list.events[0].image);
    assert.equal(pic.headers.get('content-type'), 'image/jpeg');
    assert.deepEqual(Buffer.from(await pic.arrayBuffer()), JPEG);
    assert.equal((await fetch(base + '/api/events/nope.jpg')).status, 404);
    assert.equal((await fetch(base + '/api/events/clear', { method: 'POST' })).status, 403);
    assert.equal((await fetch(base + '/api/events/clear', { method: 'POST', headers: { 'X-Monitor-Token': state.token } })).status, 200);
    assert.equal((await fetch(base + '/api/events').then(r => r.json())).events.length, 0);
    assert.equal((await fetch(base + '/api/settings', { method: 'POST', headers: { 'X-Monitor-Token': state.token }, body: '{"sn":"x"}' })).status, 400);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await rm(dir, { recursive: true, force: true }); }
});
