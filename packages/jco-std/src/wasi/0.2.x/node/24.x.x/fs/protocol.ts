import type {
  FsErrorResponse,
  FsRequest,
  FsResponse,
  FsSuccessResponse,
  FsTaggedValue,
  FsWireError,
} from "./types.js";

const TAG = "__jcoNodeFs";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function tagged(tag: FsTaggedValue["__jcoNodeFs"], value?: unknown): FsTaggedValue {
  return value === undefined ? { [TAG]: tag } : { [TAG]: tag, value };
}

/** Convert values accepted by the filesystem protocol to JSON-safe data. */
export function encodeWire(value: unknown): unknown {
  if (value === undefined) {
    return tagged("undefined");
  }
  if (typeof value === "bigint") {
    return tagged("bigint", value.toString());
  }
  if (value instanceof Date) {
    return tagged("date", value.getTime());
  }
  if (value instanceof URL) {
    return tagged("url", value.href);
  }
  if (value instanceof ArrayBuffer) {
    return tagged("bytes", [...new Uint8Array(value)]);
  }
  if (ArrayBuffer.isView(value)) {
    return tagged("bytes", [...new Uint8Array(value.buffer, value.byteOffset, value.byteLength)]);
  }
  if (Array.isArray(value)) {
    return value.map(encodeWire);
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, encodeWire(entry)]),
    );
  }
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  throw new TypeError(`unsupported filesystem protocol value: ${typeof value}`);
}

/** Restore tagged protocol values without assuming either a Node or browser host. */
export function decodeWire(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(decodeWire);
  }
  if (!isRecord(value)) {
    return value;
  }
  const tag = value[TAG];
  if (tag === "undefined") {
    return undefined;
  }
  if (tag === "bigint") {
    if (typeof value.value !== "string") {
      throw new TypeError("invalid filesystem bigint payload");
    }
    return BigInt(value.value);
  }
  if (tag === "date") {
    if (typeof value.value !== "number") {
      throw new TypeError("invalid filesystem date payload");
    }
    return new Date(value.value);
  }
  if (tag === "bytes") {
    if (!Array.isArray(value.value) || value.value.some((byte) => !Number.isInteger(byte))) {
      throw new TypeError("invalid filesystem byte payload");
    }
    return Uint8Array.from(value.value as number[]);
  }
  if (tag === "url") {
    if (typeof value.value !== "string") {
      throw new TypeError("invalid filesystem URL payload");
    }
    return new URL(value.value);
  }
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, decodeWire(entry)]));
}

export function serializeRequest(operation: string, args: readonly unknown[]): string {
  const request: FsRequest = { operation, args: args.map(encodeWire) };
  return JSON.stringify(request);
}

export function parseRequest(requestJson: string): FsRequest {
  const parsed: unknown = JSON.parse(requestJson);
  if (!isRecord(parsed) || typeof parsed.operation !== "string" || !Array.isArray(parsed.args)) {
    throw new TypeError("invalid filesystem request envelope");
  }
  return { operation: parsed.operation, args: parsed.args.map(decodeWire) };
}

export function serializeSuccess(value: unknown): string {
  const response: FsSuccessResponse = { ok: true, value: encodeWire(value) };
  return JSON.stringify(response);
}

export function serializeFailure(error: FsWireError): string {
  const response: FsErrorResponse = { ok: false, error };
  return JSON.stringify(response);
}

export function parseResponse(responseJson: string): FsResponse {
  const parsed: unknown = JSON.parse(responseJson);
  if (!isRecord(parsed) || typeof parsed.ok !== "boolean") {
    throw new TypeError("invalid filesystem response envelope");
  }
  if (parsed.ok) {
    return { ok: true, value: decodeWire(parsed.value) };
  }
  if (!isRecord(parsed.error) || typeof parsed.error.message !== "string") {
    throw new TypeError("invalid filesystem error envelope");
  }
  const wire = parsed.error;
  return {
    ok: false,
    error: {
      name: typeof wire.name === "string" ? wire.name : "Error",
      message: String(wire.message),
      code: typeof wire.code === "string" ? wire.code : undefined,
      errno:
        typeof wire.errno === "number" || typeof wire.errno === "string" ? wire.errno : undefined,
      syscall: typeof wire.syscall === "string" ? wire.syscall : undefined,
      path: typeof wire.path === "string" ? wire.path : undefined,
      dest: typeof wire.dest === "string" ? wire.dest : undefined,
    },
  };
}
