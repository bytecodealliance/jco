import { expect, test } from "vitest";
import { Buffer } from "node:buffer";
import { v8, blocked, deniedError } from "../helpers/v8.js";

test("returns a byte-mode Readable containing an actual heap snapshot", async () => {
  const stream = v8.getHeapSnapshot({ exposeNumericValues: true });
  const chunks: Uint8Array[] = [];

  for await (const chunk of stream) {
    expect(chunk).toBeInstanceOf(Uint8Array);
    chunks.push(chunk as Uint8Array);
  }

  const result = JSON.parse(Buffer.concat(chunks).toString());

  expect(result.snapshot.meta.node_fields).toContain("type");
  expect(result.nodes.length).toBeGreaterThan(0);
  expect(result.strings.length).toBeGreaterThan(0);
  expect(() => blocked.getHeapSnapshot()).toThrow(expect.objectContaining(deniedError));
  expect(() => Reflect.apply(v8.getHeapSnapshot, null, [{ exposeInternals: "yes" }])).toThrow(
    expect.objectContaining({ code: "ERR_INVALID_ARG_TYPE" }),
  );
});
