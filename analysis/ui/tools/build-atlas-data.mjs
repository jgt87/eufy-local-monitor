// Turns the recovered module tables and decoded native resources into the JSON the
// UI atlas reads. Paths in the output are relative to analysis/ (the atlas server root).
// Usage: node build-atlas-data.mjs <analysis-dir> [--ui <work dir with rn/modules/trees>] [--apk <APK dir>]
//   [--version <label>] [--res <decoded res dir> | none]
// The main build (--ui = analysis/ui) writes ui/atlas/data; every build adds ui/atlas/data/versions/<version>.json.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { apkVersion } from './apk-version.mjs';

const argv = process.argv.slice(2);
const opt = n => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : undefined; };
const root = path.resolve(argv[0]);
const ui = path.resolve(opt('ui') ?? path.join(root, 'ui'));
const primary = ui === path.join(root, 'ui');
const rnDir = path.join(ui, 'rn'), modDir = path.join(ui, 'modules'), treeDir = path.join(ui, 'trees');
const resDir = opt('res') === 'none' ? null : path.resolve(opt('res') ?? path.join(root, 'decoded/resources/res'));
const apkDir = path.resolve(opt('apk') ?? path.join(root, '../APKDownload'));
const ver = apkVersion(apkDir, opt('version'));
const outDir = path.join(ui, 'atlas/data');
const versionsDir = path.join(root, 'ui/atlas/data/versions');
for (const d of ['bundles', 'lang', 'assets']) fs.mkdirSync(path.join(outDir, d), { recursive: true });
fs.mkdirSync(versionsDir, { recursive: true });
const rel = p => path.relative(root, p).split(path.sep).join('/');
const write = (name, data) => fs.writeFileSync(path.join(outDir, name), JSON.stringify(data));
const hasRes = resDir && fs.existsSync(resDir);
if (!hasRes) console.log('No decoded native resources: native strings, colours, drawables and layouts are left empty.');

// ---------- native values ----------
const decodeXml = s => s.replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
function readValues(file, tag) {
  const out = {};
  if (!hasRes || !fs.existsSync(file)) return out;
  const re = new RegExp(`<${tag} name="([^"]+)"[^>]*>([\\s\\S]*?)</${tag}>`, 'g');
  for (const m of fs.readFileSync(file, 'utf8').matchAll(re)) out[m[1]] = decodeXml(m[2].trim());
  return out;
}
const nativeStrings = readValues(path.join(resDir || '.', 'values/strings.xml'), 'string');
const colorsDay = readValues(path.join(resDir || '.', 'values/colors.xml'), 'color');
const colorsNight = { ...colorsDay, ...readValues(path.join(resDir || '.', 'values-night/colors.xml'), 'color') };
const dimens = readValues(path.join(resDir || '.', 'values/dimens.xml'), 'dimen');
function resolveRefs(table) {
  const out = {};
  for (const k of Object.keys(table)) {
    let v = table[k], guard = 0;
    while (typeof v === 'string' && v.startsWith('@color/') && guard++ < 10) v = table[v.slice(7)];
    out[k] = v ?? null;
  }
  return out;
}
write('native-strings.json', nativeStrings);
write('native-colors.json', { day: resolveRefs(colorsDay), night: resolveRefs(colorsNight) });
write('native-dimens.json', dimens);

// Native drawables: prefer raster at xxhdpi, otherwise the XML (vector/shape/selector).
const dpiRank = d => ['drawable-xxhdpi', 'drawable-xxxhdpi', 'drawable-xhdpi', 'drawable-hdpi', 'drawable', 'drawable-nodpi', 'drawable-anydpi', 'mipmap-xxhdpi', 'mipmap-xxxhdpi'].indexOf(d);
const drawables = {}, drawablesNight = {};
for (const d of hasRes ? fs.readdirSync(resDir).filter(d => /^(drawable|mipmap)/.test(d)) : []) {
  const rank = dpiRank(d), night = d.includes('night');
  if (rank < 0 && !night) continue;
  const target = night ? drawablesNight : drawables;
  for (const f of fs.readdirSync(path.join(resDir, d))) {
    const name = f.replace(/\.9\.png$|\.[^.]+$/, '');
    const r = night ? 0 : rank;
    if (!target[name] || target[name].rank > r) target[name] = { rank: r, path: rel(path.join(resDir, d, f)) };
  }
}
const flat = t => Object.fromEntries(Object.entries(t).map(([k, v]) => [k, v.path]));
write('native-drawables.json', { day: flat(drawables), night: flat(drawablesNight) });

