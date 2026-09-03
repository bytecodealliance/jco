import type { HttpHeaderField } from "../types.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder("latin1");

/** RFC 7541 Appendix A. Index zero is deliberately unused. */
const STATIC_TABLE: ReadonlyArray<readonly [string, string]> = [
  ["", ""],
  [":authority", ""],
  [":method", "GET"],
  [":method", "POST"],
  [":path", "/"],
  [":path", "/index.html"],
  [":scheme", "http"],
  [":scheme", "https"],
  [":status", "200"],
  [":status", "204"],
  [":status", "206"],
  [":status", "304"],
  [":status", "400"],
  [":status", "404"],
  [":status", "500"],
  ["accept-charset", ""],
  ["accept-encoding", "gzip, deflate"],
  ["accept-language", ""],
  ["accept-ranges", ""],
  ["accept", ""],
  ["access-control-allow-origin", ""],
  ["age", ""],
  ["allow", ""],
  ["authorization", ""],
  ["cache-control", ""],
  ["content-disposition", ""],
  ["content-encoding", ""],
  ["content-language", ""],
  ["content-length", ""],
  ["content-location", ""],
  ["content-range", ""],
  ["content-type", ""],
  ["cookie", ""],
  ["date", ""],
  ["etag", ""],
  ["expect", ""],
  ["expires", ""],
  ["from", ""],
  ["host", ""],
  ["if-match", ""],
  ["if-modified-since", ""],
  ["if-none-match", ""],
  ["if-range", ""],
  ["if-unmodified-since", ""],
  ["last-modified", ""],
  ["link", ""],
  ["location", ""],
  ["max-forwards", ""],
  ["proxy-authenticate", ""],
  ["proxy-authorization", ""],
  ["range", ""],
  ["referer", ""],
  ["refresh", ""],
  ["retry-after", ""],
  ["server", ""],
  ["set-cookie", ""],
  ["strict-transport-security", ""],
  ["transfer-encoding", ""],
  ["user-agent", ""],
  ["vary", ""],
  ["via", ""],
  ["www-authenticate", ""],
];

/**
 * RFC 7541 Appendix B, represented as [bit length, code]. The table is derived
 * from hpack.js (MIT, copyright Fedor Indutny) and is identical to the RFC.
 */
