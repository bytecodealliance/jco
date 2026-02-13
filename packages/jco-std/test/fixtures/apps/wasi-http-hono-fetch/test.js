import { assert } from "vitest";

export const config = {
  wit: {
    world: "hono-wasi-http-fetch",
  },
  wasmtime: {
    extraArgs: () => ["-S", "http", "-S", "inherit-network"],
  },
};

export async function test({ server }) {
  const req = await fetch(server.url);
  assert.strictEqual(req.status, 200);
  const text = await req.text();
  assert.strictEqual(text, "status: 200");
}
