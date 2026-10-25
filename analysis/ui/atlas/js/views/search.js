// Global search across screens, modals and components of every bundle.
import { h } from '../dom.js';
import * as data from '../data.js';

export function initSearch(input, results) {
  let index = null;
  async function run() {
    const q = input.value.trim().toLowerCase();
    if (q.length < 2) { results.hidden = true; return; }
    index ||= await data.searchIndex();
    const hits = index.filter(([, , p]) => p.toLowerCase().includes(q))
      .sort((a, b) => (a[3] === 'screen' ? 0 : 1) - (b[3] === 'screen' ? 0 : 1) || a[2].length - b[2].length).slice(0, 40);
    results.replaceChildren(...(hits.length ? hits.map(([b, i, p, kind]) =>
      h('a', { href: `#/b/${b}/${i}`, onclick: () => { results.hidden = true; } }, h('strong', {}, p.split('_').pop()), h('small', {}, `${kind} · ${b} · ${p.split('_').slice(0, -1).join('/')}`)))
      : [h('p', { class: 'muted' }, 'No matches.')]));
    results.hidden = false;
  }
  input.addEventListener('input', run);
  input.addEventListener('focus', run);
  document.addEventListener('click', e => { if (e.target !== input && !results.contains(e.target)) results.hidden = true; });
  input.addEventListener('keydown', e => { if (e.key === 'Escape') { results.hidden = true; input.blur(); } });
}
