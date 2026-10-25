// T8214 variants: screens and components that branch on the owner's doorbell model (isT8214 checks,
// 'T8214' literals, T8214 text keys), grouped by how much of the branch the tree recovery could place.
import { h, shortName, folderOf } from '../dom.js';
import * as data from '../data.js';
import { BUNDLE_TITLES } from '../main.js';

const GROUPS = [
  ['branch', 'Elements inside a T8214 branch', 'The preview marks these elements and the model selector on the screen page hides or keeps them.'],
  ['direct', 'References the model directly', 'The file checks the model, but the check decides navigation, values or props, or its branch could not be separated from the straight-line tree.'],
  ['via', 'Through a view model or hook', 'The file itself has no check; a logic file of the same feature that it imports calls isT8214.'],
];

export async function t8214View() {
  const list = (await data.bundles()).filter(b => b.t8214);
  const rows = [];
  for (const b of list) {
    const cat = await data.catalog(b.bundle);
    cat.modules.forEach((m, i) => {
      if (m.kind === 'logic' || !m.t8214) return;
      const group = m.t8214.branches ? 'branch' : m.t8214.refs.length ? 'direct' : 'via';
      rows.push({ bundle: b.bundle, cat, m, i, group });
    });
  }
  const link = (r, i) => h('a', { href: `#/b/${r.bundle}/${i}` }, shortName(r.cat.modules[i].p));
  const join = (items, sep) => items.flatMap((x, k) => (k ? [sep, x] : [x]));
  const screens = rows.filter(r => r.m.kind === 'screen' || r.m.kind === 'modal').length;
  return h('div', { class: 'page' },
    h('h1', {}, 'T8214 variants'),
    h('p', { class: 'lede' }, `${rows.length} screens and components (${screens} screens and modals) change with the T8214 doorbell model. Control flow is followed only for these model checks: an element counts as inside the branch when it is built between the check and the end of its block.`),
    ...GROUPS.map(([key, title, note]) => {
      const rs = rows.filter(r => r.group === key).sort((a, b) => (b.m.t8214.branches - a.m.t8214.branches) || a.m.p.localeCompare(b.m.p));
      if (!rs.length) return null;
      return h('section', {},
        h('h2', {}, title, h('small', { class: 'muted' }, ` ${rs.length}`)),
        h('p', { class: 'muted small' }, note),
        h('table', { class: 'map-list' },
          h('thead', {}, h('tr', {}, h('th', {}, 'File'), h('th', {}, 'Bundle'), h('th', {}, key === 'via' ? 'Through' : 'References'), key === 'branch' ? h('th', {}, 'Branch elements') : null)),
          h('tbody', {}, ...rs.map(r => h('tr', {},
            h('td', {}, h('a', { href: `#/b/${r.bundle}/${r.i}` }, h('strong', {}, shortName(r.m.p))), h('small', { class: 'muted' }, ` ${r.m.kind}`), h('span', { class: 'folder-path' }, folderOf(r.m.p))),
            h('td', {}, BUNDLE_TITLES[r.bundle] || r.bundle),
            h('td', {}, key === 'via' ? join(r.m.t8214.via.map(i => link(r, i)), ', ') : join(r.m.t8214.refs.map(x => h('code', {}, x)), ' ')),
            key === 'branch' ? h('td', {}, String(r.m.t8214.branches)) : null,
          )))),
      );
    }),
  );
}
