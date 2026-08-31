import { describe, expect, test } from "vitest";

import * as nodeHost from "../../../../../../src/wasi/0.2.x/node/24.x.x/cluster-host-node.js";
import { Worker } from "../../../../../../src/wasi/0.2.x/node/24.x.x/cluster/worker.js";
import type { WorkerInfo } from "../../../../../../src/wasi/0.2.x/node/24.x.x/cluster/types.js";

// A worker snapshot of the shape the Node host reports. Constructing one directly keeps these
// tests off cluster.fork(), which would re-execute the test runner.
const snapshot: WorkerInfo = {
  id: 4242,
  state: "online",
  exitedAfterDisconnect: false,
  connected: true,
  dead: false,
};

describe("cluster.Worker against the Node host", () => {
  test("exposes the id the host reported", () => {
    expect(new Worker(nodeHost, snapshot).id).toBe(4242);
  });

  test("falls back to the last snapshot when the host no longer knows the worker", () => {
    // The Node host cannot answer for an id it never forked, which is what a worker sees after
    // it exits; the last known state has to remain readable.
    const worker = new Worker(nodeHost, snapshot);
    expect(worker.state).toBe("online");
    expect(worker.isConnected()).toBe(true);
    expect(worker.isDead()).toBe(false);
  });

  test("worker.process explains that a ChildProcess cannot cross the boundary", () => {
    const worker = new Worker(nodeHost, snapshot);
    expect(() => worker.process).toThrow(
      expect.objectContaining({ code: "ERR_JCO_UNSUPPORTED_NODE_API" }),
    );
    expect(() => worker.process).toThrowError(/ChildProcess/);
  });

  test("send rejects values JSON cannot represent, before reaching the host", () => {
    const worker = new Worker(nodeHost, snapshot);
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => worker.send(cyclic)).toThrowError(/JSON/);
    expect(() => worker.send(() => undefined)).toThrowError(/JSON/);
  });

  test("operations on a worker the host does not know fail loudly", () => {
    const worker = new Worker(nodeHost, snapshot);
    expect(() => worker.send({ ok: true })).toThrow();
    expect(() => worker.disconnect()).toThrow();
    expect(() => worker.kill()).toThrow();
  });
});
