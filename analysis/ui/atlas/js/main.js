// Hash router and navigation for the UI atlas.
import { h, clear, errorBox, loading } from './dom.js';
import * as data from './data.js';
import { overviewView } from './views/overview.js';
import { bundleView } from './views/bundle.js';
import { screenView } from './views/screen.js';
import { tokensView } from './views/tokens.js';
import { nativeListView, nativeLayoutView } from './views/native.js';
import { assetsView } from './views/assets.js';
import { mapView } from './views/map.js';
import { t8214View } from './views/t8214.js';
import { initSearch, searchView, languageLabel } from './views/search.js';
import { diffView } from './views/diff.js';

export const BUNDLE_TITLES = {
  SEC_SETTING: 'Device settings', SEC_ADDDEVICE: 'Add device / onboarding', MEGA_PLAYER: 'Player and playback',
  ZX_EVENT: 'Events', ZX_EVENT_TAB: 'Events tab', ZX_AI: 'AI features and modes', ZX_GLOBAL: 'Global (security mode, scan)',
  ZX_T8030: 'HomeBase 3', ZX_WallLight: 'Wall light', 'zx-rnsdk': 'Shared SDK and UI kit',
};

const view = document.getElementById('view');
const nav = document.getElementById('nav');

async function buildNav() {
  const list = await data.bundles();
  clear(nav).append(
    h('a', { href: '#/' }, 'Overview'),
    h('a', { href: '#/tokens' }, 'Design tokens'),
    h('a', { href: '#/native' }, 'Native layouts'),
    h('a', { href: '#/map' }, 'Screen map'),
    h('a', { href: '#/search' }, 'Text search'),
    h('a', { href: '#/diff' }, 'Compare versions'),
    h('a', { href: '#/t8214' }, h('span', {}, 'T8214 variants'), h('small', {}, list.reduce((n, b) => n + (b.t8214 || 0), 0))),
    h('div', { class: 'nav-head' }, 'React Native bundles'),
    ...list.map(b => h('a', { href: `#/b/${b.bundle}` }, h('span', {}, BUNDLE_TITLES[b.bundle] || b.bundle), h('small', {}, b.screens + b.modals || b.components))),
  );
  markNav();
}

function markNav() {
  const hash = location.hash || '#/';
  for (const a of nav.querySelectorAll('a')) {
    const href = a.getAttribute('href');
    a.classList.toggle('active', href === '#/' ? hash === '#/' || hash === '' : hash.startsWith(href));
  }
}

async function route() {
  markNav();
  const parts = (location.hash.replace(/^#\/?/, '') || '').split('/').map(decodeURIComponent);
  clear(view).append(loading());
  try {
    let node;
    if (!parts[0]) node = await overviewView();
    else if (parts[0] === 'tokens') node = await tokensView();
    else if (parts[0] === 'native' && parts[1]) node = await nativeLayoutView(parts[1]);
    else if (parts[0] === 'native') node = await nativeListView(parts[1]);
    else if (parts[0] === 'assets' && parts[1]) node = await assetsView(parts[1]);
    else if (parts[0] === 'map') node = await mapView(parts[1], parts[2] !== undefined ? Number(parts[2]) : undefined);
    else if (parts[0] === 't8214') node = await t8214View();
    else if (parts[0] === 'search') node = await searchView(parts.slice(1).join('/'));
    else if (parts[0] === 'diff') node = await diffView(parts[1], parts[2]);
    else if (parts[0] === 'b' && parts[2] !== undefined) node = await screenView(parts[1], Number(parts[2]));
    else if (parts[0] === 'b' && parts[1]) node = await bundleView(parts[1]);
    else node = h('p', {}, 'Unknown page.');
    clear(view).append(node);
    view.scrollTop = 0;
  } catch (err) {
    console.error(err);
    clear(view).append(errorBox(err));
  }
}

window.addEventListener('hashchange', route);
buildNav().catch(err => nav.append(errorBox(err)));
initSearch(document.getElementById('search'), document.getElementById('search-results'));

// Preview language: views re-render in the chosen language; the choice is kept in localStorage.
async function initLanguage(select) {
  const list = await data.langs().catch(() => [{ code: 'en', keys: 0, translated: 0 }]);
  if (!list.some(l => l.code === data.getLanguage())) data.setLanguage('en');
  const en = list.find(l => l.code === 'en')?.keys || 1;
  clear(select).append(...list.map(l => h('option', { value: l.code, selected: l.code === data.getLanguage() },
    `${languageLabel(l.code)}${l.code === 'en' ? '' : ` · ${Math.round(100 * l.translated / en)}%`}`)));
  select.addEventListener('change', () => { data.setLanguage(select.value); route(); });
}
const langReady = initLanguage(document.getElementById('lang')).catch(err => console.error(err));
langReady.then(route);
