import {
  ReadableStream as Stream,
  WritableStream as Sink,
  TransformStream as Transform,
} from "web-streams-polyfill";
import { Buffer } from "node:buffer";
import { TextEncoder, TextDecoder } from "./text-encoding.js";

export const ReadableStream =
  globalThis.ReadableStream ?? (Stream as unknown as typeof globalThis.ReadableStream);
export const WritableStream =
  globalThis.WritableStream ?? (Sink as unknown as typeof globalThis.WritableStream);
export const TransformStream =
  globalThis.TransformStream ?? (Transform as unknown as typeof globalThis.TransformStream);
const encode = (value: unknown): Uint8Array<ArrayBuffer> =>
  typeof value === "string"
    ? new Uint8Array(new TextEncoder().encode(value))
    : value instanceof ArrayBuffer
      ? new Uint8Array(value.slice(0))
      : ArrayBuffer.isView(value)
        ? new Uint8Array(new Uint8Array(value.buffer, value.byteOffset, value.byteLength))
        : new Uint8Array(new TextEncoder().encode(String(value)));

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

class PortableHeaders {
  readonly #values = new Map<string, string>();
  constructor(init?: Record<string, string> | Iterable<[string, string]>) {
    if (init) {
      for (const [name, value] of Symbol.iterator in Object(init)
        ? (init as Iterable<[string, string]>)
        : Object.entries(init)) {
        this.append(name, value);
      }
    }
  }
  set(name: string, value: string): void {
    this.#values.set(String(name).toLowerCase(), String(value).trim());
  }
  append(name: string, value: string): void {
    const previous = this.get(name);
    this.set(name, previous === null ? value : `${previous}, ${value}`);
  }
  get(name: string): string | null {
    return this.#values.get(String(name).toLowerCase()) ?? null;
  }
  has(name: string): boolean {
    return this.#values.has(String(name).toLowerCase());
  }
  delete(name: string): void {
    this.#values.delete(String(name).toLowerCase());
  }
  entries() {
    return this.#values.entries();
  }
  keys() {
    return this.#values.keys();
  }
  values() {
    return this.#values.values();
  }
  [Symbol.iterator]() {
    return this.entries();
  }
  forEach(callback: (value: string, key: string, headers: PortableHeaders) => void): void {
    for (const [key, value] of this.#values) {
      callback(value, key, this);
    }
  }
}
export const Headers =
  globalThis.Headers ?? (PortableHeaders as unknown as typeof globalThis.Headers);
class PortableResponse {
  readonly status: number;
  readonly statusText: string;
  readonly headers: Headers;
  readonly body: ReadableStream<Uint8Array> | null;
  bodyUsed = false;
  url = "";
  constructor(
    body?: unknown,
    init: { status?: number; statusText?: string; headers?: HeadersInit } = {},
  ) {
    this.status = init.status ?? 200;
    this.statusText = init.statusText ?? "";
    this.headers = new Headers(init.headers);
    this.body =
      body == null
        ? null
        : body instanceof ReadableStream
          ? (body as ReadableStream<Uint8Array>)
          : new Blob([encode(body)]).stream();
  }
  get ok(): boolean {
    return this.status >= 200 && this.status < 300;
  }
  async arrayBuffer(): Promise<ArrayBuffer> {
    if (this.bodyUsed) {
      throw new TypeError("Body is unusable");
    }
    this.bodyUsed = true;
    const chunks: Uint8Array[] = [];
    const reader = this.body?.getReader();
    if (reader) {
      for (;;) {
        const next = await reader.read();
        if (next.done) {
          break;
        }
        chunks.push(next.value);
      }
    }
    return new Uint8Array(Buffer.concat(chunks.map((bytes) => Buffer.from(bytes))))
      .buffer as ArrayBuffer;
  }
  async text(): Promise<string> {
    return new TextDecoder().decode(await this.arrayBuffer());
  }
  async json(): Promise<unknown> {
    return JSON.parse(await this.text());
  }
  async blob(): Promise<Blob> {
    return new Blob([await this.arrayBuffer()], { type: this.headers.get("content-type") ?? "" });
  }
}
export const Response =
  globalThis.Response ?? (PortableResponse as unknown as typeof globalThis.Response);
class PortableRequest {
  readonly url: string;
  readonly method: string;
  readonly headers: Headers;
  constructor(input: string | URL, init: RequestInit = {}) {
    this.url = String(input);
    this.method = init.method ?? "GET";
    this.headers = new Headers(init.headers);
  }
}
export const Request =
  globalThis.Request ?? (PortableRequest as unknown as typeof globalThis.Request);
export const fetch: typeof globalThis.fetch =
  globalThis.fetch ??
  ((async (input: RequestInfo | URL, init: RequestInit = {}) => {
    // Loading Web streams while node:stream initializes must not eagerly load
    // node:http, whose connection classes extend that same stream module.
    const { default: http } = await import("node:http");
    const url = input instanceof Request ? input.url : String(input);
    const headers = new Headers(init.headers);
    return new Promise<Response>((resolve, reject) => {
      const request = http.request(
        url,
        {
          method: init.method ?? "GET",
          headers: Object.fromEntries(headers),
          signal: init.signal ?? undefined,
        },
        (incoming) => {
          const stream = new ReadableStream<Uint8Array>({
            start(controller) {
              incoming.on("data", (chunk) => controller.enqueue(encode(chunk)));
              incoming.on("end", () => controller.close());
              incoming.on("error", (error) => controller.error(error));
            },
          });
          const response = new Response(stream, {
            status: incoming.statusCode,
            statusText: incoming.statusMessage,
            headers: incoming.headers as Record<string, string>,
          });
          Object.defineProperty(response, "url", { value: url });
          resolve(response);
        },
      );
      request.once("error", (error) =>
        reject(Object.assign(new TypeError("fetch failed"), { cause: error })),
      );
      request.end(
        init.body == null
          ? undefined
          : typeof init.body === "string"
            ? init.body
            : encode(init.body),
      );
    });
  }) as typeof globalThis.fetch);
