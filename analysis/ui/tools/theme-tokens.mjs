// Extracts getter-based token classes (BCColor/BCFont style: `get darker() { return this.color({...}) }`)
// from theme modules of a Hermes v96 bundle. For each class builder it lists the getter keys and,
// per getter, the literal fields, referenced token paths and numeric constants it passes on.
// Usage: node theme-tokens.mjs <index.android.hbc> <BytecodeList.def> <modules.json> <path-regex> <out.json>
import fs from 'node:fs';
import { loadOpcodes, openHbc } from './hbc.mjs';

const [hbcPath, defPath, modulesPath, pathRe, outPath] = process.argv.slice(2);
const h = openHbc(hbcPath, loadOpcodes(defPath));
const b = h.buffer, S = h.strings;
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
      if (type === 0x00) out.push(null); else if (type === 0x10) out.push(true); else if (type === 0x20) out.push(false);
      else if (type === 0x30) { out.push(b.readDoubleLE(p)); p += 8; } else if (type === 0x40) { out.push(S[b.readUInt32LE(p)]); p += 4; }
      else if (type === 0x50) { out.push(S[b.readUInt16LE(p)]); p += 2; } else if (type === 0x60) { out.push(S[b[p]]); p += 1; }
      else { out.push(b.readInt32LE(p)); p += 4; }
    }
  }
  return out;
}

function getterBody(fid) {
  const regs = [], fields = {}, numbers = [], calls = [];
  for (const ins of h.instructions(fid)) {
    const a = ins.args;
    if (ins.op.startsWith('LoadConstString')) regs[a[0]] = { s: ins.str };
    else if (/^LoadConst(UInt8|Int|Double)$/.test(ins.op)) { regs[a[0]] = { n: a[1] }; numbers.push(a[1]); }
    else if (ins.op === 'LoadConstZero') { regs[a[0]] = { n: 0 }; numbers.push(0); }
    else if (ins.op === 'LoadFromEnvironment') regs[a[0]] = { ref: [`env${a[2]}`] };
    else if (/^GetById/.test(ins.op)) { const base = regs[a[1]]; regs[a[0]] = { ref: [...(base?.ref ?? ['this']), ins.str] }; if (base?.ref?.[0] === 'this' || !base) calls.push(ins.str); }
    else if (ins.op.startsWith('NewObjectWithBuffer')) {
      const keys = readLiterals(keyBase, a[3], a[2]), vals = readLiterals(valueBase, a[4], a[2]);
      keys.forEach((k, i) => { fields[k] = vals[i]; });
    } else if (/^PutNewOwnById/.test(ins.op)) {
      const v = regs[a[1]];
      fields[ins.str] = v?.s ?? v?.n ?? (v?.ref ? { ref: v.ref.join('.') } : null);
    } else if (ins.op === 'LoadThisNS') regs[a[0]] = { ref: ['this'] };
  }
  return { fields, numbers, calls };
}

const { modules } = JSON.parse(fs.readFileSync(modulesPath, 'utf8'));
const re = new RegExp(pathRe);
const out = {};
for (const m of modules.filter(m => re.test(m.path))) {
  const stack = [m.factory], seen = new Set(), classes = [];
  while (stack.length) {
    const id = stack.pop();
    if (seen.has(id)) continue;
    seen.add(id);
    const getters = {};
    let pendingKey = null;
    const kids = [];
    for (const ins of h.instructions(id)) {
      if (ins.fn !== undefined) kids.push(ins.fn);
      if (ins.op.startsWith('LoadConstString')) pendingKey = ins.str;
      if (/^PutNewOwnById/.test(ins.op) && ins.str === 'key') continue;
      if (ins.op.startsWith('CreateClosure') && pendingKey) getters[pendingKey] = ins.fn;
    }
    const keys = Object.keys(getters).filter(k => ['get', 'value'].includes(h.headers[getters[k]].name));
    if (keys.length >= 2) classes.push({ builder: id, getters: Object.fromEntries(keys.map(k => [k, { fn: getters[k], kind: h.headers[getters[k]].name, ...getterBody(getters[k]) }])) });
    stack.push(...kids.filter(k => !seen.has(k)));
  }
  out[m.path] = classes;
}
fs.writeFileSync(outPath, JSON.stringify(out, null, 1));
for (const [p, cs] of Object.entries(out)) console.log(p, cs.map(c => Object.keys(c.getters).join(',')).join(' | '));
