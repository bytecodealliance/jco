export { default as environment } from "./cli/environment.js";
export { _setCwd } from "./cli/environment.js";
export { default as exit } from "./cli/exit.js";
export { default as run } from "./cli/run.js";
export { _setRun } from "./cli/run.js";
export { default as stderr } from "./cli/stderr.js";
export { _setStderr } from "./cli/stderr.js";
export { default as stdin } from "./cli/stdin.js";
export { default as stdout } from "./cli/stdout.js";
export { _setStdout } from "./cli/stdout.js";
export type { OutputDrain } from "./cli/output.js";
export { default as terminalInput } from "./cli/terminal-input.js";
export { default as terminalOutput } from "./cli/terminal-output.js";
export { default as terminalStderr } from "./cli/terminal-stderr.js";
export { default as terminalStdin } from "./cli/terminal-stdin.js";
export { default as terminalStdout } from "./cli/terminal-stdout.js";
export { _setArgs, _setEnv, _setStdin } from "@bytecodealliance/preview2-shim/cli";

import stdout from "./cli/stdout.js";
import stderr from "./cli/stderr.js";

/** Wait for writes currently queued on both output destinations. */
export async function _flush() {
  await Promise.all([stdout._flush(), stderr._flush()]);
}

/** Close both outputs' host readers and drain their accepted writes. */
export async function _shutdown() {
  await Promise.all([stdout._shutdown(), stderr._shutdown()]);
}
