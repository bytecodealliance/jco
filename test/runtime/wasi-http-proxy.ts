import * as assert from "node:assert";

// @ts-ignore
import { commands } from "../output/wasi-http-proxy/wasi-http-proxy.js";

const defaultHeaders: [string, string][] = [
  ["content-type", "text/plain"],
  ["x-wasi", "mock-server"],
  ["date", "null"],
  ["connection", "keep-alive"],
  ["keep-alive", "timeout=5"],
  ["transfer-encoding", "chunked"],
];

async function run() {
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
