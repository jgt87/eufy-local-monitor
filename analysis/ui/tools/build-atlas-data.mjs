// Turns the recovered module tables and decoded native resources into the JSON the
// UI atlas reads. Paths in the output are relative to analysis/ (the atlas server root).
// Usage: node build-atlas-data.mjs <analysis-dir>
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2]);
const rnDir = path.join(root, 'ui/rn'), modDir = path.join(root, 'ui/modules');
const resDir = path.join(root, 'decoded/resources/res');
const outDir = path.join(root, 'ui/atlas/data');
fs.mkdirSync(path.join(outDir, 'bundles'), { recursive: true });
fs.mkdirSync(path.join(outDir, 'lang'), { recursive: true });
const rel = p => path.relative(root, p).split(path.sep).join('/');
const write = (name, data) => fs.writeFileSync(path.join(outDir, name), JSON.stringify(data));

// ---------- native values ----------
const decodeXml = s => s.replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
function readValues(file, tag) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  const re = new RegExp(`<${tag} name="([^"]+)"[^>]*>([\\s\\S]*?)</${tag}>`, 'g');
  for (const m of fs.readFileSync(file, 'utf8').matchAll(re)) out[m[1]] = decodeXml(m[2].trim());
  return out;
}
const nativeStrings = readValues(path.join(resDir, 'values/strings.xml'), 'string');
const colorsDay = readValues(path.join(resDir, 'values/colors.xml'), 'color');
const colorsNight = { ...colorsDay, ...readValues(path.join(resDir, 'values-night/colors.xml'), 'color') };
const dimens = readValues(path.join(resDir, 'values/dimens.xml'), 'dimen');
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
for (const d of fs.readdirSync(resDir).filter(d => /^(drawable|mipmap)/.test(d))) {
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

const layoutNames = fs.readdirSync(path.join(resDir, 'layout')).map(f => f.replace(/\.xml$/, '')).sort();
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
      list.push({ bundle: b, score, path: `ui/rn/${b}/${d}/${f}` });
    }
  }
}
function findDrawable(name, bundle) {
  const list = drawableIndex[name];
  if (!list) return null;
  return [...list].sort((a, b) => (a.bundle !== bundle) - (b.bundle !== bundle) || a.score - b.score)[0].path;
}

const fontSizes = {}, radii = {}, colorUse = {};
const bundleIndex = [];
const sdkUiPrefixes = ['node_modules_bc-rnuikit_lib_', 'node_modules_zx-rnsdk_lib_'];
for (const file of fs.readdirSync(modDir).filter(f => f.endsWith('.json')).sort()) {
  const bundle = file.replace(/\.json$/, '');
  const { modules } = JSON.parse(fs.readFileSync(path.join(modDir, file), 'utf8'));
  const byPath = new Map(modules.map(m => [m.path, m]));

  const lang = {};
  for (const m of modules.filter(m => /_language_en\.(js|ts|json)$/.test(m.path))) for (const o of m.objects) Object.assign(lang, o);

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

  const out = appMods.map((m, i) => {
    const short = m.path.slice(prefix.length);
    const base = short.split('_').pop();
    const stem = base.replace(/\.[^.]+$/, '');
    const kind = /(Screen|Page)\d*$/.test(stem) ? 'screen' : /(Modal|Dialog|Sheet|Popup|Alert)\d*$/.test(stem) ? 'modal' : /\.tsx$|\.jsx$/.test(base) ? 'component' : 'logic';
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
    const navigates = [...new Set(m.strings.filter(s => screenNames.has(s) && screenNames.get(s) !== i).map(s => screenNames.get(s)))];
    return { p: short, kind, fns: m.functions, deps, navigates, text, images, colors: [...colors], styles: styles.slice(0, 80) };
  });
  write(`bundles/${bundle}.json`, { bundle, prefix, modules: out });
  write(`lang/${bundle}.json`, lang);
  bundleIndex.push({
    bundle, prefix, modules: out.length,
    screens: out.filter(m => m.kind === 'screen').length, modals: out.filter(m => m.kind === 'modal').length,
    components: out.filter(m => m.kind === 'component').length, langKeys: Object.keys(lang).length, assets: Object.keys(assets).length,
  });
}
write('bundles.json', bundleIndex);

// ---------- asset maps and search index ----------
fs.mkdirSync(path.join(outDir, 'assets'), { recursive: true });
const search = [];
for (const file of fs.readdirSync(modDir).filter(f => f.endsWith('.json')).sort()) {
  const bundle = file.replace(/\.json$/, '');
  const { modules } = JSON.parse(fs.readFileSync(path.join(modDir, file), 'utf8'));
  const map = {};
  for (const m of modules.filter(m => isAsset(m.path))) {
    const rec = m.objects.find(o => o.__packager_asset);
    if (rec) map[m.path] = { name: rec.name, w: rec.width, h: rec.height, src: findDrawable(androidResName(rec.httpServerLocation, rec.name), bundle) };
  }
  write(`assets/${bundle}.json`, map);
  const cat = JSON.parse(fs.readFileSync(path.join(outDir, `bundles/${bundle}.json`), 'utf8'));
  cat.modules.forEach((m, i) => { if (m.kind !== 'logic') search.push([bundle, i, m.p, m.kind]); });
}
write('search.json', search);

// ---------- design tokens ----------
// Colour tokens come from the bc-rnuikit getter classes (theme-tokens.mjs output). Each getter passes
// {fixedFG, darkFG, fixedBG, darkBG}; refs point at env7 (light palette), env8 (dark palette),
// env12/env13 (the fixed/dynamic token objects themselves).
const sdkTrees = JSON.parse(fs.readFileSync(path.join(root, 'ui/trees/zx-rnsdk.json'), 'utf8')).modules;
const themeClasses = JSON.parse(fs.readFileSync(path.join(root, 'ui/trees/zx-rnsdk.theme.json'), 'utf8'));
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
