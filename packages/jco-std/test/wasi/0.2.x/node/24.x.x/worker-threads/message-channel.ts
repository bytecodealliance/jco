import { expect, test } from "vitest";
import { portable } from "../helpers/worker-threads.js";

test("message-channel fails explicitly before touching arguments", () => {
  const api = portable().workerThreads;
  const value = new Proxy(
    {},
    {
      get() {
        throw new Error("argument touched");
      },
    },
  );
  expect(() => Reflect.construct(api.MessageChannel, [value])).toThrow(
    expect.objectContaining({ code: "ERR_JCO_UNSUPPORTED_NODE_API" }),
  );
});
