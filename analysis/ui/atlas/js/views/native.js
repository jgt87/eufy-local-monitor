// Native Android layouts: grouped list and a rendered preview of one layout.
import { h, clear } from '../dom.js';
import * as data from '../data.js';
import { createNativeRenderer } from '../native-render.js';

const PREFIX_TITLES = {
  activity: 'Activities', fragment: 'Fragments', dialog: 'Dialogs', item: 'List items', view: 'Custom views', layout: 'Layout parts',
  bdb: 'Battery doorbell (bdb)', bdb2: 'Battery doorbell 2', vdb: 'Video doorbell (vdb)', esl: 'Smart lock (esl)', wl: 'Wall light (wl)', fg: 'Floodlight/garage cam (fg)',
  sd: 'Solo/SD camera (sd)', solo: 'SoloCam', hb: 'HomeBase', hb3: 'HomeBase 3', garage: 'Garage', grage: 'Garage', ic: 'Indoor cam (ic)', tracker: 'Tracker', ss: 'Smart safe (ss)',
};
const PINNED = ['activity_live_video', 'fragment_live_display', 'activity_event', 'activity_login_home_security', 'activity_login_layout', 'activity_splash_layout', 'activity_house_device_list_layout', 'activity_live_stream_mode', 'activity_check_homebase3_update', 'activity_customizehomepage_layout'];

let mode = 'light';

export async function nativeListView() {
  const names = await data.nativeLayouts();
  const groups = new Map();
  for (const n of names) {
    const p = n.split('_')[0];
    const key = groups.has(p) || names.filter(x => x.startsWith(`${p}_`)).length > 15 ? p : 'other';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(n);
  }
  const body = h('div', { class: 'folders' });
  let q = '';
  const draw = () => {
    body.replaceChildren(...[...groups].sort((a, b) => b[1].length - a[1].length).map(([p, ns]) => {
      const shown = ns.filter(n => !q || n.includes(q));
      if (!shown.length) return null;
      return h('details', { class: 'folder', open: q ? true : undefined }, h('summary', {}, PREFIX_TITLES[p] || p, h('small', {}, shown.length)),
        h('div', { class: 'chips' }, ...shown.map(n => h('a', { class: 'chip', href: `#/native/${n}` }, n))));
    }).filter(Boolean));
  };
  draw();
  return h('div', { class: 'page' },
    h('h1', {}, 'Native layouts'),
    h('p', { class: 'lede' }, `${names.length} layout XML files decoded from the base APK. These cover the Java/Kotlin screens: device setup wizards, older device settings, live view chrome and dialogs. Their controller code is in the protected DEX, so which screen uses which layout is inferred from names.`),
    h('div', { class: 'chips pinned' }, ...PINNED.filter(n => names.includes(n)).map(n => h('a', { class: 'chip screen', href: `#/native/${n}` }, n))),
    h('div', { class: 'toolbar' }, h('input', { type: 'search', placeholder: 'Filter layouts', 'aria-label': 'Filter layouts', oninput: e => { q = e.target.value.toLowerCase(); draw(); } })),
    body,
  );
}

export async function nativeLayoutView(name) {
  const phone = h('div', { class: 'phone' });
  const statsLine = h('p', { class: 'muted small' });
  const xmlBox = h('pre', { class: 'json xml' });
  let showGone = false;
  async function draw() {
    clear(phone).append(h('p', { class: 'muted' }, 'Rendering…'));
    const r = await createNativeRenderer(mode);
    try {
      const node = await r.render(name);
      node.classList.toggle('show-gone', showGone);
      clear(phone).append(h('div', { class: 'phone-screen native' }, node));
    } catch (err) { clear(phone).append(h('div', { class: 'error' }, String(err))); }
    const custom = [...r.stats.custom].sort((a, b) => b[1] - a[1]);
    statsLine.replaceChildren(`${r.stats.views} views · ${r.stats.includes} includes`, custom.length ? ` · custom views: ${custom.slice(0, 6).map(([n, c]) => `${n.split('.').pop()}×${c}`).join(', ')}` : '',
      r.stats.missing.size ? ` · unresolved resources: ${[...r.stats.missing].slice(0, 6).join(', ')}` : '');
  }
  xmlBox.textContent = await data.text(`decoded/resources/res/layout/${name}.xml`);
  const modeBtn = h('button', { class: 'tab', type: 'button', onclick: () => { mode = mode === 'light' ? 'dark' : 'light'; modeBtn.textContent = mode === 'light' ? 'Dark mode' : 'Light mode'; draw(); } }, mode === 'light' ? 'Dark mode' : 'Light mode');
  const goneBtn = h('button', { class: 'tab', type: 'button', onclick: () => { showGone = !showGone; goneBtn.classList.toggle('active', showGone); phone.querySelector('.nv-root')?.classList.toggle('show-gone', showGone); } }, 'Show hidden views');
  draw();
  return h('div', { class: 'page screen-page' },
    h('p', { class: 'crumbs' }, h('a', { href: '#/native' }, 'Native layouts')),
    h('h1', {}, name),
    h('div', { class: 'toolbar' }, modeBtn, goneBtn),
    statsLine,
    h('div', { class: 'screen-grid' }, h('div', { class: 'phone-col' }, phone), h('div', { class: 'side' }, h('details', { class: 'section', open: true }, h('summary', {}, 'Layout XML'), xmlBox))),
  );
}
