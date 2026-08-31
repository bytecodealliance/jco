import { describe, expect, test } from "vitest";

import { createCluster } from "../../../../../../src/wasi/0.2.x/node/24.x.x/cluster/core.js";
import * as nodeHost from "../../../../../../src/wasi/0.2.x/node/24.x.x/cluster-host-node.js";

const cluster = createCluster(nodeHost);

/** Node deprecates these; Jco keeps the entry point and throws rather than implementing them. */
describe("deprecated cluster APIs", () => {
  test("cluster.isMaster throws and points at isPrimary", () => {
    expect(() => cluster.isMaster).toThrowError(/cluster.isPrimary/);
    expect(() => cluster.isMaster).toThrow(
      expect.objectContaining({ code: "ERR_JCO_UNSUPPORTED_DEPRECATED_NODE_API" }),
    );
  });

  test("cluster.setupMaster throws and points at setupPrimary", () => {
    expect(() => cluster.setupMaster()).toThrowError(/cluster.setupPrimary/);
    expect(() => cluster.setupMaster()).toThrow(
      expect.objectContaining({ code: "ERR_JCO_UNSUPPORTED_DEPRECATED_NODE_API" }),
    );
  });

  test("setupMaster touches nothing before throwing", async () => {
    const nodeCluster = await import("node:cluster");
    const before = nodeCluster.default.settings.silent;
    let touched = false;
    const settings = {
      get silent() {
        touched = true;
        return true;
      },
    };
    expect(() => cluster.setupMaster(settings as never)).toThrow();
    expect(touched, "argument getter must not run").toBe(false);
    expect(nodeCluster.default.settings.silent, "host settings must be untouched").toBe(before);
  });
});
