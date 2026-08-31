import { vi } from "vitest";

import { createDns } from "../../../../../../../src/wasi/0.2.x/node/24.x.x/dns/core.js";
import type {
  DnsRequest,
  DnsResponse,
} from "../../../../../../../src/wasi/0.2.x/node/24.x.x/dns/types.js";

export function fakeDns() {
  const query = vi.fn((source: string): string => {
    const request = JSON.parse(source) as DnsRequest;
    let value: unknown;
    switch (request.operation) {
      case "getServers":
        value = ["192.0.2.53"];
        break;
      case "validateServers":
        value = request.args[0];
        break;
      case "lookup": {
        const options = request.args[1] as { all: boolean; family: number };
        const address = options.family === 6 ? "2001:db8::1" : "192.0.2.1";
        value = options.all
          ? [{ address, family: options.family || 4 }]
          : { address, family: options.family || 4 };
        break;
      }
      case "lookupService":
        value = { hostname: "localhost", service: "http" };
        break;
      case "resolve4":
        value = request.args[1]?.ttl ? [{ address: "192.0.2.1", ttl: 60 }] : ["192.0.2.1"];
        break;
      case "resolve6":
        value = ["2001:db8::1"];
        break;
      case "resolveMx":
        value = [{ exchange: "mail.example", priority: 10 }];
        break;
      case "reverse":
        value = ["example.test"];
        break;
      default:
        value = [];
    }
    const response: DnsResponse = { ok: true, value };
    return JSON.stringify(response);
  });
  return { query, modules: createDns({ query }) };
}
