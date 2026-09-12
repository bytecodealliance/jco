import { expect, test } from "vitest";
import { portable } from "../helpers/worker-threads.js";

test("post-message-to-thread fails explicitly before touching arguments", () => {
  const api = portable().workerThreads;
  const value = new Proxy(
    {},
    {
      get() {
        throw new Error("argument touched");
      },
    },
  );
  expect(() => api.postMessageToThread(1, value)).toThrow(
    expect.objectContaining({ code: "ERR_JCO_UNSUPPORTED_NODE_API" }),
  );
});
