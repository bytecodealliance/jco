import nodeHttps from "node:https";

import { describe, expect, test } from "vitest";

import type { IncomingMessage } from "../../../../../../src/wasi/0.2.x/node/24.x.x/http/incoming-message.js";
import { Agent } from "../../../../../../src/wasi/0.2.x/node/24.x.x/https/agent.js";
import { describeDifferential } from "../helpers/assert.js";
import { recordingImplementation } from "./helpers/index.js";

const decoder = new TextDecoder();

function header(
  request: { headers: Array<{ name: string; value: Uint8Array }> },
  name: string,
): string | undefined {
  const field = request.headers.find((entry) => entry.name.toLowerCase() === name);
  return field === undefined ? undefined : decoder.decode(field.value);
}

describe("node:https request", () => {
  test.concurrent("sends the https scheme to the implementation", () => {
    const { https, requests } = recordingImplementation();
    https.request("https://example.com/a?b=1").end();
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      method: "GET",
      scheme: "https",
      authority: "example.com",
      pathWithQuery: "/a?b=1",
    });
  });

  test.concurrent("elides the default port 443 from the authority and Host header", () => {
    const { https, requests } = recordingImplementation();
    https.request("https://example.com:443/").end();
    https.request("https://example.com:8443/").end();
    expect(requests[0].authority).toBe("example.com");
    expect(header(requests[0], "host")).toBe("example.com");
    expect(requests[1].authority).toBe("example.com:8443");
    expect(header(requests[1], "host")).toBe("example.com:8443");
  });

  test.concurrent("keeps port 80 in the authority, unlike node:http", () => {
    const { https, requests } = recordingImplementation();
    https.request({ host: "example.com", port: 80 }).end();
    expect(requests[0].authority).toBe("example.com:80");
  });

  test.concurrent("defaults to port 443 when the options carry none", () => {
    const { https, requests } = recordingImplementation();
    https.request({ host: "example.com" }).end();
    expect(requests[0].authority).toBe("example.com");
    expect(header(requests[0], "host")).toBe("example.com");
  });

  test.concurrent("honours an explicit defaultPort for elision", () => {
    const { https, requests } = recordingImplementation();
    https.request({ host: "example.com", defaultPort: 8443 }).end();
    expect(requests[0].authority).toBe("example.com");
  });

  test.concurrent("takes the default port from an explicitly supplied agent", () => {
    const { https, requests } = recordingImplementation();
    https.request({ host: "example.com", agent: new Agent({ defaultPort: 8443 }) }).end();
    expect(requests[0].authority).toBe("example.com");
  });

  test.concurrent("defaults the agent to the https global agent", () => {
    const { https } = recordingImplementation();
    const request = https.request("https://example.com/");
    expect(request.agent).toBe(https.globalAgent);
    expect(request.agent?.protocol).toBe("https:");
    request.end();
  });

  test.concurrent("gives agent: false a fresh https agent", () => {
    const { https } = recordingImplementation();
    const request = https.request({ host: "example.com", agent: false });
    expect(request.agent).toBeInstanceOf(https.Agent);
    expect(request.agent).not.toBe(https.globalAgent);
    expect(request.agent.protocol).toBe("https:");
    expect(request.agent.keepAlive).toBe(false);
    request.end();
  });

  test.concurrent("reports the https protocol on the request", () => {
    const { https } = recordingImplementation();
    const request = https.request("https://example.com/");
    expect(request.protocol).toBe("https:");
    request.end();
  });

  test.concurrent("carries basic auth from the URL", () => {
    const { https, requests } = recordingImplementation();
    https.request("https://user:pass@example.com/").end();
    expect(header(requests[0], "authorization")).toBe(`Basic ${btoa("user:pass")}`);
  });

  test.concurrent("buffers a request body and frames it", async () => {
    const { https, requests } = recordingImplementation();
    const response = new Promise<IncomingMessage>((resolve) => {
      const request = https.request("https://example.com/", { method: "post" }, resolve);
      request.write("hello ");
      request.end("world");
    });
    const message = await response;
    expect(decoder.decode(requests[0].body)).toBe("hello world");
    expect(header(requests[0], "content-length")).toBe("11");
    expect(requests[0].method).toBe("POST");
    expect(message.statusCode).toBe(200);
  });

  test.concurrent("carries client TLS options to the implementation", () => {
    const { https, requests } = recordingImplementation();
    https
      .request({
        host: "example.com",
        ca: ["A", "B"],
        cert: "C",
        key: "K",
        rejectUnauthorized: false,
        servername: "sni.example.com",
        minVersion: "TLSv1.3",
        ALPNProtocols: ["http/1.1"],
      })
      .end();
    const tls = requests[0].tls!;
    expect(tls.ca!.map((entry) => decoder.decode(entry))).toEqual(["A", "B"]);
    expect(tls.cert!.map((entry) => decoder.decode(entry))).toEqual(["C"]);
    expect(tls.key!.map((entry) => decoder.decode(entry))).toEqual(["K"]);
    expect(tls).toMatchObject({
      rejectUnauthorized: false,
      servername: "sni.example.com",
      minVersion: "TLSv1.3",
      alpnProtocols: ["http/1.1"],
    });
  });

  test.concurrent("omits the TLS record when no TLS option is given", () => {
    const { https, requests } = recordingImplementation();
    https.request("https://example.com/").end();
    https.request({ host: "example.com", timeout: 5, headers: { a: "b" } }).end();
    expect("tls" in requests[0]).toBe(false);
    expect("tls" in requests[1]).toBe(false);
  });

  test.concurrent("refuses unrepresentable client TLS options before sending anything", () => {
    const { https, requests } = recordingImplementation();
    for (const [name, value] of [
      ["checkServerIdentity", () => undefined],
      ["secureContext", {}],
      ["session", new Uint8Array(8)],
      ["pskCallback", () => undefined],
    ] as const) {
      expect(() => https.request({ host: "example.com", [name]: value })).toThrow(
        expect.objectContaining({
          code: "ERR_JCO_UNSUPPORTED_NODE_API",
          message: expect.stringContaining(`https.request option ${name}`),
        }),
      );
    }
    expect(requests).toHaveLength(0);
  });

  test.concurrent("labels its refusals as https", () => {
    const { https } = recordingImplementation();
    const request = https.request("https://example.com/");
    expect(() => request.setNoDelay()).toThrow(
      expect.objectContaining({
        code: "ERR_JCO_UNSUPPORTED_NODE_API",
        message: expect.stringContaining("https.ClientRequest.setNoDelay"),
      }),
    );
    expect(() => request.abort()).toThrow(
      expect.objectContaining({
        code: "ERR_JCO_UNSUPPORTED_DEPRECATED_NODE_API",
        message: expect.stringContaining("https.ClientRequest.abort"),
      }),
    );
    request.end();
  });
});

