// Opt-in diagnostics (EUFY_DIAG=1): SDK debug/trace output, swallowed errors and FFmpeg stderr for
// camera streams, written as JSON lines to .runtime/diagnostics-<time>.log. Values that identify the
// account or device, and key material, are redacted before anything is written.
import { mkdirSync, createWriteStream } from 'node:fs';
import path from 'node:path';

const SECRET_KEYS = /pass(word)?|token|secret|auth|key|cookie|session_?id|private|email|account_?id|user_?id|mvaluestrsub|p2p_did|did$|dsk|init_?str|sign/i;
const SERIAL = /\b(T[0-9A-Z]{4})[0-9A-Z]{8,14}\b/g;             // eufy serials: keep the model prefix
const MAC = /\b(?:[0-9A-F]{2}[:-]?){5}[0-9A-F]{2}\b/gi;
const LONG_HEX = /\b[0-9a-f]{32,}\b/gi;
const LONG_B64 = /\b[A-Za-z0-9+/_-]{40,}={0,2}/g;
const EMAIL = /[^\s"'@]+@[^\s"'@]+\.[a-z]{2,}/gi;

export function redactString(s) {
  return String(s)
    .replace(EMAIL, '<email>')
    .replace(SERIAL, '$1<sn>')
    .replace(MAC, '<mac>')
    .replace(LONG_HEX, '<hex>')
    .replace(LONG_B64, '<b64>');
}

export function redact(value, depth = 0) {
  if (value === null || value === undefined) return value;
  if (depth > 6) return '<deep>';
  if (typeof value === 'string') return redactString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) return `<${value.length} bytes>`;
  if (value instanceof Error) return { name: value.name, message: redactString(value.message), code: value.code, cause: value.cause ? redact(value.cause, depth + 1) : undefined };
  if (Array.isArray(value)) return value.slice(0, 50).map(v => redact(v, depth + 1));
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = SECRET_KEYS.test(k) && v !== null && typeof v !== 'boolean' ? '<redacted>' : redact(v, depth + 1);
    return out;
  }
  return `<${typeof value}>`;
}

export function createDiagnostics(root, enabled = process.env.EUFY_DIAG === '1') {
  if (!enabled) {
    const noop = () => {};
    return { enabled: false, file: null, log: noop, logger: undefined, close: noop };
  }
  const dir = path.join(root, '.runtime');
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `diagnostics-${new Date().toISOString().replace(/[:.]/g, '-')}.log`);
  const out = createWriteStream(file, { flags: 'a' });
  const log = (source, message, data) => {
    out.write(`${JSON.stringify({ t: new Date().toISOString(), source, message: redactString(message), data: data === undefined ? undefined : redact(data) })}\n`);
  };
  const at = level => (message, ...rest) => log(`sdk:${level}`, typeof message === 'string' ? message : JSON.stringify(redact(message)), rest.length ? (rest.length === 1 ? rest[0] : rest) : undefined);
  const logger = { debug: at('debug'), info: at('info'), warn: at('warn'), error: at('error'), trace: at('trace') };
  logger.child = () => logger;
  log('diag', 'diagnostics started', { pid: process.pid, node: process.version });
  return { enabled: true, file, log, logger, close: () => out.end() };
}

// First bytes of the camera feed: Annex-B start code and NAL type tell H.264 from H.265.
export function describeVideoStart(chunk) {
  const b = Buffer.from(chunk.subarray(0, 64));
  let i = b.indexOf(Buffer.from([0, 0, 1]));
  const nal = i >= 0 && i + 3 < b.length ? b[i + 3] : null;
  return {
    bytes: chunk.length,
    head: b.subarray(0, 16).toString('hex'),
    annexB: i >= 0,
    h264NalType: nal === null ? null : nal & 0x1f,
    h265NalType: nal === null ? null : (nal >> 1) & 0x3f,
  };
}
