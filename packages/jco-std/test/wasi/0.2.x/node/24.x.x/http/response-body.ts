import { expect, test, vi } from "vitest";
import { ResponseBody } from "../../../../../../src/wasi/0.2.x/node/24.x.x/http/response-body.js";

test("body queues copy guest writes, bound each transfer, and signal backpressure", async () => {
  const drain = vi.fn();
  const close = vi.fn();
  const body = new ResponseBody(drain, close);
  const bytes = new Uint8Array(65536).fill(7);
  expect(body.write(bytes)).toBe(false);
  bytes.fill(0);
  body.write(Uint8Array.of(8));
  body.end();
  expect(await body.poll()).toEqual({ tag: "chunk", val: new Uint8Array(65536).fill(7) });
  await Promise.resolve();
  expect(drain).toHaveBeenCalledTimes(1);
  expect(await body.poll()).toEqual({ tag: "chunk", val: Uint8Array.of(8) });
  expect(await body.poll()).toEqual({ tag: "end" });
  body[Symbol.dispose]();
  body[Symbol.dispose]();
  expect(close).toHaveBeenCalledTimes(1);
});

test("disconnected consumers discard queued bytes and terminate polling", async () => {
  const close = vi.fn();
  const body = new ResponseBody(() => {}, close);
  body.write(new Uint8Array(65536));
  body[Symbol.dispose]();
  expect(body.write(Uint8Array.of(1))).toBe(false);
  expect(await body.poll()).toEqual({ tag: "end" });
  expect(close).toHaveBeenCalledTimes(1);
});
