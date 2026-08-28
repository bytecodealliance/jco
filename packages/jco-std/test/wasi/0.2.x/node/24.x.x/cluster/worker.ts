import { describe, expect, test } from "vitest";
import { createCluster } from "../../../../../../src/wasi/0.2.x/node/24.x.x/cluster/index.js";
import { FakeClusterHost } from "../helpers/cluster.js";

describe("cluster.Worker", () => {
  test("send encodes the message as JSON for the host", () => {
    const host = new FakeClusterHost();
    const worker = createCluster(host).fork();
    expect(worker.send({ hello: "world" })).toBe(true);
    expect(host.sent).toEqual([{ id: worker.id, json: '{"hello":"world"}' }]);
  });

  test("kill defaults to SIGTERM and honours an explicit signal", () => {
    const host = new FakeClusterHost();
    const worker = createCluster(host).fork();
    worker.kill();
    worker.kill("SIGKILL");
    expect(host.calls).toContain(`kill(${worker.id},SIGTERM)`);
    expect(host.calls).toContain(`kill(${worker.id},SIGKILL)`);
  });

  test("destroy is an alias of kill", () => {
    const host = new FakeClusterHost();
    const worker = createCluster(host).fork();
    worker.destroy("SIGHUP");
    expect(host.calls).toContain(`kill(${worker.id},SIGHUP)`);
  });

  test("disconnect returns the worker for chaining", () => {
    const host = new FakeClusterHost();
    const worker = createCluster(host).fork();
    expect(worker.disconnect()).toBe(worker);
    expect(host.calls).toContain(`disconnectWorker(${worker.id})`);
  });

  test("state is read from the host, not cached", () => {
    const host = new FakeClusterHost();
    const worker = createCluster(host).fork();
    expect(worker.state).toBe("none");
    host.workers.set(worker.id, { ...host.getWorker(worker.id), state: "online" });
    expect(worker.state).toBe("online");
  });
});
