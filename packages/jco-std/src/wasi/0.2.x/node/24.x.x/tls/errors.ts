import { unsupportedNodeApi } from "../errors/core.js";

export function unsupported(
  api: string,
  reason = "this operation requires a native object or synchronous callback that cannot cross the component boundary",
): never {
  throw unsupportedNodeApi(`tls.${api}`, reason);
}

export function hostCall<T>(operation: () => T): T {
  try {
    return operation();
  } catch (error) {
    const record = error as { payload?: unknown; name?: string; message?: string; code?: string };
    const value = (record?.payload ?? record) as { name?: string; message?: string; code?: string };
    if (!(error instanceof Error) || record?.payload !== undefined) {
      if (typeof value?.message === "string") {
        const result =
          value.name === "TypeError"
            ? new TypeError(value.message)
            : value.name === "RangeError"
              ? new RangeError(value.message)
              : new Error(value.message);
        Object.assign(result, value);
        throw result;
      }
    }
    throw error;
  }
}
