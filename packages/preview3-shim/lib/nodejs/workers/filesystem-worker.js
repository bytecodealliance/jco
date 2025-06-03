import { promisify } from 'util';
import { FSError } from '../filesystem/error.js';
import { Router } from '../workers/resource-worker.js';

// Use fs callback API for BigInt offset support
import fs from 'fs';
const readAsync = promisify(fs.read);
const writeAsync = promisify(fs.write);
const { opendir } = fs.promises;

const CHUNK_BYTES = 64 * 1024;
// Reuse a single buffer for all read/write ops
const BUFFER = Buffer.alloc(CHUNK_BYTES);

/** Auto‐dispatch all ops */
Router()
    .op('read', handleRead)
    .op('write', handleWrite)
    .op('readDir', handleReadDir);

/** Map fs.Dirent -> WASI type */
function wasiTypeFromDirent(obj) {
    if (obj.isFile()) return 'regular-file';
    if (obj.isSocket()) return 'socket';
    if (obj.isSymbolicLink()) return 'symbolic-link';
    if (obj.isFIFO()) return 'fifo';
    if (obj.isDirectory()) return 'directory';
    if (obj.isCharacterDevice()) return 'character-device';
    if (obj.isBlockDevice()) return 'block-device';
    return 'unknown';
}

async function handleRead({ fd, offset, stream }) {
    if (typeof fd !== 'number' || fd < 0) {
        throw new TypeError(`Invalid file descriptor: ${fd}`);
    }

    if (!stream || typeof stream.getWriter !== 'function') {
        throw new TypeError('stream must have a getWriter() method');
    }

    const writer = stream.getWriter();
    try {
        let pos = BigInt(offset);
        const start = pos;

        while (true) {
            const { bytesRead } = await readAsync(
                fd,
                BUFFER,
                0,
                CHUNK_BYTES,
                pos
            );
            if (bytesRead === 0) break;

            await writer.write(BUFFER.subarray(0, bytesRead));
            pos += BigInt(bytesRead);
        }

        await writer.close();

        return { bytesRead: pos - start };
    } catch (err) {
        await writer.abort(err);
        throw err;
    }
}

async function handleWrite({ fd, offset, stream }) {
    if (typeof fd !== 'number' || fd < 0) {
        throw new TypeError(`Invalid file descriptor: ${fd}`);
    }

    if (!stream || typeof stream.getReader !== 'function') {
        throw new TypeError('stream must have a getReader() method');
    }

    const reader = stream.getReader();
    try {
        let pos = BigInt(offset);
        const start = pos;

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
        }
        return { bytesWritten: pos - start };
    } catch (err) {
        await reader.cancel(err);
        throw err;
    }
}

async function handleReadDir({ fullPath, stream, preopens }) {
    if (!stream || typeof stream.getWriter !== 'function') {
        throw new TypeError('stream must have a getWriter() method');
    }

    const canAccess = preopens.some(
        (p) => fullPath === p || fullPath.startsWith(p + '/')
    );

    if (!canAccess) {
        const err = new FSError('not-permitted');
        await writer.abort(err);
        throw err;
    }

    const writer = stream.getWriter();

    try {
        const walker = await opendir(fullPath);
        for await (const dirent of walker) {
            await writer.write({
                name: dirent.name,
                type: wasiTypeFromDirent(dirent),
            });
        }
        await writer.close();
        return { ok: true };
    } catch (err) {
        await writer.abort(err);
        throw err;
    }
}
