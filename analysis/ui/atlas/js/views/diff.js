// Compare versions (#/diff[/<old>/<new>]): added, removed and changed screens, changed texts and T8214
// changes between two version manifests. Links open screens in the data the atlas currently shows.
import { h, clear, shortName, folderOf } from '../dom.js';
import * as data from '../data.js';
import { BUNDLE_TITLES } from '../main.js';
import { diffManifests, diffSummary } from '../version-diff.js';

const vLabel = v => `${v.version ? `${v.version} · ${v.build}` : v.id}${v.source ? ` (${v.source})` : ''}`;
let withComponents = false;

export async function diffView(aId, bId) {
  const index = await data.versionIndex();
  const ids = index.versions.map(v => v.id);
  if (ids.length < 2) return emptyState(index);
  const b = ids.includes(bId) ? bId : ids[ids.length - 1];
  const a = ids.includes(aId) && aId !== b ? aId : ids.filter(x => x !== b).pop();
  const [ma, mb] = await Promise.all([data.manifest(a), data.manifest(b)]);
  const pick = (value, other, label) => h('label', { class: 'check' }, h('small', {}, label), h('select', {
    'aria-label': `${label} version`, onchange: e => { location.hash = label === 'Old' ? `#/diff/${e.target.value}/${other}` : `#/diff/${other}/${e.target.value}`; },
  }, ...index.versions.map(v => h('option', { value: v.id, selected: v.id === value }, vLabel(v)))));
  return h('div', { class: 'page' },
    h('h1', {}, 'Compare versions'),
    h('p', { class: 'lede' }, 'Screens are matched by bundle and source path. A tree change means the recovered element tree differs (function ids and minified component names are ignored); texts are the text keys a file shows; strings compare the English language tables.'),
    h('div', { class: 'toolbar' }, pick(a, b, 'Old'), h('span', { class: 'muted' }, '→'), pick(b, a, 'New')),
    await renderDiff(diffManifests(ma, mb), { current: index.current, strings: [ma, mb] }));
}

function emptyState(index) {
  const v = index.versions;
  return h('div', { class: 'page' },
    h('h1', {}, 'Compare versions'),
    h('p', { class: 'lede' }, v.length
      ? `The atlas has one version manifest: ${vLabel(v[0])}. A comparison needs a second APK set.`
      : 'No version manifest yet. Rebuild the atlas data once (node analysis/ui/tools/build-all.mjs) to write the manifest of the current APK set.'),
    h('section', { class: 'empty-state' },
      h('h2', {}, 'Add another version'),
      h('ol', { class: 'notes' },
        h('li', {}, 'Put the other APK set (the base APK named like ', h('code', {}, 'Anker_eufy-<version>_<build>.apk'), ' plus ', h('code', {}, 'feature_asset_pack.apk'), ') in its own folder next to ', h('code', {}, 'APKDownload'), ', for example ', h('code', {}, 'APKDownload-6.2.0'), '. The folder is only read.'),
        h('li', {}, 'Build it: ', h('code', {}, 'node analysis/ui/tools/build-all.mjs --apk APKDownload-6.2.0'), '. Its work files go to ', h('code', {}, 'analysis/ui/versions/<version>/'), '; the atlas keeps showing the current data and only gains the manifest ', h('code', {}, 'ui/atlas/data/versions/<version>.json'), '.'),
        h('li', {}, 'Reload this page, or print the comparison with ', h('code', {}, 'node analysis/ui/tools/diff-versions.mjs'), '.'),
      )));
}

