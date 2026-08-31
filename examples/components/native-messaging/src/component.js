import { getStdin } from 'wasi:cli/stdin@0.2.12';
import { getStdout } from 'wasi:cli/stdout@0.2.12';

import { writeMessage } from './output.js';

function readExact(input, length) {
    const bytes = new Uint8Array(length);
    let offset = 0;

    while (offset < length) {
        let chunk;
        try {
            chunk = input.blockingRead(BigInt(length - offset));
        } catch {
            return null;
        }

        if (chunk.length === 0) {
            return null;
        }

        bytes.set(chunk, offset);
        offset += chunk.length;
    }

    return bytes;
}

function readMessage(input) {
    const header = readExact(input, 4);
    if (header === null) {
        return null;
    }

    const length = new DataView(header.buffer, header.byteOffset, 4).getUint32(0, true);
    return readExact(input, length);
}

export const run = {
    run() {
        const input = getStdin();
        const output = getStdout();

        for (let message = readMessage(input); message !== null; message = readMessage(input)) {
            writeMessage(output, message);
        }
    },
};
