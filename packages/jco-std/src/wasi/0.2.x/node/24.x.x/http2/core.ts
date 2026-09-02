import { constants, type Http2Constants } from "./constants.js";
import { unsupported } from "./errors.js";
import {
  createServerConstructor,
  Http2ServerRequest,
  Http2ServerResponse,
  type Http2RequestListener,
  type Http2ServerConstructor,
} from "./server.js";
import { createConnection, type ConnectListener, ClientHttp2Session } from "./session.js";
import { getDefaultSettings, getPackedSettings, getUnpackedSettings } from "./settings.js";
import type { Http2ClientOptions, Http2Implementation, Http2ServerOptions } from "./types.js";

export const sensitiveHeaders = Symbol("nodejs.http2.sensitiveHeaders");

export interface NodeHttp2Module {
  connect: (
    authority: string | URL,
    optionsOrListener?: Http2ClientOptions | ConnectListener,
    listener?: ConnectListener,
  ) => ClientHttp2Session;
  constants: Http2Constants;
  createServer: (
    optionsOrListener?: Http2ServerOptions | Http2RequestListener,
    listener?: Http2RequestListener,
  ) => InstanceType<Http2ServerConstructor>;
  createSecureServer: (
    optionsOrListener?: Http2ServerOptions | Http2RequestListener,
    listener?: Http2RequestListener,
  ) => InstanceType<Http2ServerConstructor>;
  getDefaultSettings: typeof getDefaultSettings;
  getPackedSettings: typeof getPackedSettings;
  getUnpackedSettings: typeof getUnpackedSettings;
  performServerHandshake: (socket: unknown, options?: Http2ServerOptions) => never;
  sensitiveHeaders: symbol;
  Http2ServerRequest: typeof Http2ServerRequest;
  Http2ServerResponse: typeof Http2ServerResponse;
}

export function createHttp2(implementation: Http2Implementation): NodeHttp2Module {
  const Http2Server = createServerConstructor(implementation, false);
  const Http2SecureServer = createServerConstructor(implementation, true);

  function connect(
    authority: string | URL,
    optionsOrListener: Http2ClientOptions | ConnectListener = {},
    listener?: ConnectListener,
  ): ClientHttp2Session {
    return createConnection(
      (normalizedAuthority, options) => implementation.connect(normalizedAuthority, options),
      authority,
      optionsOrListener,
      listener,
    );
  }

  function createServer(
    optionsOrListener: Http2ServerOptions | Http2RequestListener = {},
    listener?: Http2RequestListener,
  ): InstanceType<Http2ServerConstructor> {
    const options = typeof optionsOrListener === "function" ? {} : optionsOrListener;
    const actualListener = typeof optionsOrListener === "function" ? optionsOrListener : listener;
    return new Http2Server(options, actualListener);
  }

  function createSecureServer(
    optionsOrListener: Http2ServerOptions | Http2RequestListener = {},
    listener?: Http2RequestListener,
  ): InstanceType<Http2ServerConstructor> {
    const options = typeof optionsOrListener === "function" ? {} : optionsOrListener;
    const actualListener = typeof optionsOrListener === "function" ? optionsOrListener : listener;
    return new Http2SecureServer(options, actualListener);
  }

  function performServerHandshake(_socket: unknown, _options?: Http2ServerOptions): never {
    return unsupported(
      "http2.performServerHandshake",
      "an arbitrary guest Duplex stream cannot cross the component boundary",
    );
  }

  return {
    connect,
    constants,
    createServer,
    createSecureServer,
    getDefaultSettings,
    getPackedSettings,
    getUnpackedSettings,
    performServerHandshake,
    sensitiveHeaders,
    Http2ServerRequest,
    Http2ServerResponse,
  };
}
