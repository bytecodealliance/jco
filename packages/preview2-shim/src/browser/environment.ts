import type { environment as EnvironmentNamespace } from "../../types/cli.js";
import { _setCwd as fsSetCwd } from "./config.js";

let _env: [string, string][] = [];
let _args: string[] = [];
let _cwd = "/";

export function _setEnv(envObj: Record<string, string>): void {
  _env = Object.entries(envObj);
}

export function _setArgs(args: string[]): void {
  _args = args;
}

export function _setCwd(cwd: string): void {
  fsSetCwd((_cwd = cwd));
}

export const environment: typeof EnvironmentNamespace = {
  getEnvironment() {
    return _env;
  },
  getArguments() {
    return _args;
  },
  initialCwd() {
    return _cwd;
  },
};
