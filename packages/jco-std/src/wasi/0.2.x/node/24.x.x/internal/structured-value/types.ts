export type EncodedValue =
  | {
      type: "value";
      value: string | boolean | null;
    }
  | { type: "undefined" }
  | {
      type: "number" | "bigint" | "date";
      value: string;
    }
  | {
      type: "array";
      length: number;
      entries: [string, number][];
    }
  | {
      type: "object";
      entries: [string, number][];
    }
  | {
      type: "map";
      entries: [number, number][];
    }
  | {
      type: "set";
      entries: number[];
    }
  | {
      type: "buffer" | "node-buffer";
      bytes: number[];
    }
  | {
      type: "regexp";
      source: string;
      flags: string;
    }
  | {
      type: "view";
      name: string;
      buffer: number;
      offset: number;
      length: number;
    };

export const viewConstructors = {
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

export interface CodecOptions {
  api?: string;
  preserveBuffers?: boolean;
  persistent?: boolean;
  cloneError?: (message: string) => Error;
}

export interface MessageCodec {
  encode(value: unknown): string;

  markAsUncloneable(value: unknown): void;

  markAsUntransferable(value: unknown): void;

  isMarkedAsUntransferable(value: unknown): boolean;
}

export interface DecodeSession {
  values: unknown[];
}

export interface Graph {
  root: number;
  nodes: EncodedValue[];
}

export function objectLike(value: unknown): value is object {
  return (typeof value === "object" && value !== null) || typeof value === "function";
}