const layoutNames = hasRes ? fs.readdirSync(path.join(resDir, 'layout')).map(f => f.replace(/\.xml$/, '')).sort() : [];
write('native-layouts.json', layoutNames);

// ---------- RN bundles ----------
const colorRe = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$|^rgba?\(\s*\d+[^)]*\)$/;
const styleKeys = new Set(['flex', 'flexDirection', 'backgroundColor', 'color', 'fontSize', 'fontWeight', 'fontFamily', 'lineHeight', 'padding', 'paddingHorizontal', 'paddingVertical', 'paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight', 'margin', 'marginHorizontal', 'marginVertical', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight', 'width', 'height', 'borderRadius', 'borderWidth', 'borderColor', 'alignItems', 'justifyContent', 'position', 'textAlign', 'opacity', 'minHeight']);
const isAsset = p => /\.(webp|png|jpe?g|gif|mp4|json|lottie)$/i.test(p) && !/_language_/.test(p);
const androidResName = (loc, name) => `${loc}/${name}`.toLowerCase().replace(/\//g, '_').replace(/[^a-z0-9_]/g, '').replace(/^assets_/, '');

// Drawable index across all bundles (the shared SDK ships assets other bundles reference).
const drawableIndex = {};
for (const b of fs.readdirSync(rnDir)) {
  for (const d of fs.readdirSync(path.join(rnDir, b)).filter(d => d.startsWith('drawable') || d === 'raw')) {
    for (const f of fs.readdirSync(path.join(rnDir, b, d))) {
      const name = f.replace(/\.[^.]+$/, '');
      const score = (d === 'drawable-xxhdpi' ? 0 : d === 'drawable-xhdpi' ? 1 : 2);
      const list = (drawableIndex[name] ||= []);
      list.push({ bundle: b, score, path: rel(path.join(rnDir, b, d, f)) });
    }
  }
}
function findDrawable(name, bundle) {
  const list = drawableIndex[name];
  if (!list) return null;
  return [...list].sort((a, b) => (a.bundle !== bundle) - (b.bundle !== bundle) || a.score - b.score)[0].path;
}

// Language tables per bundle (res/language/<code>.js). Regional files fill in for the plain code
// (de-DE -> de) only where the bundle has no file of that code.
const LANG_ALIAS = { 'de-DE': 'de', 'tr-TR': 'tr', 'es-LA': 'es', 'zh-TW': 'zh-Hant', 'pt-BR': 'pt', 'pt-PT': 'pt', 'ja-JP': 'ja', 'he-IL': 'he' };
function langTables(modules) {
  const parts = {}, out = {};
  for (const m of modules) {
    const x = /_language_([a-z]{2,3}(?:-[A-Za-z]{2,4})?)\.(js|ts|json)$/.exec(m.path);
    if (x) (parts[LANG_ALIAS[x[1]] || x[1]] ||= []).push([!LANG_ALIAS[x[1]], m.objects]);
  }
  for (const [code, list] of Object.entries(parts)) {
    out[code] = {};
    for (const [, objs] of list.sort((a, b) => a[0] - b[0])) for (const o of objs) Object.assign(out[code], o);
  }
  return out;
}
const readJson = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const sdkTreeMods = new Map(readJson(path.join(treeDir, 'zx-rnsdk.json')).modules.map(m => [m.path, m]));
const sdkLang = langTables(readJson(path.join(modDir, 'zx-rnsdk.json')).modules).en ?? {};
// Text keys a tree displays (translate() keys and i18n proxy entries), model-branch labels, and a
// tree hash that ignores function ids and minified component names, so it compares across builds.
const plainKey = x => typeof x === 'string' && x !== '' && !/^[#@=^]/.test(x);
function treeInfo(tm, treeMods) {
  const keys = new Set(), labels = new Set();
  const walk = v => {
    if (!v || typeof v !== 'object') return;
    if (Array.isArray(v)) { for (const x of v) walk(x); return; }
    if (typeof v.$t === 'string') keys.add(v.$t);
    if (typeof v.$m === 'string' && Array.isArray(v.$p)) { const x = (treeMods.get(v.$m) ?? sdkTreeMods.get(v.$m))?.texts?.[v.$p.join('.')]; if (plainKey(x)) keys.add(x); }
    if (Array.isArray(v.$c)) for (const l of v.$c) labels.add(l);
    for (const x of Object.values(v)) walk(x);
  };
  walk(tm?.comps);
  const hash = tm?.comps.length ? crypto.createHash('sha1').update(JSON.stringify(tm.comps.map(c => [c.trees, c.branches ?? null]), (k, x) => (k === '$f' ? 0 : x))).digest('hex').slice(0, 12) : null;
  return { keys, labels: [...labels].sort(), hash };
}

const fontSizes = {}, radii = {}, colorUse = {};
const bundleIndex = [], langStats = {}, searchKeys = new Map(), searchEntries = [];
const manifest = { id: ver.id, version: ver.version, build: ver.build, source: path.basename(apkDir), built: new Date().toISOString(), counts: {}, bundles: {} };
const sdkUiPrefixes = ['node_modules_bc-rnuikit_lib_', 'node_modules_zx-rnsdk_lib_'];
for (const file of fs.readdirSync(modDir).filter(f => f.endsWith('.json')).sort()) {
  const bundle = file.replace(/\.json$/, '');
  const { modules } = readJson(path.join(modDir, file));
  const byPath = new Map(modules.map(m => [m.path, m]));
  const treeMods = new Map(readJson(path.join(treeDir, file)).modules.map(m => [m.path, m]));

  const langs = langTables(modules);
  const lang = langs.en ?? {};
  for (const [code, table] of Object.entries(langs)) {
    const s = (langStats[code] ||= { code, keys: 0, translated: 0, bundles: 0 });
    s.keys += Object.keys(table).length; s.bundles++;
    s.translated += Object.entries(table).filter(([k, v]) => code === 'en' || v !== lang[k]).length;
    if (code !== 'en') { fs.mkdirSync(path.join(outDir, 'lang', code), { recursive: true }); write(`lang/${code}/${bundle}.json`, table); }
  }

  const assets = {};
  for (const m of modules.filter(m => isAsset(m.path))) {
    const rec = m.objects.find(o => o.__packager_asset);
    if (!rec) continue;
    const res = androidResName(rec.httpServerLocation, rec.name);
    assets[m.path] = { name: rec.name, w: rec.width, h: rec.height, type: rec.type, src: findDrawable(res, bundle) };
  }

  const isUi = p => !isAsset(p) && !/_language_/.test(p) && (bundle === 'zx-rnsdk' ? sdkUiPrefixes.some(x => p.startsWith(x)) : !p.startsWith('node_modules'));
  const appMods = modules.filter(m => isUi(m.path));
  const prefix = (() => {
    const first = appMods[0]?.path || '';
    if (bundle === 'zx-rnsdk') return 'node_modules_';
    return first.slice(0, first.indexOf('_') + 1);
  })();
  const ids = new Map(appMods.map((m, i) => [m.path, i]));
  const screenNames = new Map();
  appMods.forEach((m, i) => { const base = m.path.split('_').pop().replace(/\.[^.]+$/, ''); if (/(Screen|Page)\d*$/.test(base)) screenNames.set(base, i); });
  // Route names from the registries (NavigationConfig route tables, <Stack.Screen name component>
  // elements), so navigate(NavigationKeys.SettingsGeneral) links to GeneralScreen.
  const routeNames = new Map(), registries = new Set();
  const addRoute = (name, target, from) => {
    const t = ids.get(target);
    if (typeof name === 'string' && t !== undefined && !routeNames.has(name)) routeNames.set(name, t);
    registries.add(from);
  };
  const walkRoutes = (v, from) => {
    if (!v || typeof v !== 'object') return;
    if (Array.isArray(v)) { for (const x of v) walkRoutes(x, from); return; }
    if (v.$props && typeof v.$props.name === 'string' && v.$props.component?.$m) addRoute(v.$props.name, v.$props.component.$m, from);
    for (const x of Object.values(v)) walkRoutes(x, from);
  };
  for (const tm of treeMods.values()) {
    for (const [name, target] of tm.routes ?? []) addRoute(name, target, tm.path);
    if (/_(Navigator|App)\.tsx$/.test(tm.path)) walkRoutes(tm.comps, tm.path);
  }
  const keyModules = new Set(appMods.filter(m => /_NavigationKeys\.tsx?$/.test(m.path)).map(m => m.path));
  for (const k of keyModules) registries.add(k);

  const extra = [];
  const out = appMods.map((m, i) => {
    const short = m.path.slice(prefix.length);
    const base = short.split('_').pop();
    const stem = base.replace(/\.[^.]+$/, '');
    // Plain .ts files cannot hold JSX, and use* files are hooks: view models named *ViewModal.ts,
    // useVideoGuideScreen.ts and the BCRNDialog.ts native wrapper are logic despite their names.
    const ui = !/\.ts$/.test(base) && !/^use[A-Z]/.test(stem);
    const kind = !ui ? 'logic' : /(Screen|Page)\d*$/.test(stem) ? 'screen' : /(Modal|Dialog|Sheet|Popup|Alert)\d*$/.test(stem) ? 'modal' : /\.tsx$|\.jsx$/.test(base) ? 'component' : 'logic';
    const text = [], seenText = new Set();
    for (const s of m.strings) {
      if (seenText.has(s)) continue;
      const t = lang[s] ?? nativeStrings[s];
      if (t !== undefined && /[_.]/.test(s)) { text.push([s, t]); seenText.add(s); }
    }
    const colors = new Set(m.strings.filter(s => colorRe.test(s)).map(s => s.toLowerCase()));
    const styles = [];
    for (const o of m.objects) {
      const keys = Object.keys(o);
      if (!keys.some(k => styleKeys.has(k))) continue;
      styles.push(o);
      for (const [k, v] of Object.entries(o)) {
        if (typeof v === 'string' && colorRe.test(v)) { colors.add(v.toLowerCase()); colorUse[v.toLowerCase()] = (colorUse[v.toLowerCase()] || 0) + 1; }
        if (k === 'fontSize' && typeof v === 'number') fontSizes[v] = (fontSizes[v] || 0) + 1;
        if (k === 'borderRadius' && typeof v === 'number') radii[v] = (radii[v] || 0) + 1;
      }
    }
    const images = m.deps.filter(d => assets[d]).map(d => assets[d]);
    const deps = m.deps.map(d => ids.get(d)).filter(x => x !== undefined && x !== i);
    // Screen names in the strings, plus route names when the file imports the route keys or the
    // name itself reads as a screen (avoids matching plain words such as "Details").
    const usesKeys = m.deps.some(d => keyModules.has(d));
    const target = s => screenNames.get(s) ?? (routeNames.has(s) && (usesKeys || /(Screen|Page)\d*$/.test(s)) ? routeNames.get(s) : undefined);
    const navigates = [...new Set(m.strings.map(target).filter(t => t !== undefined && t !== i))];
    // Re-export files (`export { IntroScreen as Screen }`) have no tree of their own: point at the
    // imported UI module whose name the file mentions.
    const tm = treeMods.get(m.path);
    const alias = kind !== 'screen' && kind !== 'modal' || tm?.comps.length || !m.strings.includes('defineProperty') ? undefined
      : deps.find(d => treeMods.get(appMods[d].path)?.comps.length && m.strings.includes(appMods[d].path.split('_').pop().replace(/\.[^.]+$/, '')));
    // Owner's doorbell model: own references (isT8214 checks, model literals, T8214 text keys) and
    // elements recovered inside a T8214 branch.
    const refs = [...new Set(m.strings.filter(s => /T8214/i.test(s) && s.length < 60))];
    const branchEls = tm ? tm.comps.reduce((n, c) => n + (JSON.stringify(c.trees).match(/"\$c":/g) || []).length + (c.branches?.length || 0), 0) : 0;
    // Manifest and search: keys from the tree plus strings of the module that are RN language keys.
    const ti = treeInfo(tm, treeMods);
    for (const s of m.strings) if (/[_.\s]/.test(s) && s.length < 200 && (Object.hasOwn(lang, s) || Object.hasOwn(sdkLang, s))) ti.keys.add(s);
    const shortOf = p => (p.startsWith(prefix) ? p.slice(prefix.length) : p);
    extra.push({ ...ti, keys: [...ti.keys].sort(), routes: (tm?.routes ?? []).map(([name, target]) => [name, shortOf(target)]) });
    return { p: short, kind, fns: m.functions, deps, navigates, text, images, colors: [...colors], styles: styles.slice(0, 80), alias, registry: registries.has(m.path) || undefined, t8214: refs.length ? { refs, branches: branchEls } : undefined };
  });
  // T8214 references reached through the screen's own logic files (view models, hooks in the same
  // feature folder or a parent folder); shared utils such as DeviceUtils would mark everything.
  const folder = p => p.split('_').slice(0, -1).join('/');
  out.forEach((m, i) => {
    if (m.kind === 'logic') return;
    const own = folder(m.p);
    const via = m.deps.filter(d => out[d].kind === 'logic' && out[d].t8214?.refs.includes('isT8214') && (own === folder(out[d].p) || own.startsWith(folder(out[d].p) + '/')) && folder(out[d].p).split('/').length > 2);
    if (via.length) (m.t8214 ||= { refs: [], branches: 0 }).via = via;
  });
  write(`bundles/${bundle}.json`, { bundle, prefix, modules: out });
  write(`lang/${bundle}.json`, lang);
  // Version manifest (keyed by source path, which stays stable across builds) and the text search index.
  const mods = {};
  const keyId = k => { if (!searchKeys.has(k)) searchKeys.set(k, searchKeys.size); return searchKeys.get(k); };
  out.forEach((m, i) => {
    if (m.kind === 'logic') return;
    const x = extra[i], t = m.t8214, e = { kind: m.kind, hash: x.hash };
    if (x.keys.length) e.texts = x.keys;
    if (m.navigates.length) e.navigates = m.navigates.map(d => out[d].p).sort();
    if (x.routes.length) e.routes = x.routes;
    if (m.alias !== undefined) e.alias = out[m.alias].p;
    if (t) e.t8214 = { refs: t.refs, branches: t.branches, ...(t.via ? { via: t.via.map(d => out[d].p) } : {}), ...(x.labels.length ? { labels: x.labels } : {}) };
    mods[m.p] = e;
    const keys = new Set([...x.keys, ...m.text.map(([k]) => k)]);
    searchEntries.push([bundle, i, m.p, m.kind, [...keys].map(keyId), m.deps.filter(d => out[d].kind === 'component')]);
  });
  manifest.bundles[bundle] = { prefix, modules: mods, strings: lang };
  for (const k of ['screen', 'modal', 'component']) manifest.counts[k] = (manifest.counts[k] || 0) + out.filter(m => m.kind === k).length;
  bundleIndex.push({
    bundle, prefix, modules: out.length,
    screens: out.filter(m => m.kind === 'screen').length, modals: out.filter(m => m.kind === 'modal').length,
    components: out.filter(m => m.kind === 'component').length, langKeys: Object.keys(lang).length, assets: Object.keys(assets).length,
    t8214: out.filter(m => m.kind !== 'logic' && m.t8214).length,
    links: out.reduce((n, m) => n + (m.registry ? 0 : m.navigates.length), 0),
  });
}
write('bundles.json', bundleIndex);

// ---------- asset maps, search index, languages, version manifest ----------
for (const file of fs.readdirSync(modDir).filter(f => f.endsWith('.json')).sort()) {
  const bundle = file.replace(/\.json$/, '');
  const { modules } = readJson(path.join(modDir, file));
  const map = {};
  for (const m of modules.filter(m => isAsset(m.path))) {
    const rec = m.objects.find(o => o.__packager_asset);
    if (rec) map[m.path] = { name: rec.name, w: rec.width, h: rec.height, src: findDrawable(androidResName(rec.httpServerLocation, rec.name), bundle) };
  }
  write(`assets/${bundle}.json`, map);
}
// search.json: entries [bundle, index, path, kind, key ids, direct child components (indexes)]; the
// browser resolves the keys in the chosen language.
write('search.json', { keys: [...searchKeys.keys()], entries: searchEntries });
const langList = Object.values(langStats).sort((a, b) => (b.code === 'en') - (a.code === 'en') || a.code.localeCompare(b.code));
write('langs.json', langList);
fs.writeFileSync(path.join(versionsDir, `${ver.id}.json`), JSON.stringify(manifest));
const indexFile = path.join(versionsDir, 'index.json');
const previous = fs.existsSync(indexFile) ? readJson(indexFile) : {};
const versions = fs.readdirSync(versionsDir).filter(f => f.endsWith('.json') && f !== 'index.json').map(f => {
  const { id, version, build, source, built, counts } = readJson(path.join(versionsDir, f));
  return { id, version, build, source, built, counts };
}).sort((a, b) => (a.build ?? 0) - (b.build ?? 0) || a.id.localeCompare(b.id));
fs.writeFileSync(indexFile, JSON.stringify({ current: primary ? ver.id : previous.current ?? null, versions }));
console.log(`Languages: ${langList.map(l => l.code).join(' ')}. Manifest ${rel(path.join(versionsDir, `${ver.id}.json`))} (${versions.length} version${versions.length === 1 ? '' : 's'}).`);

// ---------- design tokens ----------
// Colour tokens come from the bc-rnuikit getter classes (theme-tokens.mjs output). Each getter passes
// {fixedFG, darkFG, fixedBG, darkBG}; refs point at env7 (light palette), env8 (dark palette),
// env12/env13 (the fixed/dynamic token objects themselves).
const sdkTrees = readJson(path.join(treeDir, 'zx-rnsdk.json')).modules;
const themeClasses = readJson(path.join(treeDir, 'zx-rnsdk.theme.json'));
const bcTheme = sdkTrees.find(m => m.path.endsWith('BCColor.ts'))?.theme?.color ?? {};
const palettes = { env7: bcTheme.colorsLight ?? {}, env8: bcTheme.colorsDark ?? {} };
const groupOf = keys => keys.includes('darker') ? 'mono' : keys.includes('focus') ? 'state' : keys.includes('appDefault') ? 'scene' : null;
const rawTokens = {};
for (const cls of themeClasses['node_modules_bc-rnuikit_lib_basic_styles_BCColor.ts'] ?? []) {
  const group = groupOf(Object.keys(cls.getters));
  if (!group) continue;
  for (const [k, g] of Object.entries(cls.getters)) rawTokens[`${group}.${k}`] = g.fields;
}
function resolveColor(v, side, depth = 0) {
  if (typeof v === 'string' || v == null) return v ?? null;
  if (depth > 5 || !v.ref) return null;
  const [env, ...rest] = v.ref.split('.');
  if (palettes[env]) return rest.reduce((o, k) => o?.[k], palettes[env]) ?? null;
  // env12 = fixed tokens (light), env13 = dynamic tokens; a trailing ".dark" selects the dark side.
  const wantsDark = rest[rest.length - 1] === 'dark';
  const [fgbg, group, key] = rest;
  const f = rawTokens[`${group}.${key}`];
  if (!f) return null;
  const pick = fgbg === 'bg' ? (wantsDark || env === 'env13' && side === 'dark' ? 'darkBG' : 'fixedBG') : (wantsDark || env === 'env13' && side === 'dark' ? 'darkFG' : 'fixedFG');
  return resolveColor(f[pick], side, depth + 1);
}
const colorTokens = {};
for (const [name, f] of Object.entries(rawTokens)) {
  colorTokens[`fg.${name}`] = { light: resolveColor(f.fixedFG, 'light'), dark: resolveColor(f.darkFG, 'dark') };
  colorTokens[`bg.${name}`] = { light: resolveColor(f.fixedBG, 'light'), dark: resolveColor(f.darkBG, 'dark') };
}
// aiot-sdk tokens (the newer OneAnker system used by most screens): UFColor getter classes and the
// `oa` semantic tables, both resolving to the OneAnker primitive palette.
const sdkByPath = new Map(sdkTrees.map(m => [m.path, m]));
const primitiveRef = r => {
  if (!r || !r.$m || !r.$p) return typeof r === 'string' ? r : null;
  const x = sdkByPath.get(r.$m)?.texts?.[r.$p.join('.')];
  return x && x.startsWith('=') ? x.slice(1) : null;
};
const ufColor = {};
const ufMod = sdkTrees.find(m => m.path.endsWith('aiot-sdk_theme_UFColor.ts'));
for (const getters of Object.values(ufMod?.getters ?? {})) {
  const group = groupOf(Object.keys(getters));
  if (!group) continue;
  for (const [k, ret] of Object.entries(getters)) {
    const f = ret?.$args?.[0];
    if (!f || typeof f !== 'object') continue;
    const pick = v => (typeof v === 'string' ? v : primitiveRef(v));
    ufColor[`fg.${group}.${k}`] = { light: pick(f.fixedFG), dark: pick(f.darkFG) };
    ufColor[`bg.${group}.${k}`] = { light: pick(f.fixedBG), dark: pick(f.darkBG) };
  }
}
const oa = {};
for (const m of sdkTrees.filter(m => /aiot-sdk_theme_oneAnker_(semantic_\w+|component)\.ts$/.test(m.path))) {
  for (const [k, x] of Object.entries(m.texts ?? {})) {
    if (x.startsWith('@')) { const [l, d] = JSON.parse(x.slice(1)); oa[k] = { light: primitiveRef(l), dark: primitiveRef(d) }; }
    else if (x.startsWith('=')) oa[k] = { light: x.slice(1), dark: x.slice(1) };
  }
}
const primitives = Object.fromEntries(Object.entries(sdkByPath.get('node_modules_aiot_aiot-sdk_theme_oneAnker_primitive.ts')?.texts ?? {}).filter(([, v]) => v.startsWith('=')).map(([k, v]) => [k.replace(/^primitive\./, ''), v.slice(1)]));
const fontClass = themeClasses['node_modules_bc-rnuikit_lib_basic_styles_BCFont.ts']?.[0];
const fontSizeScale = Object.fromEntries(Object.entries(fontClass?.getters ?? {}).filter(([, g]) => g.numbers.length).map(([k, g]) => [k, g.numbers[0]]));
// Scale classes are created in source order; the first one backs `fixed` and `relative`, the second `ratio`
// (verified in the UFSpace/UFRadius factories, same structure in bc-rnuikit).
const radiusClasses = [...(themeClasses['node_modules_bc-rnuikit_lib_basic_styles_BCRadius.ts'] ?? [])].sort((a, b) => a.builder - b.builder);
const radiusScale = radiusClasses.map(c => Object.fromEntries(Object.entries(c.getters).filter(([, g]) => g.numbers.length).map(([k, g]) => [k, g.numbers[0]])));

// Dimension tokens of the aiot-sdk / OneAnker system.
const SIZE_KEYS = ['XXXS', 'XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
function getterScale(path) {
  const groups = Object.entries(sdkByPath.get(path)?.getters ?? {}).sort((a, b) => Number(a[0]) - Number(b[0]));
  const first = groups[0]?.[1] ?? {};
  const out = {};
  for (const k of SIZE_KEYS) {
    const arg = first[k]?.$args?.[0];
    const n = typeof arg === 'number' ? arg : arg && typeof arg === 'object' ? arg.margin : undefined;
    if (typeof n === 'number') out[k] = n;
  }
  return out;
}
const textsOf = file => sdkByPath.get(`node_modules_aiot_aiot-sdk_theme_oneAnker_nonColor_${file}.ts`)?.texts ?? {};
function numTable(texts, prefix) {
  const raw = Object.fromEntries(Object.entries(texts).filter(([k]) => k.startsWith(prefix)).map(([k, v]) => [k.slice(prefix.length), v]));
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    let x = v, guard = 0;
    while (x && x.startsWith('^') && guard++ < 4) x = raw[x.slice(1)];
    if (x && x.startsWith('=')) out[k] = Number(x.slice(1));
  }
  return out;
}
const sdkModules = JSON.parse(fs.readFileSync(path.join(modDir, 'zx-rnsdk.json'), 'utf8')).modules;
const oaFontObjects = sdkModules.find(m => m.path.endsWith('oneAnker_nonColor_font.ts'))?.objects ?? [];
const oaFontSizes = oaFontObjects.filter(o => 'body' in o);
const dims = {
  ufSpace: getterScale('node_modules_aiot_aiot-sdk_theme_UFSpace.ts'),
  ufRadius: getterScale('node_modules_aiot_aiot-sdk_theme_UFRadius.ts'),
  ufFontSizes: getterScale('node_modules_aiot_aiot-sdk_theme_UFFont.ts'),
  oaGap: numTable(textsOf('space'), 'oaSpace.gap.'),
  oaPadding: numTable(textsOf('space'), 'oaSpace.padding.'),
  oaRadius: numTable(textsOf('radius'), 'oaRadius.'),
  oaLine: numTable(textsOf('line'), 'oaLine.'),
  // Brand tables in source order: standard, hapt, anker. setFontBrand picks one at runtime; standard is shown.
  oaFontSizes: { standard: oaFontSizes[0], hapt: oaFontSizes[1], anker: oaFontSizes[2] },
  fontFamilies: oaFontObjects.find(o => 'semibold' in o && typeof o.semibold === 'string') ?? {},
  fontWeights: { slim: '200', normal: '400', medium: '500', semibold: '600', bold: '700', heavy: '800' },
};
const top = (h, n) => Object.entries(h).sort((a, b) => b[1] - a[1]).slice(0, n);
write('tokens.json', {
  colorTokens, ufColor, oa, primitives,
  palettes: { light: palettes.env7, dark: palettes.env8 },
  oneAnkerRef: sdkTrees.find(m => m.path.endsWith('OneAnkerRefColors.ts'))?.theme?.OneAnkerRefColors ?? {},
  font: {
    sizes: fontSizeScale,
    weights: { slim: '200', normal: '400', medium: '500', bold: 'bold' },
    family: { bold: 'MontForAnker-SemiBold', default: 'MontForAnker-Regular' },
    files: ['MontForAnker-Regular', 'MontForAnker-SemiBold', 'MontForAnker-Bold', 'MontForAnker-Heavy'],
  },
  radius: radiusScale,
  dims,
  usage: { fontSizes: top(fontSizes, 40), radii: top(radii, 30), colors: top(colorUse, 80) },
  nativeTheme: Object.fromEntries(['colorPrimary', 'colorAccent', 'main_bg_pressed'].map(k => [k, resolveRefs(colorsDay)[k]])),
});
console.table(bundleIndex);
console.log('defColor tokens', Object.keys(colorTokens).length, 'UFColor tokens', Object.keys(ufColor).length, 'oa tokens', Object.keys(oa).length, 'primitives', Object.keys(primitives).length, 'font sizes', JSON.stringify(fontSizeScale));
