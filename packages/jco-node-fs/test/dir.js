const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { afterEach, beforeEach, test } = require('node:test');
const { Worker } = require('node:worker_threads');
const { once } = require('node:events');
const assert = require('node:assert/strict');

const { Dir } = require('..');

const isWindows = process.platform === 'win32';

/** A path leading outside of a directory is refused with this error. */
const ESCAPE = { code: 'EPERM' };

/** Layout: `<root>/sandbox` is opened as `dir`, and `<root>/outside` must stay unreachable. */
let root;
let dir;

beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'jco-dir-'));
    fs.mkdirSync(host('sandbox/sub'), { recursive: true });
    fs.writeFileSync(host('sandbox/file'), 'inside');
    fs.writeFileSync(host('sandbox/sub/nested'), 'nested');
    fs.mkdirSync(host('outside'));
    fs.writeFileSync(host('outside/secret'), 'secret');
    dir = Dir.open(host('sandbox'));
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
 * Assert that no operation can reach `<root>/outside` through `name`.
 *
 * @param {Dir} handle - the directory to operate on
 * @param {string} name - a path that leads to `<root>/outside`
 */
function assertCannotReachOutside(handle, name) {
    const existing = handle.readDir().find((entry) => entry.type === 'regular-file').name;

    assert.throws(() => handle.statAt(`${name}/secret`, true), ESCAPE);
    assert.throws(() => handle.statAt(`${name}/secret`, false), ESCAPE);
    assert.throws(() => handle.openAt(`${name}/secret`, { read: true, follow: true }), ESCAPE);
    assert.throws(() => handle.openAt(name, { directory: true, follow: true }), ESCAPE);
    assert.throws(() => handle.openAt(`${name}/created`, { create: true, write: true }), ESCAPE);
    assert.throws(() => handle.createDirAt(`${name}/created`), ESCAPE);
    assert.throws(() => handle.unlinkAt(`${name}/secret`), ESCAPE);
    assert.throws(() => handle.renameAt(`${name}/secret`, handle, 'stolen'), ESCAPE);
    assert.throws(() => handle.renameAt(existing, handle, `${name}/planted`), ESCAPE);
    assert.throws(() => handle.linkAt(`${name}/secret`, handle, 'stolen'), ESCAPE);
    assert.throws(() => handle.symlinkAt(existing, `${name}/planted`), ESCAPE);
    assert.throws(() => handle.setTimesAt(`${name}/secret`, 0n, 0n, true), ESCAPE);
    assert.throws(() => handle.readlinkAt(`${name}/secret`), ESCAPE);

    assert.deepEqual(fs.readdirSync(host('outside')), ['secret']);
    assert.equal(fs.readFileSync(host('outside/secret'), 'utf8'), 'secret');
    assert.notEqual(fs.statSync(host('outside/secret')).mtimeMs, 0);
}

test('opens files as descriptors that Node.js can use', () => {
    assert.equal(readAndClose(dir.openAt('file', { read: true })), 'inside');
    assert.equal(readAndClose(dir.openAt('sub/nested')), 'nested');

    const fd = dir.openAt('created', { create: true, exclusive: true, write: true });
    fs.writeSync(fd, 'written');
    fs.closeSync(fd);
    assert.equal(fs.readFileSync(host('sandbox/created'), 'utf8'), 'written');

    assert.throws(() => dir.openAt('created', { create: true, exclusive: true }), {
        code: 'EEXIST',
        syscall: 'open',
        path: 'created',
    });
    fs.closeSync(dir.openAt('created', { truncate: true }));
    assert.equal(fs.readFileSync(host('sandbox/created'), 'utf8'), '');
    assert.throws(() => dir.openAt('missing'), { code: 'ENOENT' });
});

test('opens directories as handles', () => {
    const sub = dir.openAt('sub', { directory: true });
    assert.ok(sub instanceof Dir);
    assert.equal(readAndClose(sub.openAt('nested')), 'nested');
    assert.throws(() => sub.openAt('../file'), ESCAPE);
    sub.close();
    assert.throws(() => sub.stat(), { code: 'EBADF' });

    const same = dir.openAt('.');
    assert.ok(same instanceof Dir);
    assert.equal(same.stat().ino, dir.stat().ino);
    same.close();

    assert.throws(() => dir.openAt('file', { directory: true }), { code: 'ENOTDIR' });
    assert.throws(() => dir.openAt('file/'), { code: 'ENOTDIR' });
    assert.throws(() => dir.openAt('sub', { write: true }), { code: 'EISDIR' });
    assert.throws(() => dir.openAt('sub', { directory: true, create: true }), { code: 'EINVAL' });
});

