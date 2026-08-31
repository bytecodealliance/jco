import { describe, expect, test } from "vitest";
import {
  createCluster,
  SCHED_NONE,
  SCHED_RR,
  Worker,
} from "../../../../../../src/wasi/0.2.x/node/24.x.x/cluster/core.js";
import { FakeClusterHost } from "../helpers/cluster.js";

describe("cluster module contract", () => {
  test("exposes Node's primary-side surface", () => {
    const cluster = createCluster(new FakeClusterHost());
    for (const key of [
      "SCHED_NONE",
      "SCHED_RR",
      "Worker",
      "isPrimary",
      "isWorker",
      "workers",
      "settings",
      "schedulingPolicy",
    ]) {
      expect(cluster, key).toHaveProperty(key);
    }
    for (const method of ["fork", "disconnect", "setupPrimary", "setupMaster"]) {
      expect(typeof (cluster as unknown as Record<string, unknown>)[method], method).toBe(
        "function",
      );
    }
  });

  test("matches Node's scheduling constants", () => {
    expect(SCHED_NONE).toBe(1);
    expect(SCHED_RR).toBe(2);
  });

  test("is an event emitter", () => {
    const cluster = createCluster(new FakeClusterHost());
    const seen: unknown[] = [];
    cluster.on("custom", (v) => seen.push(v));
    expect(cluster.emit("custom", 42)).toBe(true);
    expect(seen).toEqual([42]);
  });

  test("reports role from the host", () => {
    const host = new FakeClusterHost();
    const cluster = createCluster(host);
    expect(cluster.isPrimary).toBe(true);
    expect(cluster.isWorker).toBe(false);
    host.primary = false;
    expect(cluster.isPrimary).toBe(false);
    expect(cluster.isWorker).toBe(true);
  });

  test("touches the host only when an API is used", () => {
    const host = new FakeClusterHost();
    createCluster(host);
    expect(host.calls).toEqual([]);
  });

  test("exports the Worker class", () => {
    expect(typeof Worker).toBe("function");
  });
});
