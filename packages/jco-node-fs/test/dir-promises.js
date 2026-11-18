const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { afterEach, beforeEach, test } = require('node:test');
const assert = require('node:assert/strict');

const { Dir } = require('..');

/** A path leading outside of a directory is refused with this error. */
const ESCAPE = { code: 'EPERM' };

/** Layout: `<root>/sandbox` is opened as `dir`, and `<root>/outside` must stay unreachable. */
let root;
let dir;

beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'jco-dir-promises-'));
    fs.mkdirSync(host('sandbox/sub'), { recursive: true });
    fs.writeFileSync(host('sandbox/file'), 'inside');
    fs.writeFileSync(host('sandbox/sub/nested'), 'nested');
    fs.mkdirSync(host('outside'));
    fs.writeFileSync(host('outside/secret'), 'secret');
    dir = await Dir.promises.open(host('sandbox'));
});

afterEach(() => {
    dir.close();
    fs.rmSync(root, { recursive: true, force: true });
});

/**
 * Resolve a path below the temporary root.
 *
 * @param {string} name - path relative to the root
 * @returns {string} the host path
 */
function host(name) {
    return path.join(root, name);
}

/**
 * Whether the host lets this process create symlinks, which Windows restricts.
 *
 * @returns {boolean} true if symlinks can be created
 */
function canSymlink() {
    const probe = fs.mkdtempSync(path.join(os.tmpdir(), 'jco-dir-probe-'));
    try {
        fs.symlinkSync('target', path.join(probe, 'link'));
        return true;
    } catch {
        return false;
    } finally {
        fs.rmSync(probe, { recursive: true, force: true });
    }
}

const symlinks = { skip: !canSymlink() };

/**
 * Read a whole file through a descriptor returned by `openAt`, and close it.
 *
 * @param {Dir | number} fd - the result of `openAt`
 * @returns {string} the file's contents
 */
function readAndClose(fd) {
    assert.equal(typeof fd, 'number');
    try {
        return fs.readFileSync(fd, 'utf8');
    } finally {
        fs.closeSync(fd);
    }
}

/**
 * Describe how a synchronous operation fails.
 *
 * @param {() => unknown} operation - the operation, which must throw
 * @returns {object} the properties of the error
 */
function failureOf(operation) {
    try {
        operation();
    } catch (error) {
        const { name, message, code, syscall, path: errorPath, dest } = error;
        return { name, message, code, syscall, path: errorPath, dest };
    }
    throw new Error('operation did not fail');
}

test('opens files as descriptors and directories as handles', async () => {
    assert.ok(dir instanceof Dir);
    assert.equal(readAndClose(await dir.promises.openAt('file', { read: true })), 'inside');

    const fd = await dir.promises.openAt('created', { create: true, exclusive: true, write: true });
    fs.writeSync(fd, 'written');
    fs.closeSync(fd);
    assert.equal(fs.readFileSync(host('sandbox/created'), 'utf8'), 'written');

    const sub = await dir.promises.openAt('sub', { directory: true });
    assert.ok(sub instanceof Dir);
    assert.equal(readAndClose(await sub.promises.openAt('nested')), 'nested');
    assert.equal(readAndClose(sub.openAt('nested')), 'nested');
    sub.close();
});

test('reports attributes and lists entries', async () => {
    assert.deepEqual(await dir.promises.stat(), dir.stat());
    assert.deepEqual(await dir.promises.statAt('file', true), dir.statAt('file', true));
    assert.equal((await dir.promises.statAt('sub', false)).type, 'directory');

    const entries = await dir.promises.readDir();
    assert.deepEqual(
        entries.sort((left, right) => left.name.localeCompare(right.name)),
        [
            { name: 'file', type: 'regular-file' },
            { name: 'sub', type: 'directory' },
        ],
    );
    await dir.promises.sync();
});

test('creates, renames, links and removes', async () => {
    const sub = dir.openAt('sub');

    await dir.promises.createDirAt('made');
    assert.equal(fs.statSync(host('sandbox/made')).isDirectory(), true);
    await dir.promises.removeDirAt('made');
    assert.equal(fs.existsSync(host('sandbox/made')), false);

    await dir.promises.renameAt('file', sub, 'moved');
    assert.equal(fs.readFileSync(host('sandbox/sub/moved'), 'utf8'), 'inside');
    await sub.promises.linkAt('moved', dir, 'linked');
    assert.equal(dir.statAt('linked', true).nlink, 2n);
    await dir.promises.unlinkAt('linked');
    assert.equal(fs.existsSync(host('sandbox/linked')), false);

    await assert.rejects(dir.promises.renameAt('missing', {}, 'other'), TypeError);
    sub.close();
});

test('creates, reads and follows symlinks', symlinks, async () => {
    await dir.promises.symlinkAt('file', 'link');
    assert.equal(await dir.promises.readlinkAt('link'), 'file');
    assert.equal((await dir.promises.statAt('link', false)).type, 'symbolic-link');
    assert.equal((await dir.promises.statAt('link', true)).type, 'regular-file');

    await dir.promises.linkAt('link', dir, 'followed', true);
    assert.equal(dir.statAt('followed', false).type, 'regular-file');

    fs.symlinkSync('../outside', host('sandbox/escape'), 'dir');
    await assert.rejects(dir.promises.statAt('escape/secret', true), ESCAPE);
    await assert.rejects(dir.promises.openAt('escape/secret', { follow: true }), ESCAPE);
    await assert.rejects(dir.promises.createDirAt('escape/created'), ESCAPE);
    assert.deepEqual(fs.readdirSync(host('outside')), ['secret']);
});

