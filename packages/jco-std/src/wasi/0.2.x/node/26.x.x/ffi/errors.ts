/**
 * Errors for `node:ffi`.
 *
 * Two kinds, kept apart on purpose. Failures the host reports are re-raised with Node's own code,
 * so a guest branching on `ERR_FFI_CALL_FAILED` behaves as it would on Node. Things a component
 * cannot express carry `ERR_JCO_UNSUPPORTED_NODE_API` and say why -- they are refusals, not
 * passed-through failures, and must never be mistaken for one.
 */

/** Error code carried by every unsupported-API failure Jco raises for Node builtins. */
export const UNSUPPORTED_CODE = "ERR_JCO_UNSUPPORTED_NODE_API";

/** Error code raised when no FFI host capability was granted. */
export const ADAPTER_REQUIRED_CODE = "ERR_JCO_FFI_ADAPTER_REQUIRED";

interface CodedError extends Error {
  code: string;
}

function coded(code: string, message: string): CodedError {
  const error = new Error(message) as CodedError;
  error.code = code;
  return error;
}

/**
 * Refuse something a component cannot do, whatever the host grants.
 *
 * @param api - the entry point being used, as a user would write it
 * @param reason - why it cannot work here
 */
export function unsupported(api: string, reason: string): CodedError {
  return coded(UNSUPPORTED_CODE, `${api} is not supported in a WebAssembly component: ${reason}`);
}

/** The WIT `variant error`, in the shape a transpiled import throws it. */
interface HostError {
  tag: string;
  val?: unknown;
}

/**
 * Recover the WIT `variant error` from whatever the binding threw.
 *
 * Transpiled imports do not throw the variant directly: they wrap it in an `Error` and hang the
 * payload off it, so the tagged value has to be unwrapped before it can be read.
 */
function asHostError(thrown: unknown): HostError | undefined {
  const candidate =
    typeof thrown === "object" && thrown !== null && "payload" in thrown
      ? (thrown as { payload: unknown }).payload
      : thrown;
  return typeof candidate === "object" &&
    candidate !== null &&
    typeof (candidate as HostError).tag === "string"
    ? (candidate as HostError)
    : undefined;
}

/**
 * Turn a host-side failure into the error a guest should see.
 *
 * @param api - the entry point being used, as a user would write it
 * @param thrown - what the host import threw
 */
export function fromHost(api: string, thrown: unknown): CodedError {
  const hostError = asHostError(thrown);
  if (!hostError) {
    return coded(
      UNSUPPORTED_CODE,
      `${api} failed: ${thrown instanceof Error ? thrown.message : String(thrown)}`,
    );
  }
  switch (hostError.tag) {
    case "denied":
      return coded(
        ADAPTER_REQUIRED_CODE,
        `${api} requires an application-provided node:ffi host adapter: ${String(hostError.val)}`,
      );
    case "unavailable":
      return coded(
        UNSUPPORTED_CODE,
        `${api} is unavailable on this host: ${String(hostError.val)}. node:ffi was added in Node 26.1.0 ` +
          "and still requires --experimental-ffi.",
      );
    case "no-such-library":
      return coded(
        "ERR_FFI_LIBRARY_CLOSED",
        `${api} failed: library handle ${String(hostError.val)} is not open`,
      );
    case "no-such-symbol":
      return coded(
        "ERR_FFI_CALL_FAILED",
        `${api} failed: ${String(hostError.val)} has not been defined`,
      );
    case "unsupported-type":
      return unsupported(api, String(hostError.val));
    case "failed": {
      const failure = hostError.val as { code?: string; message?: string } | undefined;
      return coded(failure?.code || "ERR_FFI_CALL_FAILED", failure?.message || `${api} failed`);
    }
    default:
      return coded(UNSUPPORTED_CODE, `${api} failed: ${hostError.tag}`);
  }
}
