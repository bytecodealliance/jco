import type { types as TypesNamespace } from "../../../types/filesystem.js";

type Descriptor = TypesNamespace.Descriptor;
type DescriptorFlags = TypesNamespace.DescriptorFlags;
type OpenFlags = TypesNamespace.OpenFlags;

export interface WriteFileAtOptions {
    append?: boolean;
}

const READ_CHUNK_SIZE = 1024n * 1024n;

/**
 * Write bytes into a preopened directory's tree from host JS, without a guest.
 *
 * Only uses the public `Descriptor` interface, so it works with any adapter.
 */
export function writeFileAt(
    preopens: [Descriptor, string][],
    virtualPath: string,
    path: string,
    data: Uint8Array,
    options: WriteFileAtOptions = {},
): void {
    withFileAt(
        preopens,
        virtualPath,
        path,
        { create: true, truncate: !options.append },
        { write: true },
        (file) => {
            let offset = options.append ? file.stat().size : 0n;
            let written = 0;
            while (written < data.byteLength) {
                const count = Number(file.write(data.subarray(written), offset));
                if (count <= 0) {
                    throw new Error(`short write to ${JSON.stringify(path)}`);
                }
                written += count;
                offset += BigInt(count);
            }
        },
    );
}

/**
 * Read the full contents of a file under a preopened directory from host JS, without a guest.
 *
 * Only uses the public `Descriptor` interface, so it works with any adapter.
 */
export function readFileAt(
    preopens: [Descriptor, string][],
    virtualPath: string,
    path: string,
): Uint8Array {
    return withFileAt(preopens, virtualPath, path, {}, { read: true }, (file) => {
        const chunks: Uint8Array[] = [];
        let length = 0;
        let offset = 0n;
        for (;;) {
            const [bytes, eof] = file.read(READ_CHUNK_SIZE, offset);
            if (bytes.byteLength > 0) {
                chunks.push(bytes);
                length += bytes.byteLength;
                offset += BigInt(bytes.byteLength);
            }
            if (eof) {
                break;
            }
        }
        const result = new Uint8Array(length);
        let position = 0;
        for (const chunk of chunks) {
            result.set(chunk, position);
            position += chunk.byteLength;
        }
        return result;
    });
}

/**
 * Open `path` under the preopen mounted at `virtualPath`, creating missing intermediate
 * directories, run `fn` on it, and release every descriptor opened along the way.
 */
function withFileAt<T>(
    preopens: [Descriptor, string][],
    virtualPath: string,
    path: string,
    openFlags: OpenFlags,
    descriptorFlags: DescriptorFlags,
    fn: (file: Descriptor) => T,
): T {
    const entry = preopens.find(([, guestPath]) => guestPath === virtualPath);
    if (!entry) {
        throw new Error(`no preopen for ${JSON.stringify(virtualPath)}`);
    }
    const [root] = entry;

    const segments = path.split("/").filter((segment) => segment && segment !== ".");
    const fileName = segments.pop();
    if (!fileName) {
        throw new Error(`invalid path: ${JSON.stringify(path)}`);
    }

    // Preopen roots are owned by the caller; everything opened here is released on exit.
    const opened: Descriptor[] = [];
    try {
        let dir: Descriptor = root;
        for (const segment of segments) {
            try {
                dir.createDirectoryAt(segment);
            } catch (error) {
                if (error !== "exist") {
                    throw error;
                }
            }
            dir = dir.openAt({ symlinkFollow: true }, segment, { directory: true }, {});
            opened.push(dir);
        }

        const file = dir.openAt({ symlinkFollow: true }, fileName, openFlags, descriptorFlags);
        opened.push(file);
        return fn(file);
    } finally {
        for (const descriptor of opened.reverse()) {
            (descriptor as Partial<Disposable>)[Symbol.dispose]?.();
        }
    }
}
