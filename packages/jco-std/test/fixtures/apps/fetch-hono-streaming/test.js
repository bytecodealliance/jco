import { assert } from "vitest";

export const config = {
  wit: {
    world: "hono-fetch-event",
  },
};

export async function test({ server }) {
  const resp = await fetch(server.url, { method: "POST", body: "echo" });
  const chunks = [];
  for await (const chunk of resp.body.values()) {
    chunks.push(chunk);
  }
  assert.strictEqual(chunks.length, 2);
  assert.deepEqual(chunks, [
    new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]),
    new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]),
  ]);
}
