/** @module Interface wasi:cli/terminal-stderr@0.3.0 **/
/**
 * If stderr is connected to a terminal, return a `terminal-output` handle
 * allowing further interaction with it.
 */
export function getTerminalStderr(): TerminalOutput | undefined;
export type TerminalOutput = import('./wasi-cli-terminal-output.js').TerminalOutput;
