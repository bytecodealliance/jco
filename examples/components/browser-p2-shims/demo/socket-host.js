const encoder = new TextEncoder();
const decoder = new TextDecoder();
const address = (port) => ({
    tag: 'ipv4',
    val: { address: [127, 0, 0, 1], port },
});

/** Bridge component-friendly string operations to the injected WASI socket namespaces. */
export function createSocketHost(imports) {
    const network = imports['wasi:sockets/instance-network'].instanceNetwork();
    let tcpOutput;
    let udpOutput;
    let udpRemoteAddress;

    return {
        tcpReceive() {
            const socket = imports['wasi:sockets/tcp-create-socket'].createTcpSocket('ipv4');
            socket.startBind(network, address(7000));
            socket.finishBind();
            socket.startListen();
            socket.finishListen();
            const [, input, output] = socket.accept();
            tcpOutput = output;
            return decoder.decode(input.blockingRead(4_000n));
        },
        tcpSend(message) {
            if (!tcpOutput) throw new Error('TCP send called before receive');
            tcpOutput.blockingWriteAndFlush(encoder.encode(message));
            tcpOutput = undefined;
        },
        udpReceive() {
            const socket = imports['wasi:sockets/udp-create-socket'].createUdpSocket('ipv4');
            socket.startBind(network, address(7001));
            socket.finishBind();
            const [incoming, outgoing] = socket.stream();
            const [datagram] = incoming.receive(1n);
            if (!datagram) throw new Error('UDP receive called without a queued datagram');
            udpOutput = outgoing;
            udpRemoteAddress = datagram.remoteAddress;
            return decoder.decode(datagram.data);
        },
        udpSend(message) {
            if (!udpOutput || !udpRemoteAddress) throw new Error('UDP send called before receive');
            udpOutput.checkSend();
            udpOutput.send([{ data: encoder.encode(message), remoteAddress: udpRemoteAddress }]);
            udpOutput = undefined;
            udpRemoteAddress = undefined;
        },
    };
}
