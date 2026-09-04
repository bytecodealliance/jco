/**
 * Module factory for the portable node:https shim.
 *
 * The export set follows nodejs/node v24.19.0, commit
 * cdc1b38d40cb567b7ad0b39c86addf830a0af0ae, lib/https.js (MIT license): `lib/https.js` reuses
 * `_http_client` and `_http_server` unchanged and varies only the protocol, the default port,
 * and the default agent, so this module reuses the node:http core through a profile rather
 * than forking it.
 *
 * Deliberately absent, matching the upstream module's own export list: nothing here is
 * deprecated at the pinned release, and the CONNECT proxy tunnelling added in Node 24
 * (`getTunnelConfigForProxiedHttps`, `establishTunnel`, `ERR_PROXY_TUNNEL`) needs a raw
 * socket, so a proxied agent refuses through `Agent.createConnection` rather than silently
 * making a direct connection.
 */

import type { ClientRequestBase, RequestInput, ResponseListener } from "../http/client-request.js";
import { createProtocolModule, type ProtocolModule } from "../http/core.js";
import type {
  RequestListener,
  ServerBase,
  ServerConstructor,
  ServerOptions,
} from "../http/server.js";
import type { HttpImplementation, HttpRequestOptions } from "../http/types.js";
import { Agent, globalAgent, HTTPS_PROFILE } from "./agent.js";

export interface NodeHttpsModule {
  Agent: typeof Agent;
  Server: ServerConstructor;
  createServer: (
    optionsOrListener?: ServerOptions | RequestListener,
    listener?: RequestListener,
  ) => ServerBase;
  get: (
    input: RequestInput,
    options?: HttpRequestOptions | ResponseListener,
    callback?: ResponseListener,
  ) => ClientRequestBase;
  globalAgent: Agent;
  request: (
    input: RequestInput,
    options?: HttpRequestOptions | ResponseListener,
    callback?: ResponseListener,
  ) => ClientRequestBase;
}

export function createHttps(implementation: HttpImplementation): NodeHttpsModule {
  const protocol: ProtocolModule = createProtocolModule(implementation, HTTPS_PROFILE);
  return {
    Agent,
    Server: protocol.Server,
    createServer: protocol.createServer,
    get: protocol.get,
    globalAgent,
    request: protocol.request,
  };
}
