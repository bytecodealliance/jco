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
 * Adapted from Node v24.20.0 lib/url.js, commit
 * 71b8b174857e25106d39b61a9e6f30d927da8b01 (MIT, see notice above).
 * Preserves legacy object construction, formatting and object resolution.
 * Deprecated string parsing/resolution throw before touching arguments.
 * Primordials use standard methods; query encoding uses audited node:querystring.
 */
import { escape, stringify } from "node:querystring";
import type { LegacyUrl, LegacyUrlConstructor, UrlObject } from "./types.js";
import { deprecated } from "./errors.js";

const slashedProtocol = new Set<string | null | undefined>([
  "http",
  "http:",
  "https",
  "https:",
  "ftp",
  "ftp:",
  "gopher",
  "gopher:",
  "file",
  "file:",
  "ws",
  "ws:",
  "wss",
  "wss:",
]);
const hostlessProtocol = new Set<string | null | undefined>(["javascript", "javascript:"]);
const CHAR_HASH = 35;
const CHAR_QUESTION_MARK = 63;
const CHAR_FORWARD_SLASH = 47;
const StringPrototypeCharCodeAt = (s: string, i: number): number => s.charCodeAt(i);
const StringPrototypeIndexOf = (s: string, v: string): number => s.indexOf(v);
const StringPrototypeSlice = (s: string, start: number, end?: number): string =>
  s.slice(start, end);
const StringPrototypeReplaceAll = (s: string, a: string, b: string): string => s.replaceAll(a, b);
const StringPrototypeAt = (s: string, i: number): string | undefined => s.at(i);
const ArrayPrototypeJoin = (a: string[], sep: string): string => a.join(sep);
const ObjectAssign = Object.assign;
const spliceOne = (a: string[], i: number): void => {
  a.splice(i, 1);
};
function isIpv6Hostname(hostname: string): boolean {
  return hostname[0] === "[" && hostname.at(-1) === "]";
}

const LegacyUrlFunction = function Url(this: LegacyUrl): void {
  this.protocol = null;
  this.slashes = null;
  this.auth = null;
  this.host = null;
  this.port = null;
  this.hostname = null;
  this.hash = null;
  this.search = null;
  this.query = null;
  this.pathname = null;
  this.path = null;
  this.href = null;
};

// Preserve the public name when a bundler renames this function expression.
Object.defineProperty(LegacyUrlFunction, "name", { value: "Url", configurable: true });
export const Url = LegacyUrlFunction as unknown as LegacyUrlConstructor;
Url.prototype.format = function format(this: UrlObject): string {
  let auth = this.auth || "";
  if (auth) {
    auth = escape(auth).replaceAll("%3A", ":");
    auth += "@";
  }

  let protocol = this.protocol || "";
  if (protocol && StringPrototypeCharCodeAt(protocol, protocol.length - 1) !== 58 /* : */) {
    protocol += ":";
  }

  let pathname = this.pathname || "";
  let hash = this.hash || "";
  let host = "";
  let query = "";

  if (this.host) {
    host = auth + this.host;
  } else if (this.hostname) {
    host =
      auth +
      (StringPrototypeIndexOf(this.hostname, ":") !== -1 && !isIpv6Hostname(this.hostname)
        ? "[" + this.hostname + "]"
        : this.hostname);
    if (this.port) {
      host += ":" + this.port;
    }
  }

  if (this.query !== null && typeof this.query === "object") {
    query = stringify(this.query);
  }
  let search = this.search || (query && "?" + query) || "";

  if (
    StringPrototypeIndexOf(pathname, "#") !== -1 ||
    StringPrototypeIndexOf(pathname, "?") !== -1
  ) {
    let newPathname = "";
    let lastPos = 0;
    const len = pathname.length;
    for (let i = 0; i < len; i++) {
      const code = StringPrototypeCharCodeAt(pathname, i);
      if (code === CHAR_HASH || code === CHAR_QUESTION_MARK) {
        if (i > lastPos) {
          newPathname += StringPrototypeSlice(pathname, lastPos, i);
        }
        newPathname += code === CHAR_HASH ? "%23" : "%3F";
        lastPos = i + 1;
      }
    }
    if (lastPos < len) {
      newPathname += StringPrototypeSlice(pathname, lastPos);
    }
    pathname = newPathname;
  }

  // Only the slashedProtocols get the //.  Not mailto:, xmpp:, etc.
  // unless they had them to begin with.
  if (this.slashes || slashedProtocol.has(protocol)) {
    if (this.slashes || host) {
      if (pathname && StringPrototypeCharCodeAt(pathname, 0) !== CHAR_FORWARD_SLASH) {
        pathname = "/" + pathname;
      }
      host = "//" + host;
    } else if (
      protocol.length >= 4 &&
      StringPrototypeCharCodeAt(protocol, 0) === 102 /* f */ &&
      StringPrototypeCharCodeAt(protocol, 1) === 105 /* i */ &&
      StringPrototypeCharCodeAt(protocol, 2) === 108 /* l */ &&
      StringPrototypeCharCodeAt(protocol, 3) === 101 /* e */
    ) {
      host = "//";
    }
  }

  // Escape '#' in search.
  if (StringPrototypeIndexOf(search, "#") !== -1) {
    search = StringPrototypeReplaceAll(search, "#", "%23");
  }

  if (hash && StringPrototypeCharCodeAt(hash, 0) !== CHAR_HASH) {
    hash = "#" + hash;
  }
  if (search && StringPrototypeCharCodeAt(search, 0) !== CHAR_QUESTION_MARK) {
    search = "?" + search;
  }

  return protocol + host + pathname + search + hash;
};

