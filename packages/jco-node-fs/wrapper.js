const { getSystemErrorName } = require('node:util');

const { fadviseRaw } = require('./index.js');

const MAX_U64 = (1n << 64n) - 1n;
const ADVICE = new Set(['normal', 'sequential', 'random', 'will-need', 'dont-need', 'no-reuse']);

function fadvise(fd, offset, length, advice) {
    if (!Number.isInteger(fd) || fd < 0) {
        throw new TypeError('fd must be a non-negative integer');
    }
    validateFilesize(offset, 'offset');
    validateFilesize(length, 'length');
    if (!ADVICE.has(advice)) {
        throw new TypeError(`unknown file advice: ${advice}`);
    }

    const errno = fadviseRaw(fd, offset.toString(), length.toString(), advice);
    if (errno === 0) {
        return;
    }

    const code = getSystemErrorName(-errno);
    const error = new Error(`${code}: fadvise`);
    error.code = code;
    error.errno = -errno;
    error.syscall = 'fadvise';
    throw error;
}

function validateFilesize(value, name) {
    if (typeof value !== 'bigint' || value < 0n || value > MAX_U64) {
        throw new TypeError(`${name} must be an unsigned 64-bit bigint`);
    }
}

module.exports.fadvise = fadvise;
