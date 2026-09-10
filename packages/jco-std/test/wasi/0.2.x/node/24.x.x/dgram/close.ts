import { expect, test } from "vitest";
import { setup, event } from "./helpers/setup.js";

test("close drains accepted send callbacks before emitting close", async () => {
  const socket = setup().createSocket("udp4");
  socket.connectSync(12345, "127.0.0.1");
  const order: string[] = [];
  socket.send("x", (error, count) => {
    expect(error).toBeNull();
    expect(count).toBe(1);
    order.push("send");
  });
  const closed = event(socket, "close");
  socket.close(() => order.push("close"));
  await closed;
  expect(order).toEqual(["send", "close"]);
});

test("closing during a custom bind lookup suppresses late listening", async () => {
  let complete: (() => void) | undefined;
  const socket = setup().createSocket({
    type: "udp4",
    lookup(_name, _family, callback) {
      complete = () => callback(null, "127.0.0.1", 4);
    },
  });
  let listening = false;
  socket.bind(0, () => {
    listening = true;
  });
  await socket[Symbol.asyncDispose]();
  complete!();
  await Promise.resolve();
  expect(listening).toBe(false);
});

test("close after an implicit bind flushes the queued operation once", async () => {
  const socket = setup().createSocket("udp4");
  const closed = event(socket, "close");
  socket.send("x", 12345, "127.0.0.1");
  socket.close();
  await closed;
  expect(() => socket.bind(0)).toThrow(
    expect.objectContaining({ code: "ERR_SOCKET_DGRAM_NOT_RUNNING" }),
  );
});
