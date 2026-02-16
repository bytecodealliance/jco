/** @module Interface wasi:cli/terminal-stdin@0.3.0-rc-2026-02-09 **/
/**
 * If stdin is connected to a terminal, return a `terminal-input` handle
 * allowing further interaction with it.
 */
export function getTerminalStdin(): TerminalInput | undefined;
export type TerminalInput = import('./wasi-cli-terminal-input.js').TerminalInput;
