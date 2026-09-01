import type { HostSignature, HostValue } from "./ffi/types.js";

export function suffix(): string;
export function open(path: string | undefined): number;
export function close(handle: number): void;
export function symbol(handle: number, name: string): bigint;
export function define(handle: number, name: string, sig: HostSignature): void;
export function call(handle: number, name: string, args: HostValue[]): HostValue;
export function read(pointer: bigint, offset: bigint, kind: string): HostValue;
export function write(pointer: bigint, offset: bigint, kind: string, data: HostValue): void;
export function readText(pointer: bigint): string | undefined;
export function readBytes(pointer: bigint, length: bigint): Uint8Array;
export function writeBytes(pointer: bigint, length: bigint, data: Uint8Array): void;
export function writeText(pointer: bigint, length: bigint, data: string, encoding: string): void;
export function currentEventLoop(): bigint;
