import fs, { type BigIntStats } from "node:fs";
import { promisify } from "node:util";

const closeAsync = promisify(fs.close);
const fdatasyncAsync = promisify(fs.fdatasync);
const fstatAsync = promisify(fs.fstat) as (
    fd: number,
    options: { bigint: true },
) => Promise<BigIntStats>;
const fsyncAsync = promisify(fs.fsync);
const ftruncateAsync = promisify(fs.ftruncate);
const futimesAsync = promisify(fs.futimes);
const openAsync = promisify(fs.open);
const readAsync = promisify(fs.read);
const writeAsync = promisify(fs.write);

interface FileResource {
    fd: number;
    refs: number;
}

let nextFileResourceId = 0;
const fileResources = new Map<number, FileResource>();

function lookupType(obj) {
    if (obj.isFile()) {
        return "regular-file";
    }
    if (obj.isSocket()) {
        return "socket";
    }
    if (obj.isSymbolicLink()) {
        return "symbolic-link";
    }
    if (obj.isFIFO()) {
        return "fifo";
    }
    if (obj.isDirectory()) {
        return "directory";
    }
    if (obj.isCharacterDevice()) {
        return "character-device";
    }
    if (obj.isBlockDevice()) {
        return "block-device";
    }
    return "unknown";
}

function getFileResource(id: number) {
    const resource = fileResources.get(id);
    if (!resource) {
        const error = new Error(`Invalid filesystem descriptor resource: ${id}`);
        (error as NodeJS.ErrnoException).code = "EBADF";
        throw error;
    }
    return resource;
}

export async function openFileResource(path: string, flags: number) {
    const fd = await openAsync(path, flags);
    let type;
    try {
        type = lookupType(await fstatAsync(fd, { bigint: true }));
    } catch (error) {
        await closeAsync(fd);
        throw error;
    }
    const id = ++nextFileResourceId;
    fileResources.set(id, { fd, refs: 1 });
    return { id, type };
}

export function retainFileResource(id: number) {
    getFileResource(id).refs++;
    return id;
}

export async function releaseFileResource(id: number) {
    const resource = getFileResource(id);
    if (--resource.refs === 0) {
        fileResources.delete(id);
        await closeAsync(resource.fd);
    }
}

export function fileResourceFd(id: number) {
    return getFileResource(id).fd;
}

export async function syncFileResourceData(id: number) {
    await fdatasyncAsync(fileResourceFd(id));
}

export async function getFileResourceType(id: number) {
    return lookupType(await fstatAsync(fileResourceFd(id), { bigint: true }));
}

export async function setFileResourceSize(id: number, size: number) {
    await ftruncateAsync(fileResourceFd(id), size);
}

export async function setFileResourceTimes(id: number, atime: number, mtime: number) {
    await futimesAsync(fileResourceFd(id), atime, mtime);
}

export async function readFileResource(id: number, length: number, offset: number) {
    const buffer = new Uint8Array(length);
    const result = await readAsync(fileResourceFd(id), buffer, 0, length, offset);
    // Deno v1 returns the byte count directly, while Node returns an object
    // containing the byte count and buffer through util.promisify's custom args.
    const bytesRead = typeof result === "number" ? result : result.bytesRead;
    return { bytes: buffer.subarray(0, bytesRead), eof: bytesRead === 0 };
}

export async function writeFileResource(id: number, buffer: Uint8Array, offset: number) {
    const result = await writeAsync(fileResourceFd(id), buffer, 0, buffer.byteLength, offset);
    return typeof result === "number" ? result : result.bytesWritten;
}

export async function syncFileResource(id: number) {
    await fsyncAsync(fileResourceFd(id));
}

export async function statFileResource(id: number) {
    const stats = await fstatAsync(fileResourceFd(id), { bigint: true });
    return {
        type: lookupType(stats),
        nlink: stats.nlink,
        size: stats.size,
        atimeNs: stats.atimeNs,
        mtimeNs: stats.mtimeNs,
        ctimeNs: stats.ctimeNs,
    };
}

export async function metadataHashFileResource(id: number) {
    const stats = await fstatAsync(fileResourceFd(id), { bigint: true });
    return { upper: stats.mtimeNs, lower: stats.ino };
}
