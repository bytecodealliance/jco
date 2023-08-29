export namespace WasiCliTerminalStdin {
  /**
   * If stdin is connected to a terminal, return a `terminal-input` handle
   * allowing further interaction with it.
   */
  export function getTerminalStdin(): TerminalInput | null;
}
import type { TerminalInput } from '../exports/wasi-cli-terminal-input';
export { TerminalInput };
