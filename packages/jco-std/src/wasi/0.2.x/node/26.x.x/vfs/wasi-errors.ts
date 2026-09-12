import { Buffer as NodeBuffer } from "node:buffer";
import { unsupportedNodeApi, systemError } from "../../24.x.x/errors/core.js";
import type { FsHost, FsPath } from "../../24.x.x/fs/types.js";
import type { HostImports } from "../../24.x.x/internal/wit-types.js";
import type { Datetime } from "./wasi-types.js";
import { createEINVAL } from "./errors.js";

const ERROR_CODES: Readonly<Record<string, string>> = {
  access: "EACCES",
  "not-permitted": "EPERM",
  "no-entry": "ENOENT",
  "not-directory": "ENOTDIR",
  "is-directory": "EISDIR",
  exist: "EEXIST",
  "not-empty": "ENOTEMPTY",
  loop: "ELOOP",
  invalid: "EINVAL",
  "bad-descriptor": "EBADF",
  "read-only": "EROFS",
  "cross-device": "EXDEV",
  "insufficient-space": "ENOSPC",
  io: "EIO",
  unsupported: "ENOTSUP",
};

/** Component bindings wrap a WIT error-code in ComponentError.payload. */
export function wasiErrorCode(error: unknown): string | undefined {
  if (typeof error === "string") {
    return error;
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "payload" in error &&
    typeof error.payload === "string"
  ) {
    return error.payload;
  }
  return undefined;
}

export function unsupported(): never {
  throw unsupportedNodeApi(
    "node:vfs",
    "this operation has no equivalent in wasi:filesystem@0.2.12",
  );
}

export function text(value: FsPath): string {
  if (value.tag === "text") {
    return value.val;
  }
  if (value.tag === "bytes") {
    return NodeBuffer.from(value.val).toString();
  }
  throw createEINVAL("open", value.val);
}

export function timestamp(seconds: number): { tag: "timestamp"; val: Datetime } {
  return {
    tag: "timestamp",
    val: { seconds: BigInt(Math.floor(seconds)), nanoseconds: Math.round((seconds % 1) * 1e9) },
  };
}

export function wrapWasiHost(host: HostImports<FsHost>): HostImports<FsHost> {
  // Preserve each typed function's arguments and result. Only the exception
  // representation changes: WASI error-code strings become Node system errors.
  const wrapped = Object.fromEntries(
    Object.entries(host).map(([name, operation]) => [
      name,
      (...args: unknown[]) => {
        try {
          return Reflect.apply(operation, host, args);
        } catch (error) {
          const detail = wasiErrorCode(error);
          if (detail === undefined) {
            throw error;
          }
          const code = ERROR_CODES[detail] ?? "EIO";
          throw systemError({ code, syscall: name, message: `${code}: ${error}, ${name}` });
        }
      },
    ]),
  );
  return wrapped as HostImports<FsHost>;
}
