import { expect } from "vitest";
import { util, native, test } from "../helpers/util.js";

test("types.isCryptoKey checks engine key slots", async () => {
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 128 }, true, ["encrypt"]);
  for (const value of [key, {}, null, { [Symbol.toStringTag]: "CryptoKey" }]) {
    expect(util.types.isCryptoKey(value)).toBe(native.types.isCryptoKey(value));
  }
});
