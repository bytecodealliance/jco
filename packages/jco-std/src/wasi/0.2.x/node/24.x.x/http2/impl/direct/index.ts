import type { DirectHttp2Host, Http2Implementation } from "../../types.js";
import { createDirectHttp2Client } from "./client.js";
import { createDirectHttp2Server } from "./server.js";

export { http2Callbacks } from "./server.js";

export function createDirectHttp2Implementation(host: DirectHttp2Host): Http2Implementation {
  return {
    connect: (authority, options) => createDirectHttp2Client(host, authority, options),
    createServer: (secure, options, handler, onError) =>
      createDirectHttp2Server(host, secure, options, handler, onError),
  };
}
