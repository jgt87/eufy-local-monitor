// Minimal Hermes v96 bytecode reader: strings, function headers, instruction streams.
// Opcode layout comes from Meta's BytecodeList.def (analysis/streaming/BytecodeList.def).
import fs from 'node:fs';

export function loadOpcodes(defPath) {
  const src = fs.readFileSync(defPath, 'utf8').split('#ifdef HERMES_RUN_WASM')[0];
  const ops = [], strArgs = new Map(), funcArgs = new Map();
  for (const line of src.split(/\r?\n/)) {
    let m = line.match(/^DEFINE_OPCODE_\d\(([^,)]+)(?:,\s*(.*))?\)/);
    if (m) ops.push({ name: m[1], types: m[2] ? m[2].split(/,\s*/) : [] });
    m = line.match(/^DEFINE_JUMP_(\d)\((\w+)\)/);
    if (m) { const rest = Array(+m[1] - 1).fill('Reg8'); ops.push({ name: m[2], types: ['Addr8', ...rest] }, { name: m[2] + 'Long', types: ['Addr32', ...rest] }); }
    m = line.match(/^OPERAND_(STRING|FUNCTION)_ID\((\w+),\s*(\d)\)/);
    if (m) (m[1] === 'STRING' ? strArgs : funcArgs).set(m[2], +m[3] - 1);
  }
  return { ops, strArgs, funcArgs };
}

const sizes = { Reg8: 1, Reg32: 4, UInt8: 1, UInt16: 2, UInt32: 4, Addr8: 1, Addr32: 4, Imm32: 4, Double: 8 };

export function openHbc(hbcPath, opcodes) {
  const b = fs.readFileSync(hbcPath);
  if (b.readBigUInt64LE(0) !== 0x1f1903c103bc1fc6n || b.readUInt32LE(8) !== 96) throw Error('Expected Hermes bytecode v96');
  const functionCount = b.readUInt32LE(40), kindCount = b.readUInt32LE(44), identifierCount = b.readUInt32LE(48);
  const stringCount = b.readUInt32LE(52), overflowCount = b.readUInt32LE(56), storageSize = b.readUInt32LE(60);
  const table = 128 + functionCount * 16 + kindCount * 4 + identifierCount * 4;
  const overflow = table + stringCount * 4, storage = overflow + overflowCount * 8;
  const strings = [];
  for (let i = 0; i < stringCount; i++) {
    const v = b.readUInt32LE(table + i * 4), utf16 = !!(v & 1);
    let offset = (v >>> 1) & 0x7fffff, length = v >>> 24;
    if (length === 255) { length = b.readUInt32LE(overflow + offset * 8 + 4); offset = b.readUInt32LE(overflow + offset * 8); }
    strings.push(b.subarray(storage + offset, storage + offset + length * (utf16 ? 2 : 1)).toString(utf16 ? 'utf16le' : 'utf8'));
  }
  const headers = [];
  for (let i = 0; i < functionCount; i++) {
    const h = 128 + i * 16, w0 = b.readUInt32LE(h), w1 = b.readUInt32LE(h + 4), w2 = b.readUInt32LE(h + 8), flag = b[h + 15];
    let offset = w0 & 0x1ffffff, size = w1 & 0x7fff, name = w1 >>> 15, frameSize = w2 >>> 25;
    if (flag & 32) { const large = ((w2 & 0x1ffffff) << 16) | (offset & 65535); offset = b.readUInt32LE(large); size = b.readUInt32LE(large + 8); name = b.readUInt32LE(large + 12); frameSize = b.readUInt32LE(large + 20); }
    headers.push({ id: i, name: strings[name] || '', offset, size, frameSize });
  }
  const { ops, strArgs, funcArgs } = opcodes;
  function* instructions(id) {
    const { offset, size } = headers[id];
    for (let p = offset; p < offset + size;) {
      const at = p, op = ops[b[p++]];
      if (!op) throw Error(`unknown opcode at ${at}`);
      const args = [];
      for (const type of op.types) {
        const n = sizes[type];
        args.push(type === 'Double' ? b.readDoubleLE(p) : type === 'Addr8' ? b.readInt8(p) : type === 'Addr32' || type === 'Imm32' ? b.readInt32LE(p) : b.readUIntLE(p, n));
        p += n;
      }
      const s = strArgs.get(op.name), f = funcArgs.get(op.name);
      yield { at, op: op.name, args, str: s !== undefined ? strings[args[s]] : undefined, fn: f !== undefined ? args[f] : undefined };
    }
  }
  return { buffer: b, functionCount, strings, headers, instructions, storageEnd: storage + storageSize };
}
