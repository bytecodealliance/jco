import type { TtyDirection, TtyEnvironment, TtyWindowSize } from "./tty/types.js";

export function isTty(fd: number): boolean;
export function open(fd: number, direction: TtyDirection): void;
export function close(fd: number, direction: TtyDirection): void;
export function windowSize(fd: number): TtyWindowSize;
export function setRawMode(fd: number, enabled: boolean): void;
export function read(fd: number, maxBytes: number): Uint8Array;
export function write(fd: number, data: Uint8Array): void;
export function environment(): TtyEnvironment;
