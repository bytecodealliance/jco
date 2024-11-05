// wasi:random/random@0.2.0 interface
// WASI Random is a random data API.

const MAX_BYTES = 65536;

/**
 * Return len cryptographically-secure random or pseudo-random bytes.
 *
 * @param {number|bigint} len
 * @returns {Uint8Array}
 */
export const getRandomBytes = (len) => {
  const bytes = new Uint8Array(Number(len));

  if (len > MAX_BYTES) {
    // this is the max bytes crypto.getRandomValues
    // can do at once see https://developer.mozilla.org/en-US/docs/Web/API/window.crypto.getRandomValues
    for (let pos = 0; pos < bytes.byteLength; pos += MAX_BYTES) {
      // buffer.slice automatically checks if the end is past the end of
      // the buffer so we don't have to here
      crypto.getRandomValues(bytes.subarray(pos, pos + MAX_BYTES));
    }
  } else {
    crypto.getRandomValues(bytes);
  }

  return bytes;
};

/**
 * Return a cryptographically-secure random or pseudo-random u64 value.
 *
 * @returns {bigint}
 */
export const getRandomU64 = () => {
  return crypto.getRandomValues(new BigUint64Array(1))[0];
};
