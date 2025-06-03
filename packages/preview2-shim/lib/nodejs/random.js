import { randomBytes, randomFillSync } from 'node:crypto';

export const insecure = {
    getInsecureRandomBytes: getRandomBytes,
    getInsecureRandomU64() {
        return new BigUint64Array(randomBytes(8).buffer)[0];
    },
};

let insecureSeedValue1, insecureSeedValue2;

export const insecureSeed = {
    insecureSeed() {
        if (insecureSeedValue1 === undefined) {
            insecureSeedValue1 = random.getRandomU64();
            insecureSeedValue2 = random.getRandomU64();
        }
        return [insecureSeedValue1, insecureSeedValue2];
    },
};

export const random = {
    getRandomBytes,

    getRandomU64() {
        return new BigUint64Array(randomBytes(8).buffer)[0];
    },
};

function getRandomBytes(len) {
    return randomBytes(Number(len));
}

getRandomBytes[Symbol.for('cabiLower')] = ({ memory, realloc }) => {
    let buf32 = new Uint32Array(memory.buffer);
    return function randomBytes(len, retptr) {
        len = Number(len);
        const ptr = realloc(0, 0, 1, len);
        randomFillSync(memory.buffer, ptr, len);
        if (memory.buffer !== buf32.buffer) {
            buf32 = new Uint32Array(memory.buffer);
        }
        if (retptr % 4) {
            throw new Error('wasi-io trap: retptr not aligned');
        }
        buf32[retptr >> 2] = ptr;
        buf32[(retptr >> 2) + 1] = len;
    };
};
