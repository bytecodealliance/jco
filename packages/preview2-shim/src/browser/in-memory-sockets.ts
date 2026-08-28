import type { TcpSocketsShim, UdpSocketsShim } from "../../types/instantiation.js";
import type {
    IpAddressFamily,
    IpSocketAddress,
} from "../../types/interfaces/wasi-sockets-network.js";
import type {
    IncomingDatagram,
    OutgoingDatagram,
} from "../../types/interfaces/wasi-sockets-udp.js";
import type { InputStream, OutputStream } from "../../types/interfaces/wasi-io-streams.js";
import { checkedU64AsNumber } from "./common.js";
import { inputStreamCreate, outputStreamCreate, pollableCreate } from "./io.js";

const symbolDispose = Symbol.dispose || Symbol.for("dispose");
const unsupported = (): never => {
    throw "not-supported";
};

function addressKey(address: IpSocketAddress): string {
    return `${address.tag}:${address.val.address.join(".")}:${address.val.port}`;
}

function takeBytes(chunks: Uint8Array[], length: bigint): Uint8Array {
    const chunk = chunks.shift();
    if (!chunk) {
        throw { tag: "closed" };
    }
    const requested = checkedU64AsNumber(length, "length");
    if (chunk.byteLength <= requested) {
        return chunk;
    }
    chunks.unshift(chunk.subarray(requested));
    return chunk.subarray(0, requested);
}

/** The browser-side endpoint of an in-memory TCP connection. */
export class InMemoryTcpClient {
    readonly #toServer: Uint8Array[] = [];
    readonly #fromServer: Uint8Array[] = [];

    write(bytes: Uint8Array): void {
        this.#toServer.push(new Uint8Array(bytes));
    }

