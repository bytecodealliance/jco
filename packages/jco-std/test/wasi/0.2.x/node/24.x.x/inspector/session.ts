import inspector from "node:inspector";

import { afterEach, describe, expect, test } from "vitest";

import {
  createInspectorCallbacks,
  createInspectorCore,
} from "../../../../../../src/wasi/0.2.x/node/24.x.x/inspector/index.js";
import * as nodeHost from "../../../../../../src/wasi/0.2.x/node/24.x.x/inspector-host-node.js";

// Driven by the real Node inspector, so these assert Node's own Session behavior. The core's
// callback registry is wired to the same host so synchronous post responses come straight back.
const core = createInspectorCore(nodeHost);
nodeHost.attachCallbacks(createInspectorCallbacks(core.registry));
const { Session } = core;

const open: Array<{ disconnect(): void }> = [];
function connected(): InstanceType<typeof Session> {
  const session = new Session();
  session.connect();
  open.push(session);
  return session;
}
afterEach(() => {
  for (const session of open.splice(0)) {
    try {
      session.disconnect();
    } catch {
      // already gone
    }
  }
});

describe("node:inspector Session validation", () => {
  test("rejects a non-string method with Node's message", () => {
    const session = new Session();
    expect(() => session.post(42 as unknown as string)).toThrow(
      expect.objectContaining({
        code: "ERR_INVALID_ARG_TYPE",
        message: 'The "method" argument must be of type string. Received type number (42)',
      }),
    );
  });

  test("rejects array and primitive params but accepts null and undefined", () => {
    const session = connected();
    expect(() => session.post("Runtime.evaluate", [1] as unknown as object)).toThrow(
      expect.objectContaining({
        code: "ERR_INVALID_ARG_TYPE",
        message: 'The "params" argument must be of type object. Received an instance of Array',
      }),
    );
    expect(() => session.post("Runtime.evaluate", true as unknown as object)).toThrow(
      expect.objectContaining({ code: "ERR_INVALID_ARG_TYPE" }),
    );
    // null and undefined are accepted (treated as no params); the command itself may still fail.
    expect(() => session.post("Runtime.evaluate", null as unknown as object, () => {})).not.toThrow(
      expect.objectContaining({ code: "ERR_INVALID_ARG_TYPE" }),
    );
  });

  test("rejects a non-function callback", () => {
    const session = connected();
    expect(() => session.post("Runtime.evaluate", {}, "cb" as unknown as () => void)).toThrow(
      expect.objectContaining({
        code: "ERR_INVALID_ARG_TYPE",
        message: "The \"callback\" argument must be of type function. Received type string ('cb')",
      }),
    );
  });

  test("validation precedes the connection check", () => {
    const session = new Session();
    // Ill-typed argument on a disconnected session still reports the arg-type error.
    expect(() => session.post(42 as unknown as string)).toThrow(
      expect.objectContaining({ code: "ERR_INVALID_ARG_TYPE" }),
    );
  });
});

describe("node:inspector Session lifecycle", () => {
  test("post before connect throws ERR_INSPECTOR_NOT_CONNECTED", () => {
    const session = new Session();
    expect(() => session.post("Runtime.evaluate", {}, () => {})).toThrow(
      expect.objectContaining({
        code: "ERR_INSPECTOR_NOT_CONNECTED",
        message: "Session is not connected",
      }),
    );
  });

  test("disconnect before connect is a no-op", () => {
    const session = new Session();
    expect(() => session.disconnect()).not.toThrow();
  });

  test("a second connect throws ERR_INSPECTOR_ALREADY_CONNECTED", () => {
    const session = connected();
    expect(() => session.connect()).toThrow(
      expect.objectContaining({
        code: "ERR_INSPECTOR_ALREADY_CONNECTED",
        message: "The inspector session is already connected",
      }),
    );
  });

  test("connectToMainThread from the main thread throws ERR_INSPECTOR_NOT_WORKER", () => {
    const session = new Session();
    expect(() => session.connectToMainThread()).toThrow(
      expect.objectContaining({ code: "ERR_INSPECTOR_NOT_WORKER" }),
    );
  });

  test("post after disconnect throws ERR_INSPECTOR_NOT_CONNECTED", () => {
    const session = new Session();
    session.connect();
    session.disconnect();
    expect(() => session.post("Runtime.evaluate", {}, () => {})).toThrow(
      expect.objectContaining({ code: "ERR_INSPECTOR_NOT_CONNECTED" }),
    );
  });
});

describe("node:inspector Session post round trip", () => {
  test("delivers a synchronous CDP result", () => {
    const session = connected();
    let outcome: { error: Error | null; value: unknown } | undefined;
    session.post("Runtime.evaluate", { expression: "6 * 7" }, (error, result) => {
      outcome = { error, value: (result as { result?: { value?: unknown } })?.result?.value };
    });
    expect(outcome).toEqual({ error: null, value: 42 });
  });

  test("reconstructs ERR_INSPECTOR_COMMAND for an unknown method", () => {
    const session = connected();
    let captured: (Error & { code?: string }) | undefined;
    session.post("Nope.nope", (error) => {
      captured = error as Error & { code?: string };
    });
    expect(captured).toBeInstanceOf(Error);
    expect(captured!.code).toBe("ERR_INSPECTOR_COMMAND");
    expect(captured!.message).toContain("'Nope.nope' wasn't found");
  });

  test("matches the real inspector's result", () => {
    const shimSession = connected();
    const nodeSession = new inspector.Session();
    nodeSession.connect();
    try {
      let shimValue: unknown;
      shimSession.post("Runtime.evaluate", { expression: "1 + 2" }, (_e, r) => {
        shimValue = (r as { result?: { value?: unknown } })?.result?.value;
      });
      let nodeValue: unknown;
      nodeSession.post("Runtime.evaluate", { expression: "1 + 2" }, (_e, r) => {
        nodeValue = r?.result?.value;
      });
      expect(shimValue).toBe(nodeValue);
    } finally {
      nodeSession.disconnect();
    }
  });
});

describe("node:inspector Session notifications", () => {
  test("re-emits a notification as inspectorNotification and a per-method event", async () => {
    const session = connected();
    const broadcast: string[] = [];
    const perMethod: Array<Record<string, unknown>> = [];
    session.on("inspectorNotification", (message: { method: string }) =>
      broadcast.push(message.method),
    );
    session.on("Runtime.executionContextCreated", (message: Record<string, unknown>) =>
      perMethod.push(message),
    );
    session.post("Runtime.enable", () => {});
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(broadcast.length).toBeGreaterThan(0);
    if (perMethod.length > 0) {
      expect(Object.keys(perMethod[0]).sort()).toEqual(["method", "params"]);
    }
  });
});
