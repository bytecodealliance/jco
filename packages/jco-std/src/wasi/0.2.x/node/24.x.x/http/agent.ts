/**
 * Inert Agent for the portable node:http shim.
 *
 * The operation mapping follows nodejs/node v24.19.0, commit
 * cdc1b38d40cb567b7ad0b39c86addf830a0af0ae, lib/_http_agent.js (MIT license).
 * Option defaults and getName() are kept for compatibility; socket pooling is
 * owned by the selected implementation.
 */

import { EventEmitter } from "../internal/event-emitter.js";
import { unsupported } from "./errors.js";

export interface AgentOptions {
  keepAlive?: boolean;
  keepAliveMsecs?: number;
  maxSockets?: number;
  maxFreeSockets?: number;
  maxTotalSockets?: number;
  scheduling?: "fifo" | "lifo";
  timeout?: number;
  defaultPort?: number;
  protocol?: string;
  noDelay?: boolean;
  [name: string]: unknown;
}

export interface AgentNameOptions {
  host?: string;
  port?: number | string;
  localAddress?: string;
  family?: number;
  socketPath?: string;
}

export class Agent extends EventEmitter {
  readonly options: AgentOptions;
  readonly defaultPort: number;
  readonly protocol: string;
  readonly requests: Record<string, unknown[]> = Object.create(null) as Record<string, unknown[]>;
  readonly sockets: Record<string, unknown[]> = Object.create(null) as Record<string, unknown[]>;
  readonly freeSockets: Record<string, unknown[]> = Object.create(null) as Record<
    string,
    unknown[]
  >;
  keepAlive: boolean;
  keepAliveMsecs: number;
  maxSockets: number;
  maxFreeSockets: number;
  maxTotalSockets: number;
  scheduling: "fifo" | "lifo";

  constructor(options: AgentOptions = {}) {
    super();
    // lib/_http_agent.js normalises two fields into `agent.options` itself: `noDelay`
    // defaults to true, and `path` is forced to null so net does not read the bag as a
    // pipe target. Both are observable through `agent.options`.
    this.options = { ...options, noDelay: options.noDelay ?? true, path: null };
    this.defaultPort = options.defaultPort ?? 80;
    this.protocol = options.protocol ?? "http:";
    this.keepAlive = options.keepAlive ?? false;
    this.keepAliveMsecs = options.keepAliveMsecs ?? 1_000;
    this.maxSockets = options.maxSockets ?? Number.POSITIVE_INFINITY;
    this.maxFreeSockets = options.maxFreeSockets ?? 256;
    this.maxTotalSockets = options.maxTotalSockets ?? Number.POSITIVE_INFINITY;
    this.scheduling = options.scheduling ?? "lifo";
  }

  createConnection(..._args: unknown[]): never {
    return unsupported(
      "http.Agent.createConnection",
      "the selected implementation owns connections",
    );
  }

  getName(options: AgentNameOptions = {}): string {
    // Field order and the conditional separators follow lib/_http_agent.js at the pinned
    // commit: an absent port contributes an empty field rather than `defaultPort`, and
    // `family` and `socketPath` are appended only when set, so the name is variable-length.
    let name = options.host || "localhost";
    name += ":";
    if (options.port) {
      name += options.port;
    }
    name += ":";
    if (options.localAddress) {
      name += options.localAddress;
    }
    if (options.family === 4 || options.family === 6) {
      name += `:${options.family}`;
    }
    if (options.socketPath) {
      name += `:${options.socketPath}`;
    }
    return name;
  }

  keepSocketAlive(_socket: unknown): boolean {
    return false;
  }

  reuseSocket(_socket: unknown, _request: unknown): void {}

  destroy(): void {
    for (const collection of [this.requests, this.sockets, this.freeSockets]) {
      for (const key of Object.keys(collection)) {
        delete collection[key];
      }
    }
  }
}

export const globalAgent = new Agent({ keepAlive: true, scheduling: "lifo", timeout: 5_000 });
