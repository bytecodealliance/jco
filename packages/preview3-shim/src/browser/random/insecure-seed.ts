import { insecureSeed } from "@bytecodealliance/preview2-shim/random";

function getInsecureSeed(): [bigint, bigint] {
  return insecureSeed.insecureSeed();
}

export default {
  getInsecureSeed,
} satisfies typeof import("../../../types/interfaces/wasi-random-insecure-seed.d.ts");
export type * from "../../../types/interfaces/wasi-random-insecure-seed.d.ts";
