import type { TcpSocketsShim } from "../../../types/instantiation.js";
import type {
    IpAddressFamily,
    IpSocketAddress,
} from "../../../types/interfaces/wasi-sockets-network.js";
import { inputStreamCreate, outputStreamCreate } from "../../../src/browser/io.js";

const symbolDispose = Symbol.dispose || Symbol.for("dispose");

class InMemoryTcpSocket {
    readonly #family: IpAddressFamily;
    readonly #received: Uint8Array[] = [];
    #remoteAddress: IpSocketAddress | undefined;

    constructor(family: IpAddressFamily) {
        this.#family = family;
    }

    addressFamily() {
        return this.#family;
    }

    startConnect(_network: unknown, remoteAddress: IpSocketAddress) {
        this.#remoteAddress = remoteAddress;
    }

    finishConnect() {
        if (!this.#remoteAddress) {
            throw "not-in-progress";
        }
        const input = inputStreamCreate({
            blockingRead: () => {
                const chunk = this.#received.shift();
                if (!chunk) {
                    throw { tag: "closed" };
                }
                return chunk;
            },
        });
        const output = outputStreamCreate({
            write: (bytes) => this.#received.push(new Uint8Array(bytes)),
        });
        return [input, output];
    }

    remoteAddress() {
        if (!this.#remoteAddress) {
            throw "invalid-state";
        }
        return this.#remoteAddress;
    }

    [symbolDispose]() {}
}

/** A deterministic TCP loopback used to test application-provided browser sockets. */
export function createInMemoryTcpSockets(): TcpSocketsShim {
    return {
        tcp: { TcpSocket: InMemoryTcpSocket },
        tcpCreateSocket: {
            createTcpSocket: (family) => new InMemoryTcpSocket(family),
        },
    } as unknown as TcpSocketsShim;
}
