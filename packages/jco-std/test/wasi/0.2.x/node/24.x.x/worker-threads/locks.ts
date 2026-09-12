import { expect, test } from "vitest";
import { portable } from "../helpers/worker-threads.js";

test("locks fails explicitly before touching arguments", () => {
  const api = portable().workerThreads;
  const value = new Proxy(
    {},
    {
      get() {
        throw new Error("argument touched");
      },
    },
  );
  expect(() => api.locks.request("shared", value)).toThrow(
    expect.objectContaining({ code: "ERR_JCO_UNSUPPORTED_NODE_API" }),
  );
  expect(() => api.locks.query()).toThrow(
    expect.objectContaining({ code: "ERR_JCO_UNSUPPORTED_NODE_API" }),
  );
});
