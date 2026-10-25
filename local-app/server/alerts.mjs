// Ring and detection alerts on the PC. Preferences live in .runtime/alerts.json; on Windows each alert is
// a toast raised through Windows PowerShell's WinRT bridge, so it shows even when no browser is open.
// Clicking the toast opens the Events page.
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { EVENT_LABELS } from './events.mjs';

export const DEFAULT_ALERTS = { desktop: true, sound: true, kinds: { doorbellPress: true, personDetected: true, strangerDetected: true, packageDelivered: true } };
const POWERSHELL_APP = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe';
const xml = s => String(s).replace(/[<>&"']/g, c => `&#${c.charCodeAt(0)};`);

export function toastXml({ title, body, url, sound, ring }) {
  const audio = !sound ? '<audio silent="true"/>' : `<audio src="ms-winsoundevent:Notification.${ring ? 'Reminder' : 'Default'}"/>`;
  return `<toast activationType="protocol" launch="${xml(url)}"><visual><binding template="ToastGeneric"><text>${xml(title)}</text><text>${xml(body)}</text><text placement="attribution">eufy Local Monitor</text></binding></visual>${audio}</toast>`;
}

export function windowsToast(toast) {
  const script = `[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null; [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] > $null; $x = New-Object Windows.Data.Xml.Dom.XmlDocument; $x.LoadXml([Console]::In.ReadToEnd()); [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('${POWERSHELL_APP}').Show((New-Object Windows.UI.Notifications.ToastNotification $x))`;
  return new Promise(resolve => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, stdio: ['pipe', 'ignore', 'ignore'] });
    child.on('error', () => resolve(false)); child.on('exit', code => resolve(code === 0));
    child.stdin.end(toastXml(toast));
  });
}

export class Alerts {
  constructor(file, { notifier = process.platform === 'win32' ? windowsToast : null, url = () => 'http://127.0.0.1:4287/#events', diag = { log() {} } } = {}) {
    this.file = file; this.notifier = notifier; this.url = url; this.diag = diag; this.prefs = sanitize(DEFAULT_ALERTS); this.ready = this.load();
  }
  async load() { try { this.prefs = sanitize(JSON.parse(await readFile(this.file, 'utf8'))); } catch { /* defaults */ } }
  snapshot() { return { ...this.prefs, kinds: { ...this.prefs.kinds }, available: !!this.notifier, labels: EVENT_LABELS }; }
  async update(next) {
    await this.ready; this.prefs = sanitize({ ...this.prefs, ...next, kinds: { ...this.prefs.kinds, ...next?.kinds } });
    await mkdir(path.dirname(this.file), { recursive: true }); await writeFile(this.file, JSON.stringify(this.prefs, null, 2));
    return this.snapshot();
  }
  wants(kind) { return !!this.prefs.kinds[kind]; }
  async notify(event, { test = false } = {}) {
    await this.ready;
    if (!this.notifier || (!test && (!this.prefs.desktop || !this.wants(event.kind)))) return false;
    const at = new Date(event.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const shown = await this.notifier({ title: event.label, body: `${event.deviceName} · ${at}`, url: this.url(), sound: this.prefs.sound, ring: event.kind === 'doorbellPress' });
    if (!shown) this.diag.log('alerts', 'toast failed', { kind: event.kind });
    return shown;
  }
}

function sanitize(p) {
  const kinds = {};
  for (const k of Object.keys(EVENT_LABELS)) kinds[k] = !!p?.kinds?.[k];
  return { desktop: p?.desktop !== false, sound: p?.sound !== false, kinds };
}
