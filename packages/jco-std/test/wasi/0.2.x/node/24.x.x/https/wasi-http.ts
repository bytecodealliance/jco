import { describe, expect, test } from "vitest";

import {
  createWasiHttpImplementation,
  type WasiHttpProvider,
  type WasiHttpScheme,
} from "../../../../../../src/wasi/0.2.x/node/24.x.x/http/impl/wasi-http.js";
import { createHttps } from "../../../../../../src/wasi/0.2.x/node/24.x.x/https/core.js";

/** A provider that records the scheme and then refuses the connection. */
function refusingProvider(): { provider: WasiHttpProvider; schemes: WasiHttpScheme[] } {
  const schemes: WasiHttpScheme[] = [];
  const provider = {
    outgoingHandler: {
      handle() {
        return {
          subscribe: () => ({ block: () => undefined }),
          get: () => ({
            tag: "ok" as const,
            val: { tag: "err" as const, val: { tag: "connection-refused" } },
          }),
        };
      },
    },
    types: {
      Fields: { fromList: () => ({ entries: () => [] }) },
      IncomingBody: { finish: () => undefined },
      OutgoingBody: { finish: () => undefined },
      OutgoingRequest: class {
        body() {
          return { write: () => ({ blockingWriteAndFlush: () => undefined }) };
        }

        setMethod(): void {}

        setScheme(scheme: WasiHttpScheme | undefined): void {
          if (scheme) {
            schemes.push(scheme);
          }
        }

        setAuthority(): void {}

        setPathWithQuery(): void {}
      },
      RequestOptions: class {
        setConnectTimeout(): void {}

        setFirstByteTimeout(): void {}

        setBetweenBytesTimeout(): void {}
      },
    },
  } satisfies WasiHttpProvider;
  return { provider, schemes };
}

describe("node:https wasi:http implementation", () => {
  test.concurrent("sets the HTTPS scheme variant rather than an `other` string", async () => {
    const { provider, schemes } = refusingProvider();
    const https = createHttps(createWasiHttpImplementation(provider));
    const request = https.request("https://example.com/");
    const error = new Promise<Error>((resolve) => request.once("error", resolve));
    request.end();
    await expect(error).resolves.toMatchObject({ code: "ECONNREFUSED" });
    expect(schemes).toEqual([{ tag: "HTTPS" }]);
  });

  test.concurrent("refuses per-request TLS options, which outgoing-handler cannot honour", async () => {
    const { provider, schemes } = refusingProvider();
    const https = createHttps(createWasiHttpImplementation(provider));
    const request = https.request({ host: "example.com", rejectUnauthorized: false });
    const error = new Promise<Error>((resolve) => request.once("error", resolve));
    request.end();
    await expect(error).resolves.toMatchObject({
      code: "ERR_JCO_UNSUPPORTED_NODE_API",
      message: expect.stringContaining(
        "https.request TLS options with the wasi-http implementation",
      ),
    });
    expect(schemes).toEqual([]);
  });

  test.concurrent("rejects server construction immediately", () => {
    const https = createHttps(createWasiHttpImplementation({} as never));
    expect(() => https.createServer()).toThrow(
      expect.objectContaining({
        code: "ERR_JCO_UNSUPPORTED_NODE_API",
        message: expect.stringContaining("https.Server"),
      }),
    );
  });
});
