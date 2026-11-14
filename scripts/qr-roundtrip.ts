/**
 * QR 编码器自检：解码自己生成的矩阵，验证 round-trip 正确。
 * 只实现本编码器支持的范围（byte 模式、ECC M、版本 1-10）。
 */
import { encodeQr } from "../src/lib/toolbox/qr";

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i += 1) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i += 1) EXP[i] = EXP[i - 255]!;
})();
function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return EXP[LOG[a]! + LOG[b]!]!;
}

function versionSpec(v: number) {
  const table: Record<number, [number, number, number, number, number, number]> = {
    1: [26, 10, 16, 1, 0, 0], 2: [44, 16, 28, 1, 0, 0], 3: [70, 26, 44, 1, 0, 0],
    4: [100, 18, 32, 2, 0, 0], 5: [134, 24, 43, 2, 0, 0], 6: [172, 16, 27, 4, 0, 0],
    7: [196, 18, 31, 4, 0, 0], 8: [242, 22, 38, 2, 17, 2], 9: [292, 22, 36, 3, 10, 2],
    10: [346, 26, 43, 4, 15, 1],
  };
  const t = table[v]!;
  return {
    total: t[0],
    ec: t[1],
    blocks: t[3] + t[5],
    g1len: t[2],
    g1: t[3],
    g2len: t[4],
    g2: t[5],
  };
}

function alignPos(v: number): number[] {
  const map: Record<number, number[]> = {
    1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34],
    7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50],
  };
  return map[v]!;
}

function buildFunctionMap(size: number, version: number): boolean[][] {
  const fn: boolean[][] = Array.from({ length: size }, () => Array<boolean>(size).fill(false));
  const mark = (r: number, c: number) => {
    if (r < 0 || c < 0 || r >= size || c >= size) return;
    fn[r]![c] = true;
  };
  // 三个「定位图形 + 分隔符」块（8×8），与编码器 finder() 的覆盖范围一致
  for (const [r0, c0] of [
    [0, 0],
    [0, size - 8],
    [size - 8, 0],
  ] as [number, number][]) {
    for (let r = 0; r < 8; r += 1) for (let c = 0; c < 8; c += 1) mark(r0 + r, c0 + c);
  }
  // 定时图形
  for (let i = 8; i < size - 8; i += 1) { mark(6, i); mark(i, 6); }
  // 校正图形
  const aligns = alignPos(version);
  for (const r of aligns) {
    for (const c of aligns) {
      if ((r === 6 && c === 6) || (r === 6 && c === size - 7) || (r === size - 7 && c === 6)) continue;
      for (let dr = -2; dr <= 2; dr += 1) for (let dc = -2; dc <= 2; dc += 1) mark(r + dr, c + dc);
    }
  }
  // 格式信息（两份）
  for (let i = 0; i <= 8; i += 1) { mark(8, i); mark(i, 8); }
  for (let i = 0; i <= 7; i += 1) { mark(8, size - 1 - i); mark(size - 1 - i, 8); }
  // 版本信息
  if (version >= 7) {
    for (let i = 0; i < 18; i += 1) {
      mark(Math.floor(i / 3), size - 11 + (i % 3));
      mark(size - 11 + (i % 3), Math.floor(i / 3));
    }
  }
  mark(size - 8, 8);
  return fn;
}

function dataPositions(size: number, fn: boolean[][]): [number, number][] {
  const pos: [number, number][] = [];
  let upward = true;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col -= 1;
    for (let i = 0; i < size; i += 1) {
      const row = upward ? size - 1 - i : i;
      for (let k = 0; k < 2; k += 1) {
        const c = col - k;
        if (!fn[row]![c]) pos.push([row, c]);
      }
    }
    upward = !upward;
  }
  return pos;
}

function unmaskBit(r: number, c: number, mask: number): boolean {
  switch (mask) {
    case 0: return (r + c) % 2 === 0;
    case 1: return r % 2 === 0;
    case 2: return c % 3 === 0;
    case 3: return (r + c) % 3 === 0;
    case 4: return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
    case 5: return ((r * c) % 2) + ((r * c) % 3) === 0;
    case 6: return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0;
    case 7: return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0;
    default: return (((r * c) % 3) + ((r + c) % 2)) % 2 === 0;
  }
}