const HUFFMAN: ReadonlyArray<readonly [number, number]> = [
  [13, 8184],
  [23, 8388568],
  [28, 268435426],
  [28, 268435427],
  [28, 268435428],
  [28, 268435429],
  [28, 268435430],
  [28, 268435431],
  [28, 268435432],
  [24, 16777194],
  [30, 1073741820],
  [28, 268435433],
  [28, 268435434],
  [30, 1073741821],
  [28, 268435435],
  [28, 268435436],
  [28, 268435437],
  [28, 268435438],
  [28, 268435439],
  [28, 268435440],
  [28, 268435441],
  [28, 268435442],
  [30, 1073741822],
  [28, 268435443],
  [28, 268435444],
  [28, 268435445],
  [28, 268435446],
  [28, 268435447],
  [28, 268435448],
  [28, 268435449],
  [28, 268435450],
  [28, 268435451],
  [6, 20],
  [10, 1016],
  [10, 1017],
  [12, 4090],
  [13, 8185],
  [6, 21],
  [8, 248],
  [11, 2042],
  [10, 1018],
  [10, 1019],
  [8, 249],
  [11, 2043],
  [8, 250],
  [6, 22],
  [6, 23],
  [6, 24],
  [5, 0],
  [5, 1],
  [5, 2],
  [6, 25],
  [6, 26],
  [6, 27],
  [6, 28],
  [6, 29],
  [6, 30],
  [6, 31],
  [7, 92],
  [8, 251],
  [15, 32764],
  [6, 32],
  [12, 4091],
  [10, 1020],
  [13, 8186],
  [6, 33],
  [7, 93],
  [7, 94],
  [7, 95],
  [7, 96],
  [7, 97],
  [7, 98],
  [7, 99],
  [7, 100],
  [7, 101],
  [7, 102],
  [7, 103],
  [7, 104],
  [7, 105],
  [7, 106],
  [7, 107],
  [7, 108],
  [7, 109],
  [7, 110],
  [7, 111],
  [7, 112],
  [7, 113],
  [7, 114],
  [8, 252],
  [7, 115],
  [8, 253],
  [13, 8187],
  [19, 524272],
  [13, 8188],
  [14, 16380],
  [6, 34],
  [15, 32765],
  [5, 3],
  [6, 35],
  [5, 4],
  [6, 36],
  [5, 5],
  [6, 37],
  [6, 38],
  [6, 39],
  [5, 6],
  [7, 116],
  [7, 117],
  [6, 40],
  [6, 41],
  [6, 42],
  [5, 7],
  [6, 43],
  [7, 118],
  [6, 44],
  [5, 8],
  [5, 9],
  [6, 45],
  [7, 119],
  [7, 120],
  [7, 121],
  [7, 122],
  [7, 123],
  [15, 32766],
  [11, 2044],
  [14, 16381],
  [13, 8189],
  [28, 268435452],
  [20, 1048550],
  [22, 4194258],
  [20, 1048551],
  [20, 1048552],
  [22, 4194259],
  [22, 4194260],
  [22, 4194261],
  [23, 8388569],
  [22, 4194262],
  [23, 8388570],
  [23, 8388571],
  [23, 8388572],
  [23, 8388573],
  [23, 8388574],
  [24, 16777195],
  [23, 8388575],
  [24, 16777196],
  [24, 16777197],
  [22, 4194263],
  [23, 8388576],
  [24, 16777198],
  [23, 8388577],
  [23, 8388578],
  [23, 8388579],
  [23, 8388580],
  [21, 2097116],
  [22, 4194264],
  [23, 8388581],
  [22, 4194265],
  [23, 8388582],
  [23, 8388583],
  [24, 16777199],
  [22, 4194266],
  [21, 2097117],
  [20, 1048553],
  [22, 4194267],
  [22, 4194268],
  [23, 8388584],
  [23, 8388585],
  [21, 2097118],
  [23, 8388586],
  [22, 4194269],
  [22, 4194270],
  [24, 16777200],
  [21, 2097119],
  [22, 4194271],
  [23, 8388587],
  [23, 8388588],
  [21, 2097120],
  [21, 2097121],
  [22, 4194272],
  [21, 2097122],
  [23, 8388589],
  [22, 4194273],
  [23, 8388590],
  [23, 8388591],
  [20, 1048554],
  [22, 4194274],
  [22, 4194275],
  [22, 4194276],
  [23, 8388592],
  [22, 4194277],
  [22, 4194278],
  [23, 8388593],
  [26, 67108832],
  [26, 67108833],
  [20, 1048555],
  [19, 524273],
  [22, 4194279],
  [23, 8388594],
  [22, 4194280],
  [25, 33554412],
  [26, 67108834],
  [26, 67108835],
  [26, 67108836],
  [27, 134217694],
  [27, 134217695],
  [26, 67108837],
  [24, 16777201],
  [25, 33554413],
  [19, 524274],
  [21, 2097123],
  [26, 67108838],
  [27, 134217696],
  [27, 134217697],
  [26, 67108839],
  [27, 134217698],
  [24, 16777202],
  [21, 2097124],
  [21, 2097125],
  [26, 67108840],
  [26, 67108841],
  [28, 268435453],
  [27, 134217699],
  [27, 134217700],
  [27, 134217701],
  [20, 1048556],
  [24, 16777203],
  [20, 1048557],
  [21, 2097126],
  [22, 4194281],
  [21, 2097127],
  [21, 2097128],
  [23, 8388595],
  [22, 4194282],
  [22, 4194283],
  [25, 33554414],
  [25, 33554415],
  [24, 16777204],
  [24, 16777205],
  [26, 67108842],
  [23, 8388596],
  [26, 67108843],
  [27, 134217702],
  [26, 67108844],
  [26, 67108845],
  [27, 134217703],
  [27, 134217704],
  [27, 134217705],
  [27, 134217706],
  [27, 134217707],
  [28, 268435454],
  [27, 134217708],
  [27, 134217709],
  [27, 134217710],
  [27, 134217711],
  [27, 134217712],
  [26, 67108846],
  [30, 1073741823],
];

interface HuffmanNode {
  zero?: HuffmanNode;
  one?: HuffmanNode;
  symbol?: number;
}

function buildHuffmanTree(): HuffmanNode {
  const root: HuffmanNode = {};
  HUFFMAN.forEach(([length, code], symbol) => {
    let node = root;
    for (let bit = length - 1; bit >= 0; bit--) {
      const key = ((code >>> bit) & 1) === 0 ? "zero" : "one";
      node = node[key] ??= {};
    }
    node.symbol = symbol;
  });
  return root;
}

const HUFFMAN_ROOT = buildHuffmanTree();

function decodeHuffman(input: Uint8Array): Uint8Array {
  const output: number[] = [];
  let node = HUFFMAN_ROOT;
  let bitsSinceSymbol = 0;
  let padding = 0;
  for (const byte of input) {
    for (let bit = 7; bit >= 0; bit--) {
      const one = ((byte >>> bit) & 1) !== 0;
      node = (one ? node.one : node.zero)!;
      bitsSinceSymbol++;
      padding = ((padding << 1) | Number(one)) & 0xff;
      if (!node) {
        throw new Error("Invalid HPACK Huffman code");
      }
      if (node.symbol !== undefined) {
        if (node.symbol === 256) {
          throw new Error("Unexpected HPACK Huffman EOS symbol");
        }
        output.push(node.symbol);
        node = HUFFMAN_ROOT;
        bitsSinceSymbol = 0;
        padding = 0;
      }
    }
  }
  if (bitsSinceSymbol > 7 || (bitsSinceSymbol > 0 && padding !== (1 << bitsSinceSymbol) - 1)) {
    throw new Error("Invalid HPACK Huffman padding");
  }
  return Uint8Array.from(output);
}

