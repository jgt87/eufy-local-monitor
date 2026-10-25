// Design tokens recovered from bc-rnuikit (BCColor, BCFont, BCRadius) and the OneAnker palette.
import { h } from '../dom.js';
import * as data from '../data.js';

export async function tokensView() {
  const [t, native] = await Promise.all([data.tokens(), data.nativeColors()]);
  const sw = c => h('span', { class: 'swatch' }, h('i', { style: { background: c || 'transparent' } }), c || '—');
  const fgbgTables = (prefix, table) => {
    const g = {};
    for (const [name, v] of Object.entries(table)) {
      const [side, group, key] = name.split('.');
      ((g[group] ||= {})[key] ||= {})[side] = v;
    }
    return Object.entries(g).map(([group, keys]) => h('section', { class: 'token-group' },
      h('h3', {}, `${prefix}.{fg|bg}.${group}`),
      h('table', { class: 'tokens' },
        h('tr', {}, h('th', {}, 'Token'), h('th', {}, 'fg light'), h('th', {}, 'fg dark'), h('th', {}, 'bg light'), h('th', {}, 'bg dark')),
        ...Object.entries(keys).map(([k, v]) => h('tr', {}, h('td', {}, h('code', {}, k)), h('td', {}, sw(v.fg?.light)), h('td', {}, sw(v.fg?.dark)), h('td', {}, sw(v.bg?.light)), h('td', {}, sw(v.bg?.dark))))),
    ));
  };
  const oaGroups = {};
  for (const [k, v] of Object.entries(t.oa || {})) { const g = k.split('.').slice(0, -1).join('.') || k; (oaGroups[g] ||= []).push([k.split('.').pop(), v]); }
  return h('div', { class: 'page' },
    h('h1', {}, 'Design tokens'),
    h('p', { class: 'lede' }, 'Two colour systems ship side by side. Most current screens use the aiot-sdk OneAnker system (', h('code', {}, 'UFColor.*'), ' and ', h('code', {}, 'oa.*'), ', brand cyan); older screens use bc-rnuikit (', h('code', {}, 'defColor.*'), ', brand blue). Counts from the recovered trees: UFColor ≈ 5,700 style references, oa ≈ 1,600, defColor ≈ 1,200.'),
    h('h2', {}, 'OneAnker semantic (oa)'),
    h('div', { class: 'oa-grid' }, ...Object.entries(oaGroups).map(([g, list]) => h('div', {}, h('h3', {}, `oa.${g}`),
      h('table', { class: 'tokens' }, h('tr', {}, h('th', {}, 'Token'), h('th', {}, 'light'), h('th', {}, 'dark')),
        ...list.map(([k, v]) => h('tr', {}, h('td', {}, h('code', {}, k)), h('td', {}, sw(v.light)), h('td', {}, sw(v.dark)))))))),
    h('h2', {}, 'Spacing, radius and type (aiot-sdk / OneAnker)'),
    h('div', { class: 'oa-grid' }, ...[
      ['UFSpace.margin|padding.*', t.dims?.ufSpace], ['UFRadius.*', t.dims?.ufRadius], ['UFFont.<weight>.* (size)', t.dims?.ufFontSizes],
      ['oa.padding.* / oa.gap.*', t.dims?.oaPadding], ['oa.radius.*', t.dims?.oaRadius], ['oa.line.*', t.dims?.oaLine],
      ['oa.font.<weight>.* (standard brand)', t.dims?.oaFontSizes?.standard],
    ].filter(([, v]) => v).map(([title, table]) => h('div', {}, h('h3', {}, title),
      h('table', { class: 'tokens' }, h('tr', {}, h('th', {}, 'Key'), h('th', {}, 'dp')),
        ...Object.entries(table).map(([k, v]) => h('tr', {}, h('td', {}, h('code', {}, k)), h('td', {}, String(v)))))))),
    h('p', { class: 'muted small' }, `Font families by weight: ${Object.entries(t.dims?.fontFamilies || {}).map(([k, v]) => `${k} → ${v}`).join(', ')}. The OneAnker font module also ships "hapt" and "anker" size tables; the app picks one at runtime with setFontBrand.`),
    h('h2', {}, 'UFColor (aiot-sdk)'),
    ...fgbgTables('UFColor', t.ufColor || {}),
    h('h2', {}, 'defColor (bc-rnuikit, legacy)'),
    ...fgbgTables('defColor', t.colorTokens),
    h('details', { class: 'section' }, h('summary', {}, 'OneAnker primitive palette', h('small', {}, Object.keys(t.primitives || {}).length)),
      h('div', { class: 'swatches' }, ...Object.entries(t.primitives || {}).map(([k, c]) => h('span', { class: 'swatch', title: c }, h('i', { style: { background: c } }), `${k} ${c}`)))),
    h('h2', {}, 'Palettes'),
    ...['light', 'dark'].map(side => h('section', { class: 'token-group' }, h('h3', {}, side),
      ...Object.entries(t.palettes[side] || {}).map(([g, cols]) => h('div', { class: 'ramp' }, h('span', { class: 'ramp-name' }, g),
        ...Object.entries(cols).map(([k, c]) => h('span', { class: 'ramp-cell', title: `${k} ${c}` }, h('i', { style: { background: c } }), h('small', {}, k), h('small', {}, c))))))),
    h('h2', {}, 'Type'),
    h('p', { class: 'muted' }, `Family: ${t.font.family.default}; weight "bold" switches to ${t.font.family.bold}. Weights: ${Object.entries(t.font.weights).map(([k, v]) => `${k} ${v}`).join(', ')}.`),
    h('div', { class: 'type-scale' }, ...Object.entries(t.font.sizes).map(([k, s]) =>
      h('div', {}, h('code', {}, `${k} · ${s}`), h('span', { style: { fontSize: `${s}px`, fontFamily: 'MontForAnker-Regular' } }, 'Front Door camera is online'), h('span', { style: { fontSize: `${s}px`, fontFamily: 'MontForAnker-SemiBold' } }, 'Live view')))),
    h('h2', {}, 'Radius'),
    ...t.radius.map((scale, i) => h('div', { class: 'radius-row' }, h('span', { class: 'muted' }, i === 0 ? 'fixed' : 'relative'),
      ...Object.entries(scale).map(([k, r]) => h('span', { class: 'radius-cell' }, h('i', { style: { borderRadius: `${r}px` } }), h('small', {}, `${k} ${r}`))))),
    h('h2', {}, 'Most used values in screen styles'),
    h('div', { class: 'usage' },
      h('div', {}, h('h3', {}, 'Font sizes'), ...t.usage.fontSizes.map(([v, n]) => h('div', { class: 'bar' }, h('code', {}, v), h('i', { style: { width: `${Math.min(100, n / t.usage.fontSizes[0][1] * 100)}%` } }), h('small', {}, n)))),
      h('div', {}, h('h3', {}, 'Corner radii'), ...t.usage.radii.map(([v, n]) => h('div', { class: 'bar' }, h('code', {}, v), h('i', { style: { width: `${Math.min(100, n / t.usage.radii[0][1] * 100)}%` } }), h('small', {}, n)))),
      h('div', {}, h('h3', {}, 'Literal colours'), h('div', { class: 'swatches' }, ...t.usage.colors.map(([c, n]) => h('span', { class: 'swatch', title: `${n} uses` }, h('i', { style: { background: c } }), c)))),
    ),
    h('h2', {}, 'Native theme (colors.xml)'),
    h('div', { class: 'swatches' }, ...Object.entries(t.nativeTheme).map(([k, c]) => h('span', { class: 'swatch' }, h('i', { style: { background: c } }), `${k} ${c}`))),
    h('p', { class: 'muted small' }, `${Object.keys(native.day).length} native colour resources are available to the layout renderer, with values-night overrides.`),
    h('details', { class: 'section' }, h('summary', {}, 'OneAnker reference palette', h('small', {}, Object.keys(t.oneAnkerRef).length)),
      h('div', { class: 'swatches' }, ...Object.entries(t.oneAnkerRef).filter(([, c]) => typeof c === 'string').map(([k, c]) => h('span', { class: 'swatch', title: c }, h('i', { style: { background: c } }), k)))),
  );
}
