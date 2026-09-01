import { vi } from "vitest";

import { createDns } from "../../../../../../../src/wasi/0.2.x/node/24.x.x/dns/core.js";
import type {
  DnsHost,
  DnsResult,
} from "../../../../../../../src/wasi/0.2.x/node/24.x.x/dns/types.js";

function ok<T>(val: T): DnsResult<T> {
  return { tag: "ok", val };
}

export function fakeDns() {
  const host = {
    getServers: vi.fn(() => ok(["192.0.2.53"])),
    validateServers: vi.fn((servers: string[]) => ok(servers)),
    lookup: vi.fn((_hostname, options) =>
      ok([
        {
          address: options.family === "ipv6" ? "2001:db8::1" : "192.0.2.1",
          family: options.family === "unspecified" ? "ipv4" : options.family,
        },
      ]),
    ),
    lookupService: vi.fn(() => ok({ hostname: "localhost", service: "http" })),
    resolve4: vi.fn((_hostname, ttl) => ok([{ address: "192.0.2.1", ttl: ttl ? 60 : 0 }])),
    resolve6: vi.fn(() => ok([{ address: "2001:db8::1", ttl: 0 }])),
    resolveAny: vi.fn(() => ok([])),
    resolveCaa: vi.fn(() => ok([])),
    resolveCname: vi.fn(() => ok([])),
    resolveMx: vi.fn(() => ok([{ exchange: "mail.example", priority: 10 }])),
    resolveNaptr: vi.fn(() => ok([])),
    resolveNs: vi.fn(() => ok([])),
    resolvePtr: vi.fn(() => ok([])),
    resolveSoa: vi.fn(() =>
      ok({
        nsname: "ns.example",
        hostmaster: "hostmaster.example",
        serial: 1,
        refresh: 2,
        retry: 3,
        expire: 4,
        minttl: 5,
      }),
    ),
    resolveSrv: vi.fn(() => ok([])),
    resolveTlsa: vi.fn(() => ok([])),
    resolveTxt: vi.fn(() => ok([])),
    reverse: vi.fn(() => ok(["example.test"])),
  } satisfies DnsHost;

  return { host, modules: createDns(host) };
}
