/** @module Interface wasi:cli/terminal-stdout@0.3.0 **/
/**
 * If stdout is connected to a terminal, return a `terminal-output` handle
 * allowing further interaction with it.
 */
export function getTerminalStdout(): TerminalOutput | undefined;
export type TerminalOutput =
    import('./wasi-cli-terminal-output.js').TerminalOutput;
