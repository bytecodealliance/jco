/** Host implementations of the imports of the benchmark fixtures. */

let scalar = 0;

export const numbers = {
    roundtripU8: (value) => value,
    roundtripS8: (value) => value,
    roundtripU16: (value) => value,
    roundtripS16: (value) => value,
    roundtripU32: (value) => value,
    roundtripS32: (value) => value,
    roundtripU64: (value) => value,
    roundtripS64: (value) => value,
    roundtripF32: (value) => value,
    roundtripF64: (value) => value,
    roundtripChar: (value) => value,
    setScalar: (value) => {
        scalar = value;
    },
    getScalar: () => scalar,
};

export const strings = {
    takeBasic: (_value) => {},
    returnUnicode: () => '🚀🚀🚀 𠈄𓀀',
};

/**
 * Imports that the benchmarks never call.
 *
 * @param {string} name - fixture the imports belong to
 * @returns {object} an object whose every function throws
 */
const unused = (name) =>
    new Proxy(
        {},
        {
            get: (_target, key) => () => {
                throw new Error(`unexpected call of ${name} import ${String(key)}`);
            },
        },
    );

export const records = unused('records');
export const lists = unused('lists');
