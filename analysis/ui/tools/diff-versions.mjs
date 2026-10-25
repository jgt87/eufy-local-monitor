// Compares two version manifests and prints added, removed and changed screens, changed texts and
// T8214 changes. Without arguments it compares the two newest builds in ui/atlas/data/versions.
// Usage: node diff-versions.mjs [<old id or manifest.json> <new id or manifest.json>] [--json <out.json>] [--all]
// (--all also lists components; the atlas page #/diff shows the same comparison with links.)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { diffManifests, diffSummary } from '../atlas/js/version-diff.js';

const versionsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../atlas/data/versions');
const argv = process.argv.slice(2);
const jsonAt = argv.indexOf('--json'), jsonOut = jsonAt >= 0 ? argv[jsonAt + 1] : null;
const all = argv.includes('--all');
const ids = argv.filter((x, i) => !x.startsWith('--') && (jsonAt < 0 || i !== jsonAt + 1));
const load = x => JSON.parse(fs.readFileSync(fs.existsSync(x) ? x : path.join(versionsDir, `${x}.json`), 'utf8'));
let pair = ids.slice(0, 2);
if (pair.length < 2) {
  const index = fs.existsSync(path.join(versionsDir, 'index.json')) ? load('index') : { versions: [] };
  if (index.versions.length < 2) {
    console.log(`Only ${index.versions.length} version manifest in ${versionsDir}. Build another APK set first:\n  node analysis/ui/tools/build-all.mjs --apk <folder with the newer APKs>`);
    process.exit(0);
  }
  pair = index.versions.slice(-2).map(v => v.id);
}
const [a, b] = pair.map(load);
const d = diffManifests(a, b);
const show = e => all || e.kind !== 'component';
const label = m => `${m.id}${m.source ? ` (${m.source})` : ''}`;
console.log(`${label(d.a)} -> ${label(d.b)}`);
console.log(Object.entries(diffSummary(d)).map(([k, n]) => `${k} ${n}`).join(' · '));
const list = (title, rows, fmt) => { const r = rows.filter(show); if (r.length) { console.log(`\n${title} (${r.length})`); for (const x of r.slice(0, 200)) console.log(`  ${fmt(x)}`); if (r.length > 200) console.log(`  … ${r.length - 200} more`); } };
list('Added', d.added, x => `${x.bundle}  ${x.p}  [${x.kind}]`);
list('Removed', d.removed, x => `${x.bundle}  ${x.p}  [${x.kind}]`);
list('Changed', d.changed, x => `${x.bundle}  ${x.p}  ${[x.kindWas && `kind ${x.kindWas}->${x.kind}`, x.tree && 'tree', x.texts && `texts +${x.texts.added.length}/-${x.texts.removed.length}`, x.navigates && 'navigation', x.routes && 'routes', x.t8214 && 'T8214'].filter(Boolean).join(', ')}`);
list('T8214', d.t8214, x => `${x.bundle}  ${x.p}  ${x.change}${x.b ? `  refs ${x.b.refs.join(' ') || '-'}` : ''}`);
const strings = [...d.strings.changed.map(s => ['~', s]), ...d.strings.added.map(s => ['+', s]), ...d.strings.removed.map(s => ['-', s])];
if (strings.length) {
  console.log(`\nTexts (${strings.length})`);
  for (const [op, s] of strings.slice(0, 100)) console.log(`  ${op} ${s.bundle}  ${s.key}: ${op === '~' ? `${JSON.stringify(s.a)} -> ${JSON.stringify(s.b)}` : JSON.stringify(s.a ?? s.b)}`);
  if (strings.length > 100) console.log(`  … ${strings.length - 100} more`);
}
if (jsonOut) { fs.writeFileSync(jsonOut, JSON.stringify(d, null, 1)); console.log(`\nWrote ${jsonOut}`); }
