import { createHash as nodeCreateHash, createHmac as nodeCreateHmac } from "node:crypto";

import { describe, expect, test } from "vitest";

import {
  createHash,
  createHmac,
  getHashes,
  hash,
  timingSafeEqual,
} from "../../../../../../src/wasi/0.2.x/node/24.x.x/crypto/index.js";

/**
 * Node's own `node:crypto` is the oracle: these digests exist so that Node-shaped middleware
 * gets the same bytes it would get on Node, so every case is checked against it rather than
 * against a hard-coded vector.
 */
const ALGORITHMS = ["sha1", "sha256"] as const;

const INPUTS = [
  "",
  "a",
  "abc",
  "The quick brown fox jumps over the lazy dog",
  // 55, 56 and 64 bytes bracket the padding boundaries of both algorithms.
  "x".repeat(55),
  "x".repeat(56),
  "x".repeat(64),
  "x".repeat(200),
  "unicode: éè你好",
];

describe("createHash", () => {
  for (const algorithm of ALGORITHMS) {
    for (const input of INPUTS) {
      test(`${algorithm} matches node for ${JSON.stringify(input.slice(0, 24))} (${input.length} chars)`, () => {
        for (const encoding of ["hex", "base64", "base64url"] as const) {
          expect(createHash(algorithm).update(input).digest(encoding)).toBe(
            nodeCreateHash(algorithm).update(input).digest(encoding),
          );
        }
      });
    }
  }

  test("accepts the spellings node accepts", () => {
    const expected = nodeCreateHash("sha1").update("x").digest("hex");
    for (const spelling of ["sha1", "SHA1", "sha-1", "SHA-1"]) {
      expect(createHash(spelling).update("x").digest("hex")).toBe(expected);
    }
  });

  test("accumulates across update calls", () => {
    const chunked = createHash("sha256").update("one").update("two").update("three");
    expect(chunked.digest("hex")).toBe(
      nodeCreateHash("sha256").update("onetwothree").digest("hex"),
    );
  });

  test("hashes bytes as well as strings", () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 255]);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(
      nodeCreateHash("sha256").update(bytes).digest("hex"),
    );
  });

  test("copy() forks the accumulated state", () => {
    const base = createHash("sha256").update("shared");
    const left = base.copy().update("-left");
    const right = base.copy().update("-right");
    expect(left.digest("hex")).toBe(nodeCreateHash("sha256").update("shared-left").digest("hex"));
    expect(right.digest("hex")).toBe(nodeCreateHash("sha256").update("shared-right").digest("hex"));
  });

  test("refuses to update after digest, as node does", () => {
    const digest = createHash("sha1");
    digest.digest("hex");
    expect(() => digest.update("more")).toThrowError(
      expect.objectContaining({ code: "ERR_CRYPTO_HASH_FINALIZED" }),
    );
  });

  test("names an algorithm it does not implement", () => {
    expect(() => createHash("md5")).toThrowError(
      expect.objectContaining({ code: "ERR_JCO_UNSUPPORTED_NODE_API" }),
    );
    expect(() => createHash("md5")).toThrowError(/crypto\.subtle\.digest/);
  });

  test("reports what it implements", () => {
    expect(getHashes()).toEqual(["sha1", "sha256"]);
  });
});

describe("createHmac", () => {
  for (const algorithm of ALGORITHMS) {
    test(`${algorithm} matches node for a short key`, () => {
      expect(createHmac(algorithm, "secret").update("message").digest("base64")).toBe(
        nodeCreateHmac(algorithm, "secret").update("message").digest("base64"),
      );
    });

    test(`${algorithm} matches node for a key longer than the block size`, () => {
      const key = "k".repeat(200);
      expect(createHmac(algorithm, key).update("message").digest("hex")).toBe(
        nodeCreateHmac(algorithm, key).update("message").digest("hex"),
      );
    });

    test(`${algorithm} matches node for an empty message`, () => {
      expect(createHmac(algorithm, "secret").update("").digest("hex")).toBe(
        nodeCreateHmac(algorithm, "secret").update("").digest("hex"),
      );
    });
  }
});

describe("hash", () => {
  test("hashes in one call, defaulting to hex", () => {
    expect(hash("sha256", "one call")).toBe(
      nodeCreateHash("sha256").update("one call").digest("hex"),
    );
  });
});

describe("timingSafeEqual", () => {
  test("compares equal buffers", () => {
    expect(timingSafeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3]))).toBe(true);
  });

  test("compares differing buffers", () => {
    expect(timingSafeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 4]))).toBe(false);
  });

  test("refuses buffers of different lengths, as node does", () => {
    expect(() => timingSafeEqual(new Uint8Array([1]), new Uint8Array([1, 2]))).toThrowError(
      expect.objectContaining({ code: "ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH" }),
    );
  });
});
