/**
 * Opt-in Node.js HTTP provider.
 *
 * The operation mapping follows nodejs/node v24.19.0, commit
 * cdc1b38d40cb567b7ad0b39c86addf830a0af0ae, lib/http.js and
 * lib/_http_client.js (MIT license). The Node stream lifecycle is adapted to
 * one buffered, typed WIT request/response exchange.
 */
import * as nodeHttp from "node:http";

import type {
  DirectHttpError,
  DirectHttpRequest,
  DirectHttpResponse,
  DirectHttpResult,
} from "./http/types.js";

type AsyncResult<T> = Promise<DirectHttpResult<T>>;
type Timer = ReturnType<typeof setTimeout>;

function serializeError(error: unknown): DirectHttpError {
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

function headers(value: readonly { name: string; value: Uint8Array }[]): string[] {
  const decoder = new TextDecoder("latin1");
  return value.flatMap(({ name, value: bytes }) => [name, decoder.decode(bytes)]);
}

function responseHeaders(rawHeaders: string[]): Array<{ name: string; value: Uint8Array }> {
  const result: Array<{ name: string; value: Uint8Array }> = [];
  for (let index = 0; index < rawHeaders.length; index += 2) {
    result.push({
      name: rawHeaders[index],
      value: Uint8Array.from(rawHeaders[index + 1], (character) => character.charCodeAt(0)),
    });
  }
  return result;
}

function timeoutError(syscall: string): Error & { code: string; syscall: string } {
  return Object.assign(new Error(`HTTP ${syscall} timed out`), {
    code: "ETIMEDOUT",
    syscall,
  });
}

export async function request(options: DirectHttpRequest): AsyncResult<DirectHttpResponse> {
  return new Promise((resolve) => {
    let connectTimer: Timer | undefined;
    let firstByteTimer: Timer | undefined;
    const finish = (result: DirectHttpResult<DirectHttpResponse>): void => {
      clearTimeout(connectTimer);
      clearTimeout(firstByteTimer);
      resolve(result);
    };
    const request = nodeHttp.request(
      new URL(`${options.scheme}://${options.authority}${options.pathWithQuery}`),
      {
        method: options.method,
        headers: headers(options.headers),
        joinDuplicateHeaders: true,
      },
      (response) => {
        clearTimeout(connectTimer);
        clearTimeout(firstByteTimer);
        const chunks: Uint8Array[] = [];
        if (options.betweenBytesTimeoutMs !== undefined) {
          response.setTimeout(options.betweenBytesTimeoutMs, () => {
            response.destroy(timeoutError("read"));
          });
        }
        response.on("data", (chunk: Uint8Array) => chunks.push(new Uint8Array(chunk)));
        response.once("error", (error) => finish({ tag: "err", val: serializeError(error) }));
        response.once("end", () => {
          const size = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
          const body = new Uint8Array(size);
          let offset = 0;
          for (const chunk of chunks) {
            body.set(chunk, offset);
            offset += chunk.byteLength;
          }
          finish({
            tag: "ok",
            val: {
              statusCode: response.statusCode ?? 0,
              statusMessage: response.statusMessage ?? "",
              httpVersion: response.httpVersion,
              headers: responseHeaders(response.rawHeaders),
              body,
            },
          });
        });
      },
    );
    request.once("error", (error) => finish({ tag: "err", val: serializeError(error) }));
    if (options.connectTimeoutMs !== undefined) {
      request.once("socket", (socket) => {
        if (!socket.connecting) {
          return;
        }
        connectTimer = setTimeout(
          () => request.destroy(timeoutError("connect")),
          options.connectTimeoutMs,
        );
        socket.once("connect", () => clearTimeout(connectTimer));
      });
    }
    request.end(options.body);
    if (options.firstByteTimeoutMs !== undefined) {
      firstByteTimer = setTimeout(
        () => request.destroy(timeoutError("request")),
        options.firstByteTimeoutMs,
      );
    }
  });
}

export default { request };
