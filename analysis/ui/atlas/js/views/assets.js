// Image assets imported by one bundle (React Native asset modules).
import { h } from '../dom.js';
import * as data from '../data.js';

export async function assetsView(bundle) {
  const map = await data.assets(bundle);
  const items = Object.entries(map).filter(([, a]) => a.src).sort((a, b) => a[1].name.localeCompare(b[1].name));
  const grid = h('div', { class: 'thumbs big' });
  const draw = q => grid.replaceChildren(...items.filter(([, a]) => !q || a.name.toLowerCase().includes(q)).map(([p, a]) =>
    h('figure', { title: p }, h('img', { src: `/${a.src}`, alt: a.name, loading: 'lazy' }), h('figcaption', {}, `${a.name} · ${a.w}×${a.h}`))));
  draw('');
  return h('div', { class: 'page' },
    h('h1', {}, `Image assets · ${bundle}`),
    h('p', { class: 'muted' }, `${items.length} assets with a packaged drawable. Night variants are separate assets, usually with a "dark" or "night" suffix.`),
    h('div', { class: 'toolbar' }, h('input', { type: 'search', placeholder: 'Filter by name', 'aria-label': 'Filter by name', oninput: e => draw(e.target.value.toLowerCase()) })),
    grid,
  );
}
