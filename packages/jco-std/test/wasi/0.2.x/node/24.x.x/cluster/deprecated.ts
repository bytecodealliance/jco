import { describe, expect, test } from "vitest";
import {
  createCluster,
  DEPRECATED_CODE,
} from "../../../../../../src/wasi/0.2.x/node/24.x.x/cluster/index.js";
import { FakeClusterHost } from "../helpers/cluster.js";

/** Node deprecates these; Jco keeps the entry point and throws rather than implementing them. */
describe("deprecated cluster APIs", () => {
  test("cluster.isMaster throws and points at isPrimary", () => {
    const cluster = createCluster(new FakeClusterHost());
    expect(() => cluster.isMaster).toThrowError(/cluster.isPrimary/);
  });

  test("cluster.setupMaster throws and points at setupPrimary", () => {
    const cluster = createCluster(new FakeClusterHost());
    expect(() => cluster.setupMaster()).toThrowError(/cluster.setupPrimary/);
  });

  test("both carry the deprecated error code", () => {
    const cluster = createCluster(new FakeClusterHost());
    for (const read of [() => cluster.isMaster, () => cluster.setupMaster()]) {
      try {
        read();
        expect.unreachable("expected a deprecation error");
      } catch (error) {
        expect((error as { code: string }).code).toBe(DEPRECATED_CODE);
      }
    }
  });

  test("setupMaster touches nothing before throwing", () => {
    const host = new FakeClusterHost();
    const cluster = createCluster(host);
    let touched = false;
    const settings = {
      get silent() {
        touched = true;
        return true;
      },
    };
    expect(() => cluster.setupMaster(settings as never)).toThrow();
    expect(touched, "argument getter must not run").toBe(false);
    expect(host.calls, "host must not be consulted").toEqual([]);
  });
});