describeDifferential("node:https request differential", () => {
  for (const protocol of ["http:", "ftp:", "wss:"]) {
    test.concurrent(`rejects the ${protocol} protocol the way Node does`, () => {
      const { https } = recordingImplementation();
      const options = { host: "example.com", protocol };
      let native: unknown;
      try {
        nodeHttps.request(options).destroy();
      } catch (error) {
        native = error;
      }
      expect(native).toMatchObject({
        code: "ERR_INVALID_PROTOCOL",
        message: `Protocol "${protocol}" not supported. Expected "https:"`,
      });
      expect(() => https.request(options)).toThrow(
        expect.objectContaining({
          code: "ERR_INVALID_PROTOCOL",
          message: (native as Error).message,
        }),
      );
    });
  }

  test.concurrent("rejects an http URL the way Node does", () => {
    const { https } = recordingImplementation();
    expect(() => https.request("http://example.com/")).toThrow(
      expect.objectContaining({
        code: "ERR_INVALID_PROTOCOL",
        message: 'Protocol "http:" not supported. Expected "https:"',
      }),
    );
  });

  test.concurrent("rejects unescaped characters in the path", () => {
    const { https } = recordingImplementation();
    expect(() => https.request({ host: "example.com", path: "/a b" })).toThrow(
      expect.objectContaining({ code: "ERR_UNESCAPED_CHARACTERS" }),
    );
  });
});
