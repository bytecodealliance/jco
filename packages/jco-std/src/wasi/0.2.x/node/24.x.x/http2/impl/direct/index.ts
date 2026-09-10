import type { TlsHost } from "../../../tls/host-types.js";
import type { DirectHttp2Host, Http2Implementation } from "../../types.js";
import { createDirectHttp2Client } from "./client.js";
import { createDirectHttp2Server, createHttp2CallbackRegistry } from "./server.js";

export function createDirectHttp2Implementation(
  host: DirectHttp2Host,
  tls?: TlsHost,
): Http2Implementation & {
  http2Callbacks: ReturnType<typeof createHttp2CallbackRegistry>["exports"];
} {
  const registry = createHttp2CallbackRegistry();
  return {
    http2Callbacks: registry.exports,
    connect: (authority, options) => createDirectHttp2Client(host, authority, options, tls),
    createServer: (secure, options, handler, onError) =>
      createDirectHttp2Server(host, registry, secure, options, handler, onError, tls),
  };
}
