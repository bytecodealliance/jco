import { Todo } from "../../common/errors.js";

function getEnvironment(): Array<[string, string]> {
  throw new Todo();
}

function getArguments(): Array<string> {
  throw new Todo();
}

function getInitialCwd(): string | undefined {
  throw new Todo();
}

export default {
  getEnvironment,
  getArguments,
  getInitialCwd,
} satisfies typeof import("../../../types/interfaces/wasi-cli-environment.d.ts");
export type * from "../../../types/interfaces/wasi-cli-environment.d.ts";
