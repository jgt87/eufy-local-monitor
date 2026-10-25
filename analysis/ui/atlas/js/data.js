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
export const lang = b => atlas(`lang/${b}.json`);
export const tokens = () => atlas('tokens.json');
export const searchIndex = () => atlas('search.json');
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
