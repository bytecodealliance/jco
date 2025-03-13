// Flags: --instantiation

// @ts-ignore
import * as helpers from "./helpers.js";
// @ts-ignore
import { instantiate } from "../output/lists/lists.js";

// @ts-ignore
import * as assert from "assert";

async function run() {
  // @ts-ignore
  const wasm = await instantiate(helpers.loadWasm, {
    ...helpers.wasi,
    "test:lists/test": {
      emptyListParam(a) {
        assert.deepStrictEqual(Array.from(a), []);
      },
      emptyStringParam(a) {
        assert.strictEqual(a, "");
      },
      emptyListResult() {
        return new Uint8Array([]);
      },
      emptyStringResult() {
        return "";
      },
      listParamLarge(a) {
        assert.strictEqual(a.length, 1000);
      },
      listParam(a) {
        assert.deepStrictEqual(Array.from(a), [1, 2, 3, 4]);
      },
      listParam2(a) {
        assert.strictEqual(a, "foo");
      },
      listParam3(a) {
        assert.deepStrictEqual(a, ["foo", "bar", "baz"]);
      },
      listParam4(a) {
        assert.deepStrictEqual(a, [["foo", "bar"], ["baz"]]);
      },
      listParam5(a) {
        assert.deepStrictEqual(a, [
          [1, 2, 3],
          [4, 5, 6],
        ]);
      },
      listResult() {
        return new Uint8Array([1, 2, 3, 4, 5]);
      },
      listResult2() {
        return "hello!";
      },
      listResult3() {
        return ["hello,", "world!"];
      },
      listRoundtrip(x) {
        return x;
      },
      stringRoundtrip(x) {
        return x;
      },

      listMinmax8(u, s) {
        assert.deepEqual(u.length, 2);
        assert.deepEqual(u[0], 0);
        assert.deepEqual(u[1], (1 << 8) - 1);
        assert.deepEqual(s.length, 2);
        assert.deepEqual(s[0], -(1 << 7));
        assert.deepEqual(s[1], (1 << 7) - 1);

        return [u, s];
      },

      listMinmax16(u, s) {
        assert.deepEqual(u.length, 2);
        assert.deepEqual(u[0], 0);
        assert.deepEqual(u[1], (1 << 16) - 1);
        assert.deepEqual(s.length, 2);
        assert.deepEqual(s[0], -(1 << 15));
        assert.deepEqual(s[1], (1 << 15) - 1);

        return [u, s];
      },

      listMinmax32(u, s) {
        assert.deepEqual(u.length, 2);
        assert.deepEqual(u[0], 0);
        assert.deepEqual(u[1], ~0 >>> 0);
        assert.deepEqual(s.length, 2);
        assert.deepEqual(s[0], 1 << 31);
        assert.deepEqual(s[1], ((1 << 31) - 1) >>> 0);

        return [u, s];
      },

      listMinmax64(u, s) {
        assert.deepEqual(u.length, 2);
        assert.deepEqual(u[0], 0n);
        assert.deepEqual(u[1], 2n ** 64n - 1n);
        assert.deepEqual(s.length, 2);
        assert.deepEqual(s[0], -(2n ** 63n));
        assert.deepEqual(s[1], 2n ** 63n - 1n);

        return [u, s];
      },

      listMinmaxFloat(f, d) {
        assert.deepEqual(f.length, 4);
        assert.deepEqual(f[0], -3.4028234663852886e38);
        assert.deepEqual(f[1], 3.4028234663852886e38);
        assert.deepEqual(f[2], Number.NEGATIVE_INFINITY);
        assert.deepEqual(f[3], Number.POSITIVE_INFINITY);

        assert.deepEqual(d.length, 4);
        assert.deepEqual(d[0], -Number.MAX_VALUE);
        assert.deepEqual(d[1], Number.MAX_VALUE);
        assert.deepEqual(d[2], Number.NEGATIVE_INFINITY);
        assert.deepEqual(d[3], Number.POSITIVE_INFINITY);

        return [f, d];
      },
    },
  });

  const bytes = wasm.allocatedBytes();
  assert.strictEqual(wasm.test, wasm["test:lists/test"]);
  wasm.testImports();
  wasm.test.emptyListParam(new Uint8Array([]));
  wasm.test.emptyStringParam("");
  wasm.test.listParam(new Uint8Array([1, 2, 3, 4]));
  wasm.test.listParamLarge("blah ".repeat(1000).slice(0, -1).split(" "));
  wasm.test.listParam2("foo");
  wasm.test.listParam3(["foo", "bar", "baz"]);
  wasm.test.listParam4([["foo", "bar"], ["baz"]]);
  assert.deepStrictEqual(Array.from(wasm.test.emptyListResult()), []);
  assert.deepStrictEqual(wasm.test.emptyStringResult(), "");
  assert.deepStrictEqual(Array.from(wasm.test.listResult()), [1, 2, 3, 4, 5]);
  assert.deepStrictEqual(wasm.test.listResult2(), "hello!");
  assert.deepStrictEqual(wasm.test.listResult3(), ["hello,", "world!"]);

  const buffer = new ArrayBuffer(8);
  new Uint8Array(buffer).set(new Uint8Array([1, 2, 3, 4]), 2);
  // Create a view of the four bytes in the middle of the buffer
  const view = new Uint8Array(buffer, 2, 4);
  assert.deepStrictEqual(
    Array.from(wasm.test.listRoundtrip(view)),
    [1, 2, 3, 4]
  );

  assert.deepStrictEqual(wasm.test.stringRoundtrip("x"), "x");
  assert.deepStrictEqual(wasm.test.stringRoundtrip(""), "");
  assert.deepStrictEqual(
    wasm.test.stringRoundtrip("hello ⚑ world"),
    "hello ⚑ world"
  );

  // Ensure that we properly called `free` everywhere in all the glue that we
  // needed to.
  assert.strictEqual(bytes, wasm.allocatedBytes());
}

await run();
