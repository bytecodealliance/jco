import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const MAXIMUM_RESPONSE_BYTES = 1024 * 1024;

export function encodeFrame(value) {
    const body = encoder.encode(JSON.stringify(value));
    const frame = Buffer.allocUnsafe(4 + body.length);
    frame.writeUInt32LE(body.length, 0);
    frame.set(body, 4);
    return frame;
}

export function decodeFrames(bytes) {
    const messages = [];
    let offset = 0;

    while (offset < bytes.length) {
        assert(bytes.length - offset >= 4, 'native host wrote an incomplete frame header');
        const length = bytes.readUInt32LE(offset);
        offset += 4;
        assert(length <= MAXIMUM_RESPONSE_BYTES, `native host wrote an oversized ${length}-byte message`);
        assert(bytes.length - offset >= length, 'native host wrote an incomplete frame body');
        messages.push(JSON.parse(decoder.decode(bytes.subarray(offset, offset + length))));
        offset += length;
    }

    return messages;
}

async function runHost(launcher, chunks) {
    const child = spawn(launcher, [], { stdio: ['pipe', 'pipe', 'pipe'] });
    const stdout = [];
    const stderr = [];
    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));

    for (const chunk of chunks) {
        child.stdin.write(chunk);
    }
    child.stdin.end();

    const [code, signal] = await once(child, 'close');
    const diagnostic = Buffer.concat(stderr).toString();
    assert.equal(signal, null, diagnostic);
    assert.equal(code, 0, diagnostic);
    return { stdout: Buffer.concat(stdout), stderr: diagnostic };
}

export async function testNativeHostProtocol(launcher) {
    const first = { kind: 'small', text: 'Hello from Firefox first: 🦊' };
    const second = ['persistent', { nested: [1, 2, 3] }, 'string,with,commas'];
    const smallRun = await runHost(launcher, [encodeFrame(first), encodeFrame(second)]);
    assert.deepEqual(decodeFrames(smallRun.stdout), [first, second], smallRun.stderr);

    const large = Array.from({ length: 5_000 }, (_, index) => ({
        index,
        text: `${index}: ${'native messaging, with nested JSON; '.repeat(8)}`,
    }));
    assert(encodeFrame(large).length > MAXIMUM_RESPONSE_BYTES, 'large fixture must require response chunking');
    const largeRun = await runHost(launcher, [encodeFrame(large)]);
    const chunked = decodeFrames(largeRun.stdout);
    assert(chunked.length > 1, 'large response was not divided into browser-sized messages');
    assert.deepEqual(chunked.flat(), large);

    const truncatedHeader = Buffer.from([10, 0, 0, 0, 0x7b]);
    const malformedRun = await runHost(launcher, [truncatedHeader]);
    assert.equal(malformedRun.stdout.length, 0, 'truncated input produced protocol output');

    console.log('direct native-messaging protocol tests passed');
}
