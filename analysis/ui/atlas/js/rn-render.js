// Renders recovered RN element trees (ui/trees/*.json) as DOM inside a phone frame.
// The trees come from straight-line symbolic evaluation, so every conditional branch is present
// and runtime data (device names, lists) is absent. Unknown components render as labelled boxes.
import { h } from './dom.js';

const RN_INDEX = 'node_modules_react-native_index.js';
const PRIMITIVE_ALIASES = {
  LinearGradient: 'View', FastImage: 'Image', SafeAreaView: 'View', KeyboardAvoidingView: 'View', Animated: 'View',
  TouchableOpacity: 'View', TouchableHighlight: 'View', TouchableWithoutFeedback: 'View', TouchableNativeFeedback: 'View', Pressable: 'View',
  RectButton: 'View', BorderlessButton: 'View', GestureHandlerRootView: 'View', BlurView: 'View', ScrollView: 'ScrollView', KeyboardAwareScrollView: 'ScrollView',
  FlatList: 'List', SectionList: 'List', VirtualizedList: 'List', RecyclerListView: 'List', FlashList: 'List',
};
const PRIMITIVES = new Set(['View', 'Text', 'Image', 'ImageBackground', 'ScrollView', 'List', 'TextInput', 'Switch', 'ActivityIndicator', 'Modal', 'StatusBar', 'RefreshControl', 'Gradient']);
// Third-party wrappers whose visual output is close to an RN primitive.
const LIB_PRIMITIVES = [
  [/react-native-linear-gradient|expo-linear-gradient/, 'Gradient'],
  [/react-native-modal/, 'Modal'],
  [/react-native-gesture-handler.*Swipeable|_Swipeable/, 'View'],
  [/react-native-animatable/, 'View'],
  [/react-native-reanimated/, 'View'],
  [/react-native-fast-image/, 'Image'],
];
const MAX_DEPTH = 14;
// Wrappers with no visual output of their own: render their children in place.
const SVG_TAGS = {
  Svg: 'svg', default: 'svg', G: 'g', Path: 'path', Circle: 'circle', Ellipse: 'ellipse', Rect: 'rect', Line: 'line', Polygon: 'polygon', Polyline: 'polyline',
  Defs: 'defs', ClipPath: 'clipPath', LinearGradient: 'linearGradient', RadialGradient: 'radialGradient', Stop: 'stop', Mask: 'mask', Use: 'use', Text: 'text', TSpan: 'tspan', Image: 'image',
};
const SVG_ATTRS = {
  d: 'd', fill: 'fill', stroke: 'stroke', strokeWidth: 'stroke-width', strokeLinecap: 'stroke-linecap', strokeLinejoin: 'stroke-linejoin', strokeDasharray: 'stroke-dasharray',
  fillRule: 'fill-rule', clipRule: 'clip-rule', fillOpacity: 'fill-opacity', strokeOpacity: 'stroke-opacity', opacity: 'opacity', cx: 'cx', cy: 'cy', r: 'r', rx: 'rx', ry: 'ry',
  x: 'x', y: 'y', x1: 'x1', y1: 'y1', x2: 'x2', y2: 'y2', width: 'width', height: 'height', points: 'points', transform: 'transform', viewBox: 'viewBox',
  offset: 'offset', stopColor: 'stop-color', stopOpacity: 'stop-opacity', id: 'id', clipPath: 'clip-path', gradientUnits: 'gradientUnits', fontSize: 'font-size', textAnchor: 'text-anchor',
};
const TRANSPARENT =/^(Fragment|StrictMode|Suspense|Profiler|Consumer|Portal|PortalHost|Host|GestureDetector|NavigationContainer|SafeAreaProvider|\w*Provider|\w*Context|ErrorBoundary|KeyboardAwareView)$/;

