export namespace RandomRandom {
  export function /**
   * Return `len` cryptographically-secure pseudo-random bytes.
   * 
   * This function must produce data from an adequately seeded
   * cryptographically-secure pseudo-random number generator (CSPRNG), so it
   * must not block, from the perspective of the calling program, and the
   * returned data is always unpredictable.
   * 
   * This function must always return fresh pseudo-random data. Deterministic
   * environments must omit this function, rather than implementing it with
   * deterministic data.
   */
  getRandomBytes(len: bigint): Uint8Array | ArrayBuffer;
  export function /**
   * Return a cryptographically-secure pseudo-random `u64` value.
   * 
   * This function returns the same type of pseudo-random data as
   * `get-random-bytes`, represented as a `u64`.
   */
  getRandomU64(): bigint;
}
