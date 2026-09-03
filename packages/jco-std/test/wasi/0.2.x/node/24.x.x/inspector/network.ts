import inspector from "node:inspector";

import { describe, expect, test } from "vitest";

import { createInspectorCore } from "../../../../../../src/wasi/0.2.x/node/24.x.x/inspector/index.js";
import * as nodeHost from "../../../../../../src/wasi/0.2.x/node/24.x.x/inspector-host-node.js";

const core = createInspectorCore(nodeHost);

describe("node:inspector experimental broadcast namespaces", () => {
  test.concurrent("Network matches Node's method set", () => {
    expect(Object.keys(core.Network).sort()).toEqual(Object.keys(inspector.Network).sort());
  });

  test.concurrent("DOMStorage matches Node's method set", () => {
    const nodeKeys = Object.keys(
      (inspector as unknown as { DOMStorage: object }).DOMStorage,
    ).sort();
    expect(Object.keys(core.DOMStorage).sort()).toEqual(nodeKeys);
  });

  test.concurrent("a params object is accepted and undefined defaults to an empty object", () => {
    expect(() => core.Network.requestWillBeSent({ requestId: "1" })).not.toThrow();
    expect(() => core.Network.requestWillBeSent()).not.toThrow();
  });

  test.concurrent("null, arrays, and primitives throw ERR_INVALID_ARG_TYPE", () => {
    expect(() => core.Network.requestWillBeSent(null as unknown as object)).toThrow(
      expect.objectContaining({
        code: "ERR_INVALID_ARG_TYPE",
        message: 'The "params" argument must be of type object. Received null',
      }),
    );
    expect(() => core.Network.requestWillBeSent([1] as unknown as object)).toThrow(
      expect.objectContaining({ code: "ERR_INVALID_ARG_TYPE" }),
    );
    expect(() => core.DOMStorage.registerStorage(5 as unknown as object)).toThrow(
      expect.objectContaining({ code: "ERR_INVALID_ARG_TYPE" }),
    );
  });

  test.concurrent("NetworkResources.put forwards two string arguments", () => {
    expect(typeof core.NetworkResources.put).toBe("function");
    expect(core.NetworkResources.put.length).toBe(2);
    expect(() => core.NetworkResources.put("http://x/y", "body")).not.toThrow();
  });
});
