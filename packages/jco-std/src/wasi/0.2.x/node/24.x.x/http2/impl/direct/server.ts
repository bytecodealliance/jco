import { fromImplementationError } from "../../errors.js";
import { toDirectSettings } from "../../settings.js";
import type {
  DirectHttp2Host,
  DirectHttp2ServerErrorListener,
  DirectHttp2StreamListener,
  Http2ServerImplementation,
  Http2ServerOptions,
  Http2StreamHandler,
} from "../../types.js";
import { tlsBytes, unwrap } from "./shared.js";

class StreamListener implements DirectHttp2StreamListener {
  readonly #handler: Http2StreamHandler;

  constructor(handler: Http2StreamHandler) {
    this.#handler = handler;
  }

  async handle(stream: Parameters<DirectHttp2StreamListener["handle"]>[0]) {
    try {
      return { tag: "ok" as const, val: await this.#handler(stream) };
    } catch (error) {
      const value =
        typeof error === "object" && error !== null ? (error as Record<string, unknown>) : {};
      return {
        tag: "err" as const,
        val: {
          name: typeof value.name === "string" ? value.name : "Error",
          message: typeof value.message === "string" ? value.message : String(error),
          code: typeof value.code === "string" ? value.code : undefined,
          syscall: typeof value.syscall === "string" ? value.syscall : undefined,
          hostname: typeof value.hostname === "string" ? value.hostname : undefined,
          address: typeof value.address === "string" ? value.address : undefined,
          port: typeof value.port === "number" ? value.port : undefined,
        },
      };
    }
  }

  [Symbol.dispose](): void {}
}

class ServerErrorListener implements DirectHttp2ServerErrorListener {
  readonly #handler: (error: Error) => void;

  constructor(handler: (error: Error) => void) {
    this.#handler = handler;
  }

  handle(reason: Parameters<DirectHttp2ServerErrorListener["handle"]>[0]): void {
    this.#handler(fromImplementationError(reason));
  }

  [Symbol.dispose](): void {}
}

export const http2Callbacks = { ServerErrorListener, StreamListener };

export function createDirectHttp2Server(
  host: DirectHttp2Host,
  secure: boolean,
  options: Http2ServerOptions,
  handler: Http2StreamHandler,
  onError: (error: Error) => void,
): Http2ServerImplementation {
  const server = new host.Server(
    {
      secure,
      key: tlsBytes(options.key),
      cert: tlsBytes(options.cert),
      settings: toDirectSettings(options.settings),
      allowHttp1: options.allowHTTP1,
      strictFieldWhitespaceValidation: options.strictFieldWhitespaceValidation,
    },
    new StreamListener(handler),
    new ServerErrorListener(onError),
  );
  const address = (value: ReturnType<typeof server.address>) =>
    value === undefined
      ? null
      : value.tag === "tcp"
        ? {
            address: value.val.address,
            family: value.val.family === "IPv6" ? ("IPv6" as const) : ("IPv4" as const),
            port: value.val.port,
          }
        : value.val;
  return {
    listen: (listenOptions) => address(unwrap(server.listen(listenOptions)))!,
    close: () => unwrap(server.close()),
    address: () => address(server.address()),
    updateSettings: (settings) => unwrap(server.updateSettings(toDirectSettings(settings))),
    ref: () => server.ref(),
    unref: () => server.unref(),
  };
}
