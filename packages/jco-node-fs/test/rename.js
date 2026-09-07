const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { afterEach, beforeEach, test } = require('node:test');
const assert = require('node:assert/strict');

const { rename } = require('..');

let directory;
beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jco-rename-'));
});
afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));

function entry(name) {
    return path.join(directory, name);
}

test('renames a directory onto an existing empty directory', () => {
    fs.mkdirSync(entry('source'));
    fs.writeFileSync(entry('source/content'), 'preserved');
    fs.mkdirSync(entry('target'));
    rename(entry('source'), entry('target'));
    assert.equal(fs.existsSync(entry('source')), false);
    assert.equal(fs.readFileSync(entry('target/content'), 'utf8'), 'preserved');
});

test('refuses a nonempty destination and preserves both directories', () => {
    fs.mkdirSync(entry('source'));
    fs.writeFileSync(entry('source/content'), 'source');
    fs.mkdirSync(entry('target'));
    fs.writeFileSync(entry('target/content'), 'target');
    assert.throws(() => rename(entry('source'), entry('target')), {
        code: 'ENOTEMPTY',
        syscall: 'rename',
        path: entry('source'),
        dest: entry('target'),
    });
    assert.equal(fs.readFileSync(entry('source/content'), 'utf8'), 'source');
    assert.equal(fs.readFileSync(entry('target/content'), 'utf8'), 'target');
});

test('renaming a directory to itself preserves its contents', () => {
    fs.mkdirSync(entry('source'));
    fs.writeFileSync(entry('source/content'), 'preserved');
    rename(entry('source'), entry('source'));
    assert.equal(fs.readFileSync(entry('source/content'), 'utf8'), 'preserved');
});

test('replaces an existing file and supports Unicode paths', () => {
    fs.writeFileSync(entry('source 🚀'), 'source');
    fs.writeFileSync(entry('target 🚀'), 'target');
    rename(entry('source 🚀'), entry('target 🚀'));
    assert.equal(fs.existsSync(entry('source 🚀')), false);
    assert.equal(fs.readFileSync(entry('target 🚀'), 'utf8'), 'source');
});

test('moves a directory symlink without moving its target', () => {
    fs.mkdirSync(entry('original'));
    fs.writeFileSync(entry('original/content'), 'preserved');
    fs.symlinkSync(entry('original'), entry('link'), process.platform === 'win32' ? 'junction' : 'dir');
    rename(entry('link'), entry('renamed-link'));
    assert.equal(fs.existsSync(entry('link')), false);
    assert.equal(fs.lstatSync(entry('renamed-link')).isSymbolicLink(), true);
    assert.equal(fs.readFileSync(entry('original/content'), 'utf8'), 'preserved');
    assert.equal(fs.readFileSync(entry('renamed-link/content'), 'utf8'), 'preserved');
});

test('reports a missing source without removing the destination', () => {
    fs.mkdirSync(entry('target'));
    assert.throws(() => rename(entry('missing'), entry('target')), { code: 'ENOENT' });
    assert.equal(fs.statSync(entry('target')).isDirectory(), true);
});

test('rejects invalid arguments before changing the filesystem', () => {
    fs.writeFileSync(entry('source'), 'preserved');
    for (const invalid of [undefined, null, 42, Buffer.from('target'), 'target\0suffix']) {
        assert.throws(() => rename(entry('source'), invalid), TypeError);
        assert.throws(() => rename(invalid, entry('target')), TypeError);
    }
    assert.equal(fs.readFileSync(entry('source'), 'utf8'), 'preserved');
    assert.equal(fs.existsSync(entry('target')), false);
});
