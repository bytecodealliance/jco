/**
 * Preview 2-backed `net.BoundSocket`.
 *
 * Adapted from nodejs/node v24.19.0, commit
 * cdc1b38d40cb567b7ad0b39c86addf830a0af0ae, lib/net.js `BoundSocket` (MIT
 * license). The libuv handle is a WASI TCP resource and `fd()` returns `-1` because components do
 * not receive an operating-system descriptor.
 */

import {
  bind,
  closeTransport,
  dispose,
  type BoundTcpSocket,
  type NodeTcpAddress,
  type WasiSocketsProvider,
} from "../internal/wasi-sockets.js";
import { invalidArgType, invalidArgValue, socketHandleAdopted, unsupported } from "./errors.js";
import { isIP } from "./ip.js";
import { validatePort } from "./socket-address.js";

export interface BoundSocketOptions {
  port?: number | string;
  host?: string | null;
  ipv6Only?: boolean;
  reusePort?: boolean;
}

export const consumeBoundSocket = Symbol("consumeBoundSocket");

export class BoundSocketBase {
  #bound: BoundTcpSocket | undefined;

  constructor(provider: WasiSocketsProvider, options: BoundSocketOptions = {}) {
    if (typeof options !== "object" || options === null) {
      throw invalidArgType("options", "Object", options);
    }
    if (options.ipv6Only !== undefined && typeof options.ipv6Only !== "boolean") {
      throw invalidArgType("options.ipv6Only", "boolean", options.ipv6Only);
    }
    if (options.reusePort !== undefined && typeof options.reusePort !== "boolean") {
      throw invalidArgType("options.reusePort", "boolean", options.reusePort);
    }
    if (options.ipv6Only || options.reusePort) {
      unsupported(
        "net.BoundSocket ipv6Only/reusePort",
        "wasi:sockets Preview 2 does not expose these bind flags",
      );
    }
    const host = options.host ?? (options.ipv6Only ? "::" : "0.0.0.0");
    if (typeof host !== "string") {
      throw invalidArgType("options.host", "string", host);
    }
    if (isIP(host) === 0) {
      throw invalidArgValue(
        "options.host",
        host,
        "must be a numeric IP address; net.BoundSocket does not perform DNS resolution",
      );
    }
    this.#bound = bind(provider, host, validatePort(options.port ?? 0));
  }

  address(): NodeTcpAddress {
    return { ...this.#get().address };
  }

  fd(): number {
    this.#get();
    return -1;
  }

  close(): void {
    const bound = this.#get();
    dispose(bound.socket);
    dispose(bound.network);
    this.#bound = undefined;
  }

  [Symbol.dispose](): void {
    if (this.#bound) {
      closeTransport(this.#bound.socket);
      dispose(this.#bound.network);
      this.#bound = undefined;
    }
  }

  [consumeBoundSocket](): BoundTcpSocket {
    const bound = this.#get();
    this.#bound = undefined;
    return bound;
  }

  #get(): BoundTcpSocket {
    if (!this.#bound) {
      throw socketHandleAdopted();
    }
    return this.#bound;
  }
}

export interface BoundSocketConstructor {
  new (options?: BoundSocketOptions): BoundSocketBase;
  readonly prototype: BoundSocketBase;
}

export function createBoundSocketConstructor(
  provider: WasiSocketsProvider,
): BoundSocketConstructor {
  return class BoundSocket extends BoundSocketBase {
    constructor(options?: BoundSocketOptions) {
      super(provider, options);
    }
  };
}
