import { assert } from "vitest";

export const config = {
  wit: {
    world: "hono-fetch-event",
  },
  wasmtime: {
    extraArgs: () => {
      return [
        "--wasi",
        "config",
        "--wasi",
        "config-var=test-config-key=test-config-value",
        "--env",
        "test-env-key=test-env-value",
      ];
    },
  },
};

export async function test({ server }) {
  let resp = await fetch(`${server.url}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      env: { key: "test-env-key" },
      config: { key: "test-config-key" },
    }),
  });
  resp = await resp.json();
  assert.strictEqual(resp.status, "success");
  assert.deepEqual(resp.data.env, { key: "test-env-key", value: "test-env-value" });
  assert.deepEqual(resp.data.config, { key: "test-config-key", value: "test-config-value" });
}
