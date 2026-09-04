import nodeHttp from "node:http";

import { describe, expect, test } from "vitest";

import { Agent, globalAgent } from "../../../../../../src/wasi/0.2.x/node/24.x.x/http/agent.js";
import { describeDifferential } from "../helpers/assert.js";

interface NameCase {
  label: string;
  options?: Parameters<Agent["getName"]>[0];
}

const NAME_CASES: NameCase[] = [
  { label: "no arguments" },
  { label: "empty options", options: {} },
  { label: "host and port", options: { host: "example.com", port: 8080 } },
  { label: "string port", options: { host: "example.com", port: "8080" } },
  { label: "host only", options: { host: "example.com" } },
  { label: "port only", options: { port: 8080 } },
  { label: "empty host", options: { host: "" } },
  { label: "port zero", options: { host: "example.com", port: 0 } },
  { label: "local address", options: { host: "example.com", port: 80, localAddress: "1.2.3.4" } },
  { label: "family 4", options: { host: "example.com", port: 80, family: 4 } },
  { label: "family 6", options: { host: "example.com", port: 80, family: 6 } },
  { label: "family 0", options: { host: "example.com", port: 80, family: 0 } },
  {
    label: "local address and family",
    options: { host: "example.com", port: 80, localAddress: "1.2.3.4", family: 6 },
  },
  { label: "socket path", options: { host: "example.com", port: 80, socketPath: "/tmp/sock" } },
  { label: "socket path only", options: { socketPath: "/tmp/sock" } },
  {
    label: "socket path with family",
    options: { host: "example.com", port: 80, family: 4, socketPath: "/tmp/sock" },
  },
];

describe("http.Agent", () => {
  test.concurrent("keeps Node's option defaults", () => {
    const agent = new Agent();
    expect(agent.defaultPort).toBe(80);
    expect(agent.protocol).toBe("http:");
    expect(agent.keepAlive).toBe(false);
    expect(agent.keepAliveMsecs).toBe(1_000);
    expect(agent.maxSockets).toBe(Number.POSITIVE_INFINITY);
    expect(agent.maxFreeSockets).toBe(256);
    expect(agent.maxTotalSockets).toBe(Number.POSITIVE_INFINITY);
    expect(agent.scheduling).toBe("lifo");
  });

  test.concurrent("does not substitute defaultPort for an absent port", () => {
    // lib/_http_agent.js appends `options.port` only when truthy, so the port field is
    // empty rather than the agent's defaultPort.
    expect(new Agent().getName({ host: "example.com" })).toBe("example.com::");
    expect(new Agent({ defaultPort: 8080 }).getName({ host: "example.com" })).toBe("example.com::");
  });

  test.concurrent("appends socketPath last instead of returning early", () => {
    expect(new Agent().getName({ host: "example.com", port: 80, socketPath: "/tmp/sock" })).toBe(
      "example.com:80::/tmp/sock",
    );
  });

  test.concurrent("normalises noDelay and path into options like Node", () => {
    expect(new Agent().options).toEqual({ noDelay: true, path: null });
    expect(new Agent({ noDelay: false, keepAlive: true }).options).toEqual({
      noDelay: false,
      keepAlive: true,
      path: null,
    });
  });

  test.concurrent("keeps the global agent's documented options", () => {
    expect(globalAgent.keepAlive).toBe(true);
    expect(globalAgent.scheduling).toBe("lifo");
    expect(globalAgent.options).toMatchObject({
      keepAlive: true,
      scheduling: "lifo",
      timeout: 5_000,
    });
  });

  test.concurrent("refuses to own connections", () => {
    expect(() => new Agent().createConnection()).toThrow(
      expect.objectContaining({ code: "ERR_JCO_UNSUPPORTED_NODE_API" }),
    );
  });
});

describeDifferential("http.Agent differential", () => {
  for (const { label, options } of NAME_CASES) {
    test.concurrent(`getName matches Node for ${label}`, () => {
      const portable = new Agent();
      const native = new nodeHttp.Agent();
      expect(portable.getName(options)).toBe(native.getName(options));
    });
  }

  test.concurrent("matches Node's normalised option bag", () => {
    expect(new Agent().options).toEqual({ ...new nodeHttp.Agent().options });
    expect(new Agent({ keepAlive: true, maxSockets: 4 }).options).toEqual({
      ...new nodeHttp.Agent({ keepAlive: true, maxSockets: 4 }).options,
    });
  });

  test.concurrent("getName ignores the agent's own defaultPort like Node", () => {
    const portable = new Agent({ defaultPort: 8080 });
    const native = new nodeHttp.Agent({ defaultPort: 8080 });
    expect(portable.getName({ host: "example.com" })).toBe(native.getName({ host: "example.com" }));
  });
});
