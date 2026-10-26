#!/usr/bin/env node
// Fails when a tracked file (or, with --history, any commit) contains personal data: IP addresses,
// email addresses, home-folder paths, MAC addresses, full device serials or credentials.
// Owner-specific strings (full serial, MAC, username, public IP) never go into git, so they are read from
// the git-ignored .private-terms.txt (one per line, # for comments) when it exists.
// Usage: node tools/check-private.mjs [--history]
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 });

// Documentation and placeholder values that are fine to publish.
// Documentation ranges (RFC 5737) and RFC 1918 / loopback / link-local / CGNAT: not personal or not routable.
// Public IPs are the ones that identify a network, so only those are treated as personal data here.
const SAFE_IP = /^(0\.0\.0\.0|255\.255\.255\.255|192\.0\.2\.\d+|198\.51\.100\.\d+|203\.0\.113\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|127\.\d+\.\d+\.\d+|169\.254\.\d+\.\d+|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d+\.\d+)$/;
const SAFE_EMAIL = /@(example\.(com|org|net|invalid)|users\.noreply\.github\.com)$/i;
const SAFE_MAC = /^00[:-]11[:-]22[:-]33[:-]44[:-]55$/i;
const SAFE_SERIAL = /FIXTURE|^T8214000000000AB$/;
// Version numbers and spec section numbers that look like IPv4 addresses.
const NOT_IPS = new Set(['analysis/streaming/BytecodeList.def:18.2.1.1', 'analysis/streaming/FINDINGS.md:3.0.0.0']);
// Placeholders in commits before this check existed (made-up test values, not real addresses). They stay
// allowed in history only, so rewriting published tags is not needed for them.
const HISTORY_ONLY = new Set(['local-app/server/app.test.mjs:192.168.1.4', 'local-app/server/events.test.mjs:10:2C:B1:00:00:00']);
const history = process.argv.includes('--history');
const SELF = 'tools/check-private.mjs'; // the scanner holds example patterns and allow-listed literals; don't scan it

const RULES = [
  { name: 'IP address', re: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g, ok: (m, file) => SAFE_IP.test(m) || /\.0\.0\.0$/.test(m) || NOT_IPS.has(`${file}:${m}`) },
  { name: 'email address', re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, ok: m => SAFE_EMAIL.test(m) },
  { name: 'home folder path', re: /\b[A-Za-z]:[\\/]{1,2}(?:Users|Documents and Settings)[\\/]{1,2}[^\\/\s'"`]+|\/(?:home|Users)\/[A-Za-z0-9._-]+/g, ok: m => /[\\/](?:Users|home)[\\/]+(?:<|\$|%|\{|runner\b|me\b)/.test(m) },
  { name: 'MAC address', re: /\b(?:[0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}\b/g, ok: m => SAFE_MAC.test(m) },
  { name: 'device serial', re: /\bT8[0-9A-Z]{3}[0-9A-Z]{8,12}\b/g, ok: m => SAFE_SERIAL.test(m) },
  { name: 'private key', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
  { name: 'JSON web token', re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g },
  { name: 'access token', re: /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|xox[abprs]-[A-Za-z0-9-]{10,})\b/g },
  { name: 'push token', re: /\b[A-Za-z0-9_-]{20,}:APA91[A-Za-z0-9_-]{20,}/g },
  { name: 'bearer token', re: /\bBearer\s+[A-Za-z0-9._~+/-]{20,}/g },
  { name: 'credential value', re: /\b(?:auth_token|access_token|refresh_token|password|passwd|secret|api_?key)["']?\s*[:=]\s*["'][^"'\s]{12,}["']/gi, ok: m => /fixture|example|placeholder|<|\$\{/i.test(m) },
];

const terms = existsSync(path.join(root, '.private-terms.txt'))
  ? readFileSync(path.join(root, '.private-terms.txt'), 'utf8').split(/\r?\n/).map(s => s.trim()).filter(s => s && !s.startsWith('#'))
  : [];

const findings = [];
const scan = (file, text, at = i => `:${i + 1}`) => {
  if (text.includes('\0')) return; // binary
  text.split(/\r?\n/).forEach((line, i) => {
    for (const rule of RULES) for (const m of line.matchAll(rule.re)) {
      if (history && HISTORY_ONLY.has(`${file}:${m[0]}`)) continue;
      if (!rule.ok?.(m[0], file)) findings.push(`${file}${at(i)}: ${rule.name}`);
    }
    for (const term of terms) if (line.toLowerCase().includes(term.toLowerCase())) findings.push(`${file}${at(i)}: a term from .private-terms.txt`);
  });
};

if (history) {
  // Every added line and every commit message on every branch and tag. Findings are not printed in full,
  // so the check itself never repeats the value.
  const log = git('log', '--all', '-p', '--no-color', '--format=commit %H%n%an <%ae>%n%cn <%ce>%n%B');
  let where = 'commit message', commit = '';
  for (const line of log.split('\n')) {
    if (line.startsWith('commit ')) { commit = line.slice(7, 14); where = 'commit message'; }
    else if (line.startsWith('+++ b/')) where = line.slice(6);
    else if (line.startsWith('-') || line.startsWith('@@') || line.startsWith('diff ') || line.startsWith('index ')) continue;
    else if (where !== SELF) scan(where, line.replace(/^\+/, ''), () => ` (commit ${commit})`);
  }
} else {
  for (const file of git('ls-files', '-z').split('\0').filter(Boolean)) {
    if (file === SELF || !existsSync(path.join(root, file))) continue;
    scan(file, readFileSync(path.join(root, file), 'utf8'));
  }
}

const unique = [...new Set(findings)];
if (unique.length) {
  console.error(`Personal data check failed (${unique.length}):\n${unique.map(f => `  ${f}`).join('\n')}`);
  process.exit(1);
}
console.log(`Personal data check passed${terms.length ? ` (with ${terms.length} private terms)` : ''}.`);
