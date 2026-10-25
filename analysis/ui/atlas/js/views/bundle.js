// One RN bundle: its source folders with screens, modals and components.
import { h, shortName, folderOf } from '../dom.js';
import * as data from '../data.js';
import { BUNDLE_TITLES } from '../main.js';

const KIND_ORDER = { screen: 0, modal: 1, component: 2 };

export async function bundleView(bundle) {
  const [cat, idx] = await Promise.all([data.catalog(bundle), data.trees(bundle)]);
  const items = cat.modules.map((m, i) => ({ ...m, i })).filter(m => m.kind !== 'logic');
  const hasTree = m => idx.byPath.has(cat.prefix + m.p);
  let filter = 'screen', query = '';
  const list = h('div', { class: 'folders' });

  function draw() {
    list.replaceChildren();
    const shown = items.filter(m => (filter === 'all' || m.kind === filter) && (!query || m.p.toLowerCase().includes(query)));
    const groups = new Map();
    for (const m of shown) {
      const f = folderOf(m.p) || '(root)';
      if (!groups.has(f)) groups.set(f, []);
      groups.get(f).push(m);
    }
    for (const [folder, ms] of [...groups].sort((a, b) => a[0].localeCompare(b[0]))) {
      list.append(h('section', { class: 'folder' },
        h('h3', {}, folder),
        h('div', { class: 'chips' }, ...ms.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.p.localeCompare(b.p)).map(m =>
          h('a', { class: `chip ${m.kind}${hasTree(m) ? '' : ' no-tree'}`, href: `#/b/${bundle}/${m.i}`, title: hasTree(m) ? m.p : `${m.p} (no element tree recovered)` },
            shortName(m.p), m.text.length ? h('small', {}, m.text.length) : null))),
      ));
    }
    if (!shown.length) list.append(h('p', { class: 'muted' }, 'Nothing matches.'));
  }

  const tabs = ['screen', 'modal', 'component', 'all'].map(k => h('button', {
    class: k === filter ? 'tab active' : 'tab', type: 'button',
    onclick: e => { filter = k; for (const b of tabs) b.classList.toggle('active', b === e.currentTarget); draw(); },
  }, { screen: 'Screens', modal: 'Modals', component: 'Components', all: 'All' }[k], h('small', {}, k === 'all' ? items.length : items.filter(m => m.kind === k).length)));
  draw();
  return h('div', { class: 'page' },
    h('h1', {}, BUNDLE_TITLES[bundle] || bundle),
    h('p', { class: 'muted' }, h('code', {}, bundle), ` · ${cat.modules.length} app source files · `, h('a', { href: `#/assets/${bundle}` }, 'image assets')),
    h('div', { class: 'toolbar' }, h('div', { class: 'tabs' }, ...tabs),
      h('input', { type: 'search', placeholder: 'Filter by path', 'aria-label': 'Filter by path', oninput: e => { query = e.target.value.toLowerCase(); draw(); } })),
    list,
  );
}
