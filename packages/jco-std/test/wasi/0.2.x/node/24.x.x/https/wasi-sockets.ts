import { describe, expect, test } from "vitest";

import {
  createWasiSocketsHttpImplementation,
  type WasiSocketsProvider,
} from "../../../../../../src/wasi/0.2.x/node/24.x.x/http/impl/wasi-sockets.js";
import { createHttps } from "../../../../../../src/wasi/0.2.x/node/24.x.x/https/core.js";

/** A provider that fails loudly if the implementation ever reaches the network. */
function untouchedProvider(): WasiSocketsProvider {
  return {
    instanceNetwork: {
      instanceNetwork: () => {
        throw new Error("network touched");
      },
    },
    ipNameLookup: {
      resolveAddresses: () => {
        throw new Error("resolver touched");
      },
    },
    tcpCreateSocket: {
      createTcpSocket: () => {
        throw new Error("socket created");
      },
    },
  };
}

describe("node:https wasi:sockets implementation", () => {
  test.concurrent("refuses client requests before touching the network", async () => {
    const https = createHttps(createWasiSocketsHttpImplementation(untouchedProvider()));
    const request = https.request("https://example.com/");
    const error = new Promise<Error>((resolve) => request.once("error", resolve));
    request.end();
    await expect(error).resolves.toMatchObject({
      code: "ERR_JCO_UNSUPPORTED_NODE_API",
      message: expect.stringMatching(/https: requests with the wasi-sockets implementation.*TLS/),
    });
  });

  test.concurrent("refuses https servers instead of serving plaintext", () => {
    const https = createHttps(createWasiSocketsHttpImplementation(untouchedProvider()));
    for (const create of [
      () => https.createServer(),
      () => https.createServer({ key: "K", cert: "C" }, () => undefined),
      () => new https.Server(),
    ]) {
      expect(create).toThrow(
        expect.objectContaining({
          code: "ERR_JCO_UNSUPPORTED_NODE_API",
          message: expect.stringMatching(/https\.Server with the wasi-sockets implementation.*TLS/),
        }),
      );
    }
  });
});
