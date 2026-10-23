import { afterEach, expect, test, vi } from "vitest";

const names = [
  "ReadableStream",
  "WritableStream",
  "TransformStream",
  "Blob",
  "File",
  "Headers",
  "Request",
  "Response",
  "fetch",
] as const;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

test("narrow fallbacks and the public barrel preserve engine constructors", async () => {
  const globals = await import("../../../../../../src/wasi/0.2.x/node/24.x.x/web-globals.js");
  const streams =
    await import("../../../../../../src/wasi/0.2.x/node/24.x.x/web-globals/streams.js");
  const blobs = await import("../../../../../../src/wasi/0.2.x/node/24.x.x/web-globals/blob.js");
  const fetch = await import("../../../../../../src/wasi/0.2.x/node/24.x.x/web-globals/fetch.js");
  for (const name of names) {
    expect(globals[name]).toBe(globalThis[name]);
  }
  expect(globals.ReadableStream).toBe(streams.ReadableStream);
  expect(globals.Blob).toBe(blobs.Blob);
  expect(globals.Response).toBe(fetch.Response);
});

test("fallback streams, blobs and response bodies interoperate without engine globals", async () => {
  vi.resetModules();
  for (const name of names) {
    vi.stubGlobal(name, undefined);
  }
  const globals = await import("../../../../../../src/wasi/0.2.x/node/24.x.x/web-globals.js");
  const streams =
    await import("../../../../../../src/wasi/0.2.x/node/24.x.x/web-globals/streams.js");
  const blobs = await import("../../../../../../src/wasi/0.2.x/node/24.x.x/web-globals/blob.js");
  const fetch = await import("../../../../../../src/wasi/0.2.x/node/24.x.x/web-globals/fetch.js");
  expect(globals.ReadableStream).toBe(streams.ReadableStream);
  expect(globals.Blob).toBe(blobs.Blob);
  expect(globals.fetch).toBe(fetch.fetch);
  const blob = new blobs.Blob(["hé", new Uint8Array([0xff])], { type: "TEXT/PLAIN" });
  expect(blob.size).toBe(4);
  expect(blob.type).toBe("text/plain");
  expect(await blob.text()).toBe("hé�");
  expect(blob.stream()).toBeInstanceOf(streams.ReadableStream);
  const response = new fetch.Response(blob.stream(), { status: 201 });
  expect(response.status).toBe(201);
  expect(await response.text()).toBe("hé�");
  expect(new fetch.Request("https://example.com").headers).toBeInstanceOf(fetch.Headers);
});
