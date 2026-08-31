import { describe, expect, test } from "vitest";

import { createCluster } from "../../../../../../src/wasi/0.2.x/node/24.x.x/cluster/core.js";
import * as nodeHost from "../../../../../../src/wasi/0.2.x/node/24.x.x/cluster-host-node.js";
import { Worker } from "../../../../../../src/wasi/0.2.x/node/24.x.x/cluster/worker.js";

const cluster = createCluster(nodeHost);

/**
 * Support Node has and this adapter does not.
 *
 * These use `test.fails`, so each fails if the body *succeeds*. The gap is recorded as an
 * executable expectation: when support lands the test turns red and has to be rewritten into a
 * real assertion rather than being quietly forgotten.
 */
describe("known gaps against Node's cluster", () => {
  test.fails("worker.process is unavailable, so pid cannot be read", () => {
    const worker = new Worker(nodeHost, {
      id: 1,
      state: "online",
      exitedAfterDisconnect: false,
      connected: true,
      dead: false,
    });
    expect(typeof (worker.process as { pid: number }).pid).toBe("number");
  });

  test.fails("no 'listening' event: cluster distributes Node net handles, guest servers are wasi:sockets", () => {
    const seen: string[] = [];
    cluster.on("listening", () => seen.push("listening"));
    cluster.pump();
    cluster.removeAllListeners("listening");
    expect(seen).toEqual(["listening"]);
  });

  test.fails("host events are not delivered on the event loop without an interaction", async () => {
    const seen: string[] = [];
    cluster.on("disconnect", () => seen.push("disconnect"));
    // In Node this would arrive on the event loop; here it waits for the next drain.
    await Promise.resolve();
    cluster.removeAllListeners("disconnect");
    expect(seen).toEqual(["disconnect"]);
  });

  test.fails("SCHED_RR is accepted but never distributes a guest connection", () => {
    cluster.schedulingPolicy = cluster.SCHED_RR;
    const distributed = (cluster as unknown as { connectionsDistributed?: number })
      .connectionsDistributed;
    expect(distributed).toBe(0);
  });
});
