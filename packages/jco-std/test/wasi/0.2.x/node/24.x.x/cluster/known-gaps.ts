import { describe, expect, test } from "vitest";
import { createCluster } from "../../../../../../src/wasi/0.2.x/node/24.x.x/cluster/core.js";
import { FakeClusterHost } from "../helpers/cluster.js";

/**
 * Support Node has and this adapter does not.
 *
 * These use `test.fails`, so each one fails if the body *succeeds*. That way the gap is recorded
 * as an executable expectation: when support lands, the test turns red and has to be rewritten
 * into a real assertion rather than being quietly forgotten.
 */
describe("known gaps against Node's cluster", () => {
  test.fails("does not emit 'listening' when a worker binds a server", () => {
    const host = new FakeClusterHost();
    const cluster = createCluster(host);
    const worker = cluster.fork();
    const seen: string[] = [];
    cluster.on("listening", () => seen.push("listening"));

    // Node emits 'listening' once the worker binds. Cluster distributes Node net handles and
    // guest servers are wasi:sockets, so nothing here can observe a bind.
    host.queue({ tag: "online", val: worker.id });
    cluster.pump();

    expect(seen).toEqual(["listening"]);
  });

  test.fails("does not expose the worker's address to 'listening' handlers", () => {
    const cluster = createCluster(new FakeClusterHost());
    const worker = cluster.fork();
    const addresses: unknown[] = [];
    worker.on("listening", (address) => addresses.push(address));
    cluster.pump();
    expect(addresses).toHaveLength(1);
  });

  test.fails("does not round-robin connections under SCHED_RR", () => {
    const host = new FakeClusterHost();
    const cluster = createCluster(host);
    cluster.schedulingPolicy = cluster.SCHED_RR;
    cluster.fork();
    cluster.fork();

    // SCHED_RR is accepted as a value, but no guest connection is ever distributed by it,
    // so there is nothing to count.
    const distributed = (cluster as unknown as { connectionsDistributed?: number })
      .connectionsDistributed;
    expect(distributed).toBe(0);
  });

  test.fails("worker.process is unavailable, so pid cannot be read", () => {
    const cluster = createCluster(new FakeClusterHost());
    const worker = cluster.fork();
    expect(typeof (worker.process as { pid: number }).pid).toBe("number");
  });

  test.fails("events are not delivered on the event loop without an interaction", async () => {
    const host = new FakeClusterHost();
    const cluster = createCluster(host);
    const worker = cluster.fork();
    const seen: string[] = [];
    cluster.on("disconnect", () => seen.push("disconnect"));

    host.queue({ tag: "disconnect", val: worker.id });
    await Promise.resolve();

    // In Node this would have been delivered by now; here it waits for the next interaction.
    expect(seen).toEqual(["disconnect"]);
  });
});
