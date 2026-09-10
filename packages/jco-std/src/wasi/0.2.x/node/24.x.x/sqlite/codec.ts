/** Typed transport for jco:node/sqlite. SQL evaluation remains entirely in the provider. */
import type { Value, Row, Bindings, Path, Error as SqliteError } from "./wire.js";
export type SQLInputValue = null | number | bigint | string | ArrayBufferView;
export type SQLOutputValue = null | number | bigint | string | Uint8Array;
export type ResultRow = Record<string, SQLOutputValue> | SQLOutputValue[];

export function fail(
  code: string,
  message: string,
  kind: "Error" | "TypeError" | "RangeError" = "TypeError",
): never {
  const Ctor = kind === "TypeError" ? TypeError : kind === "RangeError" ? RangeError : Error;
  throw Object.assign(new Ctor(message), { code });
}

export function encode(value: unknown): Value {
  if (value === null) {
    return { tag: "null" };
  }
  if (typeof value === "number") {
    return { tag: "number", val: value };
  }
  if (typeof value === "string") {
    return { tag: "text", val: value };
  }
  if (typeof value === "bigint") {
    if (value < -(1n << 63n) || value >= 1n << 63n) {
      fail("ERR_INVALID_ARG_VALUE", "BigInt value is too large to bind.");
    }
    return { tag: "bigint", val: value };
  }
  if (ArrayBuffer.isView(value)) {
    return { tag: "blob", val: new Uint8Array(value.buffer, value.byteOffset, value.byteLength) };
  }
  return fail("ERR_INVALID_ARG_TYPE", "Provided value cannot be bound to SQLite parameter.");
}

export function decode(value: Value): SQLOutputValue {
  return value.tag === "null" ? null : value.tag === "blob" ? new Uint8Array(value.val) : value.val;
}

export function encodeRow(row: ResultRow): Row {
  return Array.isArray(row)
    ? { tag: "array", val: row.map(encode) }
    : { tag: "object", val: Object.entries(row).map(([k, v]) => [k, encode(v)]) };
}

export function decodeRow(row: Row): ResultRow {
  if (row.tag === "array") {
    return row.val.map(decode);
  }
  const result: Record<string, SQLOutputValue> = Object.create(null);
  for (const [key, value] of row.val) {
    result[key] = decode(value);
  }
  return result;
}

export function bindings(args: unknown[]): Bindings {
  const first = args[0];
  if (first !== null && typeof first === "object" && !ArrayBuffer.isView(first)) {
    return {
      named: Object.keys(first).map((k) => [k, encode((first as Record<string, unknown>)[k])]),
      positional: args.slice(1).map(encode),
    };
  }
  return { positional: args.map(encode) };
}

export function path(value: unknown): Path {
  if (typeof value === "string") {
    return { tag: "text", val: value };
  }
  if (value instanceof Uint8Array) {
    return { tag: "bytes", val: value };
  }
  if (
    value !== null &&
    typeof value === "object" &&
    typeof (value as { href?: unknown }).href === "string"
  ) {
    return { tag: "url", val: (value as { href: string }).href };
  }
  return fail(
    "ERR_INVALID_ARG_TYPE",
    'The "path" argument must be a string, Uint8Array, or URL without null bytes.',
  );
}

export function capture<T>(fn: () => T): T {
  try {
    return fn();
  } catch (error) {
    throw serializeError(error);
  }
}

export function serializeError(error: unknown): SqliteError {
  const e = error as Partial<SqliteError>;
  return {
    name: e?.name ?? "Error",
    message: e?.message ?? String(error),
    code: e?.code,
    errcode: e?.errcode,
    errstr: e?.errstr,
  };
}

export function restoreError(error: unknown): Error {
  const record = error as { payload?: SqliteError };
  const e = record?.payload ?? (error as SqliteError);
  if (error instanceof Error && !record.payload) {
    return error;
  }
  const Ctor = e?.name === "TypeError" ? TypeError : e?.name === "RangeError" ? RangeError : Error;
  const result = new Ctor(e?.message ?? String(error));
  for (const key of ["code", "errcode", "errstr"] as const) {
    if (e?.[key] !== undefined) {
      Object.assign(result, { [key]: e[key] });
    }
  }
  return result;
}

export function call<T>(fn: () => T): T {
  try {
    return fn();
  } catch (error) {
    throw restoreError(error);
  }
}
