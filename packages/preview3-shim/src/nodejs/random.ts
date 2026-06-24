import {
  insecure,
  insecureSeed as insecureSeedV2,
  random,
} from "@bytecodealliance/preview2-shim/random";

export { insecure, random };

// `wasi:random/insecure-seed` was renamed between p2 (`insecure-seed`)
// and p3 (`get-insecure-seed`). Rename the member to match the p3 WIT
// while keeping the original implementation.
export const insecureSeed = {
  getInsecureSeed: insecureSeedV2.insecureSeed,
};
