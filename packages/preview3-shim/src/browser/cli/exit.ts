import { exit as preview2Exit } from "@bytecodealliance/preview2-shim/cli";
import type { Result } from "../../../types/interfaces/wasi-cli-exit.d.ts";

const exitWithCodeV2 = preview2Exit as typeof preview2Exit & {
  exitWithCode(statusCode: number): void;
};

function exit(status: Result<void, void>): void {
  preview2Exit.exit(status);
}

function exitWithCode(statusCode: number): void {
  exitWithCodeV2.exitWithCode(statusCode);
}

export default {
  exit,
  exitWithCode,
} satisfies typeof import("../../../types/interfaces/wasi-cli-exit.d.ts");
export type * from "../../../types/interfaces/wasi-cli-exit.d.ts";
