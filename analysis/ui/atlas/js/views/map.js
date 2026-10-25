// Screen navigation map: which files open which screens, from the catalogue's `navigates` field
// (screen names and registry route names a file mentions). Per bundle as an outgoing/incoming list,
// per screen as a graph of its direct links. Route registries (NavigationConfig, Navigator) are left out.
import { h, shortName, folderOf } from '../dom.js';
import * as data from '../data.js';
import { BUNDLE_TITLES } from '../main.js';

const SVG = 'http://www.w3.org/2000/svg';
const s = (tag, attrs = {}, ...children) => {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined) el.setAttribute(k, v);
  el.append(...children);
  return el;
};

// Outgoing and incoming links per module index, without the registries.
async function linkIndex(bundle) {
  const cat = await data.catalog(bundle);
  const out = new Map(), inc = new Map();
  cat.modules.forEach((m, i) => {
    if (m.registry || !m.navigates.length) return;
    out.set(i, m.navigates);
    for (const j of m.navigates) (inc.get(j) || inc.set(j, []).get(j)).push(i);
  });
  return { cat, out, inc };
}

const chip = (bundle, cat, i, href = `#/b/${bundle}/${i}`) => h('a', { class: `chip ${cat.modules[i].kind}`, href, title: cat.modules[i].p }, shortName(cat.modules[i].p));

export async function mapView(bundle, focus) {
  const list = (await data.bundles()).filter(b => b.links);
  if (!bundle) bundle = [...list].sort((a, b) => b.links - a.links)[0]?.bundle;
  if (!bundle) return h('p', {}, 'No navigation links were recovered.');
  const tabs = h('div', { class: 'tabs wrap' }, ...list.map(b => h('a', { class: b.bundle === bundle ? 'tab active' : 'tab', href: `#/map/${b.bundle}` }, BUNDLE_TITLES[b.bundle] || b.bundle, h('small', {}, b.links))));
  return focus === undefined ? listPage(bundle, tabs) : focusPage(bundle, focus);
}

async function listPage(bundle, tabs) {
  const { cat, out, inc } = await linkIndex(bundle);
  const rows = [...new Set([...out.keys(), ...inc.keys()])]
    .sort((a, b) => cat.modules[a].p.localeCompare(cat.modules[b].p));
  const registries = cat.modules.filter(m => m.registry).map(m => shortName(m.p));
  const body = h('tbody');
  let query = '';
  function draw() {
    const shown = rows.filter(i => !query || cat.modules[i].p.toLowerCase().includes(query));
    body.replaceChildren(...shown.map(i => {
      const m = cat.modules[i];
      return h('tr', {},
        h('td', {}, h('a', { href: `#/map/${bundle}/${i}`, title: 'Show the link graph of this file' }, h('strong', {}, shortName(m.p))), ' ',
          m.t8214 ? h('span', { class: 'tag' }, 'T8214') : null, h('span', { class: 'folder-path' }, folderOf(m.p))),
        h('td', {}, h('div', { class: 'chips' }, ...(inc.get(i) || []).map(j => chip(bundle, cat, j)))),
        h('td', {}, h('div', { class: 'chips' }, ...(out.get(i) || []).map(j => chip(bundle, cat, j)))),
      );
    }));
    if (!shown.length) body.append(h('tr', {}, h('td', { colspan: 3, class: 'muted' }, 'Nothing matches.')));
  }
  draw();
  const links = [...out.values()].reduce((n, l) => n + l.length, 0);
  return h('div', { class: 'page' },
    h('h1', {}, 'Screen map', h('small', {}, BUNDLE_TITLES[bundle] || bundle)),
    h('p', { class: 'muted' }, `${links} links between ${rows.length} files. A link means the file names the target screen or one of its registry routes, usually in a navigate() call; conditions are not followed.`,
      registries.length ? ` Route registries left out: ${registries.join(', ')}.` : ''),
    h('div', { class: 'toolbar' }, tabs),
    h('div', { class: 'toolbar' }, h('input', { type: 'search', placeholder: 'Filter by path', 'aria-label': 'Filter by path', oninput: e => { query = e.target.value.toLowerCase(); draw(); } })),
    h('table', { class: 'map-list' }, h('thead', {}, h('tr', {}, h('th', {}, 'File'), h('th', {}, 'Opened from'), h('th', {}, 'Opens'))), body),
  );
}

// One file's direct links: callers on the left, targets on the right. Nodes open their own graph.
async function focusPage(bundle, focus) {
  const { cat, out, inc } = await linkIndex(bundle);
  const m = cat.modules[focus];
  if (!m) return h('p', {}, 'No such module.');
  const left = inc.get(focus) || [], right = out.get(focus) || [];
  const W = 860, NW = 230, NH = 28, GAP = 8, TOP = 34;
  const rowsN = Math.max(left.length, right.length, 1);
  const H = TOP + rowsN * (NH + GAP) + 16;
  const cy = TOP + (rowsN * (NH + GAP) - GAP) / 2;
  const colY = (n, k) => TOP + (rowsN - n) * (NH + GAP) / 2 + k * (NH + GAP);
  const cx = (W - NW) / 2, lx = 12, rx = W - NW - 12;
  const svg = s('svg', { class: 'map-graph', viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': `Links of ${shortName(m.p)}` });
  const label = (text, max = 30) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);
  const node = (i, x, y, center) => {
    const mod = cat.modules[i];
    return s('a', { class: `node ${mod.kind}${center ? ' center' : ''}`, href: center ? `#/b/${bundle}/${i}` : `#/map/${bundle}/${i}` },
      s('title', {}, `${mod.p}${center ? ' (open the screen)' : ' (show its links)'}`),
      s('rect', { x, y, width: NW, height: NH, rx: 6 }),
      s('text', { x: x + 10, y: y + NH / 2 + 4 }, label(shortName(mod.p)) + (mod.t8214 ? '  · T8214' : '')));
  };
  const edge = (x1, y1, x2, y2) => s('path', { class: 'edge', d: `M${x1},${y1} C${(x1 + x2) / 2},${y1} ${(x1 + x2) / 2},${y2} ${x2},${y2}` });
  svg.append(
    s('text', { class: 'col-label', x: lx, y: 20 }, `Opened from (${left.length})`),
    s('text', { class: 'col-label', x: rx, y: 20 }, `Opens (${right.length})`),
    ...left.map((i, k) => edge(lx + NW, colY(left.length, k) + NH / 2, cx, cy)),
    ...right.map((i, k) => edge(cx + NW, cy, rx, colY(right.length, k) + NH / 2)),
    ...left.map((i, k) => node(i, lx, colY(left.length, k), false)),
    ...right.map((i, k) => node(i, rx, colY(right.length, k), false)),
    node(focus, cx, cy - NH / 2, true),
  );
  return h('div', { class: 'page' },
    h('p', { class: 'crumbs' }, h('a', { href: `#/map/${bundle}` }, `Screen map / ${BUNDLE_TITLES[bundle] || bundle}`), ' / ', folderOf(m.p)),
    h('h1', {}, shortName(m.p), h('small', {}, ` ${m.kind}`)),
    h('div', { class: 'toolbar' }, h('a', { class: 'tab', href: `#/b/${bundle}/${focus}` }, 'Open screen'), h('a', { class: 'tab', href: `#/map/${bundle}` }, 'All links')),
    left.length || right.length ? svg : h('p', { class: 'muted' }, 'No links to or from this file were recovered.'),
    h('p', { class: 'muted small' }, 'Click a node to show its own links; the middle node opens the screen.'),
  );
}
