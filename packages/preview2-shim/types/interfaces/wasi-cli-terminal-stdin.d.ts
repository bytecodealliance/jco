export namespace WasiCliTerminalStdin {
  /**
   * If stdin is connected to a terminal, return a `terminal-input` handle
   * allowing further interaction with it.
   */
  export function getTerminalStdin(): TerminalInput | undefined;
}
import type { TerminalInput } from './wasi-cli-terminal-input.js';
export { TerminalInput };
