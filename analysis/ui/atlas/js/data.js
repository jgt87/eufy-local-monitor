// Cached loaders for the atlas data. All paths are relative to the analysis/ server root.
const cache = new Map();

export function json(path) {
  if (!cache.has(path)) {
    cache.set(path, fetch(`/${path}`).then(r => {
      if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
      return r.json();
    }));
  }
  return cache.get(path);
}

export function text(path) {
  const key = `text:${path}`;
  if (!cache.has(key)) cache.set(key, fetch(`/${path}`).then(r => (r.ok ? r.text() : Promise.reject(new Error(`${path}: HTTP ${r.status}`)))));
  return cache.get(key);
}

const atlas = p => json(`ui/atlas/data/${p}`);
export const bundles = () => atlas('bundles.json');
export const catalog = b => atlas(`bundles/${b}.json`);
export const assets = b => atlas(`assets/${b}.json`);
export const tokens = () => atlas('tokens.json');
export const searchIndex = () => atlas('search.json');
export const langs = () => atlas('langs.json');
// Version manifests; a missing index (older data) reads as no versions.
export const versionIndex = () => atlas('versions/index.json').catch(() => ({ current: null, versions: [] }));
export const manifest = id => atlas(`versions/${id}.json`);

// Preview language. English tables are the base; another language overlays its own table, so keys it
// lacks keep the English text (native strings exist only in English, from config.en.apk).
const LANG_KEY = 'atlas.lang';
let language = 'en';
try { language = localStorage.getItem(LANG_KEY) || 'en'; } catch { /* storage blocked */ }
export const getLanguage = () => language;
export function setLanguage(code) {
  language = code || 'en';
  try { localStorage.setItem(LANG_KEY, language); } catch { /* storage blocked */ }
}
export function lang(b, code = language) {
  const en = atlas(`lang/${b}.json`);
  return code === 'en' ? en : Promise.all([en, atlas(`lang/${code}/${b}.json`).catch(() => ({}))]).then(([e, l]) => ({ ...e, ...l }));
}
export const nativeStrings = () => atlas('native-strings.json');
export const nativeColors = () => atlas('native-colors.json');
export const nativeDimens = () => atlas('native-dimens.json');
export const nativeDrawables = () => atlas('native-drawables.json');
export const nativeLayouts = () => atlas('native-layouts.json');

// Tree index for one bundle: modules by full path, components by function id,
// and an export-name lookup used to resolve components imported through barrel files.
const treeIndexes = new Map();
export function trees(bundle) {
  if (!treeIndexes.has(bundle)) {
    treeIndexes.set(bundle, json(`ui/trees/${bundle}.json`).then(({ modules }) => {
      const byPath = new Map(), byFid = new Map(), byName = new Map();
      const addName = (name, entry) => { if (!byName.has(name)) byName.set(name, []); byName.get(name).push(entry); };
      for (const m of modules) {
        byPath.set(m.path, m);
        for (const c of m.comps) byFid.set(c.fid, { module: m, comp: c });
        for (const [name, fid] of Object.entries(m.exports)) if (byFid.has(fid)) addName(name, byFid.get(fid));
        const stem = m.path.split('_').pop().replace(/\.(tsx?|jsx?)$/, '');
        const def = m.exports.default !== undefined ? byFid.get(m.exports.default) : m.comps[0] && { module: m, comp: m.comps[0] };
        if (def) addName(stem, def);
      }
      return { modules, byPath, byFid, byName };
    }));
  }
  return treeIndexes.get(bundle);
}

// Everything the RN renderer needs for one bundle.
export async function renderContext(bundle) {
  const [idx, sdk, assetMap, sdkAssets, langMap, sdkLang, native, tok] = await Promise.all([
    trees(bundle), trees('zx-rnsdk'), assets(bundle), assets('zx-rnsdk'), lang(bundle), lang('zx-rnsdk'), nativeStrings(), tokens(),
  ]);
  return { bundle, idx, sdk, assets: { ...sdkAssets, ...assetMap }, lang: { ...native, ...sdkLang, ...langMap }, tokens: tok };
}

// The tree module a catalogue entry renders: its own, or for a re-export file (`alias`) the module it re-exports.
export function treeModuleFor(cat, idx, i) {
  const m = cat.modules[i];
  const own = idx.byPath.get(cat.prefix + m.p);
  if (own?.comps.length || m.alias === undefined) return own;
  return idx.byPath.get(cat.prefix + cat.modules[m.alias].p);
}

// Model-branch labels from the tree recovery: 'T8214' / 'T8214*' (prefix test) for the branch taken on
// the owner's doorbell, '!T8214' for the else side; other models (such as 'T8214C') keep their name.
const OWNER = new Set(['T8214', 'T8214*']);
export function branchHidden(labels, variant) {
  if (!labels || variant === 'all') return false;
  return labels.some(l => {
    const neg = l.startsWith('!'), owner = OWNER.has(neg ? l.slice(1) : l);
    return variant === 'T8214' ? (owner ? neg : !neg) : owner && !neg;
  });
}
export const branchText = labels => labels.map(l => (l.startsWith('!') ? `not ${l.slice(1)}` : l)).join(' · ');
