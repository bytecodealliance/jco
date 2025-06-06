import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { StreamReader, stream } from '@bytecodealliance/preview3-shim/stream';

import net from 'net';

import {
    TcpSocket,
    tcpCreateSocket,
    makeIpAddress,
    IP_ADDRESS_FAMILY,
} from '@bytecodealliance/preview3-shim/sockets';

const ipv4LocalAddress = makeIpAddress('ipv4', '127.0.0.1', 0);
const ipv6LocalAddress = makeIpAddress('ipv6', '::1', 0);

const createIpv4Socket = () =>
    tcpCreateSocket.createTcpSocket(IP_ADDRESS_FAMILY.IPV4);
const createIpv6Socket = () =>
    tcpCreateSocket.createTcpSocket(IP_ADDRESS_FAMILY.IPV6);

describe('TCP Socket Creation', () => {
    test('should create an IPv4 socket', async () => {
        const socket = await tcpCreateSocket.createTcpSocket(
            IP_ADDRESS_FAMILY.IPV4
        );

        expect(socket).toBeInstanceOf(TcpSocket);
        expect(socket.addressFamily()).toBe(IP_ADDRESS_FAMILY.IPV4);
    });

    test('should create an IPv6 socket', async () => {
        const socket = await tcpCreateSocket.createTcpSocket(
            IP_ADDRESS_FAMILY.IPV6
        );

        expect(socket).toBeInstanceOf(TcpSocket);
        expect(socket.addressFamily()).toBe(IP_ADDRESS_FAMILY.IPV6);
    });

    test('should throw on invalid address family', async () => {
        await expect(
            tcpCreateSocket.createTcpSocket('invalid')
        ).rejects.toSatisfy((err) => err.payload.tag === 'invalid-argument');
    });
});

describe('TCP Socket Bind', () => {
    test('should bind to a local IPv4 address', async () => {
        const client = await createIpv4Socket();
        await expect(client.bind(ipv4LocalAddress)).resolves;
    });

    test('should bind to a local IPv6 address', async () => {
        const client = await createIpv6Socket();
        await expect(client.bind(ipv6LocalAddress)).resolves;
    });

    test('should throw when binding with mismatched address family', async () => {
        const client = await createIpv4Socket();
        await expect(client.bind(ipv6LocalAddress)).rejects.toSatisfy(
            (err) => err.payload.tag === 'invalid-argument'
        );
    });

    test('should throw when binding already bound socket', async () => {
        const client = await createIpv4Socket();
        await client.bind(ipv4LocalAddress);
        await expect(client.bind(ipv4LocalAddress)).rejects.toSatisfy(
            (err) => err.payload.tag === 'invalid-state'
        );
    });

    test('should return local address after binding', async () => {
        const client = await createIpv4Socket();
        await client.bind(ipv4LocalAddress);
        const localAddr = await client.localAddress();

        expect(localAddr).toBeDefined();
        expect(localAddr.tag).toBe(IP_ADDRESS_FAMILY.IPV4);
        expect(localAddr.val.address).toStrictEqual([127, 0, 0, 1]);
        expect(typeof localAddr.val.port).toBe('number');
        expect(localAddr.val.port).toBeGreaterThan(0);
    });
});

describe('TCP Socket Listen', () => {
    test('should listen on a bound socket', async () => {
        const client = await createIpv4Socket();
        await client.bind(ipv4LocalAddress);
        const stream = await client.listen();

        expect(stream).toBeInstanceOf(StreamReader);
        expect(client.isListening()).toBe(true);
    });

    test('should throw when listening on unbound socket', async () => {
        const client = await createIpv4Socket();

        try {
            await client.listen();
            expect.unreachable();
        } catch (error) {
            expect(error).toBeDefined();
        }
    });

    test('should throw when listening on already listening socket', async () => {
        const client = await createIpv4Socket();
        await client.bind(ipv4LocalAddress);
        await client.listen();

        await expect(client.listen()).rejects.toSatisfy(
            (err) => err.payload.tag === 'invalid-state'
        );
    });

    test('should allow backlog size configuration before listening', async () => {
        const client = await createIpv4Socket();

        await client.setListenBacklogSize(1000n);
        await client.bind(ipv4LocalAddress);
        const stream = await client.listen();

        expect(stream).toBeInstanceOf(StreamReader);
        expect(client.isListening()).toBe(true);
    });

    test('should throw when setting backlog size to 0', async () => {
        const client = await createIpv4Socket();

        await expect(client.setListenBacklogSize(0n)).rejects.toSatisfy(
            (err) => err.payload.tag === 'invalid-argument'
        );
    });

    test('should throw when setting backlog size on listening socket', async () => {
        const client = await createIpv4Socket();
        await client.bind(ipv4LocalAddress);
        await client.listen();

        await expect(client.setListenBacklogSize(1000n)).rejects.toSatisfy(
            (err) => err.payload.tag === 'invalid-state'
        );
    });

    test('accepts a preview3 client and exchanges data', async () => {
        const listener = await createIpv4Socket();
        await listener.bind(makeIpAddress('ipv4', '127.0.0.1', 0));
        const localAddr = await listener.localAddress();
        const acceptStream = await listener.listen();

        // Create and connect client
        const client = await createIpv4Socket();
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

describe('Intagration: TCP Socket Send', () => {
    let server;
    let port;
    let received = Buffer.alloc(0);

    beforeAll(() => {
        server = net.createServer((sock) => {
            sock.on('data', (chunk) => {
                received = Buffer.concat([received, chunk]);
            });
        });
        server.listen(0, '127.0.0.1', () => {
            port = server.address().port;
        });
    });

    afterAll(() => {
        server.close();
    });

    test('sends multiple chunks via stream()', async () => {
        const client = await createIpv4Socket();
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
