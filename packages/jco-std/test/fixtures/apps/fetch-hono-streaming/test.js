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
  // HTTP transport may split or coalesce the application's writes.
  assert.strictEqual(Buffer.concat(chunks).toString("utf8"), "HelloHello");
}
