/**
 * Portable `net.SocketAddress`.
 *
 * Adapted from nodejs/node v24.19.0, commit
 * cdc1b38d40cb567b7ad0b39c86addf830a0af0ae, lib/internal/socketaddress.js (MIT license).
 * The native `block_list` address handle is replaced by immutable validated JavaScript state.
 */

import { codedError } from "../errors/core.js";
import { invalidAddress, invalidArgType, invalidArgValue, outOfRange } from "./errors.js";
import { parseIp, type IpFamily } from "./ip.js";

export type IPVersion = "ipv4" | "ipv6";

export interface SocketAddressInitOptions {
  address?: string;
  family?: IPVersion;
  port?: number;
  flowlabel?: number;
}

export interface SocketAddressJson {
  address: string;
  port: number;
  family: IPVersion;
  flowlabel: number;
}

export interface SocketAddressDetails {
  familyNumber: IpFamily;
  bytes: Uint8Array;
}

const details = new WeakMap<SocketAddress, SocketAddressDetails>();

function validatePort(value: unknown, name = "options.port"): number {
  if (typeof value !== "number" && typeof value !== "string") {
    throw invalidArgType(name, ["number", "string"], value);
  }
  const port = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (typeof port !== "number" || !Number.isInteger(port) || port < 0 || port > 65_535) {
    throw codedError(
      new RangeError(`${name} should be >= 0 and < 65536. Received ${String(value)}.`),
      "ERR_SOCKET_BAD_PORT",
    );
  }
  return port;
}

export class SocketAddress {
  readonly #address: string;
  readonly #family: IPVersion;
  readonly #port: number;
  readonly #flowlabel: number;

  static isSocketAddress(value: unknown): value is SocketAddress {
    return value instanceof SocketAddress;
  }

  static parse(input: string): SocketAddress | undefined {
    if (typeof input !== "string") {
      throw invalidArgType("input", "string", input);
    }
    try {
      const url = new URL(`http://${input}`);
      const bracketed = url.hostname.startsWith("[") && url.hostname.endsWith("]");
      return new SocketAddress({
        address: bracketed ? url.hostname.slice(1, -1) : url.hostname,
        family: bracketed ? "ipv6" : "ipv4",
        port: url.port === "" ? 0 : Number(url.port),
      });
    } catch {
      return undefined;
    }
  }

  constructor(options: SocketAddressInitOptions = {}) {
    if (typeof options !== "object" || options === null) {
      throw invalidArgType("options", "Object", options);
    }
    const rawFamily: unknown = options.family ?? "ipv4";
    if (typeof rawFamily !== "string") {
      throw invalidArgValue("options.family", rawFamily);
    }
    const family = rawFamily.toLowerCase();
    if (family !== "ipv4" && family !== "ipv6") {
      throw invalidArgValue("options.family", options.family);
    }
    const address = options.address ?? (family === "ipv4" ? "127.0.0.1" : "::");
    if (typeof address !== "string") {
      throw invalidArgType("options.address", "string", address);
    }
    const parsed = parseIp(address, family);
    if (!parsed) {
      throw invalidAddress();
    }
    const port = validatePort(options.port ?? 0);
    const flowlabel = family === "ipv4" ? 0 : (options.flowlabel ?? 0);
    if (typeof flowlabel !== "number") {
      throw invalidArgType("options.flowlabel", "number", flowlabel);
    }
    if (!Number.isInteger(flowlabel) || flowlabel < 0 || flowlabel > 0x000f_ffff) {
      throw outOfRange("options.flowlabel", ">= 0 and <= 1048575", flowlabel);
    }
    this.#address = parsed.canonical;
    this.#family = family;
    this.#port = port;
    this.#flowlabel = flowlabel;
    details.set(this, { familyNumber: parsed.family, bytes: parsed.bytes });
  }

  get address(): string {
    return this.#address;
  }

  get family(): IPVersion {
    return this.#family;
  }

  get port(): number {
    return this.#port;
  }

  get flowlabel(): number {
    return this.#flowlabel;
  }

  toJSON(): SocketAddressJson {
    return {
      address: this.address,
      port: this.port,
      family: this.family,
      flowlabel: this.flowlabel,
    };
  }
}

export function socketAddressDetails(value: SocketAddress): SocketAddressDetails {
  return details.get(value)!;
}

export { validatePort };
