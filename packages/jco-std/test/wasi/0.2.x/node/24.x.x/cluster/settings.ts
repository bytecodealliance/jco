import { describe, expect, test } from "vitest";
import { createCluster } from "../../../../../../src/wasi/0.2.x/node/24.x.x/cluster/index.js";
import { FakeClusterHost } from "../helpers/cluster.js";

describe("cluster settings", () => {
  test("reads settings from the host", () => {
    const host = new FakeClusterHost();
    host.settings = { silent: true, args: ["--flag"], cwd: "/app", schedulingPolicy: 1 };
    expect(createCluster(host).settings).toEqual({
      silent: true,
      args: ["--flag"],
      cwd: "/app",
      schedulingPolicy: 1,
    });
  });

  test("returns a copy, so mutating it does not change host state", () => {
    const host = new FakeClusterHost();
    const cluster = createCluster(host);
    cluster.settings.args.push("--injected");
    expect(host.settings.args).toEqual([]);
  });

  test("setupPrimary merges over current host settings", () => {
    const host = new FakeClusterHost();
    const cluster = createCluster(host);
    cluster.setupPrimary({ silent: true });
    expect(host.settings.silent).toBe(true);
    expect(host.settings.cwd, "unset fields keep their value").toBe("/");
  });

  test("setupPrimary emits 'setup'", () => {
    const cluster = createCluster(new FakeClusterHost());
    const seen: unknown[] = [];
    cluster.on("setup", (s) => seen.push(s));
    cluster.setupPrimary({ silent: true });
    expect(seen).toHaveLength(1);
  });

  test("schedulingPolicy round-trips through the host", () => {
    const host = new FakeClusterHost();
    const cluster = createCluster(host);
    expect(cluster.schedulingPolicy).toBe(2);
    cluster.schedulingPolicy = 1;
    expect(host.settings.schedulingPolicy).toBe(1);
  });
});
