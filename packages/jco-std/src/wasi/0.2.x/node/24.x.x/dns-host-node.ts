import { Buffer } from "node:buffer";
import dns from "node:dns";
import dnsPromises from "node:dns/promises";

import type { DnsErrorData, DnsRequest, DnsResponse } from "./dns/types.js";

const ALLOWED_OPERATIONS = new Set([
  "lookup",
  "lookupService",
  "resolve4",
  "resolve6",
  "resolveAny",
  "resolveCaa",
  "resolveCname",
  "resolveMx",
  "resolveNaptr",
  "resolveNs",
  "resolvePtr",
  "resolveSoa",
  "resolveSrv",
  "resolveTlsa",
  "resolveTxt",
  "reverse",
]);

type DnsOperation = (...args: never[]) => Promise<unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function serializeError(error: unknown): DnsErrorData {
  if (!isRecord(error)) {
    return { name: "Error", message: String(error) };
  }
  return {
    name: typeof error.name === "string" ? error.name : "Error",
    message: typeof error.message === "string" ? error.message : String(error),
    code: typeof error.code === "string" ? error.code : undefined,
    errno:
      typeof error.errno === "string" || typeof error.errno === "number" ? error.errno : undefined,
    syscall: typeof error.syscall === "string" ? error.syscall : undefined,
    hostname: typeof error.hostname === "string" ? error.hostname : undefined,
  };
}

function replacer(_key: string, value: unknown): unknown {
  return value instanceof ArrayBuffer
    ? { __jcoDnsArrayBuffer: Buffer.from(value).toString("base64") }
    : value;
}

function unsupported(operation: string): Error {
  return Object.assign(new Error(`Unsupported DNS operation: ${operation}`), {
    code: "ERR_JCO_UNSUPPORTED_NODE_API",
  });
}

/**
 * Opt-in provider that delegates to Node's real `node:dns` implementation.
 * Jco lowers this promise-returning host function as a synchronous Preview 2
 * WIT import with JSPI, so Node's event loop remains free while DNS completes.
 */
export async function query(requestJson: string): Promise<string> {
  let response: DnsResponse;
  try {
    const request = JSON.parse(requestJson) as DnsRequest;
    if (request.operation === "getServers") {
      response = { ok: true, value: dns.getServers() };
    } else if (request.operation === "validateServers") {
      const resolver = new dns.Resolver();
      resolver.setServers(request.args[0] as string[]);
      response = { ok: true, value: resolver.getServers() };
    } else {
      if (!ALLOWED_OPERATIONS.has(request.operation)) {
        throw unsupported(request.operation);
      }
      let target: object = dnsPromises;
      if (request.resolver) {
        const resolver = new dnsPromises.Resolver(request.resolver.options);
        if (request.resolver.servers) {
          resolver.setServers(request.resolver.servers);
        }
        if (request.resolver.localAddress) {
          resolver.setLocalAddress(...request.resolver.localAddress);
        }
        target = resolver;
      }
      if (request.operation === "lookup" && isRecord(request.args[1])) {
        const options = request.args[1];
        const guestHints = typeof options.hints === "number" ? options.hints : 0;
        let hints = 0;
        if (guestHints & 32) {
          hints |= dns.ADDRCONFIG;
        }
        if (guestHints & 16) {
          hints |= dns.ALL;
        }
        if (guestHints & 8) {
          hints |= dns.V4MAPPED;
        }
        request.args[1] = { ...options, hints };
      }
      const operation = (target as Record<string, unknown>)[request.operation];
      if (typeof operation !== "function") {
        throw unsupported(request.operation);
      }
      response = {
        ok: true,
        value: await (operation as DnsOperation).apply(target, request.args as never[]),
      };
    }
  } catch (error) {
    response = { ok: false, error: serializeError(error) };
  }
  return JSON.stringify(response, replacer);
}

export default { query };
