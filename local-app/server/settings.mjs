// View of a device's reported settings, built from the SDK's property specs and values. String values
// pass through the diagnostics redaction so key material, serials and MAC addresses never reach the page.
// Only the settings in EDITABLE can be changed, and only as switches or the SDK's own enum choices: the
// SDK does not describe numeric ranges, so a free number is never written.
import { redactString } from './diagnostics.mjs';

const HIDDEN = /key|secret|token|password|sign|did$|^sn$|serial|mac(Address)?$|^unknown_/i;
export const EDITABLE = new Set(['motionDetection', 'chimeSwitch', 'mechanicalChimeSwitch', 'dingdongRingtone', 'motionSensitivity']);
const GROUPS = [
  ['Power', /battery|power|charg|solar/i],
  ['Detection', /motion|pir|detect|person|human|sensitiv|zone|stranger|pet|vehicle/i],
  ['Doorbell and sound', /chime|ring|dingdong|volume|audio|mic|speaker|quick|sound|voice/i],
  ['Notifications', /notif|push|alert/i],
  ['Video and lights', /video|quality|wdr|night|hdr|resolution|codec|watermark|flip|mirror|light|led|compression|image/i],
  ['Network', /wifi|rssi|signal|network|ip$/i],
];

export const humanize = name => {
  const words = String(name).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim().toLowerCase();
  const fixed = words.replace(/\b(wdr|led|pir|hdr|ip|rssi|ai)\b/g, w => w.toUpperCase());
  return fixed.charAt(0).toUpperCase() + fixed.slice(1);
};
const groupOf = name => GROUPS.find(([, re]) => re.test(name))?.[0] || 'Other';
const short = s => { const text = redactString(s); return text.length > 160 ? `${text.slice(0, 157)}…` : text; };

export function formatValue(value, spec = {}) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'On' : 'Off';
  if (spec.enumValues && (typeof value === 'number' || /^\d+$/.test(value)) && spec.enumValues[Number(value)] !== undefined) return String(spec.enumValues[Number(value)]);
  if (typeof value === 'number') return spec.unit ? `${value}${spec.unit === '%' ? '' : ' '}${spec.unit}` : String(value);
  if (typeof value === 'string') {
    if (/^\s*[{[]/.test(value)) { try { return formatValue(JSON.parse(value), spec); } catch { /* not JSON */ } }
    return short(value);
  }
  if (Array.isArray(value)) return value.length ? short(value.map(v => (typeof v === 'object' ? JSON.stringify(v) : String(v))).join(', ')) : 'None';
  if (typeof value === 'object') {
    const entries = Object.entries(value).filter(([k]) => !HIDDEN.test(k));
    return entries.length ? short(entries.map(([k, v]) => `${humanize(k)}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' · ')) : '—';
  }
  return short(value);
}

export function controlFor(name, value, spec = {}) {
  if (!EDITABLE.has(name) || !spec.writable) return null;
  if (typeof value === 'boolean') return { type: 'switch' };
  if (spec.enumValues && Object.keys(spec.enumValues).length > 1) return { type: 'select', options: Object.entries(spec.enumValues).map(([v, label]) => [Number(v), String(label)]) };
  return null;
}

export function describeSettings(device) {
  const values = typeof device.getProperties === 'function' ? device.getProperties() || {} : {};
  const specs = new Map((Array.isArray(device.properties) ? device.properties : []).map(s => [s.name, s]));
  const rows = [];
  for (const [name, value] of Object.entries(values)) {
    if (HIDDEN.test(name)) continue;
    const spec = specs.get(name) || {};
    const control = controlFor(name, value, spec);
    rows.push({ name, label: humanize(name), value: formatValue(value, spec), group: groupOf(name), writable: !!spec.writable, control, ...(control ? { raw: control.type === 'switch' ? value : Number(value) } : {}) });
  }
  rows.sort((a, b) => a.group.localeCompare(b.group) || a.label.localeCompare(b.label));
  const groups = [];
  for (const row of rows) { let g = groups.find(x => x.name === row.group); if (!g) groups.push(g = { name: row.group, rows: [] }); g.rows.push(row); }
  const order = [...GROUPS.map(([n]) => n), 'Other'];
  groups.sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
  return {
    name: device.name || '', model: device.model || '', modelName: device.modelName || '',
    capabilities: Array.isArray(device.capabilities) ? [...device.capabilities] : [],
    reported: rows.length, groups,
  };
}