export function createRenderer(rc, { mode = 'light', onSelect } = {}) {
  const { idx, sdk, assets, lang, tokens } = rc;
  const info = new WeakMap();
  const stats = { elements: 0, expanded: 0, unresolved: new Map(), texts: 0, images: 0 };

  // ---------- value resolution ----------
  function lookupVar(path, ctx) {
    // arg1.title (function component props) / this.props.title (class components)
    const parts = path.split('.');
    let rest;
    if (parts[0] === 'arg1') rest = parts.slice(1);
    else if (parts[0] === 'this' && parts[1] === 'props') rest = parts.slice(2);
    else return undefined;
    if (!ctx.props) return undefined;
    let v = ctx.props, c = ctx.parent;
    for (const k of rest) {
      if (v && typeof v === 'object' && !Array.isArray(v) && k in v) v = v[k];
      else return undefined;
    }
    return { value: v, ctx: c };
  }

  function token(m, p) {
    if (!p || !p.length) return undefined;
    if (p[0] === 'defColor' && p.length >= 4) {
      const t = tokens.colorTokens[`${p[1]}.${p[2]}.${p[3]}`];
      return t ? (mode === 'dark' ? t.dark : t.light) : undefined;
    }
    if (p[0] === 'UFColor' && p.length >= 4) {
      const t = tokens.ufColor[`${p[1]}.${p[2]}.${p[3]}`];
      return t ? (mode === 'dark' ? t.dark : t.light) : undefined;
    }
    if ((p[0] === 'oa' || p[0] === 'OneAnker') && p.length >= 3) {
      const rest = p[0] === 'OneAnker' && p[1] === 'colors' ? p.slice(2) : p.slice(1);
      const t = tokens.oa[rest.join('.')];
      if (t) return mode === 'dark' ? t.dark : t.light;
    }
    const d = tokens.dims || {};
    if (p[0] === 'UFRadius' && p.length === 2) return d.ufRadius?.[p[1]];
    if (p[0] === 'UFSpace' && p.length === 3 && (p[1] === 'margin' || p[1] === 'padding')) return d.ufSpace?.[p[2]];
    if (p[0] === 'UFFont' && p.length >= 3 && d.ufFontSizes?.[p[2]] !== undefined) {
      const font = { fontSize: d.ufFontSizes[p[2]], fontWeight: d.fontWeights?.[p[1]] || '400', fontFamily: d.fontFamilies?.[p[1]] || 'MontForAnker-Regular' };
      return p.length === 4 ? font[p[3]] : { $font: font };
    }
    if (p[0] === 'oa' && p.length === 3) {
      if (p[1] === 'padding' && d.oaPadding?.[p[2]] !== undefined) return d.oaPadding[p[2]];
      if (p[1] === 'gap' && d.oaGap?.[p[2]] !== undefined) return d.oaGap[p[2]];
      if (p[1] === 'radius' && d.oaRadius?.[p[2]] !== undefined) return d.oaRadius[p[2]];
      if (p[1] === 'line' && d.oaLine?.[p[2]] !== undefined) return d.oaLine[p[2]];
    }
    if (p[0] === 'oa' && p[1] === 'font' && p.length >= 4) {
      const size = d.oaFontSizes?.standard?.[p[3]];
      if (size !== undefined) {
        const font = { fontSize: size, fontWeight: d.fontWeights?.[p[2]] || '400', fontFamily: d.fontFamilies?.[p[2]] || 'MontForAnker-Regular' };
        return p.length === 5 ? font[p[4]] : { $font: font };
      }
    }
    if (p[0] === 'defFont' && p.length >= 3) {
      const weight = tokens.font.weights[p[1]] || '400';
      const size = tokens.font.sizes[p[2]];
      return { $font: { fontSize: size, fontWeight: weight === 'bold' ? '600' : weight, fontFamily: p[1] === 'bold' ? tokens.font.family.bold : tokens.font.family.default } };
    }
    return undefined;
  }

  // Constant tables recovered per module (i18n proxies, enums, OneAnker primitives): "Export.prop" -> key or "=literal".
  let allTexts = null;
  function constant(m, p) {
    if (!p || !p.length) return undefined;
    const base = p.join('.');
    const keys = [`${base}.${mode}`, `${base}.light`, base];
    let hit;
    for (const ix of [idx, sdk]) {
      const mod = ix.byPath.get(m);
      if (mod?.texts) { const k = keys.find(x => x in mod.texts); if (k) { hit = mod.texts[k]; break; } }
    }
    if (hit === undefined) {
      if (!allTexts) {
        allTexts = new Map();
        for (const ix of [idx, sdk]) for (const mod of ix.modules) if (mod.texts) for (const [k, x] of Object.entries(mod.texts)) if (!allTexts.has(k)) allTexts.set(k, x);
      }
      const k = keys.find(x => allTexts.has(x));
      hit = k && allTexts.get(k);
    }
    if (hit === undefined || hit === null) return undefined;
    if (hit.startsWith('#')) { const a = assets[hit.slice(1)]; return a ? { $image: a } : undefined; }
    if (hit.startsWith('@')) return undefined;
    return hit.startsWith('=') ? hit.slice(1) : { $text: hit };
  }

  function val(v, ctx) {
    if (v === null || v === undefined) return undefined;
    if (typeof v !== 'object') return v;
    if (Array.isArray(v)) return v.map(x => val(x, ctx));
    if ('$t' in v) return { $text: v.$t };
    if ('$v' in v) {
      const r = lookupVar(v.$v, ctx);
      return r ? val(r.value, r.ctx) : undefined;
    }
    if ('$m' in v) {
      if (assets[v.$m] && !v.$p) return { $image: assets[v.$m] };
      const t = token(v.$m, v.$p);
      if (t !== undefined) return t;
      const c = constant(v.$m, v.$p);
      if (c !== undefined) return c;
      return undefined;
    }
    if ('$e' in v || '$f' in v || '$call' in v) return v; // rendered lazily
    const out = {};
    for (const [k, x] of Object.entries(v)) out[k] = val(x, ctx);
    return out;
  }

  // ---------- style conversion ----------
  const px = v => (typeof v === 'number' ? `${v}px` : typeof v === 'string' && /^-?\d+(\.\d+)?%$/.test(v) ? v : undefined);
  function flattenStyle(s, ctx, out = {}) {
    const v = val(s, ctx);
    if (!v) return out;
    if (Array.isArray(v)) { for (const x of v) flattenStyle(x, ctx, out); return out; }
    if (typeof v !== 'object') return out;
    if (v.$font) return Object.assign(out, v.$font);
    if (Array.isArray(v.$spread)) for (const x of v.$spread) { const f = val(x, ctx); if (f?.$font) Object.assign(out, f.$font); }
    for (const [k, x] of Object.entries(v)) if (k !== '$spread' && x !== undefined && x !== null && typeof x !== 'object') out[k] = x;
    return out;
  }
  const FONT_FILES = new Set(['MontForAnker-Regular', 'MontForAnker-SemiBold', 'MontForAnker-Bold', 'MontForAnker-Heavy', 'Mont-SemiBold', 'Mont-Regular', 'Mont-Bold']);
  function toCss(st) {
    const css = {};
    const set = (k, v) => { if (v !== undefined && v !== null && v !== '') css[k] = v; };
    for (const [k, v] of Object.entries(st)) {
      switch (k) {
        case 'flex':
          if (typeof v === 'number') set('flex', v > 0 ? `${v} 1 0%` : v === 0 ? '0 0 auto' : '0 1 auto');
          break;
        case 'flexDirection': case 'alignItems': case 'justifyContent': case 'alignSelf': case 'flexWrap': case 'alignContent':
          set(k.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`), String(v)); break;
        case 'flexGrow': case 'flexShrink': case 'opacity': case 'zIndex': case 'aspectRatio': set(k.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`), String(v)); break;
        case 'flexBasis': set('flex-basis', px(v)); break;
        case 'position': set('position', v === 'absolute' ? 'absolute' : 'relative'); break;
        case 'top': case 'left': case 'right': case 'bottom': case 'width': case 'height': case 'minWidth': case 'minHeight': case 'maxWidth': case 'maxHeight':
          set(k.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`), px(v)); break;
        case 'start': set('left', px(v)); break;
        case 'end': set('right', px(v)); break;
        case 'margin': case 'padding': set(k, px(v)); break;
        case 'marginHorizontal': case 'paddingHorizontal': { const b = k.startsWith('m') ? 'margin' : 'padding'; set(`${b}-left`, px(v)); set(`${b}-right`, px(v)); break; }
        case 'marginVertical': case 'paddingVertical': { const b = k.startsWith('m') ? 'margin' : 'padding'; set(`${b}-top`, px(v)); set(`${b}-bottom`, px(v)); break; }
        case 'marginStart': case 'marginLeft': set('margin-left', px(v)); break;
        case 'marginEnd': case 'marginRight': set('margin-right', px(v)); break;
        case 'marginTop': case 'marginBottom': case 'paddingTop': case 'paddingBottom': set(k.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`), px(v)); break;
        case 'paddingStart': case 'paddingLeft': set('padding-left', px(v)); break;
        case 'paddingEnd': case 'paddingRight': set('padding-right', px(v)); break;
        case 'gap': case 'rowGap': case 'columnGap': set(k.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`), px(v)); break;
        case 'backgroundColor': set('background-color', String(v)); break;
        case 'color': set('color', String(v)); break;
        case 'borderRadius': set('border-radius', px(v)); break;
        case 'borderTopLeftRadius': case 'borderTopRightRadius': case 'borderBottomLeftRadius': case 'borderBottomRightRadius':
          set(k.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`), px(v)); break;
        case 'borderWidth': set('border-width', px(v)); set('border-style', 'solid'); break;
        case 'borderTopWidth': case 'borderBottomWidth': case 'borderLeftWidth': case 'borderRightWidth':
          set(k.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`), px(v)); set(k.replace('Width', 'Style').replace(/[A-Z]/g, c => `-${c.toLowerCase()}`), 'solid'); break;
        case 'borderColor': case 'borderTopColor': case 'borderBottomColor': set(k.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`), String(v)); break;
        case 'borderStyle': set('border-style', String(v)); break;
        case 'fontSize': set('font-size', px(v)); break;
        case 'lineHeight': set('line-height', px(v)); break;
        case 'fontWeight': set('font-weight', String(v) === 'bold' ? '600' : String(v)); break;
        case 'fontFamily': if (FONT_FILES.has(v)) set('font-family', `"${v}", "MontForAnker-Regular", sans-serif`); break;
        case 'textAlign': set('text-align', String(v)); break;
        case 'letterSpacing': set('letter-spacing', px(v)); break;
        case 'textDecorationLine': set('text-decoration', String(v)); break;
        case 'overflow': set('overflow', v === 'hidden' ? 'hidden' : 'visible'); break;
        case 'display': set('display', v === 'none' ? 'none' : 'flex'); break;
        case 'tintColor': css['--tint'] = String(v); break;
        default:
      }
    }
    return css;
  }

  // ---------- component resolution ----------
  function resolveType(t, ctx) {
    const v = typeof t === 'string' ? t : null;
    if (v) return { primitive: /^RCT|^Android/.test(v) ? 'View' : v };
    if (!t || typeof t !== 'object') return { unknown: '?' };
    if ('$f' in t) {
      const hit = idx.byFid.get(t.$f) || sdk.byFid.get(t.$f);
      return hit ? { comp: hit, name: hit.comp.name && hit.comp.name.length > 2 ? hit.comp.name : `local fn ${t.$f}` } : { unknown: `fn ${t.$f}` };
    }
    if ('$v' in t) {
      const r = lookupVar(t.$v, ctx);
      if (r && r.value && typeof r.value === 'object' && ('$m' in r.value || '$v' in r.value)) return resolveType(r.value, r.ctx);
      return { unknown: t.$v.replace(/^arg1\.|^this\.props\./, 'props.') };
    }
    if (!('$m' in t)) return { unknown: '?' };
    const name = (t.$p && t.$p[t.$p.length - 1]) || 'default';
    if (TRANSPARENT.test(name)) return { transparent: name };
    if (/react-native-svg/.test(t.$m) || SVG_TAGS[name] && /svg|Svg|icon|Icon/.test(t.$m)) return { svg: SVG_TAGS[name] || 'svg', name };
    if (t.$m === RN_INDEX || /node_modules_react-native_Libraries/.test(t.$m)) {
      const prim = PRIMITIVE_ALIASES[name] || name;
      if (PRIMITIVES.has(prim)) return { primitive: prim, name };
    }
    if (PRIMITIVE_ALIASES[name]) return { primitive: PRIMITIVE_ALIASES[name], name };
    for (const [re, prim] of LIB_PRIMITIVES) if (re.test(t.$m) && (prim !== 'View' || !/^(Image|Button|Text)$/.test(name))) return { primitive: prim, name: name === 'default' ? t.$m.replace(/^node_modules_/, '').split('_')[0] : name };
    if (/react-native-elements|@rneui/.test(t.$m) && /^(Image|Text)$/.test(name)) return { primitive: name, name };
    // Direct module import: the module's export (or default).
    for (const ix of [idx, sdk]) {
      const mod = ix.byPath.get(t.$m);
      if (mod) {
        const named = mod.exports[name];
        const fid = named ?? (name === 'default' ? mod.exports.default : undefined);
        const hit = fid !== undefined ? ix.byFid.get(fid) : (name === 'default' && mod.comps[0] ? { module: mod, comp: mod.comps[0] } : null);
        if (hit) return { comp: hit, name };
      }
    }
    // Barrel import (index.ts re-exports): resolve by export or file name, never to app roots.
    const barrel = /_index\.(t|j)sx?$/.test(t.$m) || !(idx.byPath.has(t.$m) || sdk.byPath.has(t.$m));
    if (barrel && name !== 'default') {
      for (const ix of [idx, sdk]) {
        const hits = (ix.byName.get(name) || []).filter(x => !/_(App|Navigator|NavigationConfig)\.tsx?$/.test(x.module.path));
        if (hits.length) {
          const dir = t.$m.replace(/index\.(t|j)sx?$/, '');
          return { comp: hits.find(x => x.module.path.startsWith(dir)) || hits[0], name };
        }
      }
    }
    const parts = t.$m.replace(/\.(t|j)sx?$/, '').split('_');
    const last = parts[parts.length - 1];
    const stem = last === 'index' ? parts.slice(-3, -1).filter(x => !/^(src|lib|dist|node|modules|components)$/.test(x)).join('/') || 'index' : last;
    return { unknown: name === 'default' || name === stem ? stem : `${stem}.${name}`, module: t.$m };
  }

  // ---------- rendering ----------
  function textOf(v, ctx) {
    const r = val(v, ctx);
    if (r === undefined || r === null) return null;
    if (typeof r === 'string' || typeof r === 'number') return String(r);
    if (r.$text) { stats.texts++; return lang[r.$text] ?? (/\s/.test(r.$text) || /^[A-Z][a-z]+$/.test(r.$text) ? r.$text : `⟨${r.$text}⟩`); }
    return null;
  }

  function renderChildren(children, ctx, inText) {
    if (children === undefined || children === null) return [];
    const list = Array.isArray(children) ? children : [children];
    const out = [];
    for (const c of list) {
      if (c === null || c === undefined || typeof c === 'boolean') continue;
      if (typeof c !== 'object') { out.push(document.createTextNode(String(c))); continue; }
      if (Array.isArray(c)) { out.push(...renderChildren(c, ctx, inText)); continue; }
      if ('$e' in c) { out.push(renderEl(c, ctx, inText)); continue; }
      if ('$f' in c) { const n = renderFn(c.$f, ctx, inText); if (n) out.push(n); continue; }
      if ('$call' in c) { for (const a of c.$args || []) out.push(...renderChildren(a, ctx, inText)); continue; }
      if ('$v' in c) {
        const r = lookupVar(c.$v, ctx);
        if (r) out.push(...renderChildren(r.value, r.ctx, inText));
        else if (inText) out.push(h('span', { class: 'rn-var' }, `{${c.$v.replace(/^arg1\.|^this\.props\./, '')}}`));
        continue;
      }
      const t = textOf(c, ctx);
      if (t !== null && t !== 'true' && t !== 'false') out.push(document.createTextNode(t));
    }
    return out;
  }

  // props: what the closure receives as its first argument (renderItem gets {item, index, section}).
  function renderFn(fid, ctx, inText, props) {
    const hit = idx.byFid.get(fid) || sdk.byFid.get(fid);
    if (!hit || ctx.depth > MAX_DEPTH || ctx.stack.has(fid)) return null;
    const tree = mainTree(hit.comp);
    return tree ? renderNode(tree, { props, parent: ctx, depth: ctx.depth + 1, stack: new Set([...ctx.stack, fid]) }, inText) : null;
  }

  // Static list data, when the bundle builds it inline: an array of raw item objects.
  function rawArray(v, ctx, depth = 0) {
    if (Array.isArray(v)) return v;
    if (v && typeof v === 'object' && '$v' in v && depth < 4) { const r = lookupVar(v.$v, ctx); return r ? rawArray(r.value, r.ctx, depth + 1) : null; }
    return null;
  }

  function renderNode(node, ctx, inText) {
    if (node && typeof node === 'object' && '$e' in node) return renderEl(node, ctx, inText);
    const frag = document.createDocumentFragment();
    for (const c of renderChildren(node, ctx, inText)) frag.append(c);
    return frag;
  }

  function mark(el, data) { info.set(el, data); el.classList.add('rn-node'); return el; }

  function renderEl(node, ctx, inText) {
    stats.elements++;
    const props = node.$props || {};
    const type = resolveType(node.$e, ctx);
    if (type.comp) {
      const fid = type.comp.comp.fid;
      if (ctx.depth < MAX_DEPTH && !ctx.stack.has(fid)) {
        const tree = mainTree(type.comp.comp);
        if (tree) {
          stats.expanded++;
          const inner = renderNode(tree, { props, parent: ctx, depth: ctx.depth + 1, stack: new Set([...ctx.stack, fid]) }, inText);
          const wrap = h('div', { class: 'rn-comp', 'data-name': type.name });
          wrap.append(inner);
          return mark(wrap, { kind: 'component', name: type.name, module: type.comp.module.path, props, ctx });
        }
      }
    }
    if (type.primitive) return renderPrimitive(type.primitive, type.name || type.primitive, props, ctx, inText);
    if (type.svg) return renderSvg(type.svg, props, ctx);
    if (type.transparent) {
      const frag = document.createDocumentFragment();
      for (const c of renderChildren(props.children, ctx, inText)) frag.append(c);
      return frag;
    }
    const label = type.unknown || '?';
    stats.unresolved.set(label, (stats.unresolved.get(label) || 0) + 1);
    const box = h('div', { class: 'rn-unknown', title: type.module || label }, h('span', { class: 'rn-unknown-label' }, label));
    const st = toCss(flattenStyle(props.style, ctx));
    Object.assign(box.style, st);
    for (const c of renderChildren(props.children, ctx, inText)) box.append(c);
    return mark(box, { kind: 'unresolved', name: label, module: type.module, props, ctx });
  }

  function renderSvg(tag, props, ctx) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [k, raw] of Object.entries(props)) {
      if (k === 'children' || k === 'style') continue;
      const v = val(raw, ctx);
      if (v === undefined || v === null || typeof v === 'object') continue;
      const attr = SVG_ATTRS[k];
      if (attr) el.setAttribute(attr, String(v));
    }
    if (tag === 'svg') {
      el.classList.add('rn-svg');
      const st = flattenStyle(props.style, ctx);
      Object.assign(el.style, toCss(st));
      if (!el.getAttribute('width') && !st.width) el.setAttribute('width', '24');
      if (!el.getAttribute('height') && !st.height) el.setAttribute('height', '24');
    }
    const kids = props.children;
    for (const c of Array.isArray(kids) ? kids : kids ? [kids] : []) {
      if (c && typeof c === 'object' && '$e' in c) {
        const t = resolveType(c.$e, ctx);
        if (t.svg) el.append(renderSvg(t.svg, c.$props || {}, ctx));
        else if (t.transparent) el.append(...renderChildren(c.$props?.children, ctx));
      } else if (typeof c === 'string' && (tag === 'text' || tag === 'tspan')) el.append(c);
    }
    return el;
  }

  function renderPrimitive(prim, name, props, ctx, inText) {
    const st = flattenStyle(props.style, ctx);
    const css = toCss(st);
    let el;
    switch (prim) {
      case 'Text': {
        el = h(inText ? 'span' : 'div', { class: inText ? 'rn-text-inline' : 'rn-text' });
        Object.assign(el.style, css);
        for (const c of renderChildren(props.children, ctx, true)) el.append(c);
        if (props.numberOfLines === 1) el.classList.add('rn-ellipsis');
        break;
      }
      case 'Image': case 'ImageBackground': {
        const src = val(props.source, ctx);
        const asset = src && src.$image;
        el = h('div', { class: prim === 'Image' ? 'rn-image' : 'rn-view rn-image-bg' });
        if (asset) {
          stats.images++;
          if (!st.width && !css.width) el.style.width = `${asset.w}px`;
          if (!st.height && !css.height) el.style.height = `${asset.h}px`;
          if (asset.src) el.style.backgroundImage = `url("/${asset.src}")`;
          else el.classList.add('rn-image-missing');
          el.title = asset.name;
        } else el.classList.add('rn-image-missing');
        Object.assign(el.style, css);
        if (css['--tint'] && asset?.src) { el.style.backgroundColor = css['--tint']; el.style.maskImage = el.style.webkitMaskImage = `url("/${asset.src}")`; el.style.backgroundImage = 'none'; el.classList.add('rn-tinted'); }
        if (prim === 'ImageBackground') for (const c of renderChildren(props.children, ctx)) el.append(c);
        break;
      }
      case 'TextInput': {
        const ph = textOf(props.placeholder, ctx);
        el = h('div', { class: 'rn-input' }, ph || textOf(props.value, ctx) || '');
        Object.assign(el.style, css);
        break;
      }
      case 'Switch': {
        const on = val(props.value, ctx) === true;
        const t = tokens.colorTokens['fg.scene.switch'], tb = tokens.colorTokens['bg.scene.switch'];
        el = h('div', { class: `rn-switch${on ? ' on' : ''}`, style: { '--on': mode === 'dark' ? t.dark : t.light, '--off': mode === 'dark' ? tb.dark : tb.light } }, h('span'));
        break;
      }
      case 'ActivityIndicator': el = h('div', { class: 'rn-spinner' }); Object.assign(el.style, css); break;
      case 'Gradient': {
        el = h('div', { class: 'rn-view' });
        Object.assign(el.style, css);
        const colors = val(props.colors, ctx);
        if (Array.isArray(colors) && colors.filter(c => typeof c === 'string').length >= 2) {
          const s = val(props.start, ctx), e = val(props.end, ctx);
          const horizontal = s && e && typeof s === 'object' && typeof e === 'object' && s.y === e.y;
          el.style.backgroundImage = `linear-gradient(${horizontal ? 'to right' : 'to bottom'}, ${colors.filter(c => typeof c === 'string').join(', ')})`;
        }
        for (const c of renderChildren(props.children, ctx)) el.append(c);
        break;
      }
      case 'StatusBar': case 'RefreshControl': return document.createDocumentFragment();
      case 'List': {
        el = h('div', { class: 'rn-view rn-list' });
        Object.assign(el.style, css);
        if (props.horizontal === true) el.style.flexDirection = 'row';
        const cc = flattenStyle(props.contentContainerStyle, ctx);
        const inner = h('div', { class: 'rn-view' }); Object.assign(inner.style, toCss(cc));
        for (const part of ['ListHeaderComponent']) if (props[part]) inner.append(...renderChildren(props[part], ctx));
        const item = props.renderItem;
        const addRow = (n, sample) => { if (n) { const row = h('div', { class: `rn-view rn-list-item${sample ? ' sample' : ''}` }); row.append(n); inner.append(row); } };
        const data = rawArray(props.data, ctx);
        const sections = rawArray(props.sections, ctx);
        if (item && typeof item === 'object' && '$f' in item && sections && sections.length) {
          for (const section of sections.slice(0, 8)) {
            if (props.renderSectionHeader?.$f) addRow(renderFn(props.renderSectionHeader.$f, ctx, false, { section }));
            const rows = rawArray(section && section.data, ctx) || [];
            rows.slice(0, 12).forEach((it, index) => addRow(renderFn(item.$f, ctx, false, { item: it, index, section })));
          }
        } else if (item && typeof item === 'object' && '$f' in item && data && data.length) {
          data.slice(0, 20).forEach((it, index) => addRow(renderFn(item.$f, ctx, false, { item: it, index })));
        } else if (item && typeof item === 'object' && '$f' in item) {
          for (let i = 0; i < 3; i++) addRow(renderFn(item.$f, ctx), true);
        } else inner.append(h('div', { class: 'rn-list-empty' }, `${name} · items come from runtime data`));
        for (const part of ['ListFooterComponent']) if (props[part]) inner.append(...renderChildren(props[part], ctx));
        el.append(inner);
        break;
      }
      case 'Modal': {
        el = h('div', { class: 'rn-modal' });
        for (const c of renderChildren(props.children, ctx)) el.append(c);
        break;
      }
      case 'ScrollView': {
        el = h('div', { class: 'rn-view rn-scroll' });
        Object.assign(el.style, css);
        const inner = h('div', { class: 'rn-view' });
        Object.assign(inner.style, toCss(flattenStyle(props.contentContainerStyle, ctx)));
        if (props.horizontal === true) inner.style.flexDirection = 'row';
        for (const c of renderChildren(props.children, ctx)) inner.append(c);
        el.append(inner);
        break;
      }
      default: {
        el = h('div', { class: 'rn-view' });
        Object.assign(el.style, css);
        for (const c of renderChildren(props.children, ctx, inText && prim === 'View' ? false : inText)) el.append(c);
      }
    }
    return mark(el, { kind: 'primitive', name, props, ctx, style: st });
  }

  function mainTree(comp) {
    if (!comp.trees || !comp.trees.length) return null;
    if (comp._main !== undefined) return comp.trees[comp._main];
    const size = t => JSON.stringify(t).length;
    let best = 0;
    comp.trees.forEach((t, i) => { if (size(t) > size(comp.trees[best])) best = i; });
    comp._main = best;
    return comp.trees[best];
  }

  function renderComponent(comp, treeIndex) {
    const tree = treeIndex !== undefined ? comp.trees[treeIndex] : mainTree(comp);
    const root = h('div', { class: `rn-root ${mode}` });
    root.append(renderNode(tree, { props: undefined, parent: null, depth: 0, stack: new Set([comp.fid]) }));
    if (onSelect) root.addEventListener('click', e => {
      let n = e.target;
      while (n && n !== root && !info.has(n)) n = n.parentElement;
      if (n && info.has(n)) { e.stopPropagation(); root.querySelectorAll('.rn-selected').forEach(x => x.classList.remove('rn-selected')); n.classList.add('rn-selected'); onSelect(info.get(n), val); }
    });
    return root;
  }

  return { renderComponent, stats, val, resolveType };
}

// The component a file is "about": the export named like the file, else the default export, else the largest tree.
export function mainComponent(treeModule) {
  if (!treeModule || !treeModule.comps.length) return null;
  const stem = treeModule.path.split('_').pop().replace(/\.(t|j)sx?$/, '');
  const byFid = fid => treeModule.comps.find(c => c.fid === fid);
  const size = c => Math.max(...c.trees.map(t => JSON.stringify(t).length));
  return byFid(treeModule.exports[stem]) || byFid(treeModule.exports.default)
    || [...treeModule.comps].sort((a, b) => size(b) - size(a))[0];
}
