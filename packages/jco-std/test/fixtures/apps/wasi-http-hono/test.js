import { assert } from "vitest";

export const config = {
  wit: {
    world: "hono-wasi-http",
  },
};

export async function test({ server }) {
  const req = await fetch(server.url);
  assert.strictEqual(req.headers.get("content-type"), "text/plain; charset=UTF-8");
  assert.strictEqual(req.headers.get("x-example"), "wasi-http");
  assert.strictEqual("Hello World!!!!", await req.text());
}
