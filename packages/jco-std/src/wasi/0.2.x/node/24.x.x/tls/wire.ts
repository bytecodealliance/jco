import { Buffer } from "node:buffer";

/** Graph payloads preserve binary certificate fields, errors, and self-signed issuer cycles. */
type Node =
  | { kind: "bytes"; data: number[] }
  | { kind: "array"; data: Value[] }
  | { kind: "object"; data: [string, Value][]; error?: string };
type Value =
  | null
  | boolean
  | number
  | string
  | { ref: number }
  | { undefined: true }
  | { number: "NaN" | "Infinity" | "-Infinity" | "-0" };

export function encode(value: unknown): string {
  const nodes: Node[] = [];
  const seen = new Map<object, number>();
  function visit(value: unknown): Value {
    if (typeof value === "number" && (!Number.isFinite(value) || Object.is(value, -0))) {
      return {
        number: (Object.is(value, -0) ? "-0" : String(value)) as
          | "NaN"
          | "Infinity"
          | "-Infinity"
          | "-0",
      };
    }
    if (value === undefined) {
      return { undefined: true };
    }
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "boolean" ||
      typeof value === "number"
    ) {
      return value;
    }
    if (typeof value !== "object") {
      throw new TypeError("TLS capability values must be data, not functions or native handles");
    }
    const existing = seen.get(value);
    if (existing !== undefined) {
      return { ref: existing };
    }
    const ref = nodes.length;
    seen.set(value, ref);
    const node: Node = ArrayBuffer.isView(value)
      ? {
          kind: "bytes",
          data: Array.from(new Uint8Array(value.buffer, value.byteOffset, value.byteLength)),
        }
      : Array.isArray(value)
        ? { kind: "array", data: [] }
        : { kind: "object", data: [] };
    nodes.push(node);
    if (node.kind === "array") {
      node.data = (value as unknown[]).map(visit);
    }
    if (node.kind === "object") {
      if (value instanceof Error) {
        node.error = value.name;
        node.data.push(["message", value.message]);
      }
      for (const [key, entry] of Object.entries(value)) {
        node.data.push([key, visit(entry)]);
      }
    }
    return { ref };
  }
  const root = visit(value);
  return JSON.stringify({ root, nodes });
}

export function decode(text: string): unknown {
  const { root, nodes } = JSON.parse(text) as { root: Value; nodes: Node[] };
  const objects: unknown[] = nodes.map((node) =>
    node.kind === "bytes"
      ? Buffer.from(node.data)
      : node.kind === "array"
        ? []
        : node.error
          ? errorWithName(node.error)
          : {},
  );
  function visit(value: Value): unknown {
    if (value !== null && typeof value === "object") {
      return "ref" in value
        ? objects[value.ref]
        : "number" in value
          ? Number(value.number)
          : undefined;
    }
    return value;
  }
  nodes.forEach((node, index) => {
    if (node.kind === "array") {
      (objects[index] as unknown[]).push(...node.data.map(visit));
    }
    if (node.kind === "object") {
      for (const [key, value] of node.data) {
        Object.defineProperty(objects[index], key, {
          value: visit(value),
          writable: true,
          configurable: true,
          enumerable: true,
        });
      }
    }
  });
  return visit(root);
}

function errorWithName(name: string): Error {
  const error =
    name === "TypeError" ? new TypeError() : name === "RangeError" ? new RangeError() : new Error();
  error.name = name;
  return error;
}
