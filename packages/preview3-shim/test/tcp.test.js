import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

import { StreamReader } from '@bytecodealliance/preview3-shim/stream';
import { FutureReader } from '@bytecodealliance/preview3-shim/future';

import {
    TcpSocket,
    tcpCreateSocket,
    makeIpAddress,
    IP_ADDRESS_FAMILY,
} from '@bytecodealliance/preview3-shim/sockets';

const ipv4LocalAddress = makeIpAddress('ipv4', '127.0.0.1', 0);
const ipv6LocalAddress = makeIpAddress('ipv6', '::1', 0);

const ipv4RemoteAddress = makeIpAddress('ipv4', '8.8.8.8', 53); // Google DNS server
const ipv6RemoteAddress = makeIpAddress('ipv6', '2001:4860:4860::8888', 53); // Google DNS IPv6

const createIPv4Socket = () =>
    tcpCreateSocket.createTcpSocket(IP_ADDRESS_FAMILY.IPV4);
const createIPv6Socket = () =>
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
        await expect(tcpCreateSocket.createTcpSocket('invalid')).rejects.toBe(
            'invalid-argument'
        );
    });
});

describe('TCP Socket Bind', () => {
    test('should bind to a local IPv4 address', async () => {
        const socket = await createIPv4Socket();
        await expect(socket.bind(ipv4LocalAddress)).resolves;
    });

    test('should bind to a local IPv6 address', async () => {
        const socket = await createIPv6Socket();
        await expect(socket.bind(ipv6LocalAddress)).resolves;
    });

    test('should throw when binding with mismatched address family', async () => {
        const socket = await createIPv4Socket();
        await expect(socket.bind(ipv6LocalAddress)).rejects.toBe(
            'invalid-argument'
        );
    });

    test('should throw when binding already bound socket', async () => {
        const socket = await createIPv4Socket();
        await socket.bind(ipv4LocalAddress);
        await expect(socket.bind(ipv4LocalAddress)).rejects.toBe(
            'invalid-state'
        );
    });

    test('should return local address after binding', async () => {
        const socket = await createIPv4Socket();
        await socket.bind(ipv4LocalAddress);
        const localAddr = await socket.localAddress();

        expect(localAddr).toBeDefined();
        expect(localAddr.tag).toBe(IP_ADDRESS_FAMILY.IPV4);
        expect(localAddr.val.address).toStrictEqual([127, 0, 0, 1]);
        expect(typeof localAddr.val.port).toBe('number');
        expect(localAddr.val.port).toBeGreaterThan(0);
    });
});

describe('TCP Socket Listen', () => {
    test('should listen on a bound socket', async () => {
        const socket = await createIPv4Socket();
        await socket.bind(ipv4LocalAddress);
        const stream = await socket.listen();

        expect(stream).toBeInstanceOf(StreamReader);
        expect(socket.isListening()).toBe(true);
    });

    test('should throw when listening on unbound socket', async () => {
        const socket = await createIPv4Socket();

        try {
            await socket.listen();
            expect.unreachable();
        } catch (error) {
            expect(error).toBeDefined();
        }
    });

    test('should throw when listening on already listening socket', async () => {
        const socket = await createIPv4Socket();
        await socket.bind(ipv4LocalAddress);
        await socket.listen();

        await expect(socket.listen()).rejects.toBe('invalid-state');
    });

    test('should allow backlog size configuration before listening', async () => {
        const socket = await createIPv4Socket();

        await socket.setListenBacklogSize(1000n);
        await socket.bind(ipv4LocalAddress);
        const stream = await socket.listen();

        expect(stream).toBeInstanceOf(StreamReader);
        expect(socket.isListening()).toBe(true);
    });

    test('should throw when setting backlog size to 0', async () => {
        const socket = await createIPv4Socket();

        await expect(socket.setListenBacklogSize(0n)).rejects.toBe(
            'invalid-argument'
        );
    });

    test('should throw when setting backlog size on listening socket', async () => {
        const socket = await createIPv4Socket();
        await socket.bind(ipv4LocalAddress);
        await socket.listen();

        await expect(socket.setListenBacklogSize(1000n)).rejects.toBe(
            'invalid-state'
        );
    });
});