function decode(text: string): string {
  const m = encodeQr(text);
  const size = m.size;
  const version = (size - 17) / 4;
  const spec = versionSpec(version);
  const fn = buildFunctionMap(size, version);
  const pos = dataPositions(size, fn);

  // 读格式信息（第一份），解出 mask
  const fmtBits: number[] = [];
  for (let i = 0; i <= 5; i += 1) fmtBits.push(m.modules[8]![i] ? 1 : 0);
  fmtBits.push(m.modules[8]![7] ? 1 : 0);
  fmtBits.push(m.modules[8]![8] ? 1 : 0);
  fmtBits.push(m.modules[7]![8] ? 1 : 0);
  for (let i = 9; i <= 14; i += 1) fmtBits.push(m.modules[14 - i]![8] ? 1 : 0);
  let raw = 0;
  for (const b of fmtBits) raw = (raw << 1) | b;
  const unmasked = raw ^ 0x5412;
  const eccBits = (unmasked >> 13) & 0b11;
  const mask = (unmasked >> 10) & 0b111;
  if (eccBits !== 0b00) throw new Error(`ECC 指示位错误：${eccBits}`);

  // 读数据位并去掩码
  const bits: number[] = [];
  for (const [r, c] of pos) {
    let bit = m.modules[r]![c] ? 1 : 0;
    if (unmaskBit(r, c, mask)) bit ^= 1;
    bits.push(bit);
  }
  const codewords: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j += 1) b = (b << 1) | bits[i + j]!;
    codewords.push(b);
  }

  // 反交织
  const blocks: number[][] = [];
  for (let i = 0; i < spec.g1; i += 1) blocks.push([]);
  for (let i = 0; i < spec.g2; i += 1) blocks.push([]);
  const maxData = Math.max(spec.g1len, spec.g2len);
  let idx = 0;
  for (let i = 0; i < maxData; i += 1) {
    for (let b = 0; b < spec.blocks; b += 1) {
      const len = b < spec.g1 ? spec.g1len : spec.g2len;
      if (i < len) blocks[b]!.push(codewords[idx++]!);
    }
  }
  // 纠错（RS 校验）
  const ecBlocks: number[][] = [];
  for (let i = 0; i < spec.ec; i += 1) ecBlocks.push([]);
  for (let i = 0; i < spec.ec; i += 1) {
    for (let b = 0; b < spec.blocks; b += 1) ecBlocks[b]!.push(codewords[idx++]!);
  }
  for (let b = 0; b < spec.blocks; b += 1) {
    const data = Uint8Array.from(blocks[b]!);
    const ec = Uint8Array.from(ecBlocks[b]!);
    // 重新计算 EC 并比对
    const calc = new Uint8Array(spec.ec);
    for (let i = 0; i < data.length; i += 1) {
      const factor = data[i]!;
      calc[spec.ec - 1] = calc[spec.ec - 1]! ^ factor;
      for (let j = spec.ec - 1; j > 0; j -= 1) {
        calc[j] = calc[j - 1]! ^ gfMul(calc[j]!, factor);
      }
    }
    for (let i = 0; i < spec.ec; i += 1) {
      if (calc[i] !== ec[i]) throw new Error(`第 ${b} 块纠错码不匹配`);
    }
  }

  // 拼接数据并解析
  const data: number[] = [];
  for (let b = 0; b < spec.blocks; b += 1) data.push(...blocks[b]!);
  const dbits: number[] = [];
  for (const b of data) for (let i = 7; i >= 0; i -= 1) dbits.push((b >> i) & 1);
  let p = 0;
  const take = (n: number) => {
    const v = dbits.slice(p, p + n).reduce((a, b) => (a << 1) | b, 0);
    p += n;
    return v;
  };
  const mode = take(4);
  if (mode !== 0b0100) throw new Error(`模式不是 byte：${mode}`);
  const lenBits = version <= 9 ? 8 : 16;
  const len = take(lenBits);
  const bytes: number[] = [];
  for (let i = 0; i < len; i += 1) bytes.push(take(8));
  return new TextDecoder().decode(Uint8Array.from(bytes));
}

const cases = [
  "https://example.com",
  "Hello",
  "BestNav Clone 效率工具箱",
  "https://bestnav.local/search?q=二维码&category=web",
  "a".repeat(50),
  "b".repeat(120),
  "混合 Mixed 内容 with 中文 and English 123 !@#",
  "x".repeat(180),
];

let fail = 0;
for (const c of cases) {
  try {
    const out = decode(c);
    const ok = out === c;
    if (!ok) fail += 1;
    console.log(`${ok ? "OK  " : "FAIL"} len=${String(c.length).padStart(3)} -> ${out === c ? "一致" : `不一致: ${out.slice(0, 40)}`}`);
  } catch (e) {
    fail += 1;
    console.log(`FAIL len=${String(c.length).padStart(3)} ${e instanceof Error ? e.message : String(e)}`);
  }
}
console.log(fail === 0 ? "\n全部 round-trip 通过" : `\n${fail} 个用例失败`);