function encodeInteger(value: number, prefixBits: number, leading: number): number[] {
  const maximum = (1 << prefixBits) - 1;
  if (value < maximum) {
    return [leading | value];
  }
  const output = [leading | maximum];
  value -= maximum;
  while (value >= 128) {
    output.push((value & 0x7f) | 0x80);
    value = Math.floor(value / 128);
  }
  output.push(value);
  return output;
}

function decodeInteger(input: Uint8Array, offset: number, prefixBits: number): [number, number] {
  const maximum = (1 << prefixBits) - 1;
  let value = input[offset] & maximum;
  offset++;
  if (value < maximum) {
    return [value, offset];
  }
  let shift = 0;
  for (;;) {
    if (offset >= input.length || shift > 28) {
      throw new Error("Invalid HPACK integer");
    }
    const byte = input[offset++];
    value += (byte & 0x7f) * 2 ** shift;
    if ((byte & 0x80) === 0) {
      return [value, offset];
    }
    shift += 7;
  }
}

function encodeString(value: Uint8Array): number[] {
  return [...encodeInteger(value.byteLength, 7, 0), ...value];
}

function decodeString(input: Uint8Array, offset: number): [Uint8Array, number] {
  const huffman = (input[offset] & 0x80) !== 0;
  const [length, start] = decodeInteger(input, offset, 7);
  const end = start + length;
  if (end > input.length) {
    throw new Error("Truncated HPACK string");
  }
  const value = input.slice(start, end);
  return [huffman ? decodeHuffman(value) : value, end];
}

function field(name: string, value: string): HttpHeaderField {
  return { name, value: encoder.encode(value) };
}

export class HpackDecoder {
  #dynamic: Array<readonly [string, string]> = [];
  #dynamicSize = 0;
  #maximumSize = 4096;

  setMaximumSize(value: number): void {
    this.#maximumSize = value;
    this.#evict();
  }

  decode(input: Uint8Array): HttpHeaderField[] {
    const output: HttpHeaderField[] = [];
    let offset = 0;
    while (offset < input.length) {
      const first = input[offset];
      if ((first & 0x80) !== 0) {
        const [index, next] = decodeInteger(input, offset, 7);
        const [name, value] = this.#at(index);
        output.push(field(name, value));
        offset = next;
        continue;
      }
      if ((first & 0xe0) === 0x20) {
        const [size, next] = decodeInteger(input, offset, 5);
        this.setMaximumSize(size);
        offset = next;
        continue;
      }
      const incremental = (first & 0x40) !== 0;
      const prefix = incremental ? 6 : 4;
      let name: string;
      let nameIndex: number;
      [nameIndex, offset] = decodeInteger(input, offset, prefix);
      if (nameIndex === 0) {
        let encodedName: Uint8Array;
        [encodedName, offset] = decodeString(input, offset);
        name = decoder.decode(encodedName).toLowerCase();
      } else {
        [name] = this.#at(nameIndex);
      }
      let encodedValue: Uint8Array;
      [encodedValue, offset] = decodeString(input, offset);
      const value = decoder.decode(encodedValue);
      output.push(field(name, value));
      if (incremental) {
        this.#insert(name, value);
      }
    }
    return output;
  }

  #at(index: number): readonly [string, string] {
    if (index <= 0) {
      throw new Error(`Invalid HPACK table index ${index}`);
    }
    const entry =
      index < STATIC_TABLE.length
        ? STATIC_TABLE[index]
        : this.#dynamic[index - STATIC_TABLE.length];
    if (!entry) {
      throw new Error(`Invalid HPACK table index ${index}`);
    }
    return entry;
  }

  #insert(name: string, value: string): void {
    const size = encoder.encode(name).byteLength + encoder.encode(value).byteLength + 32;
    if (size > this.#maximumSize) {
      this.#dynamic = [];
      this.#dynamicSize = 0;
      return;
    }
    this.#dynamic.unshift([name, value]);
    this.#dynamicSize += size;
    this.#evict();
  }

  #evict(): void {
    while (this.#dynamicSize > this.#maximumSize && this.#dynamic.length > 0) {
      const [name, value] = this.#dynamic.pop()!;
      this.#dynamicSize -= encoder.encode(name).byteLength + encoder.encode(value).byteLength + 32;
    }
  }
}

/** Encode conservative, non-indexed literals; peers may still use their full dynamic table. */
export function encodeHeaders(headers: HttpHeaderField[]): Uint8Array {
  const output: number[] = [];
  for (const { name: rawName, value } of headers) {
    const name = rawName.toLowerCase();
    const valueText = decoder.decode(value);
    const exactIndex = STATIC_TABLE.findIndex(
      ([candidateName, candidateValue]) => candidateName === name && candidateValue === valueText,
    );
    if (exactIndex > 0) {
      output.push(...encodeInteger(exactIndex, 7, 0x80));
      continue;
    }
    const nameIndex = STATIC_TABLE.findIndex(([candidateName]) => candidateName === name);
    output.push(...encodeInteger(Math.max(0, nameIndex), 4, 0));
    if (nameIndex <= 0) {
      output.push(...encodeString(encoder.encode(name)));
    }
    output.push(...encodeString(value));
  }
  return Uint8Array.from(output);
}
