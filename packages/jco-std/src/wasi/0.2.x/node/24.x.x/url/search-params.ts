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
 * Node24 constructor/validation adaptation for whatwg-url's shared parameter
 * list. Node v24.20.0 lib/internal/url.js, commit
 * 71b8b174857e25106d39b61a9e6f30d927da8b01; MIT notice below.
 */
import { codedError, invalidArgType, invalidThis, missingArgs } from "../errors.js";

type ParametersConstructor = typeof globalThis.URLSearchParams;
function tupleError(): never {
  throw codedError(
    new TypeError("Each query pair must be an iterable [name, value] tuple"),
    "ERR_INVALID_TUPLE",
  );
}
function wellFormed(value: unknown): string {
  // Core WebIDL wrappers apply USVString conversion too. Normalize record keys
  // here so two ill-formed keys that become equal retain the later value.
  const text = `${value}`;
  return text.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]|[\uD800-\uDFFF]/g, (part) =>
    part.length === 2 ? part : "\ufffd",
  );
}

function normalizeInitializer(input: unknown): string | string[][] | undefined {
  if (input === undefined) {
    return undefined;
  }
  if (input === null || (typeof input !== "object" && typeof input !== "function")) {
    return wellFormed(input);
  }
  const record = input as Record<PropertyKey, unknown>;
  const method = record[Symbol.iterator];
  const pairs: string[][] = [];
  if (method != null) {
    if (typeof method !== "function") {
      throw codedError(new TypeError("Query pairs must be iterable"), "ERR_ARG_NOT_ITERABLE");
    }
    // Node's for-of reads Symbol.iterator a second time after the
    // validation probe, which matters for accessors with observable behavior.
    for (const pair of input as Iterable<unknown>) {
      if (pair == null) {
        tupleError();
      }
      if (Array.isArray(pair)) {
        if (pair.length !== 2) {
          tupleError();
        }
        pairs.push([wellFormed(pair[0]), wellFormed(pair[1])]);
      } else {
        if (
          (typeof pair !== "object" && typeof pair !== "function") ||
          typeof (pair as Record<PropertyKey, unknown>)[Symbol.iterator] !== "function"
        ) {
          tupleError();
        }
        const converted: string[] = [];
        for (const element of pair as Iterable<unknown>) {
          converted.push(wellFormed(element));
        }
        if (converted.length !== 2) {
          tupleError();
        }
        pairs.push(converted);
      }
    }
  } else {
    const visited = new Map<string, number>();
    for (const key of Reflect.ownKeys(input)) {
      const descriptor = Object.getOwnPropertyDescriptor(input, key);
      if (!descriptor?.enumerable) {
        continue;
      }
      const name = wellFormed(key);
      const value = wellFormed(record[key]);
      const index = visited.get(name);
      if (index !== undefined) {
        pairs[index][1] = value;
      } else {
        visited.set(name, pairs.length);
        pairs.push([name, value]);
      }
    }
  }
  return pairs;
}

/** Keep URL.searchParams and standalone instances on the same core prototype. */
export function adaptSearchParams(Core: ParametersConstructor): ParametersConstructor {
  const size = Object.getOwnPropertyDescriptor(Core.prototype, "size")!;
  function checkReceiver(receiver: unknown): void {
    try {
      size.get!.call(receiver);
    } catch {
      throw invalidThis("URLSearchParams");
    }
  }
  for (const name of [
    "append",
    "delete",
    "get",
    "getAll",
    "has",
    "set",
    "sort",
    "toString",
    "keys",
    "values",
    "entries",
    "forEach",
  ] as const) {
    const descriptor = Object.getOwnPropertyDescriptor(Core.prototype, name)!;
    const original: (this: unknown, ...args: unknown[]) => unknown = descriptor.value;
    const method = function (this: unknown, ...args: unknown[]): unknown {
      checkReceiver(this);
      if (name === "append" || name === "set") {
        if (args.length < 2) {
          throw missingArgs("name", "value");
        }
        args = [wellFormed(args[0]), wellFormed(args[1])];
      } else if (["delete", "get", "getAll", "has"].includes(name)) {
        if (args.length === 0) {
          throw missingArgs("name");
        }
        args = [
          wellFormed(args[0]),
          ...(args[1] !== undefined && (name === "delete" || name === "has")
            ? [wellFormed(args[1])]
            : []),
        ];
      } else if (name === "forEach" && typeof args[0] !== "function") {
        throw invalidArgType("callback", "function", args[0]);
      }
      return Reflect.apply(original, this, args);
    };
    Object.defineProperties(method, { name: { value: name }, length: { value: original.length } });
    Object.defineProperty(Core.prototype, name, { ...descriptor, value: method });
  }
  Object.defineProperty(Core.prototype, Symbol.iterator, {
    value: Core.prototype.entries,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(Core.prototype, "size", {
    ...size,
    get(this: unknown): number {
      checkReceiver(this);
      return size.get!.call(this);
    },
  });
  const Constructor = new Proxy(Core, {
    construct(target, args: unknown[], newTarget) {
      return Reflect.construct(target, [normalizeInitializer(args[0])], newTarget);
    },
  });
  Object.defineProperty(Core.prototype, "constructor", {
    value: Constructor,
    writable: true,
    configurable: true,
  });
  return Constructor;
}
