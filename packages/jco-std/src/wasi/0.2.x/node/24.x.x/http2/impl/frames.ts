import type { WasiInputStream, WasiOutputStream } from "../../http/impl/wasi-sockets.js";

export const FRAME = {
  data: 0,
  headers: 1,
  priority: 2,
  rstStream: 3,
  settings: 4,
  pushPromise: 5,
  ping: 6,
  goaway: 7,
  windowUpdate: 8,
  continuation: 9,
} as const;

export const FLAG = {
  ack: 0x1,
  endStream: 0x1,
  endHeaders: 0x4,
  padded: 0x8,
  priority: 0x20,
} as const;

export interface Http2Frame {
  type: number;
  flags: number;
  streamId: number;
  payload: Uint8Array;
}

export const CLIENT_PREFACE = new TextEncoder().encode("PRI * HTTP/2.0\r\n\r\nSM\r\n\r\n");

export function concat(chunks: readonly Uint8Array[]): Uint8Array {
  const output = new Uint8Array(chunks.reduce((size, chunk) => size + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

export function encodeFrame(frame: Http2Frame): Uint8Array {
  if (frame.payload.byteLength > 0xff_ffff) {
    throw new Error("HTTP/2 frame payload is too large");
  }
  const output = new Uint8Array(9 + frame.payload.byteLength);
  const view = new DataView(output.buffer);
  output[0] = frame.payload.byteLength >>> 16;
  output[1] = frame.payload.byteLength >>> 8;
  output[2] = frame.payload.byteLength;
  output[3] = frame.type;
  output[4] = frame.flags;
  view.setUint32(5, frame.streamId & 0x7fff_ffff);
  output.set(frame.payload, 9);
  return output;
}

export function writeFrame(output: WasiOutputStream, frame: Http2Frame): void {
  output.blockingWriteAndFlush(encodeFrame(frame));
}

export class FrameReader {
  readonly #input: WasiInputStream;
  readonly #u64: (value: number) => bigint;
  #buffer: Uint8Array<ArrayBufferLike> = new Uint8Array();

  constructor(input: WasiInputStream, u64: (value: number) => bigint = BigInt) {
    this.#input = input;
    this.#u64 = u64;
  }

  readBytes(length: number): Uint8Array {
    while (this.#buffer.byteLength < length) {
      const requested = this.#u64(Math.max(65_536, length - this.#buffer.byteLength));
      const chunk = this.#input.blockingRead(requested);
      if (chunk.byteLength === 0) {
        continue;
      }
      this.#buffer = concat([this.#buffer, chunk]);
    }
    const result = this.#buffer.slice(0, length);
    this.#buffer = this.#buffer.slice(length);
    return result;
  }

  readFrame(): Http2Frame {
    const header = this.readBytes(9);
    const length = (header[0] << 16) | (header[1] << 8) | header[2];
    return {
      type: header[3],
      flags: header[4],
      streamId:
        new DataView(header.buffer, header.byteOffset, header.byteLength).getUint32(5) &
        0x7fff_ffff,
      payload: this.readBytes(length),
    };
  }
}

export function uint32(value: number): Uint8Array {
  const output = new Uint8Array(4);
  new DataView(output.buffer).setUint32(0, value);
  return output;
}

export function parseUint32(value: Uint8Array, offset = 0): number {
  return new DataView(value.buffer, value.byteOffset, value.byteLength).getUint32(offset);
}
