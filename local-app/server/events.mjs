// Doorbell and camera events received while the monitor runs, kept in .runtime/events/ so the history
// survives a restart. Records name the device by its display name and a short hash, never its serial.
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import path from 'node:path';

export const EVENT_LABELS = {
  doorbellPress: 'Doorbell pressed', motion: 'Motion detected', personDetected: 'Person detected', strangerDetected: 'Unfamiliar person',
  petDetection: 'Pet detected', dogDetected: 'Dog detected', vehicleDetected: 'Vehicle detected', soundDetected: 'Sound detected',
  cryingDetected: 'Crying detected', packageDelivered: 'Package delivered', packageTaken: 'Package taken', packageStranded: 'Package left waiting',
};

export const deviceKey = sn => createHash('sha256').update(String(sn)).digest('hex').slice(0, 12);
const ID = /^[0-9a-z]{8,16}-[0-9a-f]{6}$/;

export class EventLog {
  constructor(dir, { max = 200 } = {}) { this.dir = dir; this.max = max; this.events = []; this.ready = this.load(); this.writing = Promise.resolve(); }
  async load() {
    try { const data = JSON.parse(await readFile(path.join(this.dir, 'events.json'), 'utf8')); if (Array.isArray(data)) this.events = data.filter(e => ID.test(e?.id)).slice(0, this.max); } catch { /* first run */ }
  }
  persist() {
    const json = JSON.stringify(this.events);
    this.writing = this.writing.then(async () => { await mkdir(this.dir, { recursive: true }); await writeFile(path.join(this.dir, 'events.json'), json); }).catch(() => {});
    return this.writing;
  }
  async add({ kind, time = new Date().toISOString(), device = {}, image = null }) {
    await this.ready;
    const event = { id: `${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`, time, kind, label: EVENT_LABELS[kind] || kind, deviceKey: device.key || null, deviceName: device.name || 'Unknown device', model: device.model || '', image: false };
    if (image?.length) { await mkdir(this.dir, { recursive: true }); await writeFile(path.join(this.dir, `${event.id}.jpg`), image); event.image = true; }
    this.events.unshift(event);
    for (const old of this.events.splice(this.max)) if (old.image) await rm(path.join(this.dir, `${old.id}.jpg`), { force: true });
    await this.persist();
    return event;
  }
  // Attach a picture that arrived after the event (the push thumbnail is fetched separately).
  async attach(id, image) {
    const event = this.events.find(e => e.id === id);
    if (!event || !image?.length) return false;
    await writeFile(path.join(this.dir, `${id}.jpg`), image); event.image = true; await this.persist();
    return true;
  }
  list() { return this.events.map(e => ({ ...e, image: e.image ? `/api/events/${e.id}.jpg` : null })); }
  latest() { return this.list()[0] || null; }
  async image(id) { if (!ID.test(id) || !this.events.some(e => e.id === id && e.image)) return null; try { return await readFile(path.join(this.dir, `${id}.jpg`)); } catch { return null; } }
  async clear() {
    await this.ready;
    for (const e of this.events) if (e.image) await rm(path.join(this.dir, `${e.id}.jpg`), { force: true });
    this.events = []; await this.persist();
  }
}
