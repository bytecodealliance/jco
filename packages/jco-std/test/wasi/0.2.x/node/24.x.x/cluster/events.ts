import { describe, expect, test } from "vitest";
import { createCluster } from "../../../../../../src/wasi/0.2.x/node/24.x.x/cluster/core.js";
import { FakeClusterHost } from "../helpers/cluster.js";

describe("cluster events", () => {
  test("re-emits host events on cluster and worker", () => {
    const host = new FakeClusterHost();
    const cluster = createCluster(host);
    const worker = cluster.fork();
    const seen: string[] = [];
    cluster.on("online", () => seen.push("cluster:online"));
    worker.on("online", () => seen.push("worker:online"));

    host.queue({ tag: "online", val: worker.id });
    cluster.pump();

    expect(seen).toEqual(["worker:online", "cluster:online"]);
  });

  test("decodes messages from JSON and reports them on both", () => {
    const host = new FakeClusterHost();
    const cluster = createCluster(host);
    const worker = cluster.fork();
    const onCluster: unknown[] = [];
    const onWorker: unknown[] = [];
    cluster.on("message", (_w, m) => onCluster.push(m));
    worker.on("message", (m) => onWorker.push(m));

    host.queue({ tag: "message", val: { id: worker.id, json: JSON.stringify({ ok: 1 }) } });
    cluster.pump();

    expect(onWorker).toEqual([{ ok: 1 }]);
    expect(onCluster).toEqual([{ ok: 1 }]);
  });

  test("exit reports code and signal, and untracks the worker", () => {
    const host = new FakeClusterHost();
    const cluster = createCluster(host);
    const worker = cluster.fork();
    const seen: unknown[][] = [];
    cluster.on("exit", (_w, code, signal) => seen.push([code, signal]));

    host.queue({ tag: "exit", val: { id: worker.id, code: 0, signal: "" } });
    cluster.pump();

    expect(seen).toEqual([[0, null]]);
    expect(cluster.workers[worker.id]).toBeUndefined();
  });

  test("a signalled exit reports the signal name", () => {
    const host = new FakeClusterHost();
    const cluster = createCluster(host);
    const worker = cluster.fork();
    const seen: unknown[][] = [];
    cluster.on("exit", (_w, code, signal) => seen.push([code, signal]));

    host.queue({ tag: "exit", val: { id: worker.id, code: 0, signal: "SIGTERM" } });
    cluster.pump();

    expect(seen).toEqual([[0, "SIGTERM"]]);
  });

  test("a worker keeps reporting its final state after exiting", () => {
    const host = new FakeClusterHost();
    const cluster = createCluster(host);
    const worker = cluster.fork();
    host.queue({ tag: "exit", val: { id: worker.id, code: 1, signal: "" } });
    host.workers.delete(worker.id);
    cluster.pump();

    expect(worker.isDead()).toBe(true);
    expect(worker.isConnected()).toBe(false);
    expect(worker.state).toBe("dead");
  });

  test("events queued by the host surface on the next interaction", () => {
    const host = new FakeClusterHost();
    const cluster = createCluster(host);
    const worker = cluster.fork();
    const seen: string[] = [];
    cluster.on("disconnect", () => seen.push("disconnect"));

    host.queue({ tag: "disconnect", val: worker.id });
    expect(seen, "not delivered until the guest interacts").toEqual([]);

    void cluster.workers;
    expect(seen).toEqual(["disconnect"]);
  });
});
