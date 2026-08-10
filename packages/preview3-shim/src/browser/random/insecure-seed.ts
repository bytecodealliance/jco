import { Todo } from "../../common/errors.js";

function getInsecureSeed(): [bigint, bigint] {
  throw new Todo();
}

export default {
  getInsecureSeed,
} satisfies typeof import("../../../types/interfaces/wasi-random-insecure-seed.d.ts");
export type * from "../../../types/interfaces/wasi-random-insecure-seed.d.ts";
