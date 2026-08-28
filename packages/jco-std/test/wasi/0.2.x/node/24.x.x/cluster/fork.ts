import { describe, expect, test } from "vitest";
import { createCluster } from "../../../../../../src/wasi/0.2.x/node/24.x.x/cluster/index.js";
import { FakeClusterHost } from "../helpers/cluster.js";

describe("cluster.fork", () => {
  test("forks through the host and tracks the worker", () => {
    const host = new FakeClusterHost();
    const cluster = createCluster(host);
    const worker = cluster.fork();
    expect(worker.id).toBe(1);
    expect(cluster.workers[1]).toBe(worker);
  });

  test("passes env entries to the host", () => {
    const host = new FakeClusterHost();
    createCluster(host).fork({ ROLE: "api" });
    expect(host.calls).toContain('fork([["ROLE","api"]])');
  });

  test("emits 'fork' with the worker", () => {
    const cluster = createCluster(new FakeClusterHost());
    const seen: number[] = [];
    cluster.on("fork", (w) => seen.push((w as { id: number }).id));
    cluster.fork();
    expect(seen).toEqual([1]);
  });

  test("returns the same Worker for an id already tracked", () => {
    const cluster = createCluster(new FakeClusterHost());
    const first = cluster.fork();
    expect(cluster.workers[first.id]).toBe(first);
  });
});
