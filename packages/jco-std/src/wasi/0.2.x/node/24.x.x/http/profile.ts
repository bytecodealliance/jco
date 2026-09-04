/**
 * Protocol profile shared by the node:http and node:https shims.
 *
 * `node:https` is `lib/_http_client.js` and `lib/_http_server.js` driven with a different
 * protocol, default port, and global agent (nodejs/node v24.19.0, commit
 * cdc1b38d40cb567b7ad0b39c86addf830a0af0ae, lib/https.js). Rather than fork those modules,
 * every protocol-dependent constant is collected here and threaded through the shared core.
 */

import { Agent, globalAgent } from "./agent.js";

export interface ProtocolProfile {
  /** Module name used in error labels, e.g. `https.Server`. */
  readonly module: "http" | "https";
  /** `options.protocol` this module accepts; anything else is `ERR_INVALID_PROTOCOL`. */
  readonly protocol: "http:" | "https:";
  /** URI scheme handed to the selected implementation. */
  readonly scheme: "http" | "https";
  /** Port assumed when neither the options nor an explicit agent supply one. */
  readonly defaultPort: number;
  /** Agent used when `options.agent` is absent, matching Node's `_defaultAgent`. */
  readonly globalAgent: Agent;
}

export const HTTP_PROFILE: ProtocolProfile = {
  module: "http",
  protocol: "http:",
  scheme: "http",
  defaultPort: 80,
  globalAgent,
};
