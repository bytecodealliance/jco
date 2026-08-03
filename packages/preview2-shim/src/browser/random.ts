import type {
    insecure as InsecureNamespace,
    insecureSeed as InsecureSeedNamespace,
    random as RandomNamespace,
} from "../../types/random.js";

const MAX_BYTES = 65536;
const MAX_U64 = (1n << 64n) - 1n;

function checkedByteLength(len: bigint): number {
    if (typeof len !== "bigint" || len < 0n || len > MAX_U64) {
        throw new TypeError("random byte length must be a valid u64");
    }
    if (len > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new RangeError("random byte length exceeds JavaScript's safe integer range");
    }
    return Number(len);
}

let insecureRandomValue1: bigint | undefined, insecureRandomValue2: bigint | undefined;

export const insecure: typeof InsecureNamespace = {
    getInsecureRandomBytes(len: bigint) {
        return random.getRandomBytes(len);
    },
    getInsecureRandomU64() {
        return random.getRandomU64();
    },
};

let insecureSeedValue1: bigint | undefined, insecureSeedValue2: bigint | undefined;

export const insecureSeed: typeof InsecureSeedNamespace = {
    insecureSeed() {
        if (insecureSeedValue1 === undefined || insecureSeedValue2 === undefined) {
            insecureSeedValue1 = random.getRandomU64();
            insecureSeedValue2 = random.getRandomU64();
        }
        return [insecureSeedValue1, insecureSeedValue2];
    },
};

export const random: typeof RandomNamespace = {
    getRandomBytes(len: bigint) {
        const byteLength = checkedByteLength(len);
        const bytes = new Uint8Array(byteLength);

        if (byteLength > MAX_BYTES) {
            // this is the max bytes crypto.getRandomValues
            // can do at once see https://developer.mozilla.org/en-US/docs/Web/API/window.crypto.getRandomValues
            for (let generated = 0; generated < byteLength; generated += MAX_BYTES) {
                // buffer.slice automatically checks if the end is past the end of
                // the buffer so we don't have to here
                crypto.getRandomValues(bytes.subarray(generated, generated + MAX_BYTES));
            }
        } else {
            crypto.getRandomValues(bytes);
        }

        return bytes;
    },

    getRandomU64() {
        return crypto.getRandomValues(new BigUint64Array(1))[0];
    },

    // @ts-expect-error Not defined in WIT
    insecureRandom() {
        if (insecureRandomValue1 === undefined || insecureRandomValue2 === undefined) {
            insecureRandomValue1 = random.getRandomU64();
            insecureRandomValue2 = random.getRandomU64();
        }
        return [insecureRandomValue1, insecureRandomValue2];
    },
};
