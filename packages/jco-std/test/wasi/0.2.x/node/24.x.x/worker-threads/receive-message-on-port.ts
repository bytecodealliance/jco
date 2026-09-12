import { expect, test } from "vitest";
import { portable } from "../helpers/worker-threads.js";

test("receive-message-on-port fails explicitly before touching arguments", () => {
  const api = portable().workerThreads;
  const value = new Proxy(
    {},
    {
      get() {
        throw new Error("argument touched");
      },
    },
  );
  expect(() =>
    api.receiveMessageOnPort(value as unknown as InstanceType<typeof api.MessagePort>),
  ).toThrow(expect.objectContaining({ code: "ERR_JCO_UNSUPPORTED_NODE_API" }));
});
