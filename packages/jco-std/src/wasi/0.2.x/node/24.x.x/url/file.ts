// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

/**
 * Adapted from Node v24.20.0 lib/internal/url.js and lib/internal/data_url.js,
 * commit 71b8b174857e25106d39b61a9e6f30d927da8b01 (MIT, see LICENSE).
 * Retains path validation and byte-decoding order; uses the portable URL core,
 * shared node:buffer and an injected path implementation instead of internals.
 * The default platform is POSIX, as for Jco's node:path.
 */
import { Buffer } from "node:buffer";
import { codedError, invalidArgType } from "../errors.js";
import type { PathModule } from "../path.js";
import type { FileUrlOptions, UrlPathBuffer } from "./types.js";
import { inspect } from "../assert/inspect.js";
import { invalidURL } from "./errors.js";
import { domainToASCII, domainToUnicode } from "./domain.js";
import { URL } from "./whatwg.js";

// Node intentionally accepts other WHATWG implementations (e.g. Electron).
function isURL(value: unknown): value is URL {
  if (!value || (typeof value !== "object" && typeof value !== "function")) {
    return false;
  }
  const candidate = value as URL & { auth?: unknown; path?: unknown };
  return Boolean(
    candidate.href &&
    candidate.protocol &&
    candidate.auth === undefined &&
    candidate.path === undefined,
  );
}
function asFileURL(input: string | URL): URL {
  const url = typeof input === "string" ? new URL(input) : input;
  if (!isURL(url)) {
    throw invalidArgType("path", ["string", "URL"], url);
  }
  if (url.protocol !== "file:") {
    throw codedError(new TypeError("The URL must be of scheme file"), "ERR_INVALID_URL_SCHEME");
  }
  return url;
}
function invalidPath(message: string, url: URL): never {
  throw Object.assign(
    codedError(new TypeError(`File URL path ${message}`), "ERR_INVALID_FILE_URL_PATH"),
    { input: url },
  );
}
function checkPosixHost(url: URL): void {
  if (url.hostname !== "") {
    throw codedError(
      new TypeError('File URL host must be "localhost" or empty on posix'),
      "ERR_INVALID_FILE_URL_HOST",
    );
  }
}

export function fileURLToPath(input: string | URL, options?: FileUrlOptions): string {
  const windows = options?.windows;
  const url = asFileURL(input);
  if (!windows) {
    checkPosixHost(url);
  }
  let pathname = url.pathname;
  for (let n = 0; n < pathname.length; n++) {
    if (pathname[n] !== "%") {
      continue;
    }
    const third = pathname.charCodeAt(n + 2) | 0x20;
    if (
      (pathname[n + 1] === "2" && third === 102) ||
      (windows && pathname[n + 1] === "5" && third === 99)
    ) {
      invalidPath(
        windows
          ? "must not include encoded \\ or / characters"
          : "must not include encoded / characters",
        url,
      );
    }
  }
  if (windows) {
    pathname = pathname.replace(/\//g, "\\");
  }
  if (pathname.includes("%")) {
    try {
      pathname = decodeURIComponent(pathname);
    } catch (error) {
      // Match Node's public V8 message across QuickJS and SpiderMonkey.
      if (error instanceof URIError) {
        throw new URIError("URI malformed");
      }
      throw error;
    }
  }
  if (!windows) {
    return pathname;
  }
  if (url.hostname !== "") {
    return `\\\\${domainToUnicode(url.hostname)}${pathname}`;
  }
  const letter = pathname.charCodeAt(1) | 0x20;
  if (letter < 97 || letter > 122 || pathname[2] !== ":") {
    invalidPath("must be absolute", url);
  }
  return pathname.slice(1);
}

/** Node's percentDecode: malformed escapes pass through, non-UTF8 bytes survive. */
function percentDecode(input: Uint8Array): Uint8Array {
  const output = new Uint8Array(input.length);
  let index = 0;
  for (let i = 0; i < input.length; i++) {
    const pair = String.fromCharCode(input[i + 1], input[i + 2]);
    if (input[i] === 37 && /^[\da-f]{2}$/i.test(pair)) {
      output[index++] = Number.parseInt(pair, 16);
      i += 2;
    } else {
      output[index++] = input[i];
    }
  }
  return output.subarray(0, index);
}
export function fileURLToPathBuffer(input: string | URL, options?: FileUrlOptions): UrlPathBuffer {
  const windows = options?.windows;
  const url = asFileURL(input);
  if (!windows) {
    checkPosixHost(url);
  }
  const pathname = windows ? url.pathname.replace(/\//g, "\\") : url.pathname;
  const decoded = Buffer.from(percentDecode(Buffer.from(pathname, "utf8")));
  if (!windows) {
    return decoded;
  }
  if (url.hostname !== "") {
    return Buffer.concat([Buffer.from(`\\\\${domainToUnicode(url.hostname)}`, "utf8"), decoded]);
  }
  const letter = decoded[1] | 0x20;
  if (letter < 97 || letter > 122 || decoded[2] !== 58) {
    invalidPath("must be absolute", url);
  }
  return decoded.subarray(1);
}

// Replaces Node24's native Ada path constructor. Percent, separators, query,
// hash and stripped ASCII whitespace must be escaped before WHATWG parsing.
function encodePath(path: string, windows: boolean): string {
  return path.replace(/[%\\?#|\t\n\r]/g, (character) => {
    if (character === "\\" && windows) {
      return "/";
    }
    return `%${character.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`;
  });
}
function invalidUncPath(path: string, reason: string): TypeError {
  return codedError(
    new TypeError(`The argument 'path' ${reason}. Received ${inspect(path)}`),
    "ERR_INVALID_ARG_VALUE",
  );
}
export function createPathToFileURL(
  path: PathModule,
): (filepath: string, options?: FileUrlOptions) => URL {
  return function pathToFileURL(filepath: string, options?: FileUrlOptions): URL {
    if (typeof filepath !== "string") {
      throw invalidArgType("path", "string", filepath);
    }
    const windows = options?.windows ?? false;
    const isUNC = windows && filepath.startsWith("\\\\");
    let resolved = isUNC
      ? filepath
      : windows
        ? path.win32.resolve(filepath)
        : path.posix.resolve(filepath);
    if (isUNC || (windows && resolved.startsWith("\\\\"))) {
      const prefixLength = resolved.startsWith("\\\\?\\UNC\\") ? 8 : 2;
      const hostnameEndIndex = resolved.indexOf("\\", prefixLength);
      if (hostnameEndIndex === -1) {
        throw invalidUncPath(resolved, "Missing UNC resource path");
      }
      if (hostnameEndIndex === 2) {
        throw invalidUncPath(resolved, "Empty UNC servername");
      }
      const hostname = resolved.slice(prefixLength, hostnameEndIndex);
      // Node's native path constructor parses the hostname separately, so
      // #, ? and / terminate the hostname without consuming the resource path.
      const asciiHostname = domainToASCII(hostname);
      if (!asciiHostname) {
        throw invalidURL(resolved.slice(hostnameEndIndex), hostname);
      }
      const url = new URL(`file://${asciiHostname}/`);
      url.pathname = encodePath(resolved.slice(hostnameEndIndex), true);
      return url;
    }
    const last = filepath.charCodeAt(filepath.length - 1);
    if ((last === 47 || (windows && last === 92)) && resolved.at(-1) !== path.sep) {
      resolved += "/";
    }
    const url = new URL("file:///");
    url.pathname = encodePath(resolved, windows);
    return url;
  };
}
