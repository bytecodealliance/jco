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
    this.options = { ...options };
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
    if (options.socketPath) {
      return `${options.socketPath}:`;
    }
    const host = options.host ?? "localhost";
    const port = options.port ?? this.defaultPort;
    const localAddress = options.localAddress ?? "";
    const family = options.family === 4 || options.family === 6 ? `:${options.family}` : "";
    return `${host}:${port}:${localAddress}${family}`;
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
