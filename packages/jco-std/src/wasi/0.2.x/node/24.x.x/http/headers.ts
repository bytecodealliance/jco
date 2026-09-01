import {
  headerAlreadySent,
  invalidArgType,
  invalidHeaderChar,
  invalidHttpToken,
} from "./errors.js";
import type { HttpHeaderValue, HttpHeaders, HttpTransportHeader } from "./types.js";

const TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const INVALID_VALUE = /[\0\r\n]/;

export function validateHeaderName(name: string, label = "Header name"): void {
  if (typeof name !== "string") {
    throw invalidArgType("name", "string", name);
  }
  if (!TOKEN.test(name)) {
    throw invalidHttpToken(label, name);
  }
}

export function validateHeaderValue(name: string, value: string): void {
  if (value === undefined) {
    throw invalidArgType("value", "string", value);
  }
  if (INVALID_VALUE.test(String(value))) {
    throw invalidHeaderChar(name);
  }
}

interface StoredHeader {
  name: string;
  value: HttpHeaderValue;
}

function values(value: HttpHeaderValue): string[] {
  return (Array.isArray(value) ? value : [value]).map(String);
}

export class HeaderStore {
  readonly #headers = new Map<string, StoredHeader>();
  #sent = false;

  constructor(headers?: HttpHeaders | readonly string[]) {
    if (Array.isArray(headers)) {
      if (headers.length % 2 !== 0) {
        throw invalidArgType("headers", "an even-length array", headers);
      }
      for (let index = 0; index < headers.length; index += 2) {
        this.append(headers[index], headers[index + 1]);
      }
    } else if (headers) {
      for (const [name, value] of Object.entries(headers)) {
        if (value !== undefined) {
          this.set(name, value);
        }
      }
    }
  }

  markSent(): void {
    this.#sent = true;
  }

  get sent(): boolean {
    return this.#sent;
  }

  set(name: string, value: HttpHeaderValue): void {
    this.#assertMutable();
    this.setInternal(name, value);
  }

  setInternal(name: string, value: HttpHeaderValue): void {
    validateHeaderName(name);
    for (const item of values(value)) {
      validateHeaderValue(name, item);
    }
    this.#headers.set(name.toLowerCase(), {
      name,
      value: Array.isArray(value) ? [...value] : value,
    });
  }

  append(name: string, value: HttpHeaderValue): void {
    this.#assertMutable();
    const current = this.#headers.get(name.toLowerCase());
    if (!current) {
      this.set(name, value);
      return;
    }
    this.set(current.name, [...values(current.value), ...values(value)]);
  }

  get(name: string): HttpHeaderValue | undefined {
    return this.#headers.get(name.toLowerCase())?.value;
  }

  has(name: string): boolean {
    return this.#headers.has(name.toLowerCase());
  }

  delete(name: string): void {
    this.#assertMutable();
    this.#headers.delete(name.toLowerCase());
  }

  names(): string[] {
    return [...this.#headers.keys()];
  }

  rawNames(): string[] {
    return [...this.#headers.values()].map(({ name }) => name);
  }

  object(): HttpHeaders {
    const result = Object.create(null) as HttpHeaders;
    for (const [name, { value }] of this.#headers) {
      result[name] = Array.isArray(value) ? [...value] : value;
    }
    return result;
  }

  entries(): Array<[string, string]> {
    return [...this.#headers.values()].flatMap(({ name, value }) =>
      values(value).map((item): [string, string] => [name, item]),
    );
  }

  transport(): HttpTransportHeader[] {
    return this.entries().map(([name, value]) => ({
      name,
      value: Uint8Array.from(value, (character) => character.charCodeAt(0) & 0xff),
    }));
  }

  #assertMutable(): void {
    if (this.#sent) {
      throw headerAlreadySent();
    }
  }
}

export function incomingHeaders(headers: HttpTransportHeader[]): {
  headers: Record<string, string | string[]>;
  rawHeaders: string[];
} {
  const decoder = new TextDecoder("latin1");
  const result: Record<string, string | string[]> = {};
  const rawHeaders: string[] = [];
  for (const { name, value } of headers) {
    const text = decoder.decode(value);
    rawHeaders.push(name, text);
    const lower = name.toLowerCase();
    const current = result[lower];
    if (lower === "set-cookie") {
      result[lower] =
        current === undefined ? [text] : [...(Array.isArray(current) ? current : [current]), text];
    } else if (current === undefined) {
      result[lower] = text;
    } else {
      result[lower] = `${Array.isArray(current) ? current.join(", ") : current}, ${text}`;
    }
  }
  return { headers: result, rawHeaders };
}