test('reports attributes with lossless 64-bit values', () => {
    const expected = fs.statSync(host('sandbox/file'), { bigint: true });
    const stat = dir.statAt('file', true);
    assert.equal(stat.type, 'regular-file');
    assert.equal(stat.size, 6n);
    assert.equal(stat.nlink, 1n);
    assert.equal(stat.ino, expected.ino);
    assert.equal(stat.mtimeNs, expected.mtimeNs);

    assert.equal(dir.stat().type, 'directory');
    assert.equal(dir.stat().ino, fs.statSync(host('sandbox'), { bigint: true }).ino);
    assert.equal(dir.statAt('sub', false).type, 'directory');
    assert.throws(() => dir.statAt('missing', true), { code: 'ENOENT', syscall: 'stat', path: 'missing' });
    assert.throws(() => dir.statAt('file/', true), { code: 'ENOTDIR' });
    assert.throws(() => dir.statAt('', true), { code: 'ENOENT' });
});

test('creates and removes directories and files', () => {
    dir.createDirAt('made');
    dir.createDirAt('trailing/');
    assert.equal(fs.statSync(host('sandbox/trailing')).isDirectory(), true);
    assert.throws(() => dir.createDirAt('made'), { code: 'EEXIST', syscall: 'mkdir', path: 'made' });

    assert.throws(() => dir.removeDirAt('sub'), { code: 'ENOTEMPTY' });
    assert.throws(() => dir.removeDirAt('file'), { code: 'ENOTDIR' });
    dir.removeDirAt('made');
    assert.equal(fs.existsSync(host('sandbox/made')), false);

    dir.unlinkAt('file');
    assert.equal(fs.existsSync(host('sandbox/file')), false);
    assert.throws(() => dir.unlinkAt('file'), { code: 'ENOENT', syscall: 'unlink' });
});

test('renames and links between directory handles', () => {
    const sub = dir.openAt('sub');
    dir.renameAt('file', sub, 'moved');
    assert.equal(fs.readFileSync(host('sandbox/sub/moved'), 'utf8'), 'inside');
    assert.throws(() => dir.renameAt('file', sub, 'moved'), {
        code: 'ENOENT',
        syscall: 'rename',
        path: 'file',
        dest: 'moved',
    });

    sub.linkAt('moved', dir, 'linked');
    assert.equal(dir.statAt('linked', true).nlink, 2n);
    assert.throws(() => sub.linkAt('moved', dir, 'linked'), { code: 'EEXIST' });
    assert.throws(() => dir.renameAt('linked', {}, 'other'), TypeError);
    sub.close();
});

test('sets times with nanosecond precision and leaves omitted times unchanged', () => {
    const before = dir.statAt('file', true);
    dir.setTimesAt('file', 1_234_567_890_123_456_789n, null, true);
    const after = dir.statAt('file', true);
    assert.equal(after.atimeNs, 1_234_567_890_123_456_789n);
    assert.equal(after.mtimeNs, before.mtimeNs);

    dir.setTimesAt('file', null, 'now', true);
    assert.equal(dir.statAt('file', true).atimeNs, 1_234_567_890_123_456_789n);
    assert.ok(dir.statAt('file', true).mtimeNs >= before.mtimeNs);

    dir.setTimes(1_000_000_000n, 2_000_000_000n);
    assert.equal(dir.stat().atimeNs, 1_000_000_000n);
    assert.equal(dir.stat().mtimeNs, 2_000_000_000n);

    assert.throws(() => dir.setTimesAt('file', 1, null, true), TypeError);
    assert.throws(() => dir.setTimes('later', null), TypeError);
});

test('lists entries with their types and syncs', () => {
    const entries = dir.readDir().sort((left, right) => left.name.localeCompare(right.name));
    assert.deepEqual(entries, [
        { name: 'file', type: 'regular-file' },
        { name: 'sub', type: 'directory' },
    ]);
    assert.doesNotThrow(() => dir.sync());
});

