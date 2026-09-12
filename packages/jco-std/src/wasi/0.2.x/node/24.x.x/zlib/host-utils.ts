import { serializeHostError } from "../internal/host-error.js";
import type { HostOptions } from "./types.js";

/** Node accepts a parameter object; WIT represents it as key/value pairs. */
export function nativeOptions(
  options: HostOptions,
): Omit<HostOptions, "params"> & { params?: Record<string, number> } {
  return {
    ...options,
    params: options.params === undefined ? undefined : Object.fromEntries(options.params),
  };
}

export function hostCall<T>(operation: () => T): T {
  try {
    return operation();
  } catch (error) {
    throw error instanceof Error ? serializeHostError(error) : error;
  }
}