// Renders a diff. opts.current: the version the atlas data belongs to; opts.strings: [old, new] manifests
// for resolving text keys to English.
export async function renderDiff(d, opts = {}) {
  const at = new Map();
  for (const b of await data.bundles()) (await data.catalog(b.bundle)).modules.forEach((m, i) => at.set(`${b.bundle}/${m.p}`, i));
  const [sa, sb] = (opts.strings || []).map(m => m.bundles);
  const english = (side, bundle, k) => { const t = side?.[bundle]?.strings?.[k] ?? side?.['zx-rnsdk']?.strings?.[k]; return typeof t === 'string' ? t : ''; };
  const file = r => {
    const i = at.get(`${r.bundle}/${r.p}`);
    return h('td', {}, i !== undefined ? h('a', { href: `#/b/${r.bundle}/${i}` }, h('strong', {}, shortName(r.p))) : h('strong', {}, shortName(r.p)),
      h('small', { class: 'muted' }, ` ${r.kind}`), h('span', { class: 'folder-path' }, folderOf(r.p)));
  };
  const bundleCell = r => h('td', {}, BUNDLE_TITLES[r.bundle] || r.bundle);
  const keyList = (keys, side, bundle) => keys.slice(0, 12).map(k => h('div', { class: 'small' }, h('code', {}, k), english(side, bundle, k) ? ` ${english(side, bundle, k)}` : ''));
  const t8 = t => (t ? [t.refs.join(' ') || '–', t.via?.length ? ` · via ${t.via.map(shortName).join(', ')}` : '', t.labels?.length ? ` · branches ${t.labels.join(' ')}` : '', t.branches ? ` · ${t.branches} branch elements` : ''].join('') : '–');
  const body = h('div');
  const summary = diffSummary(d);
  function draw() {
    const show = r => withComponents || r.kind !== 'component';
    const table = (title, rows, head, cells, note) => {
      const rs = rows.filter(show);
      return h('section', {}, h('h2', {}, title, h('small', { class: 'muted' }, ` ${rs.length}`)), note ? h('p', { class: 'muted small' }, note) : null,
        rs.length ? h('table', { class: 'map-list' }, h('thead', {}, h('tr', {}, ...head.map(x => h('th', {}, x)))), h('tbody', {}, ...rs.slice(0, 400).map(r => h('tr', {}, ...cells(r)))))
          : h('p', { class: 'muted' }, 'None.'));
    };
    const strings = [...d.strings.changed.map(s => ['changed', s]), ...d.strings.added.map(s => ['added', s]), ...d.strings.removed.map(s => ['removed', s])];
    clear(body).append(
      h('div', { class: 'stats' }, ...[['Added', summary.added], ['Removed', summary.removed], ['Changed', summary.changed], ['T8214 changes', summary.t8214], ['Strings changed', summary.stringsChanged + summary.stringsAdded + summary.stringsRemoved]]
        .map(([k, n]) => h('div', { class: 'stat' }, h('strong', {}, n), h('span', {}, k)))),
      h('div', { class: 'toolbar' }, h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: withComponents, onchange: e => { withComponents = e.target.checked; draw(); } }), 'Include components')),
      opts.current ? h('p', { class: 'muted small' }, `Links open the screen in the data the atlas shows (${opts.current}); files missing from it are not linked.`) : null,
      table('Added', d.added, ['File', 'Bundle'], r => [file(r), bundleCell(r)]),
      table('Removed', d.removed, ['File', 'Bundle'], r => [file(r), bundleCell(r)]),
      table('Changed', d.changed, ['File', 'Bundle', 'What changed', 'Texts'], r => [file(r), bundleCell(r),
        h('td', {}, h('div', { class: 'chips' }, ...[r.kindWas && `was ${r.kindWas}`, r.tree && 'element tree', r.texts && `texts +${r.texts.added.length} −${r.texts.removed.length}`,
          r.navigates && `navigation +${r.navigates.added.length} −${r.navigates.removed.length}`, r.routes && 'routes', r.t8214 && 'T8214'].filter(Boolean).map(x => h('span', { class: 'chip' }, x)))),
        h('td', {}, r.texts ? [...keyList(r.texts.added, sb, r.bundle).map(x => (x.prepend('+ '), x)), ...keyList(r.texts.removed, sa, r.bundle).map(x => (x.prepend('− '), x))] : null)]),
      table('T8214 changes', d.t8214, ['File', 'Change', 'Old', 'New'], r => [file(r), h('td', {}, r.change), h('td', { class: 'small' }, t8(r.a)), h('td', { class: 'small' }, t8(r.b))],
        'Model references (isT8214 checks, T8214 literals and text keys), logic files they come through, and the branch labels of recovered elements.'),
      h('section', {}, h('h2', {}, 'Strings', h('small', { class: 'muted' }, ` ${strings.length}`)), h('p', { class: 'muted small' }, 'English language tables per bundle.'),
        strings.length ? h('table', { class: 'map-list' }, h('thead', {}, h('tr', {}, h('th', {}, 'Key'), h('th', {}, 'Change'), h('th', {}, 'Old'), h('th', {}, 'New'))),
          h('tbody', {}, ...strings.slice(0, 500).map(([op, s]) => h('tr', {}, h('td', {}, h('code', {}, s.key), h('span', { class: 'folder-path' }, BUNDLE_TITLES[s.bundle] || s.bundle)),
            h('td', {}, op), h('td', {}, typeof s.a === 'string' ? s.a : s.a ? JSON.stringify(s.a) : ''), h('td', {}, typeof s.b === 'string' ? s.b : s.b ? JSON.stringify(s.b) : '')))))
          : h('p', { class: 'muted' }, 'None.'),
        strings.length > 500 ? h('p', { class: 'muted small' }, `Showing 500 of ${strings.length}; node analysis/ui/tools/diff-versions.mjs --json <file> writes them all.`) : null),
    );
  }
  draw();
  return h('div', { class: 'diff', 'data-summary': JSON.stringify(summary) }, h('p', { class: 'muted small' }, `${vLabel(d.a)} → ${vLabel(d.b)}`), body);
}