test('validates arguments and reports use after close', () => {
    for (const invalid of [undefined, null, 42, Buffer.from('file'), 'file\0suffix']) {
        assert.throws(() => dir.statAt(invalid, true), TypeError);
        assert.throws(() => dir.openAt(invalid), TypeError);
        assert.throws(() => Dir.open(invalid), TypeError);
    }
    assert.throws(() => dir.openAt('file', { read: 1 }), TypeError);
    assert.throws(() => new Dir({}), TypeError);
    assert.throws(() => Dir.open(host('missing')), { code: 'ENOENT', syscall: 'open' });
    assert.throws(() => Dir.open(host('sandbox/file')), { code: 'ENOTDIR' });

    const closed = Dir.open(host('sandbox'));
    closed.close();
    closed.close();
    assert.throws(() => closed.readDir(), { code: 'EBADF', syscall: 'scandir' });
    assert.throws(() => dir.renameAt('file', closed, 'file'), { code: 'EBADF' });
});

test('worker threads open their own handles and can use descriptors opened elsewhere', async () => {
    const fd = dir.openAt('file', { read: true });
    const worker = new Worker(
        `const { parentPort, workerData } = require('node:worker_threads');
         const fs = require('node:fs');
         const { Dir } = require(workerData.module);
         const dir = Dir.open(workerData.directory);
         const own = dir.openAt('sub/nested');
         parentPort.postMessage({
             shared: fs.readFileSync(workerData.fd, 'utf8'),
             own: fs.readFileSync(own, 'utf8'),
         });
         fs.closeSync(own);
         dir.close();`,
        { eval: true, workerData: { module: require.resolve('..'), directory: host('sandbox'), fd } },
    );
    try {
        const [message] = await once(worker, 'message');
        assert.deepEqual(message, { shared: 'inside', own: 'nested' });
    } finally {
        await worker.terminate();
        fs.closeSync(fd);
    }
});

test('refuses paths that leave the directory through ".."', () => {
    assertCannotReachOutside(dir, '../outside');
    assertCannotReachOutside(dir, 'sub/../../outside');
    assert.throws(() => dir.statAt('..', true), ESCAPE);
    assert.throws(() => dir.openAt('sub/../..'), ESCAPE);

    // `..` that stays inside is resolved.
    assert.equal(dir.statAt('sub/../file', true).type, 'regular-file');
    assert.equal(dir.statAt('sub/..', true).ino, dir.stat().ino);
});

test('refuses absolute paths', () => {
    assert.throws(() => dir.statAt(host('outside/secret'), true), ESCAPE);
    assert.throws(() => dir.openAt(host('outside/secret'), { read: true }), ESCAPE);
    assert.throws(() => dir.openAt(host('sandbox/file'), { read: true }), ESCAPE);
    assert.throws(() => dir.createDirAt(host('outside/created')), ESCAPE);
    assert.throws(() => dir.symlinkAt(host('outside'), 'absolute'), ESCAPE);
    assert.deepEqual(fs.readdirSync(host('outside')), ['secret']);
});

test('refuses symlinks that lead outside, and does not follow them unasked', symlinks, () => {
    fs.symlinkSync('../outside', host('sandbox/relative'), 'dir');
    fs.symlinkSync(host('outside'), host('sandbox/absolute'), 'dir');
    fs.symlinkSync('../outside/secret', host('sandbox/secret-link'), 'file');

    assertCannotReachOutside(dir, 'relative');
    assertCannotReachOutside(dir, 'absolute');
    assert.throws(() => dir.statAt('secret-link', true), ESCAPE);
    assert.throws(() => dir.openAt('secret-link', { read: true, follow: true }), ESCAPE);
    assert.throws(() => dir.setTimesAt('secret-link', 0n, 0n, true), ESCAPE);

    // Without following, the symlink itself is the object.
    assert.equal(dir.statAt('secret-link', false).type, 'symbolic-link');
    assert.equal(dir.readlinkAt('secret-link'), '../outside/secret');
    assert.equal(dir.readlinkAt('absolute'), host('outside'));
    assert.throws(() => dir.openAt('secret-link', { read: true }), { code: 'ELOOP' });
    dir.unlinkAt('secret-link');
    assert.equal(fs.readFileSync(host('outside/secret'), 'utf8'), 'secret');
});

