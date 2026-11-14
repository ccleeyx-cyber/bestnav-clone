/**
 * 轻量 QR Code 编码器（byte 模式，ECC 等级 L/M，自动版本 1-10）。
 *
 * 自实现，不引第三方依赖。生成的是标准 QR Code（ISO/IEC 18004），可被任意扫码器识别。
 */

export interface QrMatrix {
  size: number;
  modules: boolean[][];
}

/* GF(256) 表，0x11D 本原多项式 */
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

/**
 * 版本信息（ECC M）。
 * 结构：[总码字数, 纠错码字数, 组1数据码字/块, 组1块数, 组2数据码字/块, 组2块数]
 * 数据取自 ISO/IEC 18004 表 13-22（ECC M）。
 */
interface VersionSpec {
  total: number;
  ecCodewords: number;
  blocks: number;
  dataCodewords: number;
  group1Len: number;
  group1Blocks: number;
  group2Len: number;
  group2Blocks: number;
}

const ECC_M_TABLE: Record<number, [number, number, number, number, number, number]> = {
  1: [26, 10, 16, 1, 0, 0],
  2: [44, 16, 28, 1, 0, 0],
  3: [70, 26, 44, 1, 0, 0],
  4: [100, 18, 32, 2, 0, 0],
  5: [134, 24, 43, 2, 0, 0],
  6: [172, 16, 27, 4, 0, 0],
  7: [196, 18, 31, 4, 0, 0],
  8: [242, 22, 38, 2, 17, 2],
  9: [292, 22, 36, 3, 10, 2],
  10: [346, 26, 43, 4, 15, 1],
};

function versionSpec(version: number): VersionSpec {
  const t = ECC_M_TABLE[version];
  if (!t) throw new Error(`不支持的 QR 版本：${version}`);
  const blocks = t[3] + t[5];
  return {
    total: t[0],
    ecCodewords: t[1],
    blocks,
    dataCodewords: 0,
    group1Len: t[2],
    group1Blocks: t[3],
    group2Len: t[4],
    group2Blocks: t[5],
  };
}

/** byte 模式字符计数指示符位宽：版本 1-9 为 8 位，10-26 为 16 位。 */
function charCountBits(version: number): number {
  return version <= 9 ? 8 : 16;
}

function alignmentPatternPositions(version: number): number[] {
  switch (version) {
    case 1: return [];
    case 2: return [6, 18];
    case 3: return [6, 22];
    case 4: return [6, 26];
    case 5: return [6, 30];
    case 6: return [6, 34];
    case 7: return [6, 22, 38];
    case 8: return [6, 24, 42];
    case 9: return [6, 26, 46];
    case 10: return [6, 28, 50];
    default: return [];
  }
}

function eccBlock(data: Uint8Array, ecLen: number): Uint8Array {
  const res = new Uint8Array(ecLen);
  for (let i = 0; i < data.length; i += 1) {
    const factor = data[i]!;
    res[ecLen - 1] = res[ecLen - 1]! ^ factor;
    for (let j = ecLen - 1; j > 0; j -= 1) {
      res[j] = res[j - 1]! ^ gfMul(res[j]!, factor);
    }
  }
  return res;
}

