import { invalidArgType } from "../../24.x.x/errors/core.js";

export function hasCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

export function invokeCallback<Args extends unknown[]>(
  callback: ((...args: Args) => void) | undefined,
  ...args: Args
): void {
  if (typeof callback !== "function") {
    throw invalidArgType("callback", "Function", callback);
  }
  callback(...args);
}

export function deferCallback<Args extends unknown[]>(
  callback: ((...args: Args) => void) | undefined,
  ...args: Args
): void {
  queueMicrotask(() => invokeCallback(callback, ...args));
}