test('follows symlinks that stay inside the directory', symlinks, () => {
    fs.symlinkSync('sub', host('sandbox/sub-link'), 'dir');
    fs.symlinkSync('../file', host('sandbox/sub/up-link'), 'file');
    dir.symlinkAt('file', 'made-link');

    assert.equal(readAndClose(dir.openAt('sub-link/nested')), 'nested');
    assert.equal(readAndClose(dir.openAt('sub-link/up-link', { follow: true })), 'inside');
    assert.equal(readAndClose(dir.openAt('made-link', { follow: true })), 'inside');
    assert.equal(dir.statAt('made-link', true).type, 'regular-file');
    assert.equal(dir.statAt('made-link', false).type, 'symbolic-link');
    assert.equal(dir.readlinkAt('made-link'), 'file');

    const linked = dir.openAt('sub-link', { directory: true, follow: true });
    assert.ok(linked instanceof Dir);
    assert.equal(linked.stat().ino, dir.statAt('sub', true).ino);
    linked.close();
    // Hosts differ in which error an unfollowed symlink fails a directory open with.
    assert.throws(
        () => dir.openAt('sub-link', { directory: true }),
        (error) => error.code === 'ENOTDIR' || error.code === 'ELOOP',
    );
});

test('links a symlink itself, or its target when asked to follow', symlinks, () => {
    fs.symlinkSync('file', host('sandbox/link'), 'file');
    fs.symlinkSync('link', host('sandbox/chain'), 'file');
    fs.symlinkSync('missing', host('sandbox/dangling'), 'file');
    fs.symlinkSync('../outside/secret', host('sandbox/escape'), 'file');

    dir.linkAt('chain', dir, 'followed', true);
    assert.equal(dir.statAt('followed', false).type, 'regular-file');
    assert.equal(dir.statAt('followed', false).ino, dir.statAt('file', false).ino);

    dir.linkAt('chain', dir, 'unfollowed');
    assert.equal(dir.statAt('unfollowed', false).type, 'symbolic-link');

    assert.throws(() => dir.linkAt('dangling', dir, 'other', true), { code: 'ENOENT' });
    assert.throws(() => dir.linkAt('escape', dir, 'other', true), ESCAPE);
    assert.equal(fs.existsSync(host('sandbox/other')), false);
});

test('refuses a symlink loop', symlinks, () => {
    fs.symlinkSync('loop-b', host('sandbox/loop-a'));
    fs.symlinkSync('loop-a', host('sandbox/loop-b'));
    assert.throws(() => dir.statAt('loop-a', true), { code: 'ELOOP' });
    assert.throws(() => dir.openAt('loop-a/file', { read: true }), { code: 'ELOOP' });
});

test('refuses a component replaced by a symlink to outside after opening', symlinks, () => {
    assert.equal(readAndClose(dir.openAt('sub/nested')), 'nested');

    fs.renameSync(host('sandbox/sub'), host('sandbox/sub-original'));
    fs.symlinkSync('../outside', host('sandbox/sub'), 'dir');

    assertCannotReachOutside(dir, 'sub');
});

test('keeps operating on its directory after the directory is renamed', { skip: isWindows }, () => {
    fs.renameSync(host('sandbox'), host('moved'));

    assert.equal(readAndClose(dir.openAt('file')), 'inside');
    dir.createDirAt('after-move');
    assert.equal(fs.statSync(host('moved/after-move')).isDirectory(), true);
    assert.equal(fs.existsSync(host('sandbox')), false);
    assert.throws(() => dir.statAt('../outside/secret', true), ESCAPE);
});

test(
    'keeps referring to its directory after its path becomes a symlink to outside',
    { skip: isWindows || symlinks.skip },
    () => {
        const sub = dir.openAt('sub');
        fs.renameSync(host('sandbox'), host('moved'));
        fs.symlinkSync('outside', host('sandbox'), 'dir');

        // The path now leads outside, the handles still refer to the original directories.
        assert.equal(fs.readFileSync(host('sandbox/secret'), 'utf8'), 'secret');
        assert.deepEqual(
            dir
                .readDir()
                .map((entry) => entry.name)
                .sort(),
            ['file', 'sub'],
        );
        assert.throws(() => dir.statAt('secret', true), { code: 'ENOENT' });
        fs.closeSync(dir.openAt('created', { create: true, write: true }));
        sub.createDirAt('created');
        assert.deepEqual(fs.readdirSync(host('outside')), ['secret']);
        assert.equal(fs.existsSync(host('moved/created')), true);
        assert.equal(fs.existsSync(host('moved/sub/created')), true);

        assertCannotReachOutside(dir, '../outside');
        assertCannotReachOutside(sub, '../../outside');
        sub.close();
    },
);
