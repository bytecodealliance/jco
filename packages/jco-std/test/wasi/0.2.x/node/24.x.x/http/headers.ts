import nodeHttp from "node:http";

import { describe, expect, test } from "vitest";

import { HeaderStore } from "../../../../../../src/wasi/0.2.x/node/24.x.x/http/headers.js";
import { recordingImplementation } from "./helpers/index.js";

describe("node:http headers", () => {
  test.each(["content-type", "X_Custom", "!#$%&'*+-.^_`|~"])(
    "accepts valid header name %s",
    (name) => {
      expect(() => nodeHttp.validateHeaderName(name)).not.toThrow();
      expect(() => recordingImplementation().http.validateHeaderName(name)).not.toThrow();
    },
  );

  test.each(["", "contains space", "bad:name", "line\nfeed"])(
    "matches Node's rejection of invalid header name %j",
    (name) => {
      expect(() => nodeHttp.validateHeaderName(name)).toThrow();
      expect(() => recordingImplementation().http.validateHeaderName(name)).toThrow(
        expect.objectContaining({ code: "ERR_INVALID_HTTP_TOKEN" }),
      );
    },
  );

  test("preserves casing, repeated values, and latin-1 bytes", () => {
    const store = new HeaderStore();
    store.set("X-Name", "caf\u00e9");
    store.append("X-Name", "second");
    expect(store.names()).toEqual(["x-name"]);
    expect(store.rawNames()).toEqual(["X-Name"]);
    expect(store.get("x-NAME")).toEqual(["caf\u00e9", "second"]);
    expect(store.fields().map(({ value }) => [...value])).toEqual([
      [99, 97, 102, 233],
      [115, 101, 99, 111, 110, 100],
    ]);
  });

  test("rejects mutation after headers are sent", () => {
    const store = new HeaderStore({ Accept: "text/plain" });
    store.markSent();
    expect(() => store.set("Accept", "application/json")).toThrow(
      expect.objectContaining({ code: "ERR_HTTP_HEADERS_SENT" }),
    );
  });
});
