import { expect, test } from "vitest";
import { setup, event } from "./helpers/setup.js";

test("connecting state rejects repeated calls; lookup failure is retryable", async () => {
  let fail = false;
  const socket = setup().createSocket({
    type: "udp4",

    lookup(name, _family, callback) {
      queueMicrotask(() =>
        fail && name === "bad"
          ? callback(Object.assign(new Error("no host"), { code: "ENOTFOUND" }), "")
          : callback(null, "127.0.0.1"),
      );
    },
  });
  try {
    socket.bindSync();
    fail = true;
    const failed = new Promise<Error | undefined>((resolve) =>
      socket.connect(12345, "bad", resolve),
    );
    expect(() => socket.connect(12345)).toThrow(
      expect.objectContaining({ code: "ERR_SOCKET_DGRAM_IS_CONNECTED" }),
    );
    expect(await failed).toMatchObject({ code: "ENOTFOUND" });
    const connected = event(socket, "connect");
    socket.connect(12345);
    await connected;
    expect(socket.remoteAddress().port).toBe(12345);
    socket.disconnect();
    expect(() => socket.disconnect()).toThrow(
      expect.objectContaining({ code: "ERR_SOCKET_DGRAM_NOT_CONNECTED" }),
    );
  } finally {
    socket.close();
  }
});
