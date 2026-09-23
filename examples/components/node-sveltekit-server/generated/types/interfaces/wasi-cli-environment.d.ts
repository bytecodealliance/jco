/** @module Interface wasi:cli/environment@0.2.12 **/
export function getEnvironment(): Array<[string, string]>;
export function getArguments(): Array<string>;
export function initialCwd(): string | undefined;
