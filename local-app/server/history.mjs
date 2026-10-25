// Battery and Wi-Fi signal over time, per device key, in .runtime/history.json. A sample is kept when a
// value changes or an hour has passed, and samples older than 60 days are dropped.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : null);

// Battery percentage and RSSI in dBm from a device's reported properties.
export function readings(values = {}) {
  const battery = num(values.battery);
  const rssi = [values.wifiRssi, values.rssi].map(num).find(v => v !== null && v < 0) ?? null;
  return { battery: battery !== null && battery >= 0 && battery <= 100 ? battery : null, rssi };
}

export class HistoryLog {
  constructor(file, { maxAgeMs = 60 * 86400000, minGapMs = 3600000, now = Date.now } = {}) {
    this.file = file; this.maxAgeMs = maxAgeMs; this.minGapMs = minGapMs; this.now = now; this.data = {}; this.ready = this.load(); this.writing = Promise.resolve();
  }
  async load() { try { const d = JSON.parse(await readFile(this.file, 'utf8')); if (d && typeof d === 'object') this.data = d; } catch { /* first run */ } }
  async sample(key, values) {
    const { battery, rssi } = readings(values);
    if (!key || (battery === null && rssi === null)) return false;
    await this.ready;
    const t = this.now(); const list = (this.data[key] ||= []); const last = list.at(-1);
    if (last && last.battery === battery && last.rssi === rssi && t - last.t < this.minGapMs) return false;
    list.push({ t, battery, rssi });
    this.data[key] = list.filter(s => t - s.t <= this.maxAgeMs);
    const json = JSON.stringify(this.data);
    this.writing = this.writing.then(async () => { await mkdir(path.dirname(this.file), { recursive: true }); await writeFile(this.file, json); }).catch(() => {});
    await this.writing;
    return true;
  }
  series(key) { return (this.data[key] || []).map(s => ({ ...s })); }
}
