import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { tcpCreateSocket, instanceNetwork } from "../../../dist/nodejs/sockets.js";
import { createTlsProvider, _resourceCounts } from "../../../dist/nodejs/tls.js";

function dispose(resource: object): void {
    assert(Symbol.dispose in resource);
    const drop: unknown = resource[Symbol.dispose];
    assert(typeof drop === "function");
    drop.call(resource);
}
const mode = process.argv[3];
const ca = await readFile(new URL("./localhost.crt", import.meta.url), "utf8");
const provider = createTlsProvider({ ca: [ca], handshakeTimeoutMs: 1000 });
const before = _resourceCounts();
const socket = tcpCreateSocket.createTcpSocket("ipv4");
socket.startConnect(instanceNetwork.instanceNetwork(), {
    tag: "ipv4",
    val: { address: [127, 0, 0, 1], port: Number(process.argv[2]) },
});
const poll = socket.subscribe();
poll.block();
dispose(poll);
const [input, output] = socket.finishConnect();
const handshake = new provider.ClientHandshake("localhost", input, output);
if (mode === "unstarted") {
    handshake[Symbol.dispose]();
} else {
    const future = provider.ClientHandshake.finish(handshake);
    assert.throws(() => provider.ClientHandshake.finish(handshake), /consumed/);
    handshake[Symbol.dispose](); // consuming finish transfers ownership out of it
    const ready = future.subscribe();
    assert.throws(() => future[Symbol.dispose](), /child poll/);
    if (mode === "pending") {
        assert.equal(future.get(), undefined);
        dispose(ready);
        future[Symbol.dispose]();
    } else {
        ready.block();
        dispose(ready);
        const result = future.get();
        assert.equal(result?.tag, "ok");
        assert(result?.tag === "ok" && result.val.tag === "ok");
        assert.deepEqual(future.get(), { tag: "err", val: undefined });
        const [connection, plaintextInput, plaintextOutput] = result.val.val;
        future[Symbol.dispose]();
        connection.closeOutput();
        dispose(plaintextOutput);
        dispose(plaintextInput);
        connection[Symbol.dispose]();
        connection[Symbol.dispose]();
    }
}
dispose(socket);
assert.deepEqual(_resourceCounts(), before);
console.log("clean");
