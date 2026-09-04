import type { WasiSocketsProvider } from "../../../http/impl/wasi-sockets.js";
import type { Http2Implementation } from "../../types.js";
import { createWasiSocketsHttp2Client } from "./client.js";
import { createWasiSocketsHttp2Server } from "./server.js";

/** Implements cleartext, prior-knowledge HTTP/2 directly over Preview 2 TCP streams. */
export function createWasiSocketsHttp2Implementation(
  provider: WasiSocketsProvider,
): Http2Implementation {
  return {
    connect: (authority, options) => createWasiSocketsHttp2Client(provider, authority, options),
    createServer: (secure, options, handler, onError) =>
      createWasiSocketsHttp2Server(provider, secure, options, handler, onError),
  };
}
