import type { ConsoleStream } from "./console/types.js";

export function write(stream: ConsoleStream, value: string): void;
export function isTerminal(stream: ConsoleStream): boolean;
export function colorDepth(stream: ConsoleStream): number;
