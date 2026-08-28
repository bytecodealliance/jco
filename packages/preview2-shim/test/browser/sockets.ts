import { suite, test, assert } from "vitest";

suite("Browser sockets", () => {
    test("browser raw sockets fail with not-supported", async () => {
        const sockets = await import("../../src/browser/sockets.js");
        assert.strictEqual(
            sockets.instanceNetwork.instanceNetwork(),
            sockets.instanceNetwork.instanceNetwork(),
        );
        assert.throws(() => sockets.tcpCreateSocket.createTcpSocket("ipv4"), /not-supported/);
        assert.throws(() => sockets.udpCreateSocket.createUdpSocket("ipv4"), /not-supported/);
        assert.throws(
            () => sockets.ipNameLookup.resolveAddresses({} as any, "example.com"),
            /not-supported/,
        );
    });

    test("browser TCP namespaces can be supplied by an application", async () => {
        const { WASIShim } = await import("../../src/common/instantiation.js");
        const { InMemoryTcpSockets } = await import("../../src/browser/sockets.js");
        const tcpSockets = new InMemoryTcpSockets();
        const shim = new WASIShim({ tcpSockets });
        const imports = shim.getImportObject();
        const serverAddress = {
            tag: "ipv4" as const,
            val: { address: [127, 0, 0, 1] as [number, number, number, number], port: 8080 },
        };
        const client = tcpSockets.connect(serverAddress);
        client.write(new TextEncoder().encode("in-memory TCP"));
        const socket = imports["wasi:sockets/tcp-create-socket"].createTcpSocket("ipv4");
        socket.startBind(imports["wasi:sockets/instance-network"].instanceNetwork(), serverAddress);
        socket.finishBind();
        socket.startListen();
        socket.finishListen();
        const [, input, output] = socket.accept();
        const message = input.blockingRead(64n);
        output.checkWrite();
        output.write(message);

        assert.strictEqual(new TextDecoder().decode(client.read()), "in-memory TCP");
        assert.deepStrictEqual(socket.localAddress(), serverAddress);
    });

    test("browser UDP namespaces can be supplied by an application", async () => {
        const { WASIShim } = await import("../../src/common/instantiation.js");
        const { InMemoryUdpSockets } = await import("../../src/browser/sockets.js");
        const udpSockets = new InMemoryUdpSockets();
        const shim = new WASIShim({ udpSockets });
        const imports = shim.getImportObject();
        const socket = imports["wasi:sockets/udp-create-socket"].createUdpSocket("ipv4");
        const localAddress = {
            tag: "ipv4" as const,
            val: { address: [127, 0, 0, 1] as [number, number, number, number], port: 8080 },
        };
        const clientAddress = {
            tag: "ipv4" as const,
            val: { address: [127, 0, 0, 1] as [number, number, number, number], port: 9090 },
        };
        const client = udpSockets.createClient(clientAddress);
        client.send(new TextEncoder().encode("in-memory UDP"), localAddress);

        socket.startBind(imports["wasi:sockets/instance-network"].instanceNetwork(), localAddress);
        socket.finishBind();
        const [incoming, outgoing] = socket.stream(undefined);
        assert.strictEqual(outgoing.checkSend(), 1_024n);
        assert.strictEqual(
            outgoing.send([
                {
                    data: incoming.receive(1n)[0].data,
                    remoteAddress: clientAddress,
                },
            ]),
            1n,
        );

        assert.strictEqual(new TextDecoder().decode(client.read()), "in-memory UDP");
        assert.deepStrictEqual(socket.localAddress(), localAddress);
    });
});
