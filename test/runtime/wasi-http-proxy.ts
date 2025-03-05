import { fileURLToPath } from "node:url";

import * as assert from "node:assert";

const defaultHeaders: [string, string][] = [
  ["content-type", "text/plain"],
  ["x-wasi", "mock-server"],
  ["date", "null"],
  ["connection", "keep-alive"],
  ["keep-alive", "timeout=5"],
  ["transfer-encoding", "chunked"],
];

async function run() {
  const outputPath = fileURLToPath(
    new URL("../output/wasi-http-proxy/wasi-http-proxy.js", import.meta.url)
  );

  // @ts-ignore
  const { commands } = import(outputPath);

  assert.equal(
    commands.getExample(),
    JSON.stringify({
      status: 200,
      headers: defaultHeaders,
      body: "hello world",
    })
  );
  assert.equal(
    commands.postExample(),
    JSON.stringify({
      status: 200,
      headers: defaultHeaders,
      body: '{"key":"value"}',
    })
  );
}

await run();
