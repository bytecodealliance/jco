import { describe, test, expect } from "vitest";

import { random, insecure, insecureSeed } from "@bytecodealliance/preview3-shim/random";

describe("Node.js Preview3 wasi-random", () => {
  test("random.getRandomBytes returns a Uint8Array of the requested length", () => {
    const bytes = random.getRandomBytes(16n);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.byteLength).toBe(16);
  });

  test("insecure.getInsecureRandomBytes returns a Uint8Array of the requested length", () => {
    const bytes = insecure.getInsecureRandomBytes(8n);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.byteLength).toBe(8);
  });

  test("insecureSeed exposes p3 `getInsecureSeed` (renamed from p2 `insecureSeed`)", () => {
    expect(typeof insecureSeed.getInsecureSeed).toBe("function");

    const seed = insecureSeed.getInsecureSeed();
    expect(Array.isArray(seed)).toBe(true);
    expect(seed).toHaveLength(2);
    expect(typeof seed[0]).toBe("bigint");
    expect(typeof seed[1]).toBe("bigint");
  });
});
