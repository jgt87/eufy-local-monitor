// Recovers JSX element trees from a Hermes v96 RN bundle by symbolic evaluation.
// Each module factory runs first, then its closures in creation order, sharing symbolic
// environments, so render functions see the module's requires and style sheets.
// Control flow is ignored (straight-line, last write wins): conditional branches all appear,
// loops run once. The output is evidence of structure, not an exact render.
// Usage: node rn-tree.mjs <index.android.hbc> <BytecodeList.def> <modules.json> <out.json>
import fs from 'node:fs';
import { loadOpcodes, openHbc } from './hbc.mjs';

const [hbcPath, defPath, modulesPath, outPath] = process.argv.slice(2);
const h = openHbc(hbcPath, loadOpcodes(defPath));
const b = h.buffer, S = h.strings;
const { modules } = JSON.parse(fs.readFileSync(modulesPath, 'utf8'));

const align = n => (n + 3) & ~3;
const arrayBase = align(h.storageEnd), keyBase = align(arrayBase + b.readUInt32LE(80)), valueBase = align(keyBase + b.readUInt32LE(84));
function readLiterals(base, index, count) {
  const out = [];
  let p = base + index;
  while (out.length < count) {
    let tag = b[p++], len = tag & 0x0f;
    if (tag & 0x80) len = (len << 8) | b[p++];
    const type = tag & 0x70;
    for (let i = 0; i < len && out.length < count; i++) {
      switch (type) {
        case 0x00: out.push(null); break;
        case 0x10: out.push(true); break;
        case 0x20: out.push(false); break;
        case 0x30: out.push(b.readDoubleLE(p)); p += 8; break;
        case 0x40: out.push(S[b.readUInt32LE(p)]); p += 4; break;
        case 0x50: out.push(S[b.readUInt16LE(p)]); p += 2; break;
        case 0x60: out.push(S[b[p]]); p += 1; break;
        case 0x70: out.push(b.readInt32LE(p)); p += 4; break;
        default: throw Error(`literal tag ${tag}`);
      }
    }
  }
  return out;
}

// ---- symbolic values ----
const U = { k: 'u' };
const lit = v => ({ k: 'lit', v });
const isLit = v => v && v.k === 'lit';
const JSX_NAMES = new Set(['jsx', 'jsxs', 'jsxDEV', 'createElement']);
const TEXT_FNS = new Set(['translate', 't', 'getString', 'i18n', 'I18n', 'getI18n', 'localize', 'strings']);
const PASS_FNS = new Set(['useDynamicValue', 'DynamicStyleSheet', 'ScaledSheet', 'create', 'memo', 'forwardRef', 'observer', 'connect', 'withTheme', 'useMemo', 'StyleSheet', 'flatten', 'compose', 'useCallback']);

function prop(base, name) {
  if (!base || base.k === 'u') return U;
  if (base.k === 'obj') return name in base.props ? base.props[name] : { k: 'get', base, name };
  if (base.k === 'arr' && /^\d+$/.test(name)) return base.items[+name] ?? U;
  return { k: 'get', base, name };
}
function lastName(v) { return v && v.k === 'get' ? v.name : v && v.k === 'lit' ? v.v : null; }

// ---- per-function evaluation ----
const fnModule = new Map();
const results = new Map(); // fid -> { rets: [] }
const renderMethods = new Set();
const fnName = id => h.headers[id].name;