Url.prototype.resolveObject = function resolveObject(
  this: LegacyUrl,
  relative: string | UrlObject,
): LegacyUrl {
  if (typeof relative === "string") {
    return deprecated("Url.prototype.resolveObject(string)");
  }

  const result = new Url();
  ObjectAssign(result, this);

  // Hash is always overridden, no matter what.
  // even href="" will remove it.
  result.hash = relative.hash;

  // If the relative url is empty, then there's nothing left to do here.
  if (relative.href === "") {
    result.href = result.format();
    return result;
  }

  // Hrefs like //foo/bar always cut to the protocol.
  if (relative.slashes && !relative.protocol) {
    // Take everything except the protocol from relative
    const relativeWithoutProtocol = { ...relative };
    delete relativeWithoutProtocol.protocol;
    ObjectAssign(result, relativeWithoutProtocol);

    // urlParse appends trailing / to urls like http://www.example.com
    if (slashedProtocol.has(result.protocol) && result.hostname && !result.pathname) {
      result.path = result.pathname = "/";
    }

    result.href = result.format();
    return result;
  }

  if (relative.protocol && relative.protocol !== result.protocol) {
    // If it's a known url protocol, then changing
    // the protocol does weird things
    // first, if it's not file:, then we MUST have a host,
    // and if there was a path
    // to begin with, then we MUST have a path.
    // if it is file:, then the host is dropped,
    // because that's known to be hostless.
    // anything else is assumed to be absolute.
    if (!slashedProtocol.has(relative.protocol)) {
      ObjectAssign(result, relative);
      result.href = result.format();
      return result;
    }

    result.protocol = relative.protocol;
    if (
      !relative.host &&
      !/^file:?$/.test(relative.protocol) &&
      !hostlessProtocol.has(relative.protocol)
    ) {
      const relPath = (relative.pathname || "").split("/");
      while (relPath.length && !(relative.host = relPath.shift())) {}
      relative.host ||= "";
      relative.hostname ||= "";
      if (relPath[0] !== "") {
        relPath.unshift("");
      }
      if (relPath.length < 2) {
        relPath.unshift("");
      }
      result.pathname = relPath.join("/");
    } else {
      result.pathname = relative.pathname;
    }
    result.search = relative.search;
    result.query = relative.query;
    result.host = relative.host || "";
    result.auth = relative.auth;
    result.hostname = relative.hostname || relative.host;
    result.port = relative.port;
    // To support http.request
    if (result.pathname || result.search) {
      const p = result.pathname || "";
      const s = result.search || "";
      result.path = p + s;
    }
    result.slashes ||= relative.slashes;
    result.href = result.format();
    return result;
  }

  const isSourceAbs = result.pathname && result.pathname.charAt(0) === "/";
  const isRelAbs = relative.host || (relative.pathname && relative.pathname.charAt(0) === "/");
  let mustEndAbs: boolean | string | number | null | undefined =
    isRelAbs || isSourceAbs || (result.host && relative.pathname);
  const removeAllDots = mustEndAbs;
  let srcPath = (result.pathname && result.pathname.split("/")) || [];
  const relPath = (relative.pathname && relative.pathname.split("/")) || [];
  const noLeadingSlashes = result.protocol && !slashedProtocol.has(result.protocol);

  // If the url is a non-slashed url, then relative
  // links like ../.. should be able
  // to crawl up to the hostname, as well.  This is strange.
  // result.protocol has already been set by now.
  // Later on, put the first path part into the host field.
  if (noLeadingSlashes) {
    result.hostname = "";
    result.port = null;
    if (result.host) {
      if (srcPath[0] === "") {
        srcPath[0] = result.host;
      } else {
        srcPath.unshift(result.host);
      }
    }
    result.host = "";
    if (relative.protocol) {
      relative.hostname = null;
      relative.port = null;
      result.auth = null;
      if (relative.host) {
        if (relPath[0] === "") {
          relPath[0] = relative.host;
        } else {
          relPath.unshift(relative.host);
        }
      }
      relative.host = null;
    }
    mustEndAbs &&= relPath[0] === "" || srcPath[0] === "";
  }

  if (isRelAbs) {
    // it's absolute.
    if (relative.host || relative.host === "") {
      if (result.host !== relative.host) {
        result.auth = null;
      }
      result.host = relative.host;
      result.port = relative.port;
    }
    if (relative.hostname || relative.hostname === "") {
      if (result.hostname !== relative.hostname) {
        result.auth = null;
      }
      result.hostname = relative.hostname;
    }
    result.search = relative.search;
    result.query = relative.query;
    srcPath = relPath;
    // Fall through to the dot-handling below.
  } else if (relPath.length) {
    // it's relative
    // throw away the existing file, and take the new path instead.
    srcPath ||= [];
    srcPath.pop();
    srcPath = srcPath.concat(relPath);
    result.search = relative.search;
    result.query = relative.query;
  } else if (relative.search !== null && relative.search !== undefined) {
    // Just pull out the search.
    // like href='?foo'.
    // Put this after the other two cases because it simplifies the booleans
    if (noLeadingSlashes) {
      result.hostname = result.host = srcPath.shift();
      // Occasionally the auth can get stuck only in host.
      // This especially happens in cases like
      // url.resolveObject('mailto:local1@domain1', 'local2@domain2')
      const authInHost = result.host && result.host.indexOf("@") > 0 && result.host.split("@");
      if (authInHost) {
        result.auth = authInHost.shift();
        result.host = result.hostname = authInHost.shift();
      }
    }
    result.search = relative.search;
    result.query = relative.query;
    // To support http.request
    if (result.pathname !== null || result.search !== null) {
      result.path = (result.pathname ? result.pathname : "") + (result.search ? result.search : "");
    }
    result.href = result.format();
    return result;
  }

  if (!srcPath.length) {
    // No path at all. All other things were already handled above.
    result.pathname = null;
    // To support http.request
    if (result.search) {
      result.path = "/" + result.search;
    } else {
      result.path = null;
    }
    result.href = result.format();
    return result;
  }

  // If a url ENDs in . or .., then it must get a trailing slash.
  // however, if it ends in anything else non-slashy,
  // then it must NOT get a trailing slash.
  let last = srcPath[srcPath.length - 1];
  const hasTrailingSlash =
    ((result.host || relative.host || srcPath.length > 1) && (last === "." || last === "..")) ||
    last === "";

  // Strip single dots, resolve double dots to parent dir
  // if the path tries to go above the root, `up` ends up > 0
  let up = 0;
  for (let i = srcPath.length - 1; i >= 0; i--) {
    last = srcPath[i];
    if (last === ".") {
      spliceOne(srcPath, i);
    } else if (last === "..") {
      spliceOne(srcPath, i);
      up++;
    } else if (up) {
      spliceOne(srcPath, i);
      up--;
    }
  }

  // If the path is allowed to go above the root, restore leading ..s
  if (!mustEndAbs && !removeAllDots) {
    while (up--) {
      srcPath.unshift("..");
    }
  }

  if (mustEndAbs && srcPath[0] !== "" && (!srcPath[0] || srcPath[0].charAt(0) !== "/")) {
    srcPath.unshift("");
  }

  if (hasTrailingSlash && StringPrototypeAt(ArrayPrototypeJoin(srcPath, "/"), -1) !== "/") {
    srcPath.push("");
  }

  const isAbsolute = srcPath[0] === "" || (srcPath[0] && srcPath[0].charAt(0) === "/");

  // put the host back
  if (noLeadingSlashes) {
    result.hostname = result.host = isAbsolute ? "" : srcPath.length ? srcPath.shift() : "";
    // Occasionally the auth can get stuck only in host.
    // This especially happens in cases like
    // url.resolveObject('mailto:local1@domain1', 'local2@domain2')
    const authInHost = result.host && result.host.indexOf("@") > 0 ? result.host.split("@") : false;
    if (authInHost) {
      result.auth = authInHost.shift();
      result.host = result.hostname = authInHost.shift();
    }
  }

  mustEndAbs ||= result.host && srcPath.length;

  if (mustEndAbs && !isAbsolute) {
    srcPath.unshift("");
  }

  if (!srcPath.length) {
    result.pathname = null;
    result.path = null;
  } else {
    result.pathname = srcPath.join("/");
  }

  // To support request.http
  if (result.pathname !== null || result.search !== null) {
    result.path = (result.pathname ? result.pathname : "") + (result.search ? result.search : "");
  }
  result.auth = relative.auth || result.auth;
  result.slashes ||= relative.slashes;
  result.href = result.format();
  return result;
};

Url.prototype.parseHost = function parseHost(this: LegacyUrl): void {
  let host = this.host;
  const match = /:[0-9]*$/.exec(`${host}`);
  if (match && host) {
    const port = match[0];
    if (port !== ":") {
      this.port = port.slice(1);
    }
    host = host.slice(0, host.length - port.length);
  }
  if (host) {
    this.hostname = host;
  }
};

export function parse(
  _url: string,
  _parseQueryString?: boolean,
  _slashesDenoteHost?: boolean,
): never {
  return deprecated("url.parse()");
}
export function resolve(_from: string, _to: string): never {
  return deprecated("url.resolve()");
}
export function resolveObject(_from: string | UrlObject, _to: string | UrlObject): never {
  return deprecated("url.resolveObject()");
}
Url.prototype.parse = parse;
Url.prototype.resolve = function resolve(_relative: string): never {
  return deprecated("Url.prototype.resolve()");
};
