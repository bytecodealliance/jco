import { afterEach, describe, expect, test } from "vitest";

import {
  createInspectorCallbacks,
  createInspectorCore,
} from "../../../../../../src/wasi/0.2.x/node/24.x.x/inspector/index.js";
import * as nodeHost from "../../../../../../src/wasi/0.2.x/node/24.x.x/inspector-host-node.js";

const core = createInspectorCore(nodeHost);
nodeHost.attachCallbacks(createInspectorCallbacks(core.registry));
const { PromisesSession } = core;

const open: Array<{ disconnect(): void }> = [];
afterEach(() => {
  for (const session of open.splice(0)) {
    try {
      session.disconnect();
    } catch {
      // already gone
    }
  }
});

function connected(): InstanceType<typeof PromisesSession> {
  const session = new PromisesSession();
  session.connect();
  open.push(session);
  return session;
}

describe("node:inspector/promises Session", () => {
  test("post resolves with a synchronous CDP result", async () => {
    const session = connected();
    const result = (await session.post("Runtime.evaluate", { expression: "6 * 7" })) as {
      result?: { value?: unknown };
    };
    expect(result?.result?.value).toBe(42);
  });

  test("post rejects with ERR_INSPECTOR_COMMAND for an unknown method", async () => {
    const session = connected();
    await expect(session.post("Nope.nope")).rejects.toMatchObject({
      code: "ERR_INSPECTOR_COMMAND",
    });
  });

  test("a validation failure rejects rather than throwing synchronously", async () => {
    const session = connected();
    const rejected = session.post(42 as unknown as string);
    expect(rejected).toBeInstanceOf(Promise);
    await expect(rejected).rejects.toMatchObject({ code: "ERR_INVALID_ARG_TYPE" });
  });

  test("post on a disconnected session rejects with ERR_INSPECTOR_NOT_CONNECTED", async () => {
    const session = new PromisesSession();
    await expect(session.post("Runtime.evaluate")).rejects.toMatchObject({
      code: "ERR_INSPECTOR_NOT_CONNECTED",
    });
  });
});
