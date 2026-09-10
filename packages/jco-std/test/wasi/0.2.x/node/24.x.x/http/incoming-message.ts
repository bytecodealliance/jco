import { expect, test } from "vitest";
import { IncomingMessage } from "../../../../../../src/wasi/0.2.x/node/24.x.x/http/incoming-message.js";

test.concurrent("a complete buffered request is still readable until middleware consumes it", async () => {
  const request = new IncomingMessage({
    method: "POST",
    url: "/echo",
    httpVersion: "1.1",
    headers: [],
    body: new TextEncoder().encode('{"hello":"world"}'),
    remoteAddress: "127.0.0.1",
    remotePort: 1234,
  });
  expect(request.complete).toBe(true);
  expect(request.readable).toBe(true);
  expect(request.socket).toMatchObject({ readable: true, writable: true });
  expect(request.connection).toBe(request.socket);
  // on-finished uses these fields before body-parser attaches data listeners.
  expect((request.complete && !request.readable) || !request.socket?.readable).toBe(false);
  request.setEncoding("utf8");
  const body: string[] = [];
  request.on("data", (chunk) => body.push(String(chunk)));
  const ended = new Promise<void>((resolve) => request.once("end", resolve));
  request._start();
  await ended;
  expect(body.join("")).toBe('{"hello":"world"}');
  expect(request.readableEnded).toBe(true);
  expect(request.readable).toBe(false);
});
