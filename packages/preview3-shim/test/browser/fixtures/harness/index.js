import { _setArgs, _setEnv } from "@bytecodealliance/preview3-shim/cli";
import * as filesystem from "@bytecodealliance/preview3-shim/filesystem";
import { _forbiddenHeaders } from "@bytecodealliance/preview3-shim/http";
import * as sockets from "@bytecodealliance/preview3-shim/sockets";

import {
  assert,
  byteStream,
  configureOpfs,
  readText,
  runComponent,
  withOpfsScratch,
} from "./helpers.js";

// Capture component output in the page result while preserving DevTools diagnostics.
const logs = [];
const originalLog = console.log;
console.log = (...values) => {
  logs.push(values.map(String).join(" "));
  originalLog(...values);
};
const originalError = console.error;
console.error = (...values) => {
  logs.push(values.map(String).join(" "));
  originalError(...values);
};

function update(status, extra = {}) {
  document.body.textContent = JSON.stringify({ status, logs, ...extra });
}

// Each action owns one host-side scenario. Keeping these separate from bootstrapping makes it
// straightforward to see which shim state is configured and which browser behavior is asserted.
const actions = {
  // Verify a component-model stream returned by a component behaves like a browser async stream.
  async "closed-stream"(component) {
    const stream = component["local:local/closed-stream"].get();
    const { value, done } = await stream[Symbol.asyncIterator]().next();
    assert(value === undefined, "closed stream unexpectedly produced a value");
    assert(done === true, "component-exported stream did not close");
  },
  // Run a P3 filesystem component with its root preopen backed by real browser OPFS.
  async "opfs-component"(component) {
    await withOpfsScratch(async (directory) => {
      const adapter = await configureOpfs(directory);
      await runComponent(component);
      // Component mutations schedule an automatic flush; let it settle before forcing one.
      await new Promise((resolve) => setTimeout(resolve, 0));
      await adapter.flush();
      console.log("OPFS component run completed");
    });
  },
  // Persist P3 descriptor mutations, reconstruct the adapter, and validate the reloaded tree.
  async "opfs-persistence"() {
    await withOpfsScratch(async (directory) => {
      const adapter = await configureOpfs(directory);
      const [[root, path]] = filesystem._getPreopens();
      assert(path === "/", `unexpected OPFS preopen path: ${path}`);

      await root.createDirectoryAt("notes");
      const file = await root.openAt(
        {},
        "notes/todo.txt",
        { create: true },
        { read: true, write: true },
      );
      const writeResult = await file.writeViaStream(byteStream("buy milk"), 0n);
      assert(writeResult.tag === "ok", `file write failed: ${JSON.stringify(writeResult)}`);
      await root.symlinkAt("notes/todo.txt", "todo-link.txt");

      await new Promise((resolve) => setTimeout(resolve, 0));
      await adapter.flush();

      await configureOpfs(directory);
      const [[reloadedRoot]] = filesystem._getPreopens();
      assert(
        (await reloadedRoot.readlinkAt("todo-link.txt")) === "notes/todo.txt",
        "symlink target did not survive OPFS reload",
      );
      const linked = await reloadedRoot.openAt(
        { symlinkFollow: true },
        "todo-link.txt",
        {},
        { read: true },
      );
      assert((await readText(linked)) === "buy milk", "file contents did not survive OPFS reload");

      const [entries, completed] = reloadedRoot.readDirectory();
      const names = [];
      for await (const entry of entries) {
        names.push(entry.name);
      }
      assert((await completed).tag === "ok", "directory read did not complete successfully");
      assert(names.includes("notes"), "persisted directory is missing after OPFS reload");
      assert(names.includes("todo-link.txt"), "persisted symlink is missing after OPFS reload");
      assert(!names.includes(".__wasi_symlinks__.json"), "OPFS sidecar leaked to the guest");
      console.log("OPFS persistence verified");
    });
  },
  // Exercise application-supplied TCP and UDP providers under actual browser package conditions.
  async "socket-providers"() {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const tcpAddress = { tag: "ipv4", val: { address: [127, 0, 0, 1], port: 8080 } };
    const tcpProvider = new sockets.InMemoryTcpSockets();
    const previousTcp = sockets._setTcpProvider(tcpProvider);
    try {
      const listener = sockets.types.TcpSocket.create("ipv4");
      listener.bind(tcpAddress);
      const accepted = listener.listen().getReader();
      const client = tcpProvider.connect(tcpAddress);
      client.write(encoder.encode("in-memory TCP"));
      const { value: connection } = await accepted.read();
      const [contents] = connection.receive();
      const bytes = [];
      for await (const byte of contents) {
        bytes.push(byte);
      }
      assert(decoder.decode(Uint8Array.from(bytes)) === "in-memory TCP", "TCP data mismatch");
    } finally {
      sockets._setTcpProvider(previousTcp);
    }

    const serverAddress = { tag: "ipv4", val: { address: [127, 0, 0, 1], port: 8081 } };
    const clientAddress = { tag: "ipv4", val: { address: [127, 0, 0, 1], port: 9091 } };
    const udpProvider = new sockets.InMemoryUdpSockets();
    const previousUdp = sockets._setUdpProvider(udpProvider);
    try {
      const socket = sockets.types.UdpSocket.create("ipv4");
      socket.bind(serverAddress);
      const client = udpProvider.createClient(clientAddress);
      client.send(encoder.encode("in-memory UDP"), serverAddress);
      const [data, remoteAddress] = await socket.receive();
      assert(decoder.decode(data) === "in-memory UDP", "UDP data mismatch");
      assert(
        JSON.stringify(remoteAddress) === JSON.stringify(clientAddress),
        "UDP remote address mismatch",
      );
    } finally {
      sockets._setUdpProvider(previousUdp);
    }
    console.log("socket providers verified");
  },
};

// Bootstrap the shim exactly as an application would before importing a transpiled component.
// The URL hash selects both the generated module and, when needed, a host-driven action above.
async function main() {
  const params = new URLSearchParams(location.hash.slice(1));
  const moduleName = params.get("entry");
  if (!moduleName) {
    throw new Error("missing transpiled module path");
  }
  _setArgs(["component"]);
  _setEnv({ HTTP_SERVER: location.host });
  filesystem._setFileData({ dir: {} });
  _forbiddenHeaders.value.add("custom-forbidden-header");

  const component = await import(`/transpiled/${moduleName}`);
  await component.$init;
  const action = params.get("action");
  if (action) {
    if (!actions[action]) {
      throw new Error(`unknown browser test action: ${action}`);
    }
    await actions[action](component);
  } else {
    await runComponent(component);
  }
}

// Report a machine-readable terminal state for the Puppeteer-side polling helper.
update("running");
void main().then(
  () => update("success"),
  (error) => update("error", { message: String(error), stack: error?.stack }),
);
