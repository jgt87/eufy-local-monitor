// Landing page: what was recovered, per bundle, and how to read it.
import { h } from '../dom.js';
import * as data from '../data.js';
import { BUNDLE_TITLES } from '../main.js';

export async function overviewView() {
  const [list, layouts] = await Promise.all([data.bundles(), data.nativeLayouts()]);
  const totals = list.reduce((t, b) => ({ screens: t.screens + b.screens, modals: t.modals + b.modals, components: t.components + b.components, assets: t.assets + b.assets }), { screens: 0, modals: 0, components: 0, assets: 0 });
  return h('div', { class: 'page' },
    h('h1', {}, 'eufy app interface, recovered from the APK'),
    h('p', { class: 'lede' }, 'Screens, components, text and design tokens rebuilt offline from the React Native Hermes bundles and the decoded Android resources of eufy 6.1.10 (30612). Nothing was executed and no account or device was contacted.'),
    h('div', { class: 'stats' },
      stat(totals.screens, 'screens'), stat(totals.modals, 'modals and sheets'), stat(totals.components, 'components'), stat(layouts.length, 'native layouts'), stat(totals.assets, 'RN image assets'),
    ),
    h('h2', {}, 'Bundles'),
    h('div', { class: 'cards' }, ...list.map(b => h('a', { class: 'card', href: `#/b/${b.bundle}` },
      h('strong', {}, BUNDLE_TITLES[b.bundle] || b.bundle),
      h('code', {}, b.bundle),
      h('span', { class: 'muted' }, `${b.screens} screens · ${b.modals} modals · ${b.components} components · ${b.langKeys} strings`),
    ))),
    h('h2', {}, 'How the previews are built'),
    h('ul', { class: 'notes' },
      h('li', {}, 'Each bundle keeps its Metro module table, so every file has its original source path (for example ', h('code', {}, 'src/playback/PlaybackScreen.tsx'), ').'),
      h('li', {}, 'Element trees come from symbolic evaluation of the compiled ', h('code', {}, 'jsx()'), ' calls. Control flow is not followed, so every conditional branch appears at once and loops render one sample.'),
      h('li', {}, 'Runtime data (device names, events, lists) is not in the bundle. Lists render once per static data entry, or three template rows when data is built at runtime; values that come from props or state show as ', h('code', {}, '{name}'), '.'),
      h('li', {}, 'Colours and fonts resolve through the app\'s own tokens (OneAnker UFColor and oa, and the older bc-rnuikit defColor and defFont) in light or dark mode. Text resolves through per-feature i18n tables, the bundle\'s English table, then the native strings.xml.'),
      h('li', {}, 'Components that cannot be resolved render as dashed boxes with their name. The main app shell (home tab, device list) is Jetpack Compose inside the protected DEX and is not recoverable statically.'),
    ),
  );
}

function stat(n, label) {
  return h('div', { class: 'stat' }, h('strong', {}, n.toLocaleString('en')), h('span', {}, label));
}
