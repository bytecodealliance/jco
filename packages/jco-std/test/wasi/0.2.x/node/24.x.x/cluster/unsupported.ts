import { describe, expect, test } from "vitest";
import {
  createCluster,
  UNSUPPORTED_CODE,
} from "../../../../../../src/wasi/0.2.x/node/24.x.x/cluster/core.js";
import { FakeClusterHost } from "../helpers/cluster.js";

/**
 * Cluster behavior with no component equivalent. Each of these must fail loudly and say why --
 * a missing property or a silent no-op would surface far from the cause.
 */
describe("unsupported cluster behavior", () => {
  test("worker.process explains that a ChildProcess cannot cross the boundary", () => {
    const cluster = createCluster(new FakeClusterHost());
    const worker = cluster.fork();
    expect(() => worker.process).toThrowError(/ChildProcess/);
    try {
      void worker.process;
    } catch (error) {
      expect((error as { code: string }).code).toBe(UNSUPPORTED_CODE);
    }
  });

  test("setupPrimary rejects settings that configure the host runner", () => {
    const cluster = createCluster(new FakeClusterHost());
    for (const key of ["exec", "execArgv", "stdio", "uid", "gid", "inspectPort", "serialization"]) {
      expect(() => cluster.setupPrimary({ [key]: "x" } as never), key).toThrowError(/host runner/);
    }
  });

  test("setupPrimary rejects host-owned settings before touching the host", () => {
    const host = new FakeClusterHost();
    const cluster = createCluster(host);
    expect(() => cluster.setupPrimary({ exec: "worker.js" } as never)).toThrow();
    expect(host.calls).not.toContain("setSettings");
  });

  test("worker.send rejects values JSON cannot represent", () => {
    const cluster = createCluster(new FakeClusterHost());
    const worker = cluster.fork();
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => worker.send(cyclic)).toThrowError(/JSON/);
    expect(() => worker.send(() => undefined)).toThrowError(/JSON/);
  });

  test("the events meta-events are refused rather than silently ignored", () => {
    const cluster = createCluster(new FakeClusterHost());
    expect(() => cluster.on("newListener", () => undefined)).toThrowError(/meta-event/);
    expect(() => cluster.on("removeListener", () => undefined)).toThrowError(/meta-event/);
  });
});
