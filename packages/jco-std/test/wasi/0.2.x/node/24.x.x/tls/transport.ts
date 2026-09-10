import native from "node:tls";
import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";
import { createTls } from "../../../../../../src/wasi/0.2.x/node/24.x.x/tls/core.js";
import { createTlsHost } from "../../../../../../src/wasi/0.2.x/node/24.x.x/tls/host-node.js";
import type { TlsSocket } from "../../../../../../src/wasi/0.2.x/node/24.x.x/tls/types.js";

const [key, cert] = await Promise.all(
  ["key", "crt"].map((ext) =>
    readFile(new URL(`../https/helpers/tls/localhost.${ext}`, import.meta.url)),
  ),
);

function setup() {
  const host = createTlsHost();
  const { api, tlsCallbacks } = createTls(host);
  host.attachCallbacks(tlsCallbacks);
  return { api, host };
}

test.concurrent("server close callbacks complete once, including an unstarted listener", async () => {
  const { api, host } = setup();
  try {
    const server = api.createServer({ key, cert });
    server.maxConnections = 5;
    expect(server.maxConnections).toBe(5);
    let count = 0;
    const error = await new Promise<Error | undefined>((resolve) =>
      server.close((error) => {
        count++;
        resolve(error);
      }),
    );
    expect(error).toMatchObject({ code: "ERR_SERVER_NOT_RUNNING" });
    await new Promise((resolve) => setImmediate(resolve));
    expect(count).toBe(1);
    expect(server.listening).toBe(false);
  } finally {
    host.dispose();
  }
});

test.concurrent("explicit legacy protocol selection and unsupported server callbacks are deliberate", () => {
  const { api, host } = setup();
  try {
    expect(() => api.createSecureContext({ secureProtocol: "TLSv1_2_method" })).not.toThrow();
    const server = api.createServer({ key, cert });
    for (const name of ["newSession", "resumeSession", "OCSPRequest", "keylog", "connection"]) {
      expect(() => server.on(name, () => {})).toThrow(/not supported/);
    }
    expect(() => {
      api.CLIENT_RENEG_LIMIT = 100;
    }).toThrow(/host policy/);
    expect(() => new api.TLSSocket()).toThrow(/use tls.connect/);
  } finally {
    host.dispose();
  }
});

test.concurrent("documentation echo with mutual authentication and stream backpressure", async () => {
  const { api, host } = setup();
  const payload = Buffer.alloc(256 * 1024, 37);
  const server = api.createServer(
    { key, cert, ca: [cert], requestCert: true, highWaterMark: 1024, ALPNProtocols: ["echo"] },
    (socket) => {
      socket.on("error", () => {});
      expect(socket.authorized).toBe(true);
      socket.pipe(socket);
    },
  );
  try {
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected TCP listener");
    }
    const client = api.connect(address.port, "127.0.0.1", {
      key,
      cert,
      ca: [cert],
      servername: "localhost",
      ALPNProtocols: ["echo"],
      highWaterMark: 1024,
    });
    const received: Buffer[] = [];
    const ended = new Promise<void>((resolve, reject) => {
      client.on("end", resolve);
      client.on("error", reject);
    });
    client.on("data", (chunk: Buffer) => received.push(chunk));
    await new Promise<void>((resolve, reject) => {
      client.once("secureConnect", resolve);
      client.once("error", reject);
    });
    expect(client.alpnProtocol).toBe("echo");
    expect(client.getProtocol()).toMatch(/^TLSv1\.[23]$/);
    expect(client.getPeerCertificate(true).issuerCertificate).toMatchObject({
      subject: { CN: "localhost" },
    });
    expect(Buffer.isBuffer(client.exportKeyingMaterial(32, "fixture"))).toBe(true);
    expect(client.write(payload)).toBe(false);
    client.end();
    await ended;
    expect(Buffer.concat(received)).toEqual(payload);
    client.destroy();
    await new Promise<void>((resolve) => server.close(resolve));
  } finally {
    host.dispose();
  }
  expect(host.resourceCounts()).toEqual({ sockets: 0, servers: 0, contexts: 0 });
}, 10_000);

test.concurrent.each(["untrusted", "hostname", "custom", "permissive", "empty-end"])(
  "client verification and termination: %s",
  async (mode) => {
    const peer = native.createServer({ key, cert }, (socket) => socket.end("ok"));
    peer.on("tlsClientError", () => {});
    await new Promise<void>((resolve) => peer.listen(0, "127.0.0.1", resolve));
    const address = peer.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected TCP listener");
    }
    const { api, host } = setup();
    let client: TlsSocket | undefined;
    try {
      client = api.connect({
        port: address.port,
        host: "127.0.0.1",
        servername: mode === "hostname" ? "wrong.example" : "localhost",
        ca: mode === "untrusted" ? undefined : [cert],
        rejectUnauthorized: mode === "permissive" ? false : true,
        checkServerIdentity:
          mode === "custom"
            ? () => Object.assign(new Error("pin rejected"), { code: "ERR_TEST_PIN" })
            : undefined,
      });
      const outcome = new Promise<string>((resolve, reject) => {
        client!.once("error", (error: Error & { code: string }) => resolve(error.code));
        client!.once("secureConnect", () => resolve("connected"));
        setTimeout(() => reject(new Error("handshake timeout")), 5000).unref();
      });
      if (mode === "empty-end") {
        client.end();
      }
      expect(await outcome).toBe(
        mode === "untrusted"
          ? "DEPTH_ZERO_SELF_SIGNED_CERT"
          : mode === "hostname"
            ? "ERR_TLS_CERT_ALTNAME_INVALID"
            : mode === "custom"
              ? "ERR_TEST_PIN"
              : "connected",
      );
    } finally {
      client?.destroy();
      host.dispose();
      await new Promise<void>((resolve) => peer.close(() => resolve()));
    }
  },
  10_000,
);
