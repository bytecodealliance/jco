// Native-messaging hosts may write at most 1 MiB in one message. Leave a
// little room below that boundary so browser implementations agree.
const MAXIMUM_RESPONSE_BYTES = 1024 * 1024 - 64;
const WRITE_CHUNK_BYTES = 4096;
const OPEN_BRACKET = 0x5b;
const CLOSE_BRACKET = 0x5d;
const COMMA = 0x2c;
const QUOTE = 0x22;
const BACKSLASH = 0x5c;

// Read exactly the requested bytes, or return null if the input closes early.
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

// Read one length-prefixed native-messaging payload from the input stream.
export function readMessage(input) {
    const header = readExact(input, 4);
    if (header === null) {
        return null;
    }

    const length = new DataView(header.buffer, header.byteOffset, 4).getUint32(0, true);
    return readExact(input, length);
}

// Write bytes in chunks accepted by the WASI output stream.
function writeAll(output, bytes) {
    for (let offset = 0; offset < bytes.length; offset += WRITE_CHUNK_BYTES) {
        output.blockingWriteAndFlush(bytes.subarray(offset, offset + WRITE_CHUNK_BYTES));
    }
}

// Prefix one payload with its native-messaging length and write it.
function writeFrame(output, body) {
    const frame = new Uint8Array(4 + body.length);
    new DataView(frame.buffer).setUint32(0, body.length, true);
    frame.set(body, 4);
    writeAll(output, frame);
    output.blockingFlush();
}

// Find a split between top-level array elements without splitting nested JSON.
function findSplit(bytes, start, preferredEnd) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    let lastComma = -1;

    for (let index = start; index < bytes.length - 1; index += 1) {
        const byte = bytes[index];

        if (inString) {
            if (escaped) {
                escaped = false;
            } else if (byte === BACKSLASH) {
                escaped = true;
            } else if (byte === QUOTE) {
                inString = false;
            }
            continue;
        }

        if (byte === QUOTE) {
            inString = true;
        } else if (byte === OPEN_BRACKET || byte === 0x7b) {
            depth += 1;
        } else if (byte === CLOSE_BRACKET || byte === 0x7d) {
            depth -= 1;
        } else if (byte === COMMA && depth === 0) {
            if (index > preferredEnd) {
                return lastComma;
            }
            lastComma = index;
        }
    }

    return bytes.length - 1 <= preferredEnd ? bytes.length - 1 : -1;
}

// Write one response, splitting oversized top-level arrays into valid frames.
export function writeMessage(output, message) {
    if (message.length <= MAXIMUM_RESPONSE_BYTES) {
        writeFrame(output, message);
        return;
    }

    if (message[0] !== OPEN_BRACKET || message[message.length - 1] !== CLOSE_BRACKET) {
        return;
    }

    let start = 1;
    const end = message.length - 1;
    while (start < end) {
        const split = findSplit(message, start, start + MAXIMUM_RESPONSE_BYTES - 2);
        if (split < start) {
            throw new Error('an individual array element exceeds the native-messaging response limit');
        }
        const body = new Uint8Array(split - start + 2);
        body[0] = OPEN_BRACKET;
        body.set(message.subarray(start, split), 1);
        body[body.length - 1] = CLOSE_BRACKET;
        writeFrame(output, body);
        start = split + 1;
    }
}
