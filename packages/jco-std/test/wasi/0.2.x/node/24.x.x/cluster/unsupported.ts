import { describe, expect, test } from "vitest";

import { createCluster } from "../../../../../../src/wasi/0.2.x/node/24.x.x/cluster/core.js";
import * as nodeHost from "../../../../../../src/wasi/0.2.x/node/24.x.x/cluster-host-node.js";

const cluster = createCluster(nodeHost);

/**
 * Cluster behavior with no component equivalent. Each must fail loudly and say why -- a missing
 * property or a silent no-op would surface far from the cause.
 */
describe("unsupported cluster behavior", () => {
  test.concurrent("setupPrimary rejects settings that configure the host runner", () => {
    for (const key of ["exec", "execArgv", "stdio", "uid", "gid", "inspectPort", "serialization"]) {
      expect(() => cluster.setupPrimary({ [key]: "x" } as never), key).toThrowError(/host runner/);
    }
  });

  test.concurrent("rejecting those settings leaves the running cluster untouched", async () => {
    const nodeCluster = await import("node:cluster");
    const before = nodeCluster.default.settings.exec;
    expect(() => cluster.setupPrimary({ exec: "other.js" } as never)).toThrow();
    expect(nodeCluster.default.settings.exec).toBe(before);
  });

  test.concurrent("the events meta-events are refused rather than silently ignored", () => {
    expect(() => cluster.on("newListener", () => undefined)).toThrowError(/meta-event/);
    expect(() => cluster.on("removeListener", () => undefined)).toThrowError(/meta-event/);
  });
});
