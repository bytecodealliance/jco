const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { after, before, test } = require('node:test');
const assert = require('node:assert/strict');

const { fadvise } = require('..');

const ADVICE_VALUES = ['normal', 'sequential', 'random', 'will-need', 'dont-need', 'no-reuse'];

let directory;
let fd;

before(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jco-node-fs-'));
    const file = path.join(directory, 'data');
    fs.writeFileSync(file, 'test data');
    fd = fs.openSync(file, 'r');
});

after(() => {
    fs.closeSync(fd);
    fs.rmSync(directory, { recursive: true, force: true });
});

test('fadvise accepts every WASI advice value', () => {
    for (const advice of ADVICE_VALUES) {
        assert.doesNotThrow(() => fadvise(fd, 0n, 0n, advice));
    }
});

test('fadvise validates its public arguments', () => {
    assert.throws(() => fadvise(fd, -1n, 0n, 'normal'), TypeError);
    assert.throws(() => fadvise(fd, 0n, -1n, 'normal'), TypeError);
    assert.throws(() => fadvise(fd, 0n, 0n, 'unknown'), TypeError);
});

test('fadvise reports operating-system errors', { skip: process.platform !== 'linux' }, () => {
    assert.throws(() => fadvise(0x7fffffff, 0n, 0n, 'normal'), { code: 'EBADF' });
});
