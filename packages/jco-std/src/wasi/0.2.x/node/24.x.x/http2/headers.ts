import { invalidArgType } from "./errors.js";
import type { Http2Headers, Http2HeaderValue, HttpHeaderField } from "./types.js";

const PSEUDO_HEADERS = new Set([
  ":authority",
  ":method",
  ":path",
  ":protocol",
  ":scheme",
  ":status",
]);
const TOKEN = /^[!#$%&'*+\-.^_`|~0-9a-z]+$/;
const INVALID_VALUE = /[\0\r\n]/;

function validateName(name: unknown): string {
  if (typeof name !== "string") {
    throw invalidArgType("header name", "string", name);
  }
  const lower = name.toLowerCase();
  if (!(PSEUDO_HEADERS.has(lower) || TOKEN.test(lower))) {
    const error = new TypeError(`Header name must be a valid HTTP token ["${name}"]`);
    Object.assign(error, { code: "ERR_INVALID_HTTP_TOKEN" });
    throw error;
  }
  return lower;
}

function strings(value: Http2HeaderValue): string[] {
  return (Array.isArray(value) ? value : [value]).map(String);
}

export function headersToFields(headers: Http2Headers | readonly string[] = {}): HttpHeaderField[] {
  const entries: Array<[string, Http2HeaderValue]> = [];
  if (Array.isArray(headers)) {
    if (headers.length % 2 !== 0) {
      throw invalidArgType("headers", "an even-length array", headers);
    }
    for (let index = 0; index < headers.length; index += 2) {
      entries.push([headers[index], headers[index + 1]]);
    }
  } else {
    for (const [name, value] of Object.entries(headers)) {
      if (value !== undefined) {
        entries.push([name, value]);
      }
    }
  }
  return entries.flatMap(([name, value]) => {
    const lower = validateName(name);
    return strings(value).map((item) => {
      if (INVALID_VALUE.test(item)) {
        const error = new TypeError(`Invalid character in header content ["${name}"]`);
        Object.assign(error, { code: "ERR_INVALID_CHAR" });
        throw error;
      }
      return {
        name: lower,
        value: Uint8Array.from(item, (character) => character.charCodeAt(0) & 0xff),
      };
    });
  });
}

export function fieldsToHeaders(fields: readonly HttpHeaderField[]): {
  headers: Http2Headers;
  rawHeaders: string[];
} {
  const decoder = new TextDecoder("latin1");
  const headers: Http2Headers = Object.create(null) as Http2Headers;
  const rawHeaders: string[] = [];
  for (const { name, value } of fields) {
    const text = decoder.decode(value);
    rawHeaders.push(name, text);
    const current = headers[name];
    if (current === undefined) {
      headers[name] = name === "set-cookie" ? [text] : text;
    } else if (name === "set-cookie") {
      headers[name] = [...(Array.isArray(current) ? current : [String(current)]), text];
    } else {
      headers[name] = `${Array.isArray(current) ? current.join(", ") : current}, ${text}`;
    }
  }
  return { headers, rawHeaders };
}
