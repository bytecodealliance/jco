const encoder = new TextEncoder();
const decoder = new TextDecoder();
const symbolDispose = Symbol.dispose || Symbol.for('dispose');
const address = (port) => ({
    tag: 'ipv4',
    val: { address: [127, 0, 0, 1], port },
});

/** Map guest-owned server resources to the injected WASI socket namespaces. */
export function createSocketServer(imports) {
    // TODO(fix): Remove this constructor-shaped adapter when ComponentizeJS can
    // pass function-returned WASI socket resources into a JavaScript guest.
    const network = imports['wasi:sockets/instance-network'].instanceNetwork();

    class TcpServer {
        #socket = imports['wasi:sockets/tcp-create-socket'].createTcpSocket('ipv4');
        #connection;
        #input;
        #output;

        startBind(port) {
            this.#socket.startBind(network, address(port));
        }
        finishBind() {
            this.#socket.finishBind();
        }
        startListen() {
            this.#socket.startListen();
        }
        finishListen() {
            this.#socket.finishListen();
        }
        accept() {
            [this.#connection, this.#input, this.#output] = this.#socket.accept();
        }
        read() {
            if (!this.#input) throw new Error('TCP read called before accept');
            return decoder.decode(this.#input.blockingRead(4_000n));
        }
        write(message) {
            if (!this.#output) throw new Error('TCP write called before accept');
            this.#output.blockingWriteAndFlush(encoder.encode(message));
        }
        [symbolDispose]() {
            this.#input?.[symbolDispose]();
            this.#output?.[symbolDispose]();
            this.#connection?.[symbolDispose]();
            this.#socket[symbolDispose]();
        }
    }

    class UdpServer {
        #socket = imports['wasi:sockets/udp-create-socket'].createUdpSocket('ipv4');
        #incoming;
        #outgoing;
        #remoteAddress;

        startBind(port) {
            this.#socket.startBind(network, address(port));
        }
        finishBind() {
            this.#socket.finishBind();
        }
        stream() {
            [this.#incoming, this.#outgoing] = this.#socket.stream();
        }
        receive() {
            if (!this.#incoming) throw new Error('UDP receive called before stream');
            const [datagram] = this.#incoming.receive(1n);
            if (!datagram) throw new Error('UDP server received no datagram');
            this.#remoteAddress = datagram.remoteAddress;
            return decoder.decode(datagram.data);
        }
        send(message) {
            if (!this.#outgoing || !this.#remoteAddress) {
                throw new Error('UDP send called before receive');
            }
            this.#outgoing.checkSend();
            this.#outgoing.send([{ data: encoder.encode(message), remoteAddress: this.#remoteAddress }]);
        }
        [symbolDispose]() {
            this.#incoming?.[symbolDispose]();
            this.#outgoing?.[symbolDispose]();
            this.#socket[symbolDispose]();
        }
    }

    return { TcpServer, UdpServer };
}