export function encodeQr(text: string): QrMatrix {
  const bytes = Array.from(new TextEncoder().encode(text));

  // ---- 选版本：数据码字容量 = 总码字 - 纠错码字 ----
  let version = 0;
  let spec: VersionSpec | null = null;
  for (let v = 1; v <= 10; v += 1) {
    const s = versionSpec(v);
    const capBytes = s.total - s.ecCodewords;
    // 4 位模式 + ccBits 计数 + 数据 + 4 位终止符
    const ccBits = charCountBits(v);
    const needed = Math.ceil((4 + ccBits + bytes.length * 8) / 8);
    if (needed <= capBytes) {
      version = v;
      spec = s;
      break;
    }
  }
  if (!spec || !version) {
    throw new Error(
      "内容过长：当前实现最多支持约 213 字节（版本 10，ECC M）；请缩短内容或改用链接短链。",
    );
  }

  // ---- 比特流 ----
  const bits: number[] = [];
  const push = (value: number, len: number) => {
    for (let i = len - 1; i >= 0; i -= 1) bits.push((value >>> i) & 1);
  };
  const ccBits = charCountBits(version);
  push(0b0100, 4); // byte mode
  push(bytes.length, ccBits);
  for (const b of bytes) push(b, 8);

  const totalDataBytes = spec.total - spec.ecCodewords;
  const totalDataBits = totalDataBytes * 8;
  // 终止符（最多 4 位）
  for (let i = 0; i < Math.min(4, totalDataBits - bits.length); i += 1) bits.push(0);
  // 补齐到字节边界
  while (bits.length % 8 !== 0) bits.push(0);
  // 交替填充码字 0xEC / 0x11
  const padBytes = [0xec, 0x11];
  let padIdx = 0;
  while (bits.length < totalDataBits) {
    push(padBytes[padIdx % 2]!, 8);
    padIdx += 1;
  }

  const dataBytes: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j += 1) b = (b << 1) | bits[i + j]!;
    dataBytes.push(b);
  }

  // ---- 分块 + 纠错 ----
  const ecPerBlock = spec.ecCodewords;
  const blocks: Uint8Array[] = [];
  let offset = 0;
  for (let i = 0; i < spec.group1Blocks; i += 1) {
    blocks.push(new Uint8Array(dataBytes.slice(offset, offset + spec.group1Len)));
    offset += spec.group1Len;
  }
  for (let i = 0; i < spec.group2Blocks; i += 1) {
    blocks.push(new Uint8Array(dataBytes.slice(offset, offset + spec.group2Len)));
    offset += spec.group2Len;
  }
  const ecBlocks = blocks.map((b) => eccBlock(b, ecPerBlock));

  // 交织：先按列交织数据码字，再按列交织纠错码字
  const finalCodewords: number[] = [];
  const maxData = Math.max(spec.group1Len, spec.group2Len);
  for (let i = 0; i < maxData; i += 1) {
    for (const b of blocks) {
      if (i < b.length) finalCodewords.push(b[i]!);
    }
  }
  for (let i = 0; i < ecPerBlock; i += 1) {
    for (const b of ecBlocks) finalCodewords.push(b[i]!);
  }

  // ---- 矩阵 ----
  const size = version * 4 + 17;
  const modules: (boolean | null)[][] = Array.from({ length: size }, () => Array<boolean | null>(size).fill(null));
  const isFunction: boolean[][] = Array.from({ length: size }, () => Array<boolean>(size).fill(false));

  const setFn = (r: number, c: number, v: boolean) => {
    if (r < 0 || c < 0 || r >= size || c >= size) return;
    modules[r]![c] = v;
    isFunction[r]![c] = true;
  };

  // 定位图形
  const finder = (row: number, col: number) => {
    for (let r = -1; r <= 7; r += 1) {
      for (let c = -1; c <= 7; c += 1) {
        const rr = row + r;
        const cc = col + c;
        if (rr < 0 || cc < 0 || rr >= size || cc >= size) continue;
        const inRing = (r >= 0 && r <= 6 && (c === 0 || c === 6)) || (c >= 0 && c <= 6 && (r === 0 || r === 6));
        const inCore = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        setFn(rr, cc, inRing || inCore);
      }
    }
  };
  finder(0, 0);
  finder(0, size - 7);
  finder(size - 7, 0);

  // 定时图形
  for (let i = 8; i < size - 8; i += 1) {
    const v = i % 2 === 0;
    setFn(6, i, v);
    setFn(i, 6, v);
  }

  // 校正图形
  const aligns = alignmentPatternPositions(version);
  for (const r of aligns) {
    for (const c of aligns) {
      if ((r === 6 && c === 6) || (r === 6 && c === size - 7) || (r === size - 7 && c === 6)) continue;
      for (let dr = -2; dr <= 2; dr += 1) {
        for (let dc = -2; dc <= 2; dc += 1) {
          const on = Math.max(Math.abs(dr), Math.abs(dc)) !== 1;
          setFn(r + dr, c + dc, on);
        }
      }
    }
  }

  // 格式信息占位（先占位，稍后写）
  for (let i = 0; i < 9; i += 1) {
    if (modules[8]![i] === null) setFn(8, i, false);
    if (modules[i]![8] === null) setFn(i, 8, false);
  }
  for (let i = 0; i < 8; i += 1) {
    if (modules[8]![size - 1 - i] === null) setFn(8, size - 1 - i, false);
    if (modules[size - 1 - i]![8] === null) setFn(size - 1 - i, 8, false);
  }
  // 版本信息（version >= 7）
  if (version >= 7) {
    for (let i = 0; i < 18; i += 1) {
      const r = Math.floor(i / 3);
      const c = size - 11 + (i % 3);
      setFn(r, c, false);
      setFn(c, r, false);
    }
  }
  // 暗模块
  setFn(size - 8, 8, true);

  const reserveFormat = () => {
    for (let i = 0; i <= 8; i += 1) {
      if (i !== 6) {
        setFn(8, i, false);
        setFn(i, 8, false);
      }
    }
    for (let i = 0; i < 8; i += 1) {
      setFn(8, size - 1 - i, false);
      setFn(size - 1 - i, 8, false);
    }
    setFn(size - 8, 8, true);
  };

  const dataPositions: [number, number][] = [];
  let upward = true;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col -= 1;
    for (let i = 0; i < size; i += 1) {
      const row = upward ? size - 1 - i : i;
      for (let k = 0; k < 2; k += 1) {
        const c = col - k;
        if (modules[row]![c] === null) dataPositions.push([row, c]);
      }
    }
    upward = !upward;
  }

  // ---- 数据填充 + 掩码 ----
  const best = { mask: 0, score: Infinity, modules: null as boolean[][] | null };

  /** 掩码判定：返回该模块是否需要翻转。 */
  const maskFlip = (r: number, c: number, mask: number): boolean => {
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
  };

  const base = modules.map((row) => row.map((v) => v === true));

  for (let mask = 0; mask < 8; mask += 1) {
    const m = base.map((row) => [...row]);
    // 先写数据比特（未掩码）
    let bitIdx = 0;
    for (const [r, c] of dataPositions) {
      let bit = 0;
      if (bitIdx < finalCodewords.length * 8) {
        const byte = finalCodewords[bitIdx >> 3]!;
        bit = (byte >> (7 - (bitIdx & 7))) & 1;
      }
      m[r]![c] = bit === 1;
      bitIdx += 1;
    }
    // 再对数据位施加掩码（只作用于数据区，格式信息随后单独写入）
    for (const [r, c] of dataPositions) {
      if (maskFlip(r, c, mask)) m[r]![c] = !m[r]![c];
    }
    // 格式信息（ECC M = 0b00, mask）
    const fmtData = (0b00 << 3) | mask;
    let rem = fmtData;
    for (let i = 0; i < 10; i += 1) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bitsOut = ((fmtData << 10) | rem) ^ 0x5412;
    const fmtBits: boolean[] = [];
    for (let i = 14; i >= 0; i -= 1) fmtBits.push(((bitsOut >> i) & 1) === 1);
    // 第一份
    for (let i = 0; i <= 5; i += 1) m[8]![i] = fmtBits[i]!;
    m[8]![7] = fmtBits[6]!;
    m[8]![8] = fmtBits[7]!;
    m[7]![8] = fmtBits[8]!;
    for (let i = 9; i <= 14; i += 1) m[14 - i]![8] = fmtBits[i]!;
    // 第二份
    for (let i = 0; i <= 7; i += 1) m[size - 1 - i]![8] = fmtBits[i]!;
    for (let i = 8; i <= 14; i += 1) m[8]![size - 15 + i] = fmtBits[i]!;
    m[size - 8]![8] = true;

    const score = penaltyScore(m, size, isFunction);
    if (score < best.score) {
      best.score = score;
      best.mask = mask;
      best.modules = m;
    }
  }

  const finalModules = best.modules!;
  const out: boolean[][] = finalModules.map((row) => row.map((v) => v === true));
  return { size, modules: out };
}

