import { Buffer } from "node:buffer";
import { TextDecoder } from "../text-encoding.js";
import { ReadableStream } from "./streams.js";
import { encode } from "./bytes.js";

class PortableBlob {
  readonly #bytes: Uint8Array;
  readonly type: string;
  constructor(parts: Iterable<unknown> = [], options: { type?: string } = {}) {
    this.#bytes = new Uint8Array(
      Buffer.concat(
        Array.from(parts, (part) =>
          Buffer.from(part instanceof PortableBlob ? part.#bytes : encode(part)),
        ),
      ),
    );
    this.type =
      options.type && /^[\x20-\x7e]*$/.test(options.type) ? options.type.toLowerCase() : "";
  }
  get size(): number {
    return this.#bytes.length;
  }
  async arrayBuffer(): Promise<ArrayBuffer> {
    return this.#bytes.slice().buffer as ArrayBuffer;
  }
  async text(): Promise<string> {
    return new TextDecoder().decode(this.#bytes);
  }
  slice(start = 0, end = this.size, type = ""): PortableBlob {
    const position = (value: number) =>
      Math.min(this.size, Math.max(0, value < 0 ? this.size + value : value));
    return new PortableBlob([this.#bytes.slice(position(start), position(end))], { type });
  }
  stream(): ReadableStream<Uint8Array> {
    let offset = 0;
    const bytes = this.#bytes;
    return new ReadableStream({
      pull(controller) {
        if (offset === bytes.length) {
          controller.close();
        } else {
          const end = Math.min(offset + 65536, bytes.length);
          controller.enqueue(bytes.slice(offset, end));
          offset = end;
        }
      },
    });
  }
}
export const Blob = globalThis.Blob ?? (PortableBlob as unknown as typeof globalThis.Blob);
class PortableFile extends PortableBlob {
  readonly name: string;
  readonly lastModified: number;
  constructor(
    parts: Iterable<unknown>,
    name: string,
    options: { type?: string; lastModified?: number } = {},
  ) {
    super(parts, options);
    this.name = String(name).replaceAll("/", ":");
    this.lastModified = options.lastModified ?? Date.now();
  }
}
export const File = globalThis.File ?? (PortableFile as unknown as typeof globalThis.File);
