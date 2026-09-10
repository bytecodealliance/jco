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
 * WHATWG core: whatwg-url@14.2.0 (jsdom, MIT), with Node 24 constructor
 * coercion, error fields and static methods. Native web classes can lack
 * newer operations, so guests use this coherent URL/URLSearchParams pair.
 * Native Blob registries have no corresponding node:buffer registry in Jco.
 */
import { URL as WhatwgURL, URLSearchParams } from "whatwg-url";
import { URLPattern as CoreURLPattern } from "urlpattern-polyfill/urlpattern";
import { invalidThis, missingArgs } from "../errors.js";
import { invalidURL, unsupported } from "./errors.js";

import type { UrlPatternConstructor } from "./types.js";
export { URLSearchParams };
// 10.1.0 implements ignoreCase and hasRegExpGroups but its bundled declarations
// omit them. The guest tests cover these Node24 overloads and properties.
export const URLPattern = CoreURLPattern as unknown as UrlPatternConstructor;

// Adapted from Node v24.20.0 lib/internal/url.js: coerce outside the parse
// failure handler, so exceptions thrown by user coercion are never swallowed.
function parse(input: string | URL, base?: string | URL): URL | null {
  if (arguments.length === 0) {
    throw missingArgs("url");
  }
  const text = `${input}`;
  const baseText = base === undefined ? undefined : `${base}`;
  try {
    return new URL(text, baseText);
  } catch {
    return null;
  }
}
function canParse(input: string | URL, base?: string | URL): boolean {
  if (arguments.length === 0) {
    throw missingArgs("url");
  }
  return parse(input, base) !== null;
}

// A proxy preserves the WHATWG core's prototype and therefore the identity of
// URL.searchParams, iterator instances and subclasses. Only Node boundaries
// differ from the WebIDL wrappers supplied by the portable dependency.
const instances = new WeakSet<object>();

export const URL: typeof globalThis.URL = new Proxy(WhatwgURL, {
  construct(target, args: unknown[], newTarget) {
    if (args.length === 0) {
      throw missingArgs("url");
    }
    const input = `${args[0]}`;
    const base = args[1] === undefined ? undefined : `${args[1]}`;
    try {
      const instance: URL = Reflect.construct(target, [input, base], newTarget);
      instances.add(instance);
      return instance;
    } catch (error) {
      if (error instanceof TypeError && /^Invalid (base )?URL:/.test(error.message)) {
        throw invalidURL(input, base);
      }
      throw error;
    }
  },
});
function createObjectURL(_blob: Blob): never {
  return unsupported("URL.createObjectURL");
}
function revokeObjectURL(_id: string): never {
  return unsupported("URL.revokeObjectURL");
}
Object.defineProperty(WhatwgURL.prototype, "constructor", {
  value: URL,
  writable: true,
  configurable: true,
});
for (const [name, value] of Object.entries({ parse, canParse, createObjectURL, revokeObjectURL })) {
  Object.defineProperty(WhatwgURL, name, {
    value,
    writable: true,
    configurable: true,
    enumerable: true,
  });
}
function checkReceiver(receiver: object): void {
  if (!instances.has(receiver)) {
    throw invalidThis("URL");
  }
}
for (const name of [
  "href",
  "origin",
  "protocol",
  "username",
  "password",
  "host",
  "hostname",
  "port",
  "pathname",
  "search",
  "searchParams",
  "hash",
] as const) {
  const descriptor = Object.getOwnPropertyDescriptor(WhatwgURL.prototype, name)!;
  const get = function (this: URL): unknown {
    checkReceiver(this);
    return descriptor.get!.call(this);
  };
  Object.defineProperty(get, "name", { value: descriptor.get!.name });
  let set: ((this: URL, value: unknown) => void) | undefined;
  if (descriptor.set) {
    set = function (this: URL, value: unknown): void {
      checkReceiver(this);
      const input = `${value}`;
      try {
        descriptor.set!.call(this, input);
      } catch (error) {
        if (name === "href") {
          throw invalidURL(input);
        }
        throw error;
      }
    };
    Object.defineProperty(set, "name", { value: descriptor.set.name });
  }
  Object.defineProperty(WhatwgURL.prototype, name, { ...descriptor, get, set });
}
for (const name of ["toString", "toJSON"] as const) {
  const descriptor = Object.getOwnPropertyDescriptor(WhatwgURL.prototype, name)!;
  const method = function (this: URL): string {
    checkReceiver(this);
    return descriptor.value.call(this);
  };
  Object.defineProperty(method, "name", { value: name });
  Object.defineProperty(WhatwgURL.prototype, name, { ...descriptor, value: method });
}
