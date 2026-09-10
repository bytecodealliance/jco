import type { TlsStreamHost } from "../../../tls/host-types.js";
/**
 * Guest contract for WebAssembly/wasi-tls wit/types.wit, revision
 * 6781ae26084100c0628ef72cc44e4517c6c48ae5 (W3C Community CLA).
 * Local contract: wasi:io@0.2.12 and an availability query (see vendored README.md).
 */
import { fromImplementationError, unsupported } from "../../errors.js";
import type { HttpTlsMaterial } from "../../types.js";
import {
  dispose,
  type WasiInputStream,
  type WasiOutputStream,
  type WasiPollable,
} from "../../../internal/wasi-sockets.js";

export interface WasiTlsError {
  toDebugString(): string;
  [Symbol.dispose]?(): void;
}
export interface WasiTlsConnection {
  closeOutput(): void;
  [Symbol.dispose]?(): void;
}
export interface WasiTlsHandshake {
  [Symbol.dispose]?(): void;
}
export type WasiTlsStreams = [WasiTlsConnection, WasiInputStream, WasiOutputStream];
export type WasiTlsResult =
  | { tag: "err"; val?: undefined }
  | {
      tag: "ok";
      val: { tag: "ok"; val: WasiTlsStreams } | { tag: "err"; val: WasiTlsError };
    };
export interface WasiTlsFuture {
  get(): WasiTlsResult | undefined;
  subscribe(): WasiPollable;
  [Symbol.dispose]?(): void;
}
export interface WasiTlsProvider {
  isAvailable(): boolean;
  ClientHandshake: {
    new (serverName: string, input: WasiInputStream, output: WasiOutputStream): WasiTlsHandshake;
    finish(handshake: WasiTlsHandshake): WasiTlsFuture;
  };
}

export function validateTlsOptions(options: HttpTlsMaterial | undefined): void {
  for (const [name, value] of Object.entries(options ?? {})) {
    if (
      value === undefined ||
      name === "servername" ||
      (name === "rejectUnauthorized" && value === true)
    ) {
      continue;
    }
    unsupported(
      `https.request TLS option ${name}`,
      "wasi:tls@0.2.0-draft only accepts a server name; trust, verification, ALPN and other TLS settings are host policy",
    );
  }
  if (options?.servername === "") {
    unsupported(
      "https.request TLS option servername",
      "wasi:tls requires a name for certificate verification and cannot disable SNI independently",
    );
  }
}

/** Takes ownership of input/output, including on handshake failure. */
export function handshake(
  provider: WasiTlsProvider | TlsStreamHost,
  serverName: string,
  input: WasiInputStream,
  output: WasiOutputStream,
): WasiTlsStreams {
  let ownedInput: WasiInputStream | undefined = input;
  let ownedOutput: WasiOutputStream | undefined = output;
  let pending: WasiTlsHandshake | undefined;
  let future: WasiTlsFuture | undefined;
  try {
    if ("startTls" in provider) {
      // WIT transfers ownership at the call, including when the provider throws.
      ownedInput = undefined;
      ownedOutput = undefined;
      future = provider.startTls(serverName, input, output);
    } else {
      pending = new provider.ClientHandshake(serverName, ownedInput, ownedOutput);
      ownedInput = undefined;
      ownedOutput = undefined;
      future = provider.ClientHandshake.finish(pending);
      pending = undefined;
    }
    for (;;) {
      const result = future.get();
      if (result) {
        if (result.tag === "err") {
          throw new Error("wasi:tls future was already consumed");
        }
        if (result.val.tag === "err") {
          const error = result.val.val;
          try {
            throw fromImplementationError({
              name: "Error",
              code: "ERR_JCO_WASI_TLS",
              message: `TLS handshake failed: ${error.toDebugString()}`,
              syscall: "tls",
              hostname: serverName,
            });
          } finally {
            dispose(error);
          }
        }
        return result.val.val;
      }
      const poll = future.subscribe();
      try {
        poll.block();
      } finally {
        dispose(poll);
      }
    }
  } finally {
    dispose(future);
    dispose(pending);
    dispose(ownedOutput);
    dispose(ownedInput);
  }
}
