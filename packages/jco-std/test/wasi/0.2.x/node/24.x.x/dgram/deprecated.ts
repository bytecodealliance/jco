import { expect, test } from "vitest";
import { setup } from "./helpers/setup.js";

test("all DEP0112 entries fail immediately without argument side effects", () => {
  const dgram = setup();
  const socket = dgram.createSocket("udp4");
  const poison = new Proxy(
    {},
    {
      get() {
        throw new Error("touched");
      },
    },
  );
  const expected = { code: "ERR_JCO_UNSUPPORTED_DEPRECATED_NODE_API" };
  expect(() => dgram._createSocketHandle(poison)).toThrow(expect.objectContaining(expected));
  expect(() => socket._healthCheck()).toThrow(expect.objectContaining(expected));
  expect(() => socket._stopReceiving()).toThrow(expect.objectContaining(expected));
  for (const key of ["_handle", "_receiving", "_bindState", "_queue", "_reuseAddr"]) {
    expect(() => Reflect.get(socket, key)).toThrow(expect.objectContaining(expected));
    expect(() => Reflect.set(socket, key, poison)).toThrow(expect.objectContaining(expected));
  }
  socket.close();
});