function evalFunction(fid, capturedEnv, factoryCtx, isFactory) {
  const regs = [];
  const get = r => regs[r] ?? U;
  const rets = [];
  const queue = [];
  let ownEnv = null;
  const since = new Set(); // registers written since the last call: outgoing argument slots
  for (const ins of h.instructions(fid)) {
    const a = ins.args, op = ins.op;
    if (/^(Call|Construct)/.test(op)) { /* handled below, then cleared */ }
    else if (a.length && !/^(J|Put|Store|Throw|Ret|Debugger|Profile|Unreachable|Switch|Check|Declare)/.test(op)) since.add(a[0]);
    switch (op) {
      case 'Mov': case 'MovLong': regs[a[0]] = get(a[1]); break;
      case 'LoadConstString': case 'LoadConstStringLongIndex': regs[a[0]] = lit(ins.str); break;
      case 'LoadConstUInt8': case 'LoadConstInt': case 'LoadConstDouble': regs[a[0]] = lit(a[1]); break;
      case 'LoadConstZero': regs[a[0]] = lit(0); break;
      case 'LoadConstTrue': regs[a[0]] = lit(true); break;
      case 'LoadConstFalse': regs[a[0]] = lit(false); break;
      case 'LoadConstNull': regs[a[0]] = lit(null); break;
      case 'LoadConstUndefined': case 'LoadConstEmpty': regs[a[0]] = { k: 'undef' }; break;
      case 'LoadParam': case 'LoadParamLong':
        regs[a[0]] = isFactory ? (a[1] === 2 ? { k: 'require' } : a[1] === 7 ? { k: 'deps' } : a[1] === 3 || a[1] === 4 ? { k: 'interop' } : { k: 'param', i: a[1] }) : { k: 'param', i: a[1] };
        break;
      case 'LoadThisNS': case 'CoerceThisNS': regs[a[0]] = { k: 'this' }; break;
      case 'CreateEnvironment': ownEnv = { slots: [], parent: capturedEnv }; if (isFactory) factoryCtx.env = ownEnv; regs[a[0]] = { k: 'env', env: ownEnv }; break;
      case 'CreateInnerEnvironment': regs[a[0]] = { k: 'env', env: { slots: [], parent: get(a[1]).env } }; break;
      case 'GetEnvironment': { let e = capturedEnv; for (let i = 0; i < a[1] && e; i++) e = e.parent; regs[a[0]] = { k: 'env', env: e }; break; }
      case 'StoreToEnvironment': case 'StoreToEnvironmentL': case 'StoreNPToEnvironment': case 'StoreNPToEnvironmentL': {
        const e = get(a[0]).env; if (e) e.slots[a[1]] = get(a[2]); break;
      }
      case 'LoadFromEnvironment': case 'LoadFromEnvironmentL': { const e = get(a[1]).env; regs[a[0]] = e?.slots[a[2]] ?? U; break; }
      case 'GetGlobalObject': regs[a[0]] = { k: 'global' }; break;
      case 'GetById': case 'GetByIdShort': case 'GetByIdLong': case 'TryGetById': case 'TryGetByIdLong':
        regs[a[0]] = prop(get(a[1]), ins.str); break;
      case 'GetByVal': {
        const base = get(a[1]), key = get(a[2]);
        if (base.k === 'deps' && isLit(key)) regs[a[0]] = { k: 'dep', i: key.v };
        else if (isLit(key)) regs[a[0]] = prop(base, String(key.v));
        else regs[a[0]] = U;
        break;
      }
      case 'NewObject': case 'NewObjectWithParent': regs[a[0]] = { k: 'obj', props: {} }; break;
      case 'NewObjectWithBuffer': case 'NewObjectWithBufferLong': {
        const keys = readLiterals(keyBase, a[3], a[2]), vals = readLiterals(valueBase, a[4], a[2]);
        regs[a[0]] = { k: 'obj', props: Object.fromEntries(keys.map((k, i) => [k, lit(vals[i])])) };
        break;
      }
      case 'NewArray': regs[a[0]] = { k: 'arr', items: [] }; break;
      case 'NewArrayWithBuffer': case 'NewArrayWithBufferLong': regs[a[0]] = { k: 'arr', items: readLiterals(arrayBase, a[3], a[2]).map(lit) }; break;
      case 'PutById': case 'PutByIdLong': case 'PutNewOwnByIdShort': case 'PutNewOwnById': case 'PutNewOwnByIdLong': case 'PutNewOwnNEById': case 'PutNewOwnNEByIdLong': {
        const o = get(a[0]), v = get(a[1]);
        if (o.k === 'obj') o.props[ins.str] = v;
        if (o.k === 'obj' && ins.str === 'value' && v.k === 'fn' && isLit(o.props.key) && o.props.key.v === 'render') renderMethods.add(v.fid);
        if (o.k === 'obj' && (ins.str === 'get' || ins.str === 'value') && v.k === 'fn' && isLit(o.props.key) && factoryCtx) (factoryCtx.getters ||= []).push({ group: fid, key: o.props.key.v, fid: v.fid });
        if (o.k === 'exports' || (o.k === 'param' && isFactory && o.i === 6)) factoryCtx.exports[ins.str] = v;
        break;
      }
      case 'PutOwnGetterSetterByVal': {
        const o = get(a[0]), k = get(a[1]), g = get(a[2]);
        if (o.k === 'obj' && isLit(k) && g.k === 'fn') o.props[k.v] = { k: 'getter', fid: g.fid };
        break;
      }
      case 'PutOwnByIndex': case 'PutOwnByIndexL': { const o = get(a[0]); if (o.k === 'arr') o.items[a[2]] = get(a[1]); break; }
      case 'PutByVal': { const o = get(a[0]), k = get(a[1]); if (isLit(k) && o.k === 'obj') o.props[k.v] = get(a[2]); else if (isLit(k) && o.k === 'arr') o.items[k.v] = get(a[2]); break; }
      case 'PutOwnByVal': { const o = get(a[0]), k = get(a[2]); if (o.k === 'obj' && isLit(k)) o.props[k.v] = get(a[1]); break; }
      case 'CreateClosure': case 'CreateClosureLongIndex': case 'CreateGeneratorClosure': case 'CreateGeneratorClosureLongIndex': case 'CreateAsyncClosure': case 'CreateAsyncClosureLongIndex': {
        const env = get(a[1]).env ?? capturedEnv;
        regs[a[0]] = { k: 'fn', fid: ins.fn };
        queue.push([ins.fn, env]);
        break;
      }
      case 'Call1': case 'Call2': case 'Call3': case 'Call4':
        regs[a[0]] = call(get(a[1]), a.slice(3).map(get), factoryCtx);
        since.clear();
        break;
      case 'Call': case 'CallLong': case 'Construct': case 'ConstructLong': {
        // Outgoing arguments sit at the top of the frame: this at frameSize-1, then arg1, arg2...
        const top = since.size ? Math.max(...since) : h.headers[fid].frameSize - 1, args = [];
        for (let i = 1; i < a[2]; i++) args.push(get(top - i));
        regs[a[0]] = call(get(a[1]), args, factoryCtx);
        since.clear();
        break;
      }
      case 'SelectObject': { const o = get(a[2]); regs[a[0]] = o.k === 'obj' || o.k === 'el' || o.k === 'call' ? o : get(a[1]); break; }
      case 'Ret': rets.push(get(a[0])); break;
      default:
        if (ins.args.length && !/^(J|Put|Store|Throw|Ret|Debugger|Async|Profile|Unreachable|Switch|Del|Catch|SaveGenerator|StartGenerator|ResumeGenerator|CompleteGenerator|Check|Declare)/.test(op)) regs[a[0]] = U;
    }
  }
  results.set(fid, { rets });
  return queue;
}

