import fs from 'fs';
import { promisify } from 'util';
import { Router } from '../workers/resource-worker.js';

const readAsync = promisify(fs.read);
const writeAsync = promisify(fs.write);
const { opendir } = fs.promises;

const CHUNK = 64 * 1024;
const buffer = Buffer.alloc(CHUNK);

/** Auto‐dispatch all ops */
Router()
    .op('read', handleRead)
    .op('write', handleWrite)
    .op('readDir', handleReadDir);

/** Map fs.Dirent → WASI type */
function lookupType(obj) {
    if (obj.isFile()) return 'regular-file';
    if (obj.isSocket()) return 'socket';
    if (obj.isSymbolicLink()) return 'symbolic-link';
    if (obj.isFIFO()) return 'fifo';
    if (obj.isDirectory()) return 'directory';
    if (obj.isCharacterDevice()) return 'character-device';
    if (obj.isBlockDevice()) return 'block-device';
    return 'unknown';
}

/** Read loop → writes into a TransformStream */
async function handleRead({ fd, offset, stream }) {
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
        return { ok: true };
    } catch (err) {
        await writer.abort(err);
        throw err;
    }
}

async function handleWrite({ fd, offset, stream }) {
    const reader = stream.getReader();
    try {
        let pos = BigInt(offset);
        let total = 0n;

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
        return { ok: true, bytesWritten: total };
    } catch (err) {
        await reader.cancel(err);
        throw err;
    }
}

async function handleReadDir({ fullPath, stream }) {
    const writer = stream.getWriter();

    try {
        const walker = await opendir(fullPath);
        for await (const dirent of walker) {
            await writer.write({
                name: dirent.name,
                type: lookupType(dirent),
            });
        }
        await writer.close();
        return { ok: true };
    } catch (err) {
        await writer.abort(err);
        throw err;
    }
}
