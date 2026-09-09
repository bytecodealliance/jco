import nativeProcess from "node:process";
import { expect, test } from "vitest";
import { process } from "../helpers/process.js";
test("supported features describe Node and deprecated getters fail", () => {
  expect(process.features.tls).toBe(nativeProcess.features.tls);
  expect(process.features.require_module).toBe(nativeProcess.features.require_module);
  for (const name of ["ipv6", "uv", "tls_alpn", "tls_ocsp", "tls_sni"] as const) {
    expect(() => process.features[name]).toThrow(
      expect.objectContaining({ code: "ERR_JCO_UNSUPPORTED_DEPRECATED_NODE_API" }),
    );
  }
});
