import type { TlsHost } from "../../../tls/host-types.js";
import deniedTls from "../../../tls/node-host.js";
import { encode } from "../../../tls/wire.js";
import { hostCall } from "../../../tls/errors.js";
import { serializeNodeError } from "../../../internal/http-host.js";
import { codedError, fromImplementationError } from "../../errors.js";
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

export class StreamListener implements DirectHttp2StreamListener {
  readonly #handler: Http2StreamHandler;

  constructor(handler: Http2StreamHandler) {
    this.#handler = handler;
  }

  async handle(stream: Parameters<DirectHttp2StreamListener["handle"]>[0]) {
    try {
      return await this.#handler(stream);
    } catch (error) {
      throw serializeNodeError(error);
    }
  }

  [Symbol.dispose](): void {}
}

export class ServerErrorListener implements DirectHttp2ServerErrorListener {
  readonly #handler: (error: Error) => void;

  constructor(handler: (error: Error) => void) {
    this.#handler = handler;
  }

  handle(reason: Parameters<DirectHttp2ServerErrorListener["handle"]>[0]): void {
    this.#handler(fromImplementationError(reason));
  }

  [Symbol.dispose](): void {}
}

export function createHttp2CallbackRegistry() {
  let nextId = 1;
  const streams = new Map<number, StreamListener>();
  const errors = new Map<number, ServerErrorListener>();
  return {
    allocate() {
      if (nextId > 0xffff_fffe) {
        throw codedError(
          "Error",
          "ERR_JCO_HTTP2_CALLBACK_LIMIT",
          "HTTP/2 callback registrations exhausted",
        );
      }
      return [nextId++, nextId++] as const;
    },
    register(
      listener: number,
      errorListener: number,
      handler: Http2StreamHandler,
      onError: (error: Error) => void,
    ) {
      streams.set(listener, new StreamListener(handler));
      errors.set(errorListener, new ServerErrorListener(onError));
    },
    release(listener: number, errorListener: number) {
      streams.delete(listener);
      errors.delete(errorListener);
    },
    exports: {
      StreamListener,
      ServerErrorListener,
      takeStreamListener(id: number) {
        const listener = streams.get(id);
        streams.delete(id);
        return listener;
      },
      takeServerErrorListener(id: number) {
        const listener = errors.get(id);
        errors.delete(id);
        return listener;
      },
    },
  };
}

export function createDirectHttp2Server(
  host: DirectHttp2Host,
  registry: ReturnType<typeof createHttp2CallbackRegistry>,
  secure: boolean,
  options: Http2ServerOptions,
  handler: Http2StreamHandler,
  onError: (error: Error) => void,
  tls: TlsHost = deniedTls,
): Http2ServerImplementation {
  const [listener, errorListener] = registry.allocate();
  const tlsContext = secure
    ? hostCall(() =>
        tls.createContext(encode({ key: tlsBytes(options.key), cert: tlsBytes(options.cert) })),
      )
    : undefined;
  let server: InstanceType<typeof host.Server>;
  try {
    server = new host.Server(
      {
        secure,
        tlsContext,
        settings: toDirectSettings(options.settings),
        allowHttp1: options.allowHTTP1,
        strictFieldWhitespaceValidation: options.strictFieldWhitespaceValidation,
      },
      listener,
      errorListener,
    );
  } finally {
    if (tlsContext !== undefined) {
      tls.releaseContext(tlsContext);
    }
  }
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
    listen(listenOptions) {
      registry.register(listener, errorListener, handler, onError);
      try {
        return address(unwrap(() => server.listen(listenOptions)))!;
      } catch (error) {
        registry.release(listener, errorListener);
        throw error;
      }
    },
    close() {
      const result = unwrap(() => server.close());
      registry.release(listener, errorListener);
      return result;
    },
    address: () => address(server.address()),
    updateSettings: (settings) => unwrap(() => server.updateSettings(toDirectSettings(settings))),
    ref: () => server.ref(),
    unref: () => server.unref(),
  };
}
