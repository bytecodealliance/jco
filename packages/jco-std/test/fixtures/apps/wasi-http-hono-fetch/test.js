import { createServer } from "node:http";
import { assert } from "vitest";

export const config = {
  wit: {
    world: "hono-wasi-http-fetch",
  },
  wasmtime: {
    extraArgs: () => ["-S", "http", "-S", "inherit-network"],
  },
};

/** Verify outgoing component fetches against a local HTTP peer. */
export async function test({ server }) {
  let requests = 0;
  const upstream = createServer((_req, res) => {
    requests++;
    res.end("fixture response");
  });
  await new Promise((resolve, reject) => {
    upstream.once("error", reject);
    upstream.listen(0, "127.0.0.1", resolve);
  });
  try {
    const address = upstream.address();
    assert.isObject(address);
    const target = `http://127.0.0.1:${address.port}`;
    const req = await fetch(`${server.url}?upstream=${encodeURIComponent(target)}`);
    assert.strictEqual(req.status, 200);
    assert.strictEqual(await req.text(), "status: 200");
    assert.strictEqual(requests, 1);
  } finally {
    await new Promise((resolve, reject) => {
      upstream.close((error) => (error ? reject(error) : resolve()));
    });
  }
}
