import { describe, expect, test } from "vitest";

import nodeDomain from "node:domain";

import domain, {
  Domain,
  create,
  createDomain,
  DEPRECATED_CODE,
} from "../../../../../../src/wasi/0.2.x/node/24.x.x/domain.js";

const DEPRECATED = expect.objectContaining({ code: DEPRECATED_CODE });

/**
 * `node:domain` is deprecated upstream in its entirety, so Jco implements none of it. What is under
 * test is that it still resolves and refuses clearly, rather than failing as an unknown import.
 */
describe("node:domain is refused, not implemented", () => {
  test.concurrent("carries Node's module shape", () => {
    // Checked with `in` rather than by reading: touching `active` or `_stack` is itself a use, and
    // throws by design.
    for (const key of Object.keys(nodeDomain)) {
      expect(key in domain, key).toBe(true);
    }
  });

  test.concurrent("importing does not throw; only using does", () => {
    // Reaching this line at all is the assertion: the module evaluated cleanly.
    expect(typeof create).toBe("function");
    expect(typeof createDomain).toBe("function");
    expect(typeof Domain).toBe("function");
  });

  test.each([
    ["create", () => create()],
    ["createDomain", () => createDomain()],
    ["new Domain", () => new Domain()],
    ["active", () => domain.active],
    ["_stack", () => domain._stack],
  ])("%s throws the deprecated error", (_name, use) => {
    expect(use).toThrow(DEPRECATED);
  });

  test.concurrent("the error names the API and a way forward", () => {
    try {
      create();
      expect.unreachable("expected a refusal");
    } catch (error) {
      expect(String(error)).toMatch(/domain\.create\(\)/);
      expect(String(error)).toMatch(/deprecated in Node\.js/);
      expect(String(error)).toMatch(/AsyncLocalStorage/);
    }
  });

  test.concurrent("Domain cannot be subclassed into something usable either", () => {
    class Custom extends Domain {}
    expect(() => new Custom()).toThrow(DEPRECATED);
  });

  test.concurrent("the same code is used as other deprecated Node APIs", () => {
    expect(DEPRECATED_CODE).toBe("ERR_JCO_UNSUPPORTED_DEPRECATED_NODE_API");
  });
});
