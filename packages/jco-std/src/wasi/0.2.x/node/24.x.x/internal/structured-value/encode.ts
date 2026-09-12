import { Buffer } from "node:buffer";
import { DOMException } from "../../errors.js";
import { unsupportedNodeApi } from "../../errors/core.js";
import { objectLike, viewConstructors } from "./types.js";
import type { CodecOptions, EncodedValue } from "./types.js";

type Visit = (value: unknown) => number;

type Unsupported = (detail: string) => never;

/** Reuse the worker transport, adding persistent IDs only for native V8 sessions. */
export function createEncoder(
  options: CodecOptions,
  uncloneable: WeakSet<object>,
): (value: unknown) => string {
  let nodes: EncodedValue[] = [];
  let seen = new Map<object, number>();

  const unsupported: Unsupported = (detail) => {
    throw unsupportedNodeApi(options.api ?? "worker_threads structured messages", detail);
  };

  return function encode(value: unknown): string {
    if (!options.persistent) {
      nodes = [];
      seen = new Map<object, number>();
    }

    const checkpoint = nodes.length;
    const added: object[] = [];

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

      // Register before walking children, so aliases and cycles resolve to this node.
      nodes.push({ type: "undefined" });

      if (objectLike(value)) {
        seen.set(value, id);
        added.push(value);
      }

      nodes[id] = encodeValue(value, visit, options, unsupported);

      return id;
    }

    try {
      const root = visit(value);

      return JSON.stringify(options.persistent ? { root, nodes } : nodes);
    } catch (error) {
      // Failed writes must not leave dangling IDs in the next session message.
      nodes.length = checkpoint;

      for (const object of added) {
        seen.delete(object);
      }

      throw error;
    } finally {
      if (!options.persistent) {
        // Worker messages must not retain their last graph between sends.
        nodes = [];
        seen.clear();
      }
    }
  };
}

function encodeValue(
  value: unknown,
  visit: Visit,
  options: CodecOptions,
  unsupported: Unsupported,
): EncodedValue {
  if (value === undefined) {
    return { type: "undefined" };
  }

  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return { type: "value", value };
  }

  if (typeof value === "number") {
    return { type: "number", value: Object.is(value, -0) ? "-0" : String(value) };
  }

  if (typeof value === "bigint") {
    return { type: "bigint", value: String(value) };
  }

  if (typeof value !== "object") {
    throw (
      options.cloneError?.("Value cannot be cloned") ??
      new DOMException("Value cannot be cloned", "DataCloneError")
    );
  }

  return encodeObject(value, visit, options, unsupported);
}

function encodeObject(
  value: object,
  visit: Visit,
  options: CodecOptions,
  unsupported: Unsupported,
): EncodedValue {
  if (value instanceof Map) {
    return {
      type: "map",
      entries: [...Map.prototype.entries.call(value)].map(([key, item]) => [
        visit(key),
        visit(item),
      ]),
    };
  }

  if (value instanceof Set) {
    return { type: "set", entries: [...Set.prototype.values.call(value)].map(visit) };
  }

  if (value instanceof Date) {
    return { type: "date", value: String(Date.prototype.getTime.call(value)) };
  }

  if (value instanceof RegExp) {
    return { type: "regexp", source: value.source, flags: value.flags };
  }

  if (options.preserveBuffers && Buffer.isBuffer(value)) {
    // Native V8's default serializer copies only a Buffer's visible bytes.
    return { type: "node-buffer", bytes: [...value] };
  }

  if (ArrayBuffer.isView(value)) {
    return encodeView(value, visit, unsupported);
  }

  if (value instanceof ArrayBuffer) {
    return { type: "buffer", bytes: [...new Uint8Array(value)] };
  }

  return encodeRecord(value, visit, unsupported);
}

function encodeView(value: ArrayBufferView, visit: Visit, unsupported: Unsupported): EncodedValue {
  // Worker messages clone Buffer as Uint8Array; V8 opts into the separate branch above.
  const name =
    value instanceof DataView
      ? "DataView"
      : Object.entries(viewConstructors).find(([, ctor]) => value instanceof ctor)?.[0];

  if (!name) {
    return unsupported("Unknown typed array view");
  }

  return {
    type: "view",
    name,
    buffer: visit(value.buffer),
    offset: value.byteOffset,
    length: value.byteLength,
  };
}

function encodeRecord(value: object, visit: Visit, unsupported: Unsupported): EncodedValue {
  const array = Array.isArray(value);
  const prototype = Object.getPrototypeOf(value);

  if (!array && prototype !== Object.prototype && prototype !== null) {
    return unsupported(
      "Only plain records, arrays, Map, Set, Date, RegExp, ArrayBuffer and typed views can cross this boundary",
    );
  }

  const entries: [string, number][] = [];

  for (const key of Object.keys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;

    if (!("value" in descriptor)) {
      return unsupported("Accessor properties are not supported");
    }

    entries.push([key, visit(descriptor.value)]);
  }

  return array ? { type: "array", length: value.length, entries } : { type: "object", entries };
}
