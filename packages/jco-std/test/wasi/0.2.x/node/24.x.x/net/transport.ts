import { describe, expect, test } from "vitest";

import {
  connect,
  errorCode,
} from "../../../../../../src/wasi/0.2.x/node/24.x.x/internal/wasi-sockets.js";
import { createProvider } from "./helpers/provider.js";

describe("shared WASI TCP transport", () => {
  test("recognizes ComponentizeJS result errors", () => {
    expect(errorCode(Object.assign(new Error("closed"), { payload: { tag: "closed" } }))).toBe(
      "closed",
    );
    expect(errorCode({ payload: "would-block" })).toBe("would-block");
    expect(errorCode(new Error("unrelated"))).toBeUndefined();
  });
  test("terminates when a literal address is filtered by family", () => {
    const { provider, disposed } = createProvider();
    expect(() => connect(provider, "127.0.0.1", 80, { family: 6 })).toThrow();
    expect(disposed).toEqual(["network"]);
  });

  test("terminates when a literal address is denied", () => {
    const { provider, disposed } = createProvider();
    expect(() => connect(provider, "127.0.0.1", 80, { allowAddress: () => false })).toThrow();
    expect(disposed).toEqual(["network"]);
  });
});
