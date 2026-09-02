import type { HttpHeaderField } from "../http/types.js";

export interface SerializedNodeError {
  name: string;
  message: string;
  code?: string;
  errno?: { tag: "number"; val: bigint } | { tag: "symbolic"; val: string };
  syscall?: string;
  hostname?: string;
  address?: string;
  port?: number;
}

export function serializeNodeError(error: unknown): SerializedNodeError {
  const value =
    typeof error === "object" && error !== null ? (error as Record<string, unknown>) : {};
  const errno =
    typeof value.errno === "number"
      ? { tag: "number" as const, val: BigInt(value.errno) }
      : typeof value.errno === "string"
        ? { tag: "symbolic" as const, val: value.errno }
        : undefined;
  return {
    name: typeof value.name === "string" ? value.name : "Error",
    message: typeof value.message === "string" ? value.message : String(error),
    code: typeof value.code === "string" ? value.code : undefined,
    errno,
    syscall: typeof value.syscall === "string" ? value.syscall : undefined,
    hostname: typeof value.hostname === "string" ? value.hostname : undefined,
    address: typeof value.address === "string" ? value.address : undefined,
    port: typeof value.port === "number" ? value.port : undefined,
  };
}

export function fieldsToRawHeaders(value: readonly HttpHeaderField[]): string[] {
  const decoder = new TextDecoder("latin1");
  return value.flatMap(({ name, value: bytes }) => [name, decoder.decode(bytes)]);
}

export function rawHeadersToFields(rawHeaders: readonly string[]): HttpHeaderField[] {
  const result: HttpHeaderField[] = [];
  for (let index = 0; index < rawHeaders.length; index += 2) {
    result.push({
      name: rawHeaders[index],
      value: Uint8Array.from(rawHeaders[index + 1], (character) => character.charCodeAt(0)),
    });
  }
  return result;
}
