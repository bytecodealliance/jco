import { assert } from "vitest";

export const config = {
  wit: {
    world: "hono-wasi-http",
  },
};

export async function test({ server }) {
  const req = await fetch(server.url);
  assert.strictEqual("Hello World!!!!", await req.text());
}