test('sets times', async () => {
    await dir.promises.setTimesAt('file', 1_234_567_890_123_456_789n, null, true);
    assert.equal(dir.statAt('file', true).atimeNs, 1_234_567_890_123_456_789n);

    await dir.promises.setTimes(1_000_000_000n, 2_000_000_000n);
    assert.equal(dir.stat().atimeNs, 1_000_000_000n);
    assert.equal(dir.stat().mtimeNs, 2_000_000_000n);

    await assert.rejects(dir.promises.setTimes('later', null), TypeError);
});

test('rejects with the errors that the synchronous operations throw', async () => {
    const sub = dir.openAt('sub');
    const cases = [
        [() => dir.statAt('missing', true), () => dir.promises.statAt('missing', true)],
        [() => dir.statAt('../outside/secret', true), () => dir.promises.statAt('../outside/secret', true)],
        [() => dir.statAt(host('outside'), false), () => dir.promises.statAt(host('outside'), false)],
        [() => dir.openAt('file', { directory: true }), () => dir.promises.openAt('file', { directory: true })],
        [() => dir.openAt('sub', { write: true }), () => dir.promises.openAt('sub', { write: true })],
        [
            () => dir.openAt('sub', { directory: true, create: true }),
            () => dir.promises.openAt('sub', { directory: true, create: true }),
        ],
        [
            () => dir.openAt('file', { create: true, exclusive: true }),
            () => dir.promises.openAt('file', { create: true, exclusive: true }),
        ],
        [() => dir.openAt('file', { read: 1 }), () => dir.promises.openAt('file', { read: 1 })],
        [() => dir.readlinkAt('file'), () => dir.promises.readlinkAt('file')],
        [() => dir.createDirAt('sub'), () => dir.promises.createDirAt('sub')],
        [() => dir.removeDirAt('sub'), () => dir.promises.removeDirAt('sub')],
        [() => dir.unlinkAt('sub'), () => dir.promises.unlinkAt('sub')],
        [() => dir.renameAt('missing', sub, 'moved'), () => dir.promises.renameAt('missing', sub, 'moved')],
        [() => dir.linkAt('file', sub, 'nested'), () => dir.promises.linkAt('file', sub, 'nested')],
        [() => dir.symlinkAt(host('outside'), 'link'), () => dir.promises.symlinkAt(host('outside'), 'link')],
        [
            () => dir.setTimesAt('missing', null, 'now', true),
            () => dir.promises.setTimesAt('missing', null, 'now', true),
        ],
        [() => dir.statAt('file\0', true), () => dir.promises.statAt('file\0', true)],
        [() => Dir.open(host('missing')), () => Dir.promises.open(host('missing'))],
    ];

    for (const [synchronous, asynchronous] of cases) {
        const expected = failureOf(synchronous);
        await assert.rejects(asynchronous(), (error) => {
            const { name, message, code, syscall, path: errorPath, dest } = error;
            assert.deepEqual({ name, message, code, syscall, path: errorPath, dest }, expected);
            return true;
        });
    }
    sub.close();
});

test('runs many operations on one handle at once', async () => {
    const count = 256;
    await Promise.all(
        Array.from({ length: count }, async (_, index) => {
            const name = `entry-${index}`;
            await dir.promises.createDirAt(name);
            const sub = await dir.promises.openAt(name, { directory: true });
            const fd = await sub.promises.openAt('data', { create: true, write: true });
            fs.writeSync(fd, name);
            fs.closeSync(fd);
            assert.equal((await dir.promises.statAt(`${name}/data`, true)).size, BigInt(name.length));
            await dir.promises.renameAt(`${name}/data`, sub, 'renamed');
            assert.deepEqual(await sub.promises.readDir(), [{ name: 'renamed', type: 'regular-file' }]);
            sub.close();
        }),
    );

    const entries = await dir.promises.readDir();
    assert.equal(entries.filter((entry) => entry.name.startsWith('entry-')).length, count);
    for (let index = 0; index < count; index++) {
        assert.equal(fs.readFileSync(host(`sandbox/entry-${index}/renamed`), 'utf8'), `entry-${index}`);
    }
});

test('operations in flight finish after close, and later ones are rejected', async () => {
    const closed = await Dir.promises.open(host('sandbox'));
    for (let index = 0; index < 64; index++) {
        fs.writeFileSync(host(`sandbox/listed-${index}`), '');
    }

    const inFlight = [
        closed.promises.readDir(),
        closed.promises.statAt('file', true),
        closed.promises.createDirAt('made-while-closing'),
        closed.promises.openAt('sub', { directory: true }),
    ];
    closed.close();

    const [entries, stat, , sub] = await Promise.all(inFlight);
    // The listing runs alongside the directory creation, so it may include it.
    assert.equal(entries.filter((entry) => entry.name !== 'made-while-closing').length, 66);
    assert.equal(stat.type, 'regular-file');
    assert.equal(fs.statSync(host('sandbox/made-while-closing')).isDirectory(), true);
    assert.equal(readAndClose(sub.openAt('nested')), 'nested');
    sub.close();

    await assert.rejects(closed.promises.readDir(), { code: 'EBADF', syscall: 'scandir' });
    await assert.rejects(closed.promises.statAt('file', true), { code: 'EBADF', syscall: 'stat', path: 'file' });
    await assert.rejects(dir.promises.renameAt('file', closed, 'file'), { code: 'EBADF' });
    assert.throws(() => closed.stat(), { code: 'EBADF' });
});

test('an operation keeps the directory open when its handle is collected', { skip: !globalThis.gc }, async () => {
    const pending = (await Dir.promises.open(host('sandbox'))).promises.readDir();
    globalThis.gc();
    assert.equal((await pending).length, 2);
});
