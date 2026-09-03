import nodeCluster from "node:cluster";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

import * as nodeHost from "../../../../../../src/wasi/0.2.x/node/24.x.x/cluster-host-node.js";
import type { HostEvent } from "../../../../../../src/wasi/0.2.x/node/24.x.x/cluster/types.js";

// The real worker lifecycle through the jco-std host adapter: fork, online, IPC both ways, and a
// signalled exit. cluster.fork() re-executes the primary's entry, which here would be the vitest
// runner, so the primary is pointed at a dedicated plain-JS worker script first. This file stays
// sequential: it owns process-wide cluster state and spawns a child process.

const WORKER_SCRIPT = fileURLToPath(new URL("../helpers/cluster-worker.mjs", import.meta.url));
const ROLE = "fork-lifecycle";
const TIMEOUT_MS = 15_000;

/** Drain host events until `pick` finds what the test is waiting for, or time runs out. */
async function waitForEvent<T>(
  seen: HostEvent[],
  pick: (event: HostEvent) => T | undefined,
): Promise<T> {
  const deadline = Date.now() + TIMEOUT_MS;
  for (;;) {
    for (const event of nodeHost.drainEvents()) {
      seen.push(event);
    }
    for (const event of seen) {
      const found = pick(event);
      if (found !== undefined) {
        return found;
      }
    }
    if (Date.now() > deadline) {
      throw new Error(`timed out waiting for a cluster event; saw ${JSON.stringify(seen)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

function parsedMessage(event: HostEvent, id: number): Record<string, unknown> | undefined {
  if (event.tag !== "message" || event.val.id !== id) {
    return undefined;
  }
  return JSON.parse(event.val.json) as Record<string, unknown>;
}

describe("node:cluster fork lifecycle through the Node host adapter", () => {
  test("forks a real worker, exchanges IPC messages, and observes its signalled exit", async () => {
    expect(nodeCluster.isPrimary).toBe(true);
    nodeCluster.setupPrimary({ exec: WORKER_SCRIPT, silent: true });

    const seen: HostEvent[] = [];
    const info = nodeHost.fork([["JCO_TEST_ROLE", ROLE]]);
    try {
      // The adapter reports the freshly forked worker before it has come online.
      expect(info.id).toBeGreaterThan(0);
      expect(info.dead).toBe(false);
      expect(info.exitedAfterDisconnect).toBe(false);

      // Node's own lifecycle events arrive through the adapter's pull queue.
      await waitForEvent(seen, (event) =>
        event.tag === "fork" && event.val === info.id ? true : undefined,
      );
      await waitForEvent(seen, (event) =>
        event.tag === "online" && event.val === info.id ? true : undefined,
      );

      // The worker's first IPC message carries the environment the adapter forked it with.
      const hello = await waitForEvent(seen, (event) => {
        const message = parsedMessage(event, info.id);
        return message?.from === "worker" ? message : undefined;
      });
      expect(hello.role).toBe(ROLE);
      expect(typeof hello.pid).toBe("number");
      expect(hello.pid).not.toBe(process.pid);

      // Messages sent through the adapter reach the worker, and its reply comes back the same way.
      nodeHost.send(info.id, JSON.stringify({ ping: 42, nested: { ok: true } }));
      const echo = await waitForEvent(seen, (event) => {
        const message = parsedMessage(event, info.id);
        return message && "echo" in message ? message.echo : undefined;
      });
      expect(echo).toEqual({ ping: 42, nested: { ok: true } });

      // While alive, the worker is enumerable and connected through the adapter.
      expect(nodeHost.listWorkers().map((worker) => worker.id)).toContain(info.id);
      expect(nodeHost.getWorker(info.id)).toMatchObject({
        id: info.id,
        connected: true,
        dead: false,
      });

      // Killing through the adapter ends the worker with the requested signal.
      nodeHost.kill(info.id, "SIGTERM");
      const exit = await waitForEvent(seen, (event) =>
        event.tag === "exit" && event.val.id === info.id ? event.val : undefined,
      );
      expect(exit.signal).toBe("SIGTERM");
      expect(exit.code).toBe(0);

      // Node forgets a dead worker, and the adapter reports that faithfully.
      expect(() => nodeHost.getWorker(info.id)).toThrow(
        expect.objectContaining({ tag: "no-such-worker", val: info.id }),
      );
    } finally {
      for (const worker of Object.values(nodeCluster.workers ?? {})) {
        if (worker && !worker.isDead()) {
          worker.kill("SIGKILL");
        }
      }
    }
  });
});