function call(callee, args, factoryCtx) {
  if (callee.k === 'require' && args[0]?.k === 'dep') {
    const path = factoryCtx?.deps[args[0].i];
    return path ? { k: 'mod', path } : U;
  }
  if (callee.k === 'interop' || callee.k === 'mod' && /interopRequire|_interop/.test(callee.path)) return args.find(x => x.k === 'mod') ?? U;
  const name = lastName(callee);
  if (name && JSX_NAMES.has(name) && args.length >= 2) return { k: 'el', type: args[0], props: args[1] ?? { k: 'obj', props: {} } };
  if (name && TEXT_FNS.has(name) && isLit(args[0]) && typeof args[0].v === 'string') return { k: 'text', key: args[0].v };
  if (name && PASS_FNS.has(name) && args[0] && args[0].k !== 'undef') return args[0];
  if (name === 'assign' && args.length >= 2) {
    const props = {}, spread = [];
    for (const x of args) {
      if (x.k === 'obj') Object.assign(props, x.props);
      else if (x.k === 'get' || x.k === 'mod') spread.push(x);
    }
    if (spread.length) props.$spread = { k: 'arr', items: spread };
    return { k: 'obj', props };
  }
  if (name && /^(pt2dp|scale|px2dp|dp|moderateScale|verticalScale|scaleSize|setSpText)$/.test(name) && args[0]) return args[0];
  if ((callee.k === 'mod' || callee.k === 'fn') && args.length >= 1 && args[0].k === 'mod') return args[0];
  if (callee.k === 'get' && callee.base.k === 'global' && callee.name === 'Object') return args[0] ?? U;
  return { k: 'call', callee, args };
}

