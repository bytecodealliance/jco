import fs from 'fs';
import { promisify } from 'util';
import { parentPort } from 'worker_threads';

const readAsync = promisify(fs.read);
const writeAsync = promisify(fs.write);

const { opendir } = fs.promises;

const CHUNK = 64 * 1024;
const buffer = Buffer.alloc(CHUNK);

async function handleRead(msg) {
    const { id, fd, offset, stream } = msg;
    const writer = stream.getWriter();
    try {
        let pos = BigInt(offset);

        while (true) {
            const { bytesRead } = await readAsync(fd, buffer, 0, CHUNK, pos);
            if (bytesRead === 0) break;

            await writer.write(buffer.subarray(0, bytesRead));
            pos += BigInt(bytesRead);
        }

        await writer.close();
        parentPort.postMessage({ id, result: { ok: true } });
    } catch (err) {
        await writer.abort(err);
        parentPort.postMessage({ id, error: err });
    }
}

async function handleWrite(msg) {
    const { id, fd, offset, stream } = msg;
    const reader = stream.getReader();

    try {
        let pos = BigInt(offset);
        let total = BigInt(0);

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const buf = Buffer.from(value);
            const { bytesWritten } = await writeAsync(
                fd,
                buf,
                0,
                buf.length,
                pos
            );
            pos += BigInt(bytesWritten);
            total += BigInt(bytesWritten);
        }

        parentPort.postMessage({
            id,
            result: { ok: true, bytesWritten: total },
        });
    } catch (err) {
        await reader.cancel(err);
        parentPort.postMessage({ id, error: err });
    }
}

async function handleReadDir(msg) {
    const { id, fullPath, stream } = msg;
    const writer = stream.getWriter();

    try {
        const walker = await opendir(fullPath);
        for await (const dirent of walker) {
            const entry = {
                name: dirent.name,
                type: lookupType(dirent),
            };
            await writer.write(entry);
        }
        await writer.close();
        parentPort.postMessage({ id, result: { ok: true } });
    } catch (err) {
        await writer.abort(err);
        parentPort.postMessage({ id, error: err });
    }
}

parentPort.on('message', async (msg) => {
    try {
        switch (msg.op) {
            case 'read':
                await handleRead(msg);
                break;
            case 'write':
                await handleWrite(msg);
                break;
            case 'readDir':
                await handleReadDir(msg);
                break;
            default:
                throw new Error('Unknown operation: ' + msg.op);
        }
    } catch (e) {
        parentPort.postMessage({ id: msg.id, error: e });
    }
});

function lookupType(obj) {
    if (obj.isFile()) return 'regular-file';
    else if (obj.isSocket()) return 'socket';
    else if (obj.isSymbolicLink()) return 'symbolic-link';
    else if (obj.isFIFO()) return 'fifo';
    else if (obj.isDirectory()) return 'directory';
    else if (obj.isCharacterDevice()) return 'character-device';
    else if (obj.isBlockDevice()) return 'block-device';
    return 'unknown';
}
