// Renders decoded Android layout XML (decoded/resources/res/layout) as DOM.
// LinearLayout/FrameLayout/ScrollView map to flexbox and grid; RelativeLayout and
// ConstraintLayout are approximated as vertical stacks because their constraints are not solved.
import { h } from './dom.js';
import * as data from './data.js';

const RES = 'decoded/resources/res';
const A = 'android:';
const ANDROID_COLORS = { white: '#ffffff', black: '#000000', transparent: 'transparent', darker_gray: '#aaaaaa' };

export async function createNativeRenderer(mode = 'light') {
  const [strings, colors, dimens, drawables] = await Promise.all([data.nativeStrings(), data.nativeColors(), data.nativeDimens(), data.nativeDrawables()]);
  const pal = colors[mode === 'dark' ? 'night' : 'day'];
  const stats = { views: 0, custom: new Map(), includes: 0, missing: new Set() };

  const argb = v => {
    const m = /^#([0-9a-f]+)$/i.exec(v || '');
    if (!m) return v;
    const x = m[1];
    if (x.length === 3 || x.length === 6) return `#${x}`;
    if (x.length === 4) return `#${x.slice(1)}${x[0]}${x[0]}`;
    if (x.length === 8) return `#${x.slice(2)}${x.slice(0, 2)}`;
    return v;
  };
  async function color(v, depth = 0) {
    if (!v || depth > 6) return undefined;
    if (v.startsWith('#')) return argb(v);
    if (v.startsWith('@android:color/')) return ANDROID_COLORS[v.slice(15)];
    if (v.startsWith('@color/')) {
      const name = v.slice(7);
      if (pal[name] !== undefined && pal[name] !== null) return color(pal[name], depth + 1);
      try { // colour state list in res/color
        const doc = parse(await data.text(`${RES}/${mode === 'dark' ? 'color-night' : 'color'}/${name}.xml`).catch(() => data.text(`${RES}/color/${name}.xml`)));
        const items = [...doc.getElementsByTagName('item')];
        const plain = items.find(i => ![...i.attributes].some(a => a.name.startsWith('android:state_'))) || items[items.length - 1];
        return plain ? color(plain.getAttribute(`${A}color`), depth + 1) : undefined;
      } catch { stats.missing.add(v); return undefined; }
    }
    return undefined;
  }
  function dimen(v, depth = 0) {
    if (!v || depth > 5) return undefined;
    if (v.startsWith('@dimen/')) return dimen(dimens[v.slice(7)], depth + 1);
    const m = /^(-?[\d.]+)(dp|dip|sp|px|pt)?$/.exec(v.trim());
    return m ? parseFloat(m[1]) : undefined;
  }
  function string(v) {
    if (!v) return undefined;
    if (v.startsWith('@string/')) return strings[v.slice(8)] ?? `⟨${v.slice(8)}⟩`;
    if (v.startsWith('@')) return undefined;
    return v;
  }

  // Drawables: raster path, or XML converted to a CSS background.
  async function drawable(v, depth = 0) {
    if (!v || depth > 5) return null;
    if (v.startsWith('#') || v.startsWith('@color/') || v.startsWith('@android:color/')) { const c = await color(v); return c ? { css: { background: c } } : null; }
    const m = /^@(drawable|mipmap)\/(.+)$/.exec(v);
    if (!m) return null;
    const path = (mode === 'dark' && drawables.night[m[2]]) || drawables.day[m[2]];
    if (!path) { stats.missing.add(v); return null; }
    if (!path.endsWith('.xml')) return { url: `/${path}` };
    let doc;
    try { doc = parse(await data.text(path)); } catch { return null; }
    const root = doc.documentElement;
    switch (root.tagName) {
      case 'vector': return { url: await vectorToDataUrl(root) };
      case 'shape': return { css: await shapeCss(root) };
      case 'selector': case 'animated-selector': {
        const items = [...root.getElementsByTagName('item')].filter(i => i.parentNode === root);
        const plain = items.find(i => ![...i.attributes].some(a => a.name.startsWith('android:state_'))) || items[items.length - 1];
        if (!plain) return null;
        if (plain.getAttribute(`${A}drawable`)) return drawable(plain.getAttribute(`${A}drawable`), depth + 1);
        const inner = [...plain.children][0];
        if (inner?.tagName === 'shape') return { css: await shapeCss(inner) };
        return null;
      }
      case 'layer-list': {
        const item = [...root.getElementsByTagName('item')][0];
        if (!item) return null;
        if (item.getAttribute(`${A}drawable`)) return drawable(item.getAttribute(`${A}drawable`), depth + 1);
        const inner = [...item.children][0];
        return inner?.tagName === 'shape' ? { css: await shapeCss(inner) } : null;
      }
      case 'bitmap': return drawable(root.getAttribute(`${A}src`), depth + 1);
      case 'inset': return drawable(root.getAttribute(`${A}drawable`), depth + 1);
      case 'ripple': {
        const item = [...root.getElementsByTagName('item')].find(i => i.getAttribute(`${A}id`) !== '@android:id/mask');
        if (item?.getAttribute(`${A}drawable`)) return drawable(item.getAttribute(`${A}drawable`), depth + 1);
        const inner = item && [...item.children][0];
        return inner?.tagName === 'shape' ? { css: await shapeCss(inner) } : null;
      }
      default: return null;
    }
  }
  async function shapeCss(shape) {
    const css = {};
    const solid = shape.getElementsByTagName('solid')[0], corners = shape.getElementsByTagName('corners')[0], stroke = shape.getElementsByTagName('stroke')[0], grad = shape.getElementsByTagName('gradient')[0];
    if (solid) css.background = await color(solid.getAttribute(`${A}color`));
    if (grad) {
      const s = await color(grad.getAttribute(`${A}startColor`)), e = await color(grad.getAttribute(`${A}endColor`));
      if (s && e) css.background = `linear-gradient(${(270 - Number(grad.getAttribute(`${A}angle`) || 0) + 360) % 360}deg, ${s}, ${e})`;
    }
    if (corners) {
      const r = dimen(corners.getAttribute(`${A}radius`));
      if (r !== undefined) css.borderRadius = `${r}px`;
      for (const [k, cssKey] of [['topLeftRadius', 'borderTopLeftRadius'], ['topRightRadius', 'borderTopRightRadius'], ['bottomLeftRadius', 'borderBottomLeftRadius'], ['bottomRightRadius', 'borderBottomRightRadius']]) {
        const x = dimen(corners.getAttribute(`${A}${k}`)); if (x !== undefined) css[cssKey] = `${x}px`;
      }
    }
    if (shape.getAttribute(`${A}shape`) === 'oval') css.borderRadius = '50%';
    if (stroke) css.border = `${dimen(stroke.getAttribute(`${A}width`)) ?? 1}px ${stroke.getAttribute(`${A}dashWidth`) ? 'dashed' : 'solid'} ${await color(stroke.getAttribute(`${A}color`)) || 'currentColor'}`;
    return css;
  }
  async function vectorToDataUrl(v) {
    const vw = v.getAttribute(`${A}viewportWidth`) || 24, vh = v.getAttribute(`${A}viewportHeight`) || 24;
    const w = dimen(v.getAttribute(`${A}width`)) || 24, hgt = dimen(v.getAttribute(`${A}height`)) || 24;
    const tint = await color(v.getAttribute(`${A}tint`));
    async function walk(node) {
      let out = '';
      for (const c of node.children) {
        if (c.tagName === 'path') {
          const fill = (await color(c.getAttribute(`${A}fillColor`))) || (c.getAttribute(`${A}fillColor`) ? 'none' : 'none');
          const stroke = await color(c.getAttribute(`${A}strokeColor`));
          const sw = c.getAttribute(`${A}strokeWidth`);
          const fa = c.getAttribute(`${A}fillAlpha`);
          out += `<path d="${esc(c.getAttribute(`${A}pathData`) || '')}" fill="${esc(tint || fill)}"${fa ? ` fill-opacity="${fa}"` : ''}${stroke ? ` stroke="${esc(stroke)}" stroke-width="${sw || 1}"` : ''}${c.getAttribute(`${A}fillType`) === 'evenOdd' ? ' fill-rule="evenodd"' : ''}/>`;
        } else if (c.tagName === 'group') {
          const t = [];
          const tx = c.getAttribute(`${A}translateX`) || 0, ty = c.getAttribute(`${A}translateY`) || 0;
          if (tx || ty) t.push(`translate(${tx} ${ty})`);
          const px = c.getAttribute(`${A}pivotX`) || 0, py = c.getAttribute(`${A}pivotY`) || 0;
          if (c.getAttribute(`${A}rotation`)) t.push(`rotate(${c.getAttribute(`${A}rotation`)} ${px} ${py})`);
          const sx = c.getAttribute(`${A}scaleX`), sy = c.getAttribute(`${A}scaleY`);
          if (sx || sy) t.push(`translate(${px} ${py}) scale(${sx || 1} ${sy || 1}) translate(${-px} ${-py})`);
          out += `<g${t.length ? ` transform="${t.join(' ')}"` : ''}>${await walk(c)}</g>`;
        } else if (c.tagName === 'clip-path') {
          // clip paths are rare in icons; skipped
        }
      }
      return out;
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${hgt}" viewBox="0 0 ${vw} ${vh}">${await walk(v)}</svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }

  // ---------- views ----------
  async function render(name, depth = 0) {
    const xml = await data.text(`${RES}/layout/${name}.xml`);
    const doc = parse(xml);
    const root = h('div', { class: `nv-root ${mode}` });
    await renderInto(root, doc.documentElement, depth, null);
    return root;
  }

  async function renderInto(parentEl, node, depth, parentKind) {
    if (node.nodeType !== 1) return;
    stats.views++;
    const tag = node.tagName;
    const attr = n => node.getAttribute(n.includes(':') ? n : `${A}${n}`);
    if (tag === 'include') {
      const layout = attr('layout');
      if (layout?.startsWith('@layout/') && depth < 6) {
        stats.includes++;
        try {
          const sub = parse(await data.text(`${RES}/layout/${layout.slice(8)}.xml`)).documentElement;
          for (const a of node.attributes) if (a.name.startsWith('android:layout_')) sub.setAttribute(a.name, a.value);
          await renderInto(parentEl, sub, depth + 1, parentKind);
        } catch { parentEl.append(h('div', { class: 'nv-custom' }, h('span', { class: 'nv-label' }, `include ${layout}`))); }
      }
      return;
    }
    if (tag === 'merge') { for (const c of node.children) await renderInto(parentEl, c, depth, parentKind); return; }
    if (tag === 'ViewStub' || tag === 'requestFocus' || tag === 'fragment' && !node.children.length) {
      if (tag === 'fragment') parentEl.append(h('div', { class: 'nv-custom' }, h('span', { class: 'nv-label' }, `fragment ${attr('name') || ''}`)));
      return;
    }
    const simple = tag.split('.').pop();
    const kind = classify(simple);
    if (kind === 'custom') stats.custom.set(tag, (stats.custom.get(tag) || 0) + 1);
    const el = h('div', { class: `nv nv-${kind}`, title: tag });
    const style = el.style;

    // size
    const w = attr('layout_width'), hh = attr('layout_height');
    const size = (v, prop) => {
      if (v === 'match_parent' || v === 'fill_parent') { if (prop === 'width') style.alignSelf = 'stretch'; else style.flexGrow = style.flexGrow || (parentKind === 'linear-v' ? '1' : ''); style[prop] = parentKind === 'frame' ? '100%' : ''; if (prop === 'width' && parentKind !== 'linear-h') style.width = '100%'; }
      else if (v === 'wrap_content' || !v) { /* auto */ }
      else { const d = dimen(v); if (d === 0 && attr('layout_weight')) return; if (d !== undefined) style[prop] = `${d}px`; }
    };
    size(w, 'width'); size(hh, 'height');
    const weight = parseFloat(attr('layout_weight'));
    if (weight > 0 && (parentKind === 'linear-v' || parentKind === 'linear-h')) style.flex = `${weight} 1 0%`;
    for (const [a, c] of [['minHeight', 'minHeight'], ['minWidth', 'minWidth'], ['maxWidth', 'maxWidth']]) { const d = dimen(attr(a)); if (d) style[c] = `${d}px`; }

    // spacing
    const sp = (prefix, cssPrefix) => {
      const all = dimen(attr(prefix));
      if (all !== undefined) style[cssPrefix] = `${all}px`;
      const hz = dimen(attr(`${prefix}Horizontal`)), vt = dimen(attr(`${prefix}Vertical`));
      const side = (names, cssSide) => { for (const n of names) { const d = dimen(attr(`${prefix}${n}`)); if (d !== undefined) { style[`${cssPrefix}${cssSide}`] = `${d}px`; return; } } };
      if (hz !== undefined) { style[`${cssPrefix}Left`] = `${hz}px`; style[`${cssPrefix}Right`] = `${hz}px`; }
      if (vt !== undefined) { style[`${cssPrefix}Top`] = `${vt}px`; style[`${cssPrefix}Bottom`] = `${vt}px`; }
      side(['Start', 'Left'], 'Left'); side(['End', 'Right'], 'Right'); side(['Top'], 'Top'); side(['Bottom'], 'Bottom');
    };
    sp('layout_margin', 'margin'); sp('padding', 'padding');

    // layout_gravity inside frames / linear layouts
    const lg = attr('layout_gravity') || '';
    if (lg) {
      if (/center_horizontal|^center$|\|center$|center\|/.test(lg)) style.justifySelf = 'center';
      if (/end|right/.test(lg)) style.justifySelf = 'end';
      if (/center_vertical|^center$|\|center$|center\|/.test(lg)) style.alignSelf = 'center';
      if (/bottom/.test(lg)) style.alignSelf = 'end';
      if (parentKind === 'linear-v') { if (/center_horizontal|^center$/.test(lg)) style.alignSelf = 'center'; if (/end|right/.test(lg)) style.alignSelf = 'flex-end'; }
    }
    if (parentKind === 'stack') {
      if (attr('layout_centerHorizontal') === 'true' || attr('layout_centerInParent') === 'true' || attr('app:layout_constraintStart_toStartOf') === 'parent' && attr('app:layout_constraintEnd_toEndOf') === 'parent' && w === 'wrap_content') style.alignSelf = 'center';
      if (attr('layout_alignParentEnd') === 'true' || attr('layout_alignParentRight') === 'true') style.alignSelf = 'flex-end';
    }

    // visibility, alpha, background
    const vis = attr('visibility');
    if (vis === 'gone') el.classList.add('nv-gone');
    if (vis === 'invisible') style.visibility = 'hidden';
    if (attr('alpha')) style.opacity = attr('alpha');
    const bg = await drawable(attr('background'));
    if (bg?.url) { style.backgroundImage = `url("${bg.url}")`; style.backgroundSize = '100% 100%'; }
    if (bg?.css) Object.assign(style, bg.css);
    if (dimen(attr('elevation')) > 0 || dimen(attr('app:cardElevation')) > 0) style.boxShadow = '0 1px 3px rgba(0,0,0,.18)';
    const cardBg = attr('app:cardBackgroundColor'); if (cardBg) style.background = await color(cardBg) || style.background;
    const cr = dimen(attr('app:cardCornerRadius')); if (cr) { style.borderRadius = `${cr}px`; style.overflow = 'hidden'; }

    // container behaviour
    let childKind = null;
    if (kind === 'linear') {
      const vertical = attr('orientation') === 'vertical';
      style.flexDirection = vertical ? 'column' : 'row';
      childKind = vertical ? 'linear-v' : 'linear-h';
      applyGravity(style, attr('gravity'), vertical);
    } else if (kind === 'frame') childKind = 'frame';
    else if (kind === 'stack') { childKind = 'stack'; applyGravity(style, attr('gravity'), true); }
    else if (kind === 'scroll') { style.flexDirection = /Horizontal/.test(simple) ? 'row' : 'column'; childKind = /Horizontal/.test(simple) ? 'linear-h' : 'linear-v'; }

    // content views
    if (kind === 'text' || kind === 'button' || kind === 'input' || kind === 'check') {
      const txt = string(attr('text')) ?? string(attr('tools:text'));
      const hint = string(attr('hint'));
      const size = dimen(attr('textSize'));
      if (size) style.fontSize = `${size}px`;
      const tc = await color(attr('textColor')); if (tc) style.color = tc;
      if (/bold/.test(attr('textStyle') || '')) style.fontWeight = '600';
      const ff = attr('fontFamily') || '';
      if (/semibold|bold|medium/i.test(ff)) style.fontFamily = '"MontForAnker-SemiBold", sans-serif';
      applyTextGravity(style, attr('gravity'));
      if (attr('maxLines') === '1' || attr('singleLine') === 'true' || attr('lines') === '1') el.classList.add('nv-ellipsis');
      for (const [a, pos] of [['drawableStart', 'start'], ['drawableLeft', 'start'], ['drawableTop', 'top'], ['drawableEnd', 'end'], ['drawableRight', 'end']]) {
        const d = await drawable(attr(a));
        if (d?.url) el.append(h('img', { class: `nv-compound ${pos}`, src: d.url, alt: '' }));
      }
      if (kind === 'check') el.prepend(h('span', { class: `nv-check ${/Switch/.test(simple) ? 'switch' : /Radio/.test(simple) ? 'radio' : 'box'}${attr('checked') === 'true' ? ' on' : ''}` }));
      el.append(h('span', { class: hint && !txt ? 'nv-hint' : 'nv-txt' }, txt ?? hint ?? (kind === 'button' || kind === 'text' ? '' : '')));
      if (kind === 'button' && !bg) el.classList.add('nv-button-default');
    } else if (kind === 'image') {
      const src = await drawable(attr('src') || attr('app:srcCompat'));
      const tint = await color(attr('tint') || attr('app:tint'));
      if (src?.url) {
        if (tint) { style.backgroundColor = tint; style.maskImage = style.webkitMaskImage = `url("${src.url}")`; style.maskSize = style.webkitMaskSize = 'contain'; style.maskRepeat = style.webkitMaskRepeat = 'no-repeat'; style.maskPosition = style.webkitMaskPosition = 'center'; }
        else el.append(h('img', { src: src.url, alt: '' }));
      } else if (src?.css) Object.assign(style, src.css);
      else el.classList.add('nv-image-missing');
      if (!style.width && !style.height && !src) { style.width = '24px'; style.height = '24px'; }
    } else if (kind === 'list') {
      el.append(h('span', { class: 'nv-label' }, `${simple} · rows come from an adapter`));
      const item = attr('tools:listitem');
      if (item?.startsWith('@layout/')) el.append(await render(item.slice(8), depth + 1));
    } else if (kind === 'progress') el.append(h('span', { class: 'nv-progress' }));
    else if (kind === 'custom' && !node.children.length) el.append(h('span', { class: 'nv-label' }, simple));
    else if (kind === 'custom') el.prepend(h('span', { class: 'nv-label nv-label-corner' }, simple));

    for (const c of node.children) await renderInto(el, c, depth, childKind || 'stack');
    parentEl.append(el);
  }

  return { render, stats };
}

function classify(simple) {
  if (/^(LinearLayout|LinearLayoutCompat|RadioGroup|TableLayout|TableRow)$/.test(simple)) return 'linear';
  if (/^(FrameLayout|CoordinatorLayout|CardView|MaterialCardView|AppBarLayout|CollapsingToolbarLayout|DrawerLayout|SwipeRefreshLayout|SmartRefreshLayout)$/.test(simple)) return 'frame';
  if (/^(RelativeLayout|ConstraintLayout|MotionLayout|PercentRelativeLayout)$/.test(simple)) return 'stack';
  if (/ScrollView$/.test(simple)) return 'scroll';
  if (/^(TextView|AppCompatTextView|MaterialTextView|AutoCompleteTextView|CheckedTextView|Chip)$/.test(simple) || /TextView$/.test(simple)) return 'text';
  if (/Button$/.test(simple) && !/ImageButton|RadioButton|FloatingActionButton/.test(simple)) return 'button';
  if (/EditText$|TextInputEditText$/.test(simple)) return 'input';
  if (/^(CheckBox|AppCompatCheckBox|MaterialCheckBox|RadioButton|AppCompatRadioButton|MaterialRadioButton|Switch|SwitchCompat|SwitchMaterial|MaterialSwitch|ToggleButton)$/.test(simple)) return 'check';
  if (/ImageView$|^ImageButton$|^AppCompatImageButton$|^FloatingActionButton$|^ShapeableImageView$|^CircleImageView$/.test(simple)) return 'image';
  if (/^(RecyclerView|ListView|GridView|ViewPager|ViewPager2|ExpandableListView)$/.test(simple)) return 'list';
  if (/ProgressBar$|^SeekBar$|^Slider$/.test(simple)) return 'progress';
  if (/^(View|Space|Toolbar|TabLayout|BottomNavigationView|NavigationView)$/.test(simple)) return simple === 'View' || simple === 'Space' ? 'box' : 'linear';
  return 'custom';
}

function applyGravity(style, g, vertical) {
  if (!g) return;
  const main = vertical ? 'justifyContent' : 'alignItems', cross = vertical ? 'alignItems' : 'justifyContent';
  if (/^center$|\|center$|^center\|/.test(g)) { style.justifyContent = 'center'; style.alignItems = 'center'; }
  if (/center_vertical/.test(g)) style[vertical ? 'justifyContent' : 'alignItems'] = 'center';
  if (/center_horizontal/.test(g)) style[vertical ? 'alignItems' : 'justifyContent'] = 'center';
  if (/bottom/.test(g)) style[main] = 'flex-end';
  if (/end|right/.test(g)) style[cross] = 'flex-end';
}
function applyTextGravity(style, g) {
  if (!g) return;
  if (/center_horizontal|^center$|\|center|center\|/.test(g)) style.textAlign = 'center';
  if (/end|right/.test(g)) style.textAlign = 'right';
  if (/center_vertical|^center$/.test(g)) style.justifyContent = 'center';
}

function parse(xml) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('XML parse error');
  return doc;
}
const esc = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
