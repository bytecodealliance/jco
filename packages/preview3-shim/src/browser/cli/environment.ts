import { _setCwd as setPreview2Cwd, environment } from "@bytecodealliance/preview2-shim/cli";

let initialCwd = environment.initialCwd();

export function _setCwd(cwd: string): void {
  initialCwd = cwd;
  setPreview2Cwd(cwd);
}

function getEnvironment(): Array<[string, string]> {
  return environment.getEnvironment();
}

function getArguments(): Array<string> {
  return environment.getArguments();
}

function getInitialCwd(): string | undefined {
  return initialCwd;
}

export default {
  getEnvironment,
  getArguments,
  getInitialCwd,
} satisfies typeof import("../../../types/interfaces/wasi-cli-environment.d.ts");
export type * from "../../../types/interfaces/wasi-cli-environment.d.ts";
