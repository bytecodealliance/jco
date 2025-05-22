import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import { promises as fsPromises } from 'fs';
import { fileURLToPath } from 'node:url';

const { stream } = await import('@bytecodealliance/preview3-shim/stream');

describe('Descriptor with os.tmpdir()', () => {
    let filesystem;
    let rootDescriptor;
    let tmpDir;
    let relBase;

    beforeAll(async () => {
        ({ filesystem } = await import('@bytecodealliance/preview3-shim'));
        [[rootDescriptor]] = filesystem.preopens.getDirectories();

        const base = os.tmpdir();
        tmpDir = await fsPromises.mkdtemp(path.join(base, 'preview3-test-'));

        const rootPath = path.parse(tmpDir).root;
        relBase = path.relative(rootPath, tmpDir).replaceAll(path.sep, '/');
    });

    afterAll(async () => {
        await fsPromises.rm(tmpDir, { recursive: true, force: true });
    });

    test('read current test module contains UNIQUE STRING', async () => {
        // reuse the same rootDescriptor from beforeAll
        const subpath = fileURLToPath(import.meta.url).slice(1);
        const child = await rootDescriptor.openAt({}, subpath, {}, {});

        const [reader, fut] = child.readViaStream(0n);
        const buf = await reader.readAll();
        const text = new TextDecoder().decode(buf);
        expect(text).toContain('UNIQUE STRING');

        await fut.read();
        child[Symbol.dispose]?.();
    });

    test('writeViaStream <=> readViaStream round-trip', async () => {
        const sub = `${relBase}/file-write.txt`;
        const child = await rootDescriptor.openAt(
            {},
            sub,
            { create: true },
            { read: true, write: true }
        );

        const { tx, rx } = stream();
        await tx.write('Hello ');
        await tx.write('Preview3!');
        await tx.close();
        await child.writeViaStream(rx, 0);

        // now read back via readViaStream_
        const [sr, fr] = child.readViaStream(0n);
        const buf = await sr.readAll();
        await fr.read();

        expect(new TextDecoder().decode(buf)).toBe('Hello Preview3!');

        child[Symbol.dispose]?.();
    });

    test('appendViaStream <=> readViaStream round-trip', async () => {
        const sub = `${relBase}/file-append.txt`;
        const child = await rootDescriptor.openAt(
            {},
            sub,
            { create: true },
            { read: true, write: true }
        );

        {
            const { tx, rx } = stream();
            await tx.write('A');
            await tx.close();

            await child.writeViaStream(rx, 0);
        }

        {
            const { tx, rx } = stream();
            await tx.write('B');
            await tx.close();

            await child.appendViaStream(rx);
        }

        const [sr, fr] = child.readViaStream(0n);
        const buf = await sr.readAll();
        await fr.read();

        expect(new TextDecoder().decode(buf)).toBe('AB');
        child[Symbol.dispose]?.();
    });

    test('createDirectoryAt => readDirectory => removeDirectoryAt', async () => {
        const dirDesc = await rootDescriptor.openAt(
            {},
            relBase,
            { directory: true },
            { read: true }
        );

        const readDir = async () => {
            const [reader, future] = dirDesc.readDirectory();
            const entries = [];
            let entry;
            while ((entry = await reader.read()) !== null) {
                entries.push(entry);
            }
            await future.read();
            return entries;
        };

        await dirDesc.createDirectoryAt('subdir');

        const entriesAfterCreate = await readDir();
        expect(entriesAfterCreate.some((e) => e.name === 'subdir')).toBe(true);

        await dirDesc.removeDirectoryAt('subdir');

        const entriesAfterRemove = await readDir();
        expect(entriesAfterRemove.some((e) => e.name === 'subdir')).toBe(false);

        dirDesc[Symbol.dispose]?.();
    });

    test('isSameObject & metadataHash vs metadataHashAt', async () => {
        const sub = `${relBase}/file3.txt`;
        const child = await rootDescriptor.openAt(
            {},
            sub,
            { create: true },
            { read: true, write: true }
        );

        expect(child.isSameObject(child)).toBe(true);
        const h1 = await child.metadataHash();

        const h2 = await rootDescriptor.metadataHashAt(
            { symlinkFollow: true },
            sub
        );

        expect(h2.lower).toBe(h1.lower);
        child[Symbol.dispose]?.();
    });
});
