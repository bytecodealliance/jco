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
 * Adapted from Node v24.20.0 lib/internal/url.js urlToHttpOptions, commit
 * 71b8b174857e25106d39b61a9e6f30d927da8b01 (MIT, see LICENSE).
 * Replaces primordials/validateObject with standard operations and Jco errors.
 */
import { invalidArgType } from "../errors.js";
import type { UrlHttpOptions } from "./types.js";

export function urlToHttpOptions<T extends URL>(url: T): Omit<T, keyof URL> & UrlHttpOptions;
export function urlToHttpOptions(url: URL): UrlHttpOptions {
  if ((typeof url !== "object" || url === null) && typeof url !== "function") {
    throw invalidArgType("url", "object", url);
  }
  const { hostname, pathname, port, username, password, search } = url;
  const extra: object = url;
  const options: UrlHttpOptions & { __proto__: null } = {
    __proto__: null,
    ...extra,
    protocol: url.protocol,
    hostname: hostname && hostname[0] === "[" ? hostname.slice(1, -1) : hostname,
    hash: url.hash,
    search,
    pathname,
    path: `${pathname || ""}${search || ""}`,
    href: url.href,
  };
  if (port !== "") {
    options.port = Number(port);
  }
  if (username || password) {
    options.auth = `${decodeURIComponent(username)}:${decodeURIComponent(password)}`;
  }
  // The own enumerable extension properties were copied above.
  return options;
}
