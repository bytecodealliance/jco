import type { UdpSocketsShim } from "../../../types/instantiation.js";
import type {
    IpAddressFamily,
    IpSocketAddress,
} from "../../../types/interfaces/wasi-sockets-network.js";
import type {
    IncomingDatagram,
    OutgoingDatagram,
} from "../../../types/interfaces/wasi-sockets-udp.js";
import { pollableCreate } from "../../../src/browser/io.js";

const symbolDispose = Symbol.dispose || Symbol.for("dispose");

class InMemoryIncomingDatagramStream {
    constructor(private readonly datagrams: IncomingDatagram[]) {}

    receive(maxResults: bigint) {
        return this.datagrams.splice(0, Number(maxResults));
    }

    subscribe() {
        return pollableCreate();
    }

    [symbolDispose]() {}
}

class InMemoryOutgoingDatagramStream {
    constructor(
        private readonly datagrams: IncomingDatagram[],
        private readonly remoteAddress: IpSocketAddress | undefined,
    ) {}

    checkSend() {
        return 1_024n;
    }

    send(datagrams: OutgoingDatagram[]) {
        for (const datagram of datagrams) {
            const remoteAddress = datagram.remoteAddress ?? this.remoteAddress;
            if (!remoteAddress) {
                throw "invalid-argument";
            }
            this.datagrams.push({
                data: new Uint8Array(datagram.data),
                remoteAddress,
            });
        }
        return BigInt(datagrams.length);
    }

    subscribe() {
        return pollableCreate();
    }

    [symbolDispose]() {}
}

class InMemoryUdpSocket {
    readonly #family: IpAddressFamily;
    readonly #datagrams: IncomingDatagram[] = [];
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
        return [
            new InMemoryIncomingDatagramStream(this.#datagrams),
            new InMemoryOutgoingDatagramStream(this.#datagrams, remoteAddress),
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

    [symbolDispose]() {}
}

/** A deterministic UDP loopback used to test application-provided browser sockets. */
export function createInMemoryUdpSockets(): UdpSocketsShim {
    return {
        udp: {
            IncomingDatagramStream: InMemoryIncomingDatagramStream,
            OutgoingDatagramStream: InMemoryOutgoingDatagramStream,
            UdpSocket: InMemoryUdpSocket,
        },
        udpCreateSocket: {
            createUdpSocket: (family) => new InMemoryUdpSocket(family),
        },
    } as unknown as UdpSocketsShim;
}
