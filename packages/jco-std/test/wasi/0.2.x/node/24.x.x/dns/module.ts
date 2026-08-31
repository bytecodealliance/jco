import nodeDns from "node:dns";
import { describe, expect, test } from "vitest";

import * as constants from "../../../../../../src/wasi/0.2.x/node/24.x.x/dns/core.js";
import { fakeDns } from "./helpers/index.js";

describe("node:dns module contract", () => {
  test("matches Node 24 DNS constants", () => {
    for (const key of [
      "ADDRCONFIG",
      "ALL",
      "V4MAPPED",
      "NODATA",
      "FORMERR",
      "SERVFAIL",
      "NOTFOUND",
      "NOTIMP",
      "REFUSED",
      "BADQUERY",
      "BADNAME",
      "BADFAMILY",
      "BADRESP",
      "CONNREFUSED",
      "TIMEOUT",
      "EOF",
      "FILE",
      "NOMEM",
      "DESTRUCTION",
      "BADSTR",
      "BADFLAGS",
      "NONAME",
      "BADHINTS",
      "NOTINITIALIZED",
      "LOADIPHLPAPI",
      "ADDRGETNETWORKPARAMS",
      "CANCELLED",
    ] as const) {
      expect(constants[key]).toBe(nodeDns[key]);
    }
  });

  test("shares state between callback and promise facades", () => {
    const { modules } = fakeDns();
    modules.callback.setDefaultResultOrder("ipv6first");
    expect(modules.promises.getDefaultResultOrder()).toBe("ipv6first");
    expect(modules.callback.Resolver.name).toBe("Resolver");
    expect(modules.promises.Resolver.name).toBe("Resolver");
  });
});
