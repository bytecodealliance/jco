import { DOMException } from "../errors.js";
import { unsupportedNodeApi } from "../errors/core.js";

/**
 * A deliberately bounded structured-value transport. A graph, rather than raw
 * JSON, preserves undefined, bigint, cycles, aliases, Map, Set and special numbers.
 * Native handles, shared memory, accessors and custom prototypes are refused.
 * No user toJSON hook runs and no transfer silently becomes a copy.
 */
type EncodedValue =
  | { type: "value"; value: string | boolean | null }
  | { type: "undefined" }
  | { type: "number" | "bigint" | "date"; value: string }
  | { type: "array"; length: number; entries: [string, number][] }
  | { type: "object"; entries: [string, number][] }
  | { type: "map"; entries: [number, number][] }
  | { type: "set"; entries: number[] }
  | { type: "buffer"; bytes: number[] }
  | { type: "regexp"; source: string; flags: string }
  | { type: "view"; name: string; buffer: number; offset: number; length: number };

const viewConstructors = {
  Int8Array,
  Uint8Array,
  Uint8ClampedArray,
  Int16Array,
  Uint16Array,
  Int32Array,
  Uint32Array,
  Float32Array,
  Float64Array,
  BigInt64Array,
  BigUint64Array,
};

function unsupported(detail: string): never {
  throw unsupportedNodeApi("worker_threads structured messages", detail);
}

function objectLike(value: unknown): value is object {
  return (typeof value === "object" && value !== null) || typeof value === "function";
}

export function createMessageCodec() {
  const uncloneable = new WeakSet<object>();
  const untransferable = new WeakSet<object>();

  function encode(value: unknown): string {
    const nodes: EncodedValue[] = [];
    const seen = new Map<object, number>();
    function visit(value: unknown): number {
      if (objectLike(value)) {
        if (uncloneable.has(value)) {
          throw new DOMException("Cannot clone object marked as uncloneable", "DataCloneError");
        }
        const previous = seen.get(value);
        if (previous !== undefined) {
          return previous;
        }
      }
      const id = nodes.length;
      nodes.push({ type: "undefined" });
      if (objectLike(value)) {
        seen.set(value, id);
      }
      if (value === undefined) {
        return id;
      }
      if (value === null || typeof value === "string" || typeof value === "boolean") {
        nodes[id] = { type: "value", value };
      } else if (typeof value === "number") {
        nodes[id] = { type: "number", value: Object.is(value, -0) ? "-0" : String(value) };
      } else if (typeof value === "bigint") {
        nodes[id] = { type: "bigint", value: String(value) };
      } else if (typeof value !== "object") {
        throw new DOMException("Value cannot be cloned", "DataCloneError");
      } else if (value instanceof Map) {
        nodes[id] = {
          type: "map",
          entries: [...Map.prototype.entries.call(value)].map(([key, item]) => [
            visit(key),
            visit(item),
          ]),
        };
      } else if (value instanceof Set) {
        nodes[id] = { type: "set", entries: [...Set.prototype.values.call(value)].map(visit) };
      } else if (value instanceof Date) {
        nodes[id] = { type: "date", value: String(Date.prototype.getTime.call(value)) };
      } else if (value instanceof RegExp) {
        nodes[id] = { type: "regexp", source: value.source, flags: value.flags };
      } else if (ArrayBuffer.isView(value)) {
        // Buffer is cloned as Uint8Array, matching Node structured cloning.
        const name =
          value instanceof DataView
            ? "DataView"
            : Object.entries(viewConstructors).find(([, ctor]) => value instanceof ctor)?.[0];
        if (!name) {
          unsupported("Unknown typed array view");
        }
        nodes[id] = {
          type: "view",
          name,
          buffer: visit(value.buffer),
          offset: value.byteOffset,
          length: value.byteLength,
        };
      } else if (value instanceof ArrayBuffer) {
        nodes[id] = { type: "buffer", bytes: [...new Uint8Array(value)] };
      } else {
        const array = Array.isArray(value);
        const prototype = Object.getPrototypeOf(value);
        if (!array && prototype !== Object.prototype && prototype !== null) {
          unsupported(
            "Only plain records, arrays, Map, Set, Date, RegExp, ArrayBuffer and typed views can cross this boundary",
          );
        }
        const entries: [string, number][] = [];
        for (const key of Object.keys(value)) {
          const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
          if (!("value" in descriptor)) {
            unsupported("Accessor properties are not supported");
          }
          entries.push([key, visit(descriptor.value)]);
        }
        nodes[id] = array
          ? { type: "array", length: value.length, entries }
          : { type: "object", entries };
      }
      return id;
    }
    visit(value);
    return JSON.stringify(nodes);
  }

  return {
    encode,
    markAsUncloneable(value: unknown): void {
      // Node's private clone flag applies to ordinary objects. Built-in value
      // serializers (including arrays) ignore it; nested ordinary objects do not.
      if (
        objectLike(value) &&
        !Array.isArray(value) &&
        !ArrayBuffer.isView(value) &&
        !(value instanceof ArrayBuffer) &&
        !(value instanceof Map) &&
        !(value instanceof Set) &&
        !(value instanceof Date) &&
        !(value instanceof RegExp)
      ) {
        uncloneable.add(value);
      }
    },
    markAsUntransferable(value: unknown): void {
      if (objectLike(value)) {
        untransferable.add(value);
      }
    },
    isMarkedAsUntransferable(value: unknown): boolean {
      return objectLike(value) && untransferable.has(value);
    },
  };
}

/** Decode only the private graph representation emitted by the paired adapter. */
export function decodeMessage(source: string): unknown {
  const nodes: EncodedValue[] = JSON.parse(source);
  const values: unknown[] = nodes.map((node) => {
    switch (node.type) {
      case "value":
        return node.value;
      case "undefined":
        return undefined;
      case "number":
        return Number(node.value);
      case "bigint":
        return BigInt(node.value);
      case "date":
        return new Date(Number(node.value));
      case "array":
        return new Array(node.length);
      case "object":
        return {};
      case "map":
        return new Map<unknown, unknown>();
      case "set":
        return new Set<unknown>();
      case "buffer":
        return Uint8Array.from(node.bytes).buffer;
      case "regexp":
        return new RegExp(node.source, node.flags);
      case "view":
        return undefined;
    }
  });
  // Buffers must exist before constructing views; object references are filled last.
  nodes.forEach((node, index) => {
    if (node.type !== "view") {
      return;
    }
    const buffer = values[node.buffer] as ArrayBuffer;
    if (node.name === "DataView") {
      values[index] = new DataView(buffer, node.offset, node.length);
    } else {
      const ctor = viewConstructors[node.name as keyof typeof viewConstructors];
      values[index] = new ctor(buffer, node.offset, node.length / ctor.BYTES_PER_ELEMENT);
    }
  });
  nodes.forEach((node, index) => {
    const target = values[index];
    if (node.type === "object" || node.type === "array") {
      for (const [key, reference] of node.entries) {
        Object.defineProperty(target, key, {
          value: values[reference],
          enumerable: true,
          configurable: true,
          writable: true,
        });
      }
    } else if (node.type === "map") {
      for (const [key, value] of node.entries) {
        (target as Map<unknown, unknown>).set(values[key], values[value]);
      }
    } else if (node.type === "set") {
      for (const value of node.entries) {
        (target as Set<unknown>).add(values[value]);
      }
    }
  });
  return values[0];
}
