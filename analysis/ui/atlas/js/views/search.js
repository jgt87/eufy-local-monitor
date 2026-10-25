// Text search across screens, modals and components of every bundle: file names, raw text keys and the
// texts they display in the chosen preview language. A screen also matches through the components it
// imports directly. The header box shows the top hits; #/search/<query> lists them all.
import { h, clear, shortName, folderOf } from '../dom.js';
import * as data from '../data.js';
import { BUNDLE_TITLES } from '../main.js';

let rowsFor = { code: null, rows: null };
async function rows() {
  const code = data.getLanguage();
  if (rowsFor.code === code) return rowsFor.rows;
  const rowsP = (async () => {
    const [{ keys, entries }, list, native] = await Promise.all([data.searchIndex(), data.bundles(), data.nativeStrings()]);
    const tables = Object.fromEntries(await Promise.all(list.map(async b => [b.bundle, await data.lang(b.bundle, code)])));
    const sdk = tables['zx-rnsdk'] ?? {};
    const at = new Map(entries.map((e, n) => [`${e[0]}/${e[1]}`, n]));
    const out = entries.map(([bundle, i, p, kind, ids, kids]) => {
      const t = tables[bundle] ?? {};
      const texts = ids.map(id => {
        const k = keys[id], v = t[k] ?? sdk[k] ?? native[k];
        return [k, typeof v === 'string' ? v : /\s/.test(k) ? k : ''];
      });
      const name = shortName(p);
      return { bundle, i, p, kind, name, texts, kids, hay: [name, p, ...texts.flat()].join('\n').toLowerCase() };
    });
    for (const r of out) r.kidRows = r.kids.map(k => out[at.get(`${r.bundle}/${k}`)]).filter(Boolean);
    return out;
  })();
  rowsFor = { code, rows: rowsP };
  return rowsP;
}

const KIND_RANK = { screen: 0, modal: 0, component: 1 };
export async function search(query) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const phrase = terms.join(' ');
  const all = s => terms.every(t => s.includes(t));
  const hits = [];
  for (const r of await rows()) {
    let src = r, via = null;
    if (!all(r.hay)) {
      if (r.kind === 'component' || !(via = r.kidRows.find(k => all(k.hay)))) continue;
      src = via;
    }
    const scored = src.texts.map(([k, v]) => {
      const tv = v.toLowerCase(), tk = k.toLowerCase();
      return [k, v, tv === phrase ? 1 : tv.includes(phrase) ? 2 : tk.includes(phrase) ? 3 : terms.some(t => tv.includes(t) || tk.includes(t)) ? 4 : 9];
    }).filter(x => x[2] < 9).sort((a, b) => a[2] - b[2] || a[1].length - b[1].length);
    const name = r.name.toLowerCase().includes(terms.join('')) ? 0 : 9;
    const score = Math.min(name, scored[0]?.[2] ?? 5) + (via ? 5 : 0);
    hits.push({ ...r, via, score, matches: scored.slice(0, 3) });
  }
  return hits.sort((a, b) => a.score - b.score || KIND_RANK[a.kind] - KIND_RANK[b.kind] || a.name.length - b.name.length);
}

// Wraps the query terms in <mark>.
function marked(text, query) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean).map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!terms.length || !text) return text;
  return text.split(new RegExp(`(${terms.join('|')})`, 'gi')).map((s, i) => (i % 2 ? h('mark', {}, s) : s));
}

function hitBody(hit, query) {
  return [
    h('strong', {}, marked(hit.name, query)),
    h('small', {}, `${hit.kind} · ${BUNDLE_TITLES[hit.bundle] || hit.bundle} · ${folderOf(hit.p)}`),
    hit.via ? h('small', {}, 'Text in its component ', h('code', {}, hit.via.name)) : null,
    ...hit.matches.map(([k, v]) => h('span', { class: 'hit-text' }, v ? marked(v, query) : null, h('code', {}, marked(k, query)))),
  ];
}

export function initSearch(input, results) {
  let seq = 0;
  async function run() {
    const q = input.value.trim(), n = ++seq;
    if (q.length < 2) { results.hidden = true; return; }
    const hits = await search(q);
    if (n !== seq) return;
    const close = () => { results.hidden = true; };
    results.replaceChildren(...(hits.length
      ? [...hits.slice(0, 8).map(hit => h('a', { href: `#/b/${hit.bundle}/${hit.i}`, onclick: close }, hitBody(hit, q))),
        h('a', { class: 'search-all', href: `#/search/${encodeURIComponent(q)}`, onclick: close }, `All ${hits.length} result${hits.length === 1 ? '' : 's'}`)]
      : [h('p', { class: 'muted' }, 'No matches.')]));
    results.hidden = false;
  }
  input.addEventListener('input', run);
  input.addEventListener('focus', run);
  document.addEventListener('click', e => { if (e.target !== input && !results.contains(e.target)) results.hidden = true; });
  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') { results.hidden = true; input.blur(); }
    if (e.key === 'Enter' && input.value.trim()) { results.hidden = true; location.hash = `#/search/${encodeURIComponent(input.value.trim())}`; }
  });
}

const FILTERS = { all: 'All', screens: 'Screens and modals', components: 'Components' };
let filter = 'screens';
export async function searchView(query = '') {
  const list = h('div', { class: 'search-page-results' });
  const count = h('p', { class: 'muted small' });
  const tabs = h('div', { class: 'tabs' });
  const field = h('input', { type: 'search', class: 'search-page-input', value: query, placeholder: 'Text, text key or file name', 'aria-label': 'Search text' });
  let hits = [];
  const langName = (await data.langs()).find(l => l.code === data.getLanguage())?.code ?? 'en';
  function draw() {
    const shown = hits.filter(x => filter === 'all' || (filter === 'components' ? x.kind === 'component' : x.kind !== 'component'));
    clear(tabs).append(...Object.entries(FILTERS).map(([k, label]) => h('button', { type: 'button', class: `tab${k === filter ? ' active' : ''}`, onclick: () => { filter = k; draw(); } },
      label, h('small', {}, k === 'all' ? hits.length : hits.filter(x => (k === 'components') === (x.kind === 'component')).length))));
    count.textContent = !field.value.trim() ? 'Type at least two characters.' : `${shown.length} match${shown.length === 1 ? '' : 'es'} · texts in ${languageLabel(langName)}${shown.length > 300 ? ' · showing the first 300' : ''}`;
    clear(list).append(...shown.slice(0, 300).map(hit => h('a', { class: 'search-hit', href: `#/b/${hit.bundle}/${hit.i}` }, hitBody(hit, field.value.trim()))));
  }
  async function run() {
    const q = field.value.trim();
    hits = q.length < 2 ? [] : await search(q);
    draw();
  }
  let timer;
  field.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => { history.replaceState(null, '', `#/search/${encodeURIComponent(field.value.trim())}`); run(); }, 150);
  });
  await run();
  setTimeout(() => field.focus(), 0);
  return h('div', { class: 'page' },
    h('h1', {}, 'Search'),
    h('p', { class: 'lede' }, 'Finds screens by the text they show in the preview language (switch it in the header), by raw text key and by file name. A screen also matches through the components it imports directly.'),
    field, h('div', { class: 'toolbar' }, tabs), count, list);
}

export function languageLabel(code) {
  try { return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) || code; } catch { return code; }
}
