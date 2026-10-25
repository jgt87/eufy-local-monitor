// One screen or component: phone preview plus text, images, imports and the raw tree.
import { h, shortName, clear } from '../dom.js';
import * as data from '../data.js';
import { branchText } from '../data.js';
import { createRenderer, mainComponent } from '../rn-render.js';
import { BUNDLE_TITLES } from '../main.js';

let mode = 'light', variant = 'all';
const VARIANTS = { all: 'All branches', T8214: 'T8214', other: 'Other models' };

export async function screenView(bundle, index) {
  const [cat, rc] = await Promise.all([data.catalog(bundle), data.renderContext(bundle)]);
  const m = cat.modules[index];
  if (!m) return h('p', {}, 'No such module.');
  const tm = data.treeModuleFor(cat, rc.idx, index);
  const comps = tm ? tm.comps : [];
  const main = mainComponent(tm);
  let current = main, treeIndex;

  const phone = h('div', { class: 'phone' });
  const inspector = h('div', { class: 'inspector' }, h('p', { class: 'muted' }, 'Select an element in the preview to see its source component and props.'));
  const statsLine = h('p', { class: 'muted small' });

  function draw() {
    clear(phone);
    if (!current) { phone.append(h('div', { class: 'phone-empty' }, 'No element tree was recovered for this file.')); return; }
    const r = createRenderer(rc, { mode, variant, onSelect: (info, val) => showInfo(info, val) });
    const t0 = performance.now();
    try {
      phone.append(h('div', { class: 'phone-screen' }, r.renderComponent(current, treeIndex)));
    } catch (err) {
      phone.append(h('div', { class: 'error' }, String(err)));
    }
    const ms = Math.round(performance.now() - t0);
    const unresolved = [...r.stats.unresolved].sort((a, b) => b[1] - a[1]);
    statsLine.replaceChildren(`${r.stats.elements} elements · ${r.stats.expanded} components expanded · ${r.stats.texts} strings · ${r.stats.images} images${r.stats.branches ? ` · ${r.stats.branches} in a model branch` : ''} · ${ms} ms`,
      unresolved.length ? h('span', {}, ` · unresolved: ${unresolved.slice(0, 8).map(([n, c]) => `${n}×${c}`).join(', ')}`) : '');
  }

  function showInfo(info, val) {
    const props = {};
    for (const [k, v] of Object.entries(info.props || {})) if (k !== 'children') props[k] = v;
    clear(inspector).append(
      h('h3', {}, info.name, h('small', {}, ` ${info.kind}`)),
      info.module ? h('p', { class: 'small' }, h('code', {}, info.module)) : null,
      info.style ? h('pre', { class: 'json' }, JSON.stringify(info.style, null, 1)) : null,
      h('details', {}, h('summary', {}, 'Recovered props'), h('pre', { class: 'json' }, JSON.stringify(props, null, 1).slice(0, 6000))),
    );
  }

  const compPicker = comps.length > 1 ? h('select', {
    'aria-label': 'Component in this file',
    onchange: e => { current = comps[Number(e.target.value)]; treeIndex = undefined; buildTreePicker(); draw(); },
  }, ...comps.map((c, i) => h('option', { value: i, selected: c === current }, `${c.name || (c.fid === tm.exports.default ? 'default export' : 'component')} · fn ${c.fid}${c.render ? ' (render)' : ''}`))) : null;
  const treePickerSlot = h('span');
  function buildTreePicker() {
    clear(treePickerSlot);
    // Model-branch trees are elements built inside an isT8214 branch that the returned tree lost.
    const branches = current?.branches || [];
    if (current && current.trees.length + branches.length > 1) {
      treePickerSlot.append(h('select', { 'aria-label': 'Returned tree', onchange: e => { treeIndex = e.target.value === '' ? undefined : e.target.value.startsWith('b') ? e.target.value : Number(e.target.value); draw(); } },
        h('option', { value: '' }, 'Largest return'), ...current.trees.map((_, i) => h('option', { value: i }, `Return ${i + 1}`)),
        ...branches.map((b, i) => h('option', { value: `b${i}` }, `Branch: ${branchText(b.c)}`))));
    }
  }
  buildTreePicker();
  const modeBtn = h('button', { class: 'tab', type: 'button', onclick: () => { mode = mode === 'light' ? 'dark' : 'light'; modeBtn.textContent = mode === 'light' ? 'Dark mode' : 'Light mode'; draw(); } }, mode === 'light' ? 'Dark mode' : 'Light mode');

  const hasBranches = tm && JSON.stringify(tm.comps).includes('"$c"') || comps.some(c => c.branches);
  const variantPicker = hasBranches ? h('select', { 'aria-label': 'Device model branch', onchange: e => { variant = e.target.value; draw(); } },
    ...Object.entries(VARIANTS).map(([k, label]) => h('option', { value: k, selected: k === variant }, label))) : null;

  draw();
  const link = i => h('a', { href: `#/b/${bundle}/${i}` }, shortName(cat.modules[i].p));
  return h('div', { class: 'page screen-page' },
    h('p', { class: 'crumbs' }, h('a', { href: `#/b/${bundle}` }, BUNDLE_TITLES[bundle] || bundle), ' / ', m.p.split('_').slice(0, -1).join('/')),
    h('h1', {}, shortName(m.p), h('small', {}, ` ${m.kind}`)),
    m.alias !== undefined ? h('p', { class: 'muted small' }, 'This file re-exports ', link(m.alias), '; the preview shows that screen.') : null,
    h('div', { class: 'toolbar' }, compPicker, treePickerSlot, variantPicker, modeBtn, m.navigates.length || cat.modules.some(x => x.navigates.includes(index)) ? h('a', { class: 'tab', href: `#/map/${bundle}/${index}` }, 'Screen map') : null),
    statsLine,
    h('div', { class: 'screen-grid' },
      h('div', { class: 'phone-col' }, phone),
      h('div', { class: 'side' },
        inspector,
        section('Text', m.text.length, h('table', { class: 'kv' }, ...m.text.map(([k, t]) => h('tr', {}, h('td', {}, h('code', {}, k)), h('td', {}, typeof rc.lang[k] === 'string' ? rc.lang[k] : t))))),
        section('Images', m.images.length, h('div', { class: 'thumbs' }, ...m.images.map(img => h('figure', {}, img.src ? h('img', { src: `/${img.src}`, alt: img.name, loading: 'lazy' }) : h('div', { class: 'missing' }), h('figcaption', {}, `${img.name} · ${img.w}×${img.h}`))))),
        section('Imports', m.deps.length, h('div', { class: 'chips' }, ...m.deps.map(i => h('span', { class: `chip ${cat.modules[i].kind}` }, link(i))))),
        m.t8214 ? section('T8214', m.t8214.refs.length + (m.t8214.via?.length || 0), t8214Info(m, link)) : null,
        section('Navigates to', m.navigates.length, h('div', { class: 'chips' }, ...m.navigates.map(i => h('span', { class: 'chip screen' }, link(i))))),
        section('Colours', m.colors.length, h('div', { class: 'swatches' }, ...m.colors.map(c => h('span', { class: 'swatch', title: c }, h('i', { style: { background: c } }), c)))),
        section('Recovered tree (JSON)', current ? 1 : 0, h('pre', { class: 'json' }, current ? JSON.stringify(current.trees, null, 1).slice(0, 40000) : '')),
      ),
    ),
  );
}

function t8214Info(m, link) {
  const t = m.t8214;
  return h('div', { class: 'small' },
    t.refs.length ? h('p', {}, 'References in this file: ', ...t.refs.map(r => h('code', {}, r)).flatMap((c, i) => (i ? [' ', c] : [c]))) : null,
    t.via?.length ? h('p', {}, 'Through its logic files: ', ...t.via.map(link).flatMap((c, i) => (i ? [', ', c] : [c]))) : null,
    h('p', { class: 'muted' }, t.branches
      ? `${t.branches} element${t.branches === 1 ? '' : 's'} recovered inside a T8214 branch: marked in the preview, filtered by the model selector, and listed as "Branch" trees in the tree selector.`
      : 'No element was recovered inside a T8214 branch: the check decides navigation, values or props, or its branch could not be separated from the straight-line tree.'),
  );
}

function section(title, count, body) {
  if (!count) return null;
  return h('details', { class: 'section', open: title === 'Text' || title === 'T8214' || undefined }, h('summary', {}, title, h('small', {}, count)), body);
}
