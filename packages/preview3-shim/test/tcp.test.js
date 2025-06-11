import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { StreamReader, stream } from '@bytecodealliance/preview3-shim/stream';

import net from 'node:net';

import {
    TcpSocket,
    createTcpSocket,
    makeIpAddress,
    IP_ADDRESS_FAMILY,
} from '@bytecodealliance/preview3-shim/sockets';

const ipv4LocalAddress = makeIpAddress('ipv4', '127.0.0.1', 0);
const ipv6LocalAddress = makeIpAddress('ipv6', '::1', 0);

const createIpv4Socket = () => createTcpSocket(IP_ADDRESS_FAMILY.IPV4);
const createIpv6Socket = () => createTcpSocket(IP_ADDRESS_FAMILY.IPV6);

describe('TCP Socket Creation', () => {
    test('should create an IPv4 socket', async () => {
        const socket = createTcpSocket(IP_ADDRESS_FAMILY.IPV4);

        expect(socket).toBeInstanceOf(TcpSocket);
        expect(socket.addressFamily()).toBe(IP_ADDRESS_FAMILY.IPV4);
    });

    test('should create an IPv6 socket', async () => {
        const socket = await createTcpSocket(IP_ADDRESS_FAMILY.IPV6);

        expect(socket).toBeInstanceOf(TcpSocket);
        expect(socket.addressFamily()).toBe(IP_ADDRESS_FAMILY.IPV6);
    });

    test('should throw on invalid address family', async () => {
        expect(() => createTcpSocket('invalid')).toThrow(
            expect.objectContaining({ payload: { tag: 'invalid-argument' } })
        );
    });
});

describe('TCP Socket Bind', () => {
    test('should bind to a local IPv4 address', async () => {
        const client = createIpv4Socket();
        expect(client.bind(ipv4LocalAddress)).toBeUndefined();
    });

    test('should bind to a local IPv6 address', async () => {
        const client = createIpv6Socket();
        expect(client.bind(ipv6LocalAddress)).toBeUndefined();
    });

    test('should throw when binding with mismatched address family', async () => {
        const client = createIpv4Socket();
        await expect(() => client.bind(ipv6LocalAddress)).toThrow(
            expect.objectContaining({ payload: { tag: 'invalid-argument' } })
        );
    });

    test('should throw when binding already bound socket', async () => {
        const client = await createIpv4Socket();
        await client.bind(ipv4LocalAddress);
        expect(() => client.bind(ipv4LocalAddress)).toThrow(
            expect.objectContaining({ payload: { tag: 'invalid-state' } })
        );
    });

    test('should return local address after binding', async () => {
        const client = createIpv4Socket();
        client.bind(ipv4LocalAddress);
        const localAddr = client.localAddress();

        expect(localAddr).toBeDefined();
        expect(localAddr.tag).toBe(IP_ADDRESS_FAMILY.IPV4);
        expect(localAddr.val.address).toStrictEqual([127, 0, 0, 1]);
        expect(typeof localAddr.val.port).toBe('number');
        expect(localAddr.val.port).toBeGreaterThan(0);
    });
});

describe('TCP Socket Listen', () => {
    test('should listen on a bound socket', async () => {
        const client = createIpv4Socket();
        client.bind(ipv4LocalAddress);
        const stream = client.listen();

        expect(stream).toBeInstanceOf(StreamReader);
        expect(client.isListening()).toBe(true);
    });

    test('should allow to listen on unbound socket', async () => {
        const client = createIpv4Socket();
        expect(() => client.listen()).not.toThrow();
        expect(client.isListening()).toBe(true);
    });

    test('should throw when listening on already listening socket', async () => {
        const client = createIpv4Socket();
        client.bind(ipv4LocalAddress);
        client.listen();

        expect(() => client.listen()).toThrow(
            expect.objectContaining({ payload: { tag: 'invalid-state' } })
        );
    });

    test('should allow backlog size configuration before listening', async () => {
        const client = createIpv4Socket();

        client.setListenBacklogSize(1000n);
        client.bind(ipv4LocalAddress);
        const stream = client.listen();

        expect(stream).toBeInstanceOf(StreamReader);
        expect(client.isListening()).toBe(true);
    });

    test('should throw when setting backlog size to 0', async () => {
        const client = await createIpv4Socket();

        await expect(() => client.setListenBacklogSize(0n)).toThrow(
            expect.objectContaining({ payload: { tag: 'invalid-argument' } })
        );
    });

    test('should throw when setting backlog size on listening socket', async () => {
        const client = createIpv4Socket();
        client.bind(ipv4LocalAddress);
        client.listen();

        expect(() => client.setListenBacklogSize(1000n)).toThrow(
            expect.objectContaining({ payload: { tag: 'invalid-state' } })
        );
    });

    test('accepts a preview3 client and exchanges data', async () => {
        const listener = createIpv4Socket();
        listener.bind(makeIpAddress('ipv4', '127.0.0.1', 0));
        const localAddr = listener.localAddress();
        const acceptStream = listener.listen();

        // Create and connect client
        const client = createIpv4Socket();
        await client.connect(localAddr);

        // Accept the incoming connection
        const conn = await acceptStream.read();
        expect(conn.addressFamily()).toBe(IP_ADDRESS_FAMILY.IPV4);
        expect(conn.isListening()).toBe(false);

        // Send message from client to server
        const { tx: tx1, rx: rx1 } = stream();
        const msg1 = 'hello-server';
        await tx1.write(new TextEncoder().encode(msg1));
        await tx1.close();

        await client.send(rx1);

        // Receive and verify the message on server
        const { stream: srvReader } = conn.receive();
        const buf1 = await srvReader.readAll();
        expect(buf1.toString()).toBe(msg1);

        // Dispose all resources
        conn[Symbol.dispose]();
        client[Symbol.dispose]();
        listener[Symbol.dispose]();
    });
});

describe('Server closure', () => {
    test('disposing listener closes server and ends accept stream', async () => {
        const listener = createTcpSocket(IP_ADDRESS_FAMILY.IPV4);
        listener.bind(makeIpAddress('ipv4', '127.0.0.1', 0));
        const addr = listener.localAddress();
        const acceptStream = listener.listen();

        listener[Symbol.dispose]();
        expect(listener.isListening()).toBe(false);

        const client = createTcpSocket(IP_ADDRESS_FAMILY.IPV4);
        await expect(client.connect(addr)).rejects.toThrow();
        client[Symbol.dispose]();

        const val = await acceptStream.read();
        expect(val).toBeNull();
    });
});

describe('Integration: TCP Socket Send', () => {
    let server;
    let port;
    let received = Buffer.alloc(0);

    beforeAll(async () => {
        server = net.createServer((sock) => {
            sock.on('data', (chunk) => {
                received = Buffer.concat([received, chunk]);
            });
        });

        await new Promise((resolve) => {
            server.listen(0, '127.0.0.1', () => {
                port = server.address().port;
                resolve();
            });
        });
    });

    afterAll(() => {
        server.close();
    });

    test('sends multiple chunks via stream()', async () => {
        const client = createIpv4Socket();
        const addr = makeIpAddress('ipv4', '127.0.0.1', port);
        await client.connect(addr);

        // prepare chunked stream
        const { tx, rx } = stream();
        const encoder = new TextEncoder();
        tx.write(encoder.encode('chunk1-'));
        tx.write(encoder.encode('chunk2'));
        await tx.close();

        await client.send(rx);
        await new Promise((r) => setTimeout(r, 50));

        expect(received.toString()).toBe('chunk1-chunk2');
        client[Symbol.dispose]();
    });
});
