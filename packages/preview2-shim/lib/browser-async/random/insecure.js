// wasi:random/insecure@0.2.0 interface
// The insecure interface for insecure pseudo-random numbers.

import { getRandomBytes, getRandomU64 } from "./random.js";

// Return len insecure pseudo-random bytes.
// In this case, just reuse the wasi:random/random interface.
export const getInsecureRandomBytes = getRandomBytes;

// Return an insecure pseudo-random u64 value.
// In this case, just reuse the wasi:random/random interface.
export const getInsecureRandomU64 = getRandomU64;
