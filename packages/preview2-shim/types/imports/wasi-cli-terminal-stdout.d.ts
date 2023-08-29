export namespace WasiCliTerminalStdout {
  /**
   * If stdout is connected to a terminal, return a `terminal-output` handle
   * allowing further interaction with it.
   */
  export function getTerminalStdout(): TerminalOutput | null;
}
import type { TerminalOutput } from '../imports/wasi-cli-terminal-output';
export { TerminalOutput };
