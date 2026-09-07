import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createServer as tcpServer, type Socket } from "node:net";
import { createServer as tlsServer } from "node:tls";
import { expect, test } from "vitest";

const exec = promisify(execFile);
const fixture = new URL("./helpers/tls/", import.meta.url);
const cert = await readFile(new URL("localhost.crt", fixture));
const key = await readFile(new URL("localhost.key", fixture));
test.concurrent.each(["unstarted", "pending", "completed"])(
  "TLS resource ownership: %s",
  async (mode: string): Promise<void> => {
    const peers = new Set<Socket>();
    const server = mode === "completed" ? tlsServer({ cert, key }) : tcpServer();
    server.on("connection", (socket: Socket): void => {
      peers.add(socket);
      socket.once("close", (): void => {
        peers.delete(socket);
      });
    });
    server.on("tlsClientError", (): void => {});
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    try {
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Expected TCP address");
      }
      const result = await exec(
        process.execPath,
        [fileURLToPath(new URL("lifecycle.ts", fixture)), String(address.port), mode],
        { timeout: 5000 },
      );
      expect(result.stdout.trim()).toBe("clean");
    } finally {
      for (const peer of peers) {
        peer.destroy();
      }
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  },
);