    read(length = 4_096n): Uint8Array {
        return takeBytes(this.#fromServer, length);
    }

    _serverStreams(): readonly [InputStream, OutputStream] {
        return [
            inputStreamCreate({ blockingRead: (length) => takeBytes(this.#toServer, length) }),
            outputStreamCreate({
                write: (bytes) => this.#fromServer.push(new Uint8Array(bytes)),
            }),
        ];
    }
}

/** Deterministic, process-local TCP namespaces with a browser-side client API. */
export class InMemoryTcpSockets implements TcpSocketsShim {
    readonly #pending = new Map<string, InMemoryTcpClient[]>();
    readonly tcp: TcpSocketsShim["tcp"];
    readonly tcpCreateSocket: TcpSocketsShim["tcpCreateSocket"];

    constructor() {
        const pending = this.#pending;

        class TcpSocket {
            readonly #family: IpAddressFamily;
            #localAddress: IpSocketAddress | undefined;
            #remoteAddress: IpSocketAddress | undefined;
            #listening = false;

            constructor(family: IpAddressFamily) {
                this.#family = family;
            }

            startBind(_network: unknown, localAddress: IpSocketAddress) {
                this.#localAddress = localAddress;
            }

            finishBind() {
                if (!this.#localAddress) {
                    throw "not-in-progress";
                }
            }

            startConnect = unsupported;
            finishConnect = unsupported;

            startListen() {
                if (!this.#localAddress) {
                    throw "invalid-state";
                }
            }

            finishListen() {
                this.#listening = true;
            }

            accept() {
                if (!this.#listening || !this.#localAddress) {
                    throw "invalid-state";
                }
                const client = pending.get(addressKey(this.#localAddress))?.shift();
                if (!client) {
                    throw "would-block";
                }
                const connected = new TcpSocket(this.#family);
                connected.#localAddress = this.#localAddress;
                const [input, output] = client._serverStreams();
                return [connected, input, output];
            }

            localAddress() {
                if (!this.#localAddress) {
                    throw "invalid-state";
                }
                return this.#localAddress;
            }

            remoteAddress() {
                if (!this.#remoteAddress) {
                    throw "invalid-state";
                }
                return this.#remoteAddress;
            }

            isListening() {
                return this.#listening;
            }

            addressFamily() {
                return this.#family;
            }

            setListenBacklogSize = unsupported;
            keepAliveEnabled = unsupported;
            setKeepAliveEnabled = unsupported;
            keepAliveIdleTime = unsupported;
            setKeepAliveIdleTime = unsupported;
            keepAliveInterval = unsupported;
            setKeepAliveInterval = unsupported;
            keepAliveCount = unsupported;
            setKeepAliveCount = unsupported;
            hopLimit = unsupported;
            setHopLimit = unsupported;
            receiveBufferSize = unsupported;
            setReceiveBufferSize = unsupported;
            sendBufferSize = unsupported;
            setSendBufferSize = unsupported;
            subscribe() {
                return pollableCreate();
            }
            shutdown() {}
            [symbolDispose]() {}
        }

        this.tcp = { TcpSocket } as unknown as TcpSocketsShim["tcp"];
        this.tcpCreateSocket = {
            createTcpSocket: (family) => new TcpSocket(family),
        } as unknown as TcpSocketsShim["tcpCreateSocket"];
    }

    connect(serverAddress: IpSocketAddress): InMemoryTcpClient {
        const client = new InMemoryTcpClient();
        const key = addressKey(serverAddress);
        const clients = this.#pending.get(key);
        if (clients) {
            clients.push(client);
        } else {
            this.#pending.set(key, [client]);
        }
        return client;
    }
}

/** The browser-side endpoint of an in-memory UDP socket. */
export class InMemoryUdpClient {
    readonly #send: (bytes: Uint8Array, serverAddress: IpSocketAddress) => void;
    readonly #received: Uint8Array[] = [];

    constructor(send: (bytes: Uint8Array, serverAddress: IpSocketAddress) => void) {
        this.#send = send;
    }

    send(bytes: Uint8Array, serverAddress: IpSocketAddress): void {
        this.#send(bytes, serverAddress);
    }

    read(): Uint8Array {
        return takeBytes(this.#received, 65_535n);
    }

    _receive(bytes: Uint8Array): void {
        this.#received.push(new Uint8Array(bytes));
    }
}

/** Deterministic, process-local UDP namespaces with a browser-side client API. */
export class InMemoryUdpSockets implements UdpSocketsShim {
    readonly #datagrams = new Map<string, IncomingDatagram[]>();
    readonly #clients = new Map<string, InMemoryUdpClient>();
    readonly udp: UdpSocketsShim["udp"];
    readonly udpCreateSocket: UdpSocketsShim["udpCreateSocket"];

    constructor() {
        const datagrams = this.#datagrams;
        const clients = this.#clients;

        class IncomingDatagramStream {
            constructor(private readonly queue: IncomingDatagram[]) {}
            receive(maxResults: bigint) {
                return this.queue.splice(0, checkedU64AsNumber(maxResults, "max results"));
            }
            subscribe() {
                return pollableCreate();
            }
            [symbolDispose]() {}
        }

        class OutgoingDatagramStream {
            #permit = 0;

            constructor(private readonly remoteAddress: IpSocketAddress | undefined) {}
            checkSend() {
                this.#permit = 1_024;
                return 1_024n;
            }
            send(outgoing: OutgoingDatagram[]) {
                if (outgoing.length > this.#permit) {
                    throw new TypeError("datagram count exceeds the permit returned by checkSend");
                }
                this.#permit -= outgoing.length;
                for (const datagram of outgoing) {
                    const destination = datagram.remoteAddress ?? this.remoteAddress;
                    if (!destination) {
                        throw "invalid-argument";
                    }
                    const client = clients.get(addressKey(destination));
                    if (!client) {
                        throw "remote-unreachable";
                    }
                    client._receive(datagram.data);
                }
                return BigInt(outgoing.length);
            }
            subscribe() {
                return pollableCreate();
            }
            [symbolDispose]() {}
        }

        class UdpSocket {
            readonly #family: IpAddressFamily;
            #localAddress: IpSocketAddress | undefined;
            #remoteAddress: IpSocketAddress | undefined;

            constructor(family: IpAddressFamily) {
                this.#family = family;
            }
            startBind(_network: unknown, localAddress: IpSocketAddress) {
                this.#localAddress = localAddress;
            }
            finishBind() {
                if (!this.#localAddress) {
                    throw "not-in-progress";
                }
            }
            stream(remoteAddress: IpSocketAddress | undefined) {
                if (!this.#localAddress) {
                    throw "invalid-state";
                }
                this.#remoteAddress = remoteAddress;
                const key = addressKey(this.#localAddress);
                let queue = datagrams.get(key);
                if (!queue) {
                    queue = [];
                    datagrams.set(key, queue);
                }
                return [
                    new IncomingDatagramStream(queue),
                    new OutgoingDatagramStream(remoteAddress),
                ];
            }
            localAddress() {
                if (!this.#localAddress) {
                    throw "invalid-state";
                }
                return this.#localAddress;
            }
            remoteAddress() {
                return this.#remoteAddress;
            }
            addressFamily() {
                return this.#family;
            }
            unicastHopLimit = unsupported;
            setUnicastHopLimit = unsupported;
            receiveBufferSize = unsupported;
            setReceiveBufferSize = unsupported;
            sendBufferSize = unsupported;
            setSendBufferSize = unsupported;
            subscribe() {
                return pollableCreate();
            }
            [symbolDispose]() {}
        }

        this.udp = {
            IncomingDatagramStream,
            OutgoingDatagramStream,
            UdpSocket,
        } as unknown as UdpSocketsShim["udp"];
        this.udpCreateSocket = {
            createUdpSocket: (family) => new UdpSocket(family),
        } as unknown as UdpSocketsShim["udpCreateSocket"];
    }

    createClient(localAddress: IpSocketAddress): InMemoryUdpClient {
        const client = new InMemoryUdpClient((bytes, serverAddress) => {
            const key = addressKey(serverAddress);
            const queue = this.#datagrams.get(key);
            const incoming = { data: new Uint8Array(bytes), remoteAddress: localAddress };
            if (queue) {
                queue.push(incoming);
            } else {
                this.#datagrams.set(key, [incoming]);
            }
        });
        this.#clients.set(addressKey(localAddress), client);
        return client;
    }
}
