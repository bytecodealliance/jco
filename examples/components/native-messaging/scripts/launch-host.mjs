#!/usr/bin/env node

// Browser-supplied native-messaging arguments intentionally remain unused:
// Firefox supplies the host manifest and extension ID, while Chromium supplies
// the extension origin. The component communicates exclusively over stdio.
import { appendFileSync, readSync, writeSync } from 'node:fs';
import process from 'node:process';

import { WASIShim } from '@bytecodealliance/preview2-shim/instantiation';

import { instantiate } from '../dist/transpiled/component.js';

const testLog = process.env.JCO_NATIVE_MESSAGING_TEST_LOG;
const waitBuffer = new Int32Array(new SharedArrayBuffer(4));

class InputStream {
    blockingRead(length) {
        if (testLog) {
            appendFileSync(testLog, `read requested ${length}\n`);
        }
        const buffer = new Uint8Array(Number(length));
        let bytesRead;
        while (bytesRead === undefined) {
            try {
                bytesRead = readSync(0, buffer, 0, buffer.length);
            } catch (error) {
                if (error.code !== 'EAGAIN' && error.code !== 'EWOULDBLOCK') {
                    throw error;
                }
                Atomics.wait(waitBuffer, 0, 0, 10);
            }
        }
        if (testLog) {
            appendFileSync(testLog, `read ${bytesRead}\n`);
        }
        if (bytesRead === 0) {
            throw { tag: 'closed' };
        }
        return buffer.subarray(0, bytesRead);
    }

    read(length) {
        return this.blockingRead(length);
    }

    skip(length) {
        return BigInt(this.blockingRead(length).length);
    }

    blockingSkip(length) {
        return this.skip(length);
    }
}

class OutputStream {
    constructor(fd) {
        this.fd = fd;
    }

    checkWrite() {
        return 1_000_000n;
    }

    write(bytes) {
        if (testLog) {
            appendFileSync(testLog, `write ${bytes.length}\n`);
        }
        let offset = 0;
        while (offset < bytes.length) {
            try {
                offset += writeSync(this.fd, bytes, offset, bytes.length - offset);
            } catch (error) {
                if (error.code !== 'EAGAIN' && error.code !== 'EWOULDBLOCK') {
                    throw error;
                }
                Atomics.wait(waitBuffer, 0, 0, 10);
            }
        }
    }

    blockingWriteAndFlush(bytes) {
        this.write(bytes);
    }

    flush() {}

    blockingFlush() {}
}

async function main() {
    if (testLog) {
        appendFileSync(testLog, `started ${JSON.stringify(process.argv.slice(2))}\n`);
        process.on('exit', (code) => appendFileSync(testLog, `exit ${code}\n`));
    }

    const stdin = new InputStream();
    const stdout = new OutputStream(1);
    const stderr = new OutputStream(2);
    if (testLog) {
        appendFileSync(testLog, 'creating shim\n');
    }
    const shim = new WASIShim();
    if (testLog) {
        appendFileSync(testLog, 'instantiating component\n');
    }
    const imports = shim.getImportObject();
    imports['wasi:io/streams'] = { InputStream, OutputStream };
    imports['wasi:cli/stdin'] = { getStdin: () => stdin };
    imports['wasi:cli/stdout'] = { getStdout: () => stdout };
    imports['wasi:cli/stderr'] = { getStderr: () => stderr };
    const component = await instantiate(undefined, imports);
    if (testLog) {
        appendFileSync(testLog, 'running component\n');
    }

    await component.run.run();
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