function penaltyScore(m: boolean[][], size: number, isFunction: boolean[][]): number {
  let score = 0;
  // 规则 1：同色连续 5+ 条
  for (let r = 0; r < size; r += 1) {
    let runColor = m[r]![0]!;
    let runLen = 1;
    for (let c = 1; c < size; c += 1) {
      if (m[r]![c] === runColor) {
        runLen += 1;
      } else {
        if (runLen >= 5) score += 3 + (runLen - 5);
        runColor = m[r]![c]!;
        runLen = 1;
      }
    }
    if (runLen >= 5) score += 3 + (runLen - 5);
  }
  for (let c = 0; c < size; c += 1) {
    let runColor = m[0]![c]!;
    let runLen = 1;
    for (let r = 1; r < size; r += 1) {
      if (m[r]![c] === runColor) {
        runLen += 1;
      } else {
        if (runLen >= 5) score += 3 + (runLen - 5);
        runColor = m[r]![c]!;
        runLen = 1;
      }
    }
    if (runLen >= 5) score += 3 + (runLen - 5);
  }
  // 规则 2：2x2 同色块
  for (let r = 0; r < size - 1; r += 1) {
    for (let c = 0; c < size - 1; c += 1) {
      const v = m[r]![c]!;
      if (v === m[r]![c + 1] && v === m[r + 1]![c] && v === m[r + 1]![c + 1]) score += 3;
    }
  }
  // 规则 3：类似定位图形（1:1:3:1:4）
  const pattern = [true, false, true, true, true, false, true, false, false, false, false];
  const matchAt = (get: (i: number) => boolean, start: number): boolean => {
    for (let k = 0; k < 11; k += 1) if (get(start + k) !== pattern[k]) return false;
    return true;
  };
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c + 11 <= size; c += 1) {
      if (matchAt((i) => m[r]![i]!, c)) score += 40;
    }
  }
  for (let c = 0; c < size; c += 1) {
    for (let r = 0; r + 11 <= size; r += 1) {
      if (matchAt((i) => m[i]![c]!, r)) score += 40;
    }
  }
  // 规则 4：黑白比例
  let dark = 0;
  for (let r = 0; r < size; r += 1) for (let c = 0; c < size; c += 1) if (m[r]![c]) dark += 1;
  const ratio = (dark * 100) / (size * size);
  score += Math.floor(Math.abs(ratio - 50) / 5) * 10;
  void isFunction;
  return score;
}

/** 把矩阵渲染成 SVG 字符串。 */
export function qrToSvg(matrix: QrMatrix, quiet = 4, moduleSize = 8): string {
  const total = (matrix.size + quiet * 2) * moduleSize;
  const parts: string[] = [];
  for (let r = 0; r < matrix.size; r += 1) {
    for (let c = 0; c < matrix.size; c += 1) {
      if (!matrix.modules[r]![c]) continue;
      const x = (c + quiet) * moduleSize;
      const y = (r + quiet) * moduleSize;
      parts.push(`M${x} ${y}h${moduleSize}v${moduleSize}h-${moduleSize}z`);
    }
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${total}" height="${total}" viewBox="0 0 ${total} ${total}">` +
    `<rect width="${total}" height="${total}" fill="#ffffff"/>` +
    `<path d="${parts.join("")}" fill="#000000"/>` +
    `</svg>`
  );
}
