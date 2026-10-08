import * as nodeCrypto from "node:crypto";
import { promisify } from "node:util";
import { describe, expect, test } from "vitest";
import * as crypto from "../../../../../../src/wasi/0.2.x/node/24.x.x/crypto/index.js";

describe("secret keys and KDFs", () => {
  test("secret keys copy their input and export independently", () => {
    const input = Buffer.from("a secret");
    const key = crypto.createSecretKey(input);
    input.fill(0);
    expect(key.export()).toEqual(Buffer.from("a secret"));
    key.export().fill(0);
    expect(key.export({ format: "jwk" })).toEqual(
      nodeCrypto.createSecretKey("a secret").export({ format: "jwk" }),
    );
    expect(key.symmetricKeySize).toBe(8);
    expect(key.equals(crypto.createSecretKey("a secret"))).toBe(true);
    expect(key.equals(crypto.createSecretKey("another!"))).toBe(false);
    expect(crypto.createHmac("sha512", key).update("payload").digest("hex")).toBe(
      nodeCrypto.createHmac("sha512", "a secret").update("payload").digest("hex"),
    );
  });

  test.each(["sha1", "sha256", "sha384", "sha512"])(
    "PBKDF2 and HKDF match Node for %s",
    async (digest) => {
      const expected = nodeCrypto.pbkdf2Sync("password é", "salt", 100, 35, digest);
      expect(crypto.pbkdf2Sync("password é", "salt", 100, 35, digest)).toEqual(expected);
      expect(await promisify(crypto.pbkdf2)("password é", "salt", 100, 35, digest)).toEqual(
        expected,
      );
      expect(Buffer.from(crypto.hkdfSync(digest, expected, "salt", "info", 31))).toEqual(
        Buffer.from(nodeCrypto.hkdfSync(digest, expected, "salt", "info", 31)),
      );
    },
  );

  test("scrypt aliases and callback form match Node", async () => {
    const expected = nodeCrypto.scryptSync("password", "salt", 32, { N: 1024, r: 8, p: 1 });
    expect(crypto.scryptSync("password", "salt", 32, { cost: 1024 })).toEqual(expected);
    expect(await promisify(crypto.scrypt)("password", "salt", 32, { N: 1024, r: 8, p: 1 })).toEqual(
      expected,
    );
    expect(() => crypto.scryptSync("pw", "salt", 16, { N: 3 })).toThrowError(
      expect.objectContaining({
        name: "RangeError",
        code: "ERR_CRYPTO_INVALID_SCRYPT_PARAMS",
        message: "Invalid scrypt params",
      }),
    );
  });
});
