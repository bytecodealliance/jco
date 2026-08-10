import { Todo } from "../../common/errors.js";

function run(): Promise<void> {
  throw new Todo();
}

export default {
  run,
} satisfies typeof import("../../../types/interfaces/wasi-cli-run.d.ts");
export type * from "../../../types/interfaces/wasi-cli-run.d.ts";
