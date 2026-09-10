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
 * Adapted from Node v24.20.0 lib/url.js urlFormat, commit
 * 71b8b174857e25106d39b61a9e6f30d927da8b01 (MIT, see notice above).
 * Uses WHATWG serialization instead of Ada; deprecated string input is refused.
 */
import { invalidArgType } from "../errors.js";
import { deprecated } from "./errors.js";
import { domainToUnicode } from "./domain.js";
import { Url } from "./legacy.js";
import { URL } from "./whatwg.js";
import type { UrlFormatOptions, UrlObject } from "./types.js";

export function format(urlObject: URL, options?: UrlFormatOptions): string;
export function format(urlObject: UrlObject): string;
export function format(urlObject: string): never;
export function format(urlObject: URL | UrlObject | string, options?: UrlFormatOptions): string {
  if (typeof urlObject === "string") {
    return deprecated("url.format(string)");
  }
  if (typeof urlObject !== "object" || urlObject === null) {
    throw invalidArgType("urlObject", ["Object", "string"], urlObject);
  }
  if (
    !(urlObject instanceof URL) &&
    !(typeof globalThis.URL === "function" && urlObject instanceof globalThis.URL)
  ) {
    return Url.prototype.format.call(urlObject);
  }
  let fragment = true;
  let unicode = false;
  let search = true;
  let auth = true;
  if (options) {
    if (typeof options !== "object" || Array.isArray(options)) {
      throw invalidArgType("options", "Object", options);
    }
    if (options.fragment != null) {
      fragment = Boolean(options.fragment);
    }
    if (options.unicode != null) {
      unicode = Boolean(options.unicode);
    }
    if (options.search != null) {
      search = Boolean(options.search);
    }
    if (options.auth != null) {
      auth = Boolean(options.auth);
    }
  }
  const url = new URL(urlObject.href);
  if (!fragment) {
    url.hash = "";
  }
  if (!search) {
    url.search = "";
  }
  if (!auth) {
    url.username = "";
    url.password = "";
  }
  if (!unicode || !url.hostname) {
    return url.href;
  }
  // Only replace the serialized authority's hostname. IDNs can occur in
  // credentials, paths and queries too, and must remain encoded there.
  const authorityStart = url.protocol.length + 2;
  const userinfo =
    url.username || url.password ? `${url.username}${url.password ? `:${url.password}` : ""}@` : "";
  const hostnameStart = authorityStart + userinfo.length;
  return (
    url.href.slice(0, hostnameStart) +
    domainToUnicode(url.hostname) +
    url.href.slice(hostnameStart + url.hostname.length)
  );
}
