import { assert } from "vitest";

export const config = {
  wit: {
    world: "hono-fetch-event",
  },
};

export async function test({ server }) {
  const req = await fetch(server.url);
  assert.strictEqual("Hello World!", await req.text());
}
