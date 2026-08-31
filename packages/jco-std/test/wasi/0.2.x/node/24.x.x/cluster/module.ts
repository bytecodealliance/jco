import process from "node:process";

import { describe, expect, test } from "vitest";

import { createCluster } from "../../../../../../src/wasi/0.2.x/node/24.x.x/cluster/core.js";
import * as denyHost from "../../../../../../src/wasi/0.2.x/node/24.x.x/cluster-host.js";
import * as nodeHost from "../../../../../../src/wasi/0.2.x/node/24.x.x/cluster-host-node.js";

// Driven by the real Node host, so what these assert is Node's own cluster behavior rather than a
// stand-in's. Forking is covered separately in fork.ts, which spawns its own process: cluster.fork()
// re-executes the current entry, so forking here would fork the test runner.
const cluster = createCluster(nodeHost);

describe("node:cluster guest adapter", () => {
  test("the default host denies process control", () => {
    expect(() => denyHost.isPrimary()).toThrow(
      expect.objectContaining({ code: "ERR_JCO_CLUSTER_ADAPTER_REQUIRED" }),
    );
    expect(() => denyHost.fork([])).toThrow(
      expect.objectContaining({ code: "ERR_JCO_CLUSTER_ADAPTER_REQUIRED" }),
    );
  });

  test("reports the process's real cluster role", () => {
    expect(cluster.isPrimary).toBe(true);
    expect(cluster.isWorker).toBe(false);
    // The test runner is a primary, so it owns no worker of its own.
    expect(cluster.worker).toBeUndefined();
  });

  test("matches Node's scheduling constants", async () => {
    const nodeCluster = await import("node:cluster");
    expect(cluster.SCHED_NONE).toBe(nodeCluster.default.SCHED_NONE);
    expect(cluster.SCHED_RR).toBe(nodeCluster.default.SCHED_RR);
  });

  test("reads settings from the running cluster", () => {
    const settings = cluster.settings;
    expect(Array.isArray(settings.args)).toBe(true);
    expect(typeof settings.cwd).toBe("string");
    expect(typeof cluster.schedulingPolicy).toBe("number");
  });

  test("returns a settings copy, so mutating it does not reach the host", () => {
    const before = cluster.settings.args.length;
    cluster.settings.args.push("--injected");
    expect(cluster.settings.args.length).toBe(before);
  });

  test("setupPrimary applies to the running cluster", async () => {
    const nodeCluster = await import("node:cluster");
    cluster.setupPrimary({ silent: true });
    expect(nodeCluster.default.settings.silent).toBe(true);
    cluster.setupPrimary({ silent: false });
  });

  test("'setup' surfaces on the drain after Node emits it", async () => {
    // Discard anything earlier tests queued, so this measures only its own event.
    await new Promise((resolve) => setImmediate(resolve));
    nodeHost.drainEvents();

    const seen: unknown[] = [];
    cluster.on("setup", (settings) => seen.push(settings));

    cluster.setupPrimary({ silent: true });
    // Node emits 'setup' on the next tick rather than synchronously, so the drain inside
    // setupPrimary runs before the host has anything queued. This is the delivery-timing
    // difference the drain model creates, made explicit.
    expect(seen, "not visible on the synchronous drain").toHaveLength(0);

    await new Promise((resolve) => setImmediate(resolve));
    cluster.pump();
    expect(seen).toHaveLength(1);

    cluster.removeAllListeners("setup");
    cluster.setupPrimary({ silent: false });
  });

  test("has no workers before anything is forked", () => {
    expect(Object.keys(cluster.workers)).toEqual([]);
  });

  test("is an event emitter", () => {
    const seen: unknown[] = [];
    cluster.on("probe", (value) => seen.push(value));
    expect(cluster.emit("probe", 1)).toBe(true);
    cluster.removeAllListeners("probe");
    expect(cluster.listenerCount("probe")).toBe(0);
    expect(seen).toEqual([1]);
  });

  test("reports an unknown worker rather than inventing one", () => {
    expect(() => nodeHost.getWorker(4242)).toThrow();
  });

  test("draining with no cluster activity yields no events", () => {
    expect(nodeHost.drainEvents()).toEqual([]);
  });

  test("the runner really is a Node cluster primary", async () => {
    const nodeCluster = await import("node:cluster");
    expect(nodeCluster.default.isPrimary).toBe(true);
    expect(process.env.NODE_UNIQUE_ID).toBeUndefined();
  });
});
