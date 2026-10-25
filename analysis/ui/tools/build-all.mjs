// Rebuilds the whole UI atlas dataset from the APKs in APKDownload (read-only).
// Steps: unpack security RN bundles + fonts -> Metro module tables -> element trees ->
// theme getter tables -> atlas JSON. Run from the project root: node analysis/ui/tools/build-all.mjs
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const tools = path.dirname(fileURLToPath(import.meta.url));
const analysis = path.resolve(tools, '../..');
const project = path.resolve(analysis, '..');
const pack = path.join(project, 'APKDownload/feature_asset_pack.apk');
const def = path.join(analysis, 'streaming/BytecodeList.def');
const ui = path.join(analysis, 'ui');
const BUNDLES = /^RN_ANDROID_(SEC_\w+|ZX_\w+|MEGA_PLAYER|zx-rnsdk)\.zip$/;

const run = (script, ...args) => execFileSync(process.execPath, ['--max-old-space-size=12000', path.join(tools, script), ...args], { stdio: 'inherit' });
// Windows' bsdtar reads zip archives; GNU tar from Git Bash does not, so call it explicitly.
const TAR = process.platform === 'win32' ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : 'bsdtar';
const unzip = (...args) => execFileSync(TAR, args, { stdio: 'inherit' });

// 1. unpack (tar on Windows 10+ reads zip archives)
const tmp = path.join(ui, '.zips');
fs.mkdirSync(tmp, { recursive: true });
fs.mkdirSync(path.join(ui, 'fonts'), { recursive: true });
unzip('-xf', pack, '-C', tmp, 'assets/fonts');
for (const f of fs.readdirSync(path.join(tmp, 'assets/fonts')).filter(f => f.startsWith('MontForAnker-'))) fs.copyFileSync(path.join(tmp, 'assets/fonts', f), path.join(ui, 'fonts', f));
const listing = execFileSync(TAR, ['-tf', pack], { encoding: 'utf8', maxBuffer: 1 << 26 }).split(/\r?\n/);
const zips = listing.filter(p => p.startsWith('assets/') && BUNDLES.test(path.basename(p)));
unzip('-xf', pack, '-C', tmp, ...zips);
for (const z of zips) {
  const mod = path.basename(z, '.zip').replace(/^RN_ANDROID_/, '');
  const dest = path.join(ui, 'rn', mod);
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  unzip('-xf', path.join(tmp, z), '-C', dest);
}
fs.rmSync(tmp, { recursive: true, force: true });

// 2-3. module tables and element trees per bundle
fs.mkdirSync(path.join(ui, 'modules'), { recursive: true });
fs.mkdirSync(path.join(ui, 'trees'), { recursive: true });
for (const mod of fs.readdirSync(path.join(ui, 'rn')).sort()) {
  const hbc = path.join(ui, 'rn', mod, 'index.android.hbc');
  if (!fs.existsSync(hbc)) continue;
  run('hbc-modules.mjs', hbc, def, path.join(ui, 'modules', `${mod}.json`));
  run('rn-tree.mjs', hbc, def, path.join(ui, 'modules', `${mod}.json`), path.join(ui, 'trees', `${mod}.json`));
}

// 4. bc-rnuikit getter tables (defColor / defFont / radius)
run('theme-tokens.mjs', path.join(ui, 'rn/zx-rnsdk/index.android.hbc'), def, path.join(ui, 'modules/zx-rnsdk.json'),
  'bc-rnuikit_lib_basic_styles_BC(Color|Font|Radius|Space)\\.ts$', path.join(ui, 'trees/zx-rnsdk.theme.json'));

// 5. atlas data
run('build-atlas-data.mjs', analysis);
console.log('UI atlas data rebuilt.');
