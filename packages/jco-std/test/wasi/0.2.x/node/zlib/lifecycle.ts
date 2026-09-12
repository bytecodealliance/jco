import { expect, test } from "vitest";
import native from "node:zlib";
import { Buffer } from "node:buffer";
import { zlib } from "../helpers/zlib.js";
test("flush and params preserve ordered data and close is idempotent", async () => {
  const stream = zlib.createDeflate();
  const chunks: Uint8Array[] = [];
  stream.on("data", (chunk: Uint8Array): void => {
    chunks.push(chunk);
  });
  const end = new Promise<void>((resolve, reject): void => {
    stream.once("end", resolve);
    stream.once("error", reject);
  });
  stream.write("first");
  await new Promise<void>((resolve, reject): void =>
    stream.flush((error): void => (error ? reject(error) : resolve())),
  );
  expect(chunks.length).toBeGreaterThan(0);
  await new Promise<void>((resolve, reject): void =>
    stream.params(1, 0, (error): void => (error ? reject(error) : resolve())),
  );
  stream.end("second");
  await end;
  expect(native.inflateSync(Buffer.concat(chunks)).toString()).toBe("firstsecond");
  stream.close();
  stream.close();
});
test("reset and dictionaries use the native codec", async () => {
  const stream = zlib.createDeflate();
  stream.reset();
  stream.close();
  expect(() => stream.reset()).toThrow(/closed/);
  const dictionary = Buffer.from("dictionary common words");
  const data = zlib.deflateSync("common words", { dictionary });
  expect(zlib.inflateSync(data, { dictionary }).toString()).toBe("common words");
});

test("flush rejects invalid kinds synchronously and stream errors close native state", async () => {
  const stream = zlib.createGzip();
  try {
    expect(() => stream.flush(6)).toThrow(expect.objectContaining({ code: "ERR_OUT_OF_RANGE" }));
  } finally {
    stream.close();
  }
  const bad = zlib.createGunzip();
  const error = new Promise<Error>((resolve): void => {
    bad.once("error", resolve);
  });
  bad.end("invalid");
  expect(await error).toMatchObject({ code: "Z_DATA_ERROR" });
  expect(bad.destroyed).toBe(true);
});
