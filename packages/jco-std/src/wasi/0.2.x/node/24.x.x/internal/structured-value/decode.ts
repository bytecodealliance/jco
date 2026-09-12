import { Buffer } from "node:buffer";
import { viewConstructors } from "./types.js";
import type { EncodedValue, Graph, DecodeSession } from "./types.js";

/** Decode only the private graph representation emitted by the paired adapter. */
export function decodeMessage(source: string, session?: DecodeSession): unknown {
  const graph: EncodedValue[] | Graph = JSON.parse(source);
  const nodes = Array.isArray(graph) ? graph : graph.nodes;
  const root = Array.isArray(graph) ? 0 : graph.root;
  const values = session?.values ?? [];
  const start = values.length;

  for (let index = start; index < nodes.length; index++) {
    values.push(allocate(nodes[index]));
  }

  // Buffers must exist before constructing views; object references are filled last.
  for (let index = start; index < nodes.length; index++) {
    const node = nodes[index];

    if (node.type === "view") {
      values[index] = restoreView(node, values);
    }
  }

  for (let index = start; index < nodes.length; index++) {
    fillReferences(nodes[index], values[index], values);
  }

  return values[root];
}

function allocate(node: EncodedValue): unknown {
  switch (node.type) {
    case "value":
      return node.value;

    case "undefined":
    case "view":
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

    case "node-buffer":
      return Buffer.from(node.bytes);

    case "regexp":
      return new RegExp(node.source, node.flags);
  }
}

function restoreView(
  node: Extract<EncodedValue, { type: "view" }>,
  values: unknown[],
): ArrayBufferView {
  // The paired encoder references an ArrayBuffer node, allocated in the first pass.
  const buffer = values[node.buffer] as ArrayBuffer;

  if (node.name === "DataView") {
    return new DataView(buffer, node.offset, node.length);
  }

  const Constructor = viewConstructors[node.name as keyof typeof viewConstructors];

  return new Constructor(buffer, node.offset, node.length / Constructor.BYTES_PER_ELEMENT);
}

function fillReferences(node: EncodedValue, target: unknown, values: unknown[]): void {
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
    // The allocation pass creates the collection corresponding to this node tag.
    for (const [key, value] of node.entries) {
      (target as Map<unknown, unknown>).set(values[key], values[value]);
    }
  } else if (node.type === "set") {
    for (const value of node.entries) {
      (target as Set<unknown>).add(values[value]);
    }
  }
}
