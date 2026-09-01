import { describe, expect, test } from "vitest";

import consumers, * as namespace from "../../../../../../src/wasi/0.2.x/node/24.x.x/stream/consumers.js";

const KEYS = ["arrayBuffer", "blob", "buffer", "bytes", "json", "text"];

describe("node:stream/consumers module", () => {
  test("exposes the complete Node 24 surface", () => {
    expect(Object.keys(consumers).sort()).toEqual(KEYS);
    expect(
      Object.keys(namespace)
        .filter((key) => key !== "default")
        .sort(),
    ).toEqual(KEYS);
  });

  test("shares default and named export identities", () => {
    for (const key of KEYS) {
      expect(consumers[key as keyof typeof consumers]).toBe(
        namespace[key as keyof typeof namespace],
      );
    }
  });
});
