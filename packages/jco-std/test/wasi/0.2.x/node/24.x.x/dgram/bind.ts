import { expect, test } from "vitest";
import { setup, event } from "./helpers/setup.js";

test.each(["udp4", "udp6"] as const)("bind defaults and overloads for %s", async (type) => {
  const dgram = setup();
  for (const bind of [
    (socket: ReturnType<typeof dgram.createSocket>) => socket.bind(),
    (socket: ReturnType<typeof dgram.createSocket>) => socket.bind(0),
    (socket: ReturnType<typeof dgram.createSocket>) => socket.bind({ port: 0 }),
    (socket: ReturnType<typeof dgram.createSocket>) => socket.bind(() => {}),
  ]) {
    const socket = dgram.createSocket(type);
    try {
      const listening = event(socket, "listening");
      bind(socket);
      await listening;
      expect(socket.address()).toMatchObject({
        family: type === "udp4" ? "IPv4" : "IPv6",
        address: type === "udp4" ? "0.0.0.0" : "::",
      });
      expect(socket.address().port).toBeGreaterThan(0);
    } finally {
      socket.close();
    }
  }
});

test("bindSync validates before state mutation", () => {
  const socket = setup().createSocket("udp4");
  try {
    expect(() => socket.bindSync({ address: "localhost" })).toThrow(
      expect.objectContaining({ code: "ERR_INVALID_ARG_VALUE" }),
    );
    expect(() => socket.bindSync({ port: -1 })).toThrow(
      expect.objectContaining({ code: "ERR_SOCKET_BAD_PORT" }),
    );
    expect(socket.bindSync({ address: "127.0.0.1" }).port).toBeGreaterThan(0);
  } finally {
    socket.close();
  }
});