// ---- serialisation ----
function ser(v, depth = 0, seen = new Set()) {
  if (!v || depth > 40) return null;
  switch (v.k) {
    case 'lit': return v.v === null ? null : typeof v.v === 'object' ? null : v.v;
    case 'text': return { $t: v.key };
    case 'mod': return { $m: v.path };
    case 'get': {
      const chain = [];
      let cur = v;
      while (cur && cur.k === 'get') { chain.unshift(cur.name); cur = cur.base; }
      if (cur && cur.k === 'mod') return { $m: cur.path, $p: chain };
      if (cur && (cur.k === 'param' || cur.k === 'this')) return { $v: [cur.k === 'this' ? 'this' : `arg${cur.i}`, ...chain].join('.') };
      return { $v: ['?', ...chain].join('.') };
    }
    case 'obj': {
      if (seen.has(v)) return { $cycle: 1 };
      seen.add(v);
      const o = {};
      for (const [k, x] of Object.entries(v.props)) o[k] = ser(x, depth + 1, seen);
      seen.delete(v);
      return o;
    }
    case 'arr': {
      if (seen.has(v)) return [];
      seen.add(v);
      const r = v.items.map(x => ser(x, depth + 1, seen));
      seen.delete(v);
      return r;
    }
    case 'el': return { $e: ser(v.type, depth + 1, seen), $props: ser(v.props, depth + 1, seen) };
    case 'fn': return { $f: v.fid };
    case 'call': {
      // Calls to local helpers (theme builders): inline the object the helper returns.
      if (v.callee.k === 'fn' && !seen.has(v.callee.fid)) {
        const r = results.get(v.callee.fid)?.rets.find(x => x.k === 'obj' || x.k === 'call' && x.callee.k === 'fn');
        if (r) { seen.add(v.callee.fid); const o = ser(r, depth + 1, seen); seen.delete(v.callee.fid); return o; }
      }
      const n = lastName(v.callee);
      // Keep calls that may yield elements or text; drop the rest to their name.
      const args = v.args.map(x => ser(x, depth + 1, seen)).filter(x => x !== null && x !== undefined);
      return { $call: n || '?', $args: args.length ? args : undefined };
    }
    case 'param': return { $v: `arg${v.i}` };
    default: return null;
  }
}
const hasEl = v => v && (v.k === 'el' || (v.k === 'call' && v.args.some(hasEl)));

// ---- drive ----
const out = [];
for (const m of modules) {
  if (/node_modules_(react-native|@react-navigation|react-native-svg|ramda|lodash|css-tree|@babel|react-redux|redux|immer|@reduxjs|core-js|qrcode|dayjs|moment)/.test(m.path) || /\.(webp|png|jpe?g|gif|mp4|json)$/i.test(m.path)) continue;
  const ctx = { deps: m.deps, exports: {} };
  const work = [[m.factory, null, ctx, true]];
  const fids = [];
  while (work.length) {
    const [fid, env, c, isFactory] = work.shift();
    if (results.has(fid)) continue;
    fnModule.set(fid, m.path);
    fids.push(fid);
    let q;
    try { q = evalFunction(fid, env, c, isFactory); } catch { results.set(fid, { rets: [] }); continue; }
    for (const [k, e] of q) work.push([k, e, c, false]);
  }
  const comps = [];
  for (const fid of fids) {
    const r = results.get(fid);
    const els = r.rets.filter(hasEl);
    if (!els.length) continue;
    comps.push({ fid, name: fnName(fid) || undefined, render: renderMethods.has(fid) || undefined, trees: els.slice(0, 4).map(x => ser(x)) });
  }
  // Theme modules: keep their exported values (colour/font token tables).
  const getterGroups = {};
  if (ctx.getters && /theme|Theme|Color|Font/.test(m.path)) for (const g of ctx.getters) {
    const ret = results.get(g.fid)?.rets[0];
    (getterGroups[g.group] ||= {})[g.key] = ret ? ser(ret) : null;
  }
  const themeExports = /(BCColor|BCFont|BCRadius|BCSpace|UFColor|UFFont|ThemeProvider|[Tt]heme|Colors?|Fonts?).(ts|tsx|js)$/.test(m.path)
    ? Object.fromEntries(Object.entries(ctx.exports).map(([k, v]) => [k, ser(v.k === 'fn' ? (results.get(v.fid)?.rets.find(r => r.k === 'obj') ?? v) : v)]))
    : undefined;
  const texts = {};
  const collect = (v, pathParts, depth, seen) => {
    if (!v || depth > 3 || seen.has(v)) return;
    if (v.k === 'text') { texts[pathParts.join('.')] = v.key; return; }
    if (v.k === 'mod') { if (/.(webp|png|jpe?g|gif)$/i.test(v.path)) texts[pathParts.join('.')] = '#' + v.path; return; }
    // Scale helpers (pt2dp-like local functions) applied to a literal: keep the literal.
    if (v.k === 'call' && v.callee.k === 'fn' && v.args.length === 1 && isLit(v.args[0]) && typeof v.args[0].v === 'number') { texts[pathParts.join('.')] = '=' + v.args[0].v; return; }
    if (v.k === 'getter') {
      const rr = results.get(v.fid)?.rets[0];
      if (rr && rr.k === 'get' && rr.base.k === 'this') { texts[pathParts.join('.')] = '^' + rr.name; return; }
    }
    if (v.k === 'getter') { const r = results.get(v.fid)?.rets.find(x => x.k === 'text' || isLit(x) && typeof x.v === 'string'); if (r) texts[pathParts.join('.')] = r.k === 'text' ? r.key : '=' + r.v; return; }
    if (v.k === 'fn') { const r = results.get(v.fid)?.rets.find(x => x.k === 'obj'); if (r) collect(r, pathParts, depth + 1, seen); return; }
    if (v.k === 'call' && lastName(v.callee) === 'DynamicValue' && v.args.length >= 2) { texts[pathParts.join('.')] = '@' + JSON.stringify([ser(v.args[0]), ser(v.args[1])]); return; }
    if (v.k === 'call' && lastName(v.callee) === 'Proxy') { for (const x of ctx.env?.slots ?? []) if (x && x.k === 'obj') collect(x, pathParts, depth, seen); return; }
    if (v.k === 'call') { for (const x of v.args) if (x.k === 'obj') collect(x, pathParts, depth, seen); return; }
    if (v.k === 'obj') {
      seen.add(v);
      const t = v.props.t;
      if (t && isLit(t) && typeof t.v === 'string' && Object.keys(v.props).length <= 3) { texts[pathParts.join('.')] = t.v; return; }
      for (const [k, x] of Object.entries(v.props)) collect(x, [...pathParts, k], depth + 1, seen);
    }
    if (isLit(v) && (typeof v.v === 'string' || typeof v.v === 'number') && depth > 0) texts[pathParts.join('.')] = '=' + v.v;
  };
  for (const [k, v] of Object.entries(ctx.exports)) collect(v, [k], 0, new Set());
  if (process.env.DEBUG_PATH && m.path.endsWith(process.env.DEBUG_PATH)) console.error(JSON.stringify(Object.fromEntries(Object.entries(ctx.exports).map(([k, v]) => [k, v.k === 'call' ? { callee: ser(v.callee), args: v.args.map(x => x.k) } : v.k === 'obj' ? Object.keys(v.props).slice(0, 8) : v.k]))));
  // Image loaders keep {light: {...}, dark: {...}} maps; expose them under each export name.
  const assetMaps = [];
  for (const slot of ctx.env?.slots ?? []) if (slot && slot.k === 'obj' && (slot.props.light || slot.props.dark)) assetMaps.push(slot);
  for (const v of Object.values(ctx.exports)) if (v.k === 'obj' && (v.props.light || v.props.dark)) assetMaps.push(v);
  if (assetMaps.length) for (const k of Object.keys(ctx.exports)) for (const am of assetMaps) {
    for (const side of ['dark', 'light']) if (am.props[side]?.k === 'obj') for (const [name, x] of Object.entries(am.props[side].props)) if (x.k === 'mod') texts[(side === 'dark' ? '~dark.' : '') + k + '.' + name] = '#' + x.path;
  }
  const hasTexts = Object.keys(texts).length > 0;
  if (!comps.length && !themeExports && !hasTexts && !Object.keys(getterGroups).length) continue;
  const exports = {};
  for (const [k, v] of Object.entries(ctx.exports)) if (v.k === 'fn') exports[k] = v.fid; else if (v.k === 'call') { const f = v.args.find(x => x.k === 'fn'); if (f) exports[k] = f.fid; }
  out.push({ path: m.path, exports, comps, theme: themeExports, getters: Object.keys(getterGroups).length ? getterGroups : undefined, texts: hasTexts ? texts : undefined });
}
fs.writeFileSync(outPath, JSON.stringify({ hbc: hbcPath, modules: out }));
console.log(JSON.stringify({ hbc: hbcPath, modulesWithTrees: out.length, components: out.reduce((n, m) => n + m.comps.length, 0) }));
