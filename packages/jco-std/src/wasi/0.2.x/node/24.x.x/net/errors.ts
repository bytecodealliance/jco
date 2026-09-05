/** Node-style errors used by the portable `node:net` shim. */

import {
  AbortError,
  codedError,
  deprecatedNodeApi,
  invalidArgType,
  invalidArgValue,
  missingArgs,
  outOfRange,
  unsupportedNodeApi,
} from "../errors/core.js";

export { AbortError, invalidArgType, invalidArgValue, missingArgs, outOfRange };

export function invalidAddress(): Error & { code: "ERR_INVALID_ADDRESS" } {
  return codedError(new Error("Invalid socket address"), "ERR_INVALID_ADDRESS");
}

export function serverAlreadyListening(): Error & { code: "ERR_SERVER_ALREADY_LISTEN" } {
  return codedError(
    new Error("Listen method has been called more than once without closing."),
    "ERR_SERVER_ALREADY_LISTEN",
  );
}

export function serverNotRunning(): Error & { code: "ERR_SERVER_NOT_RUNNING" } {
  return codedError(new Error("Server is not running."), "ERR_SERVER_NOT_RUNNING");
}

export function socketClosed(): Error & { code: "ERR_SOCKET_CLOSED" } {
  return codedError(new Error("Socket is closed"), "ERR_SOCKET_CLOSED");
}

export function socketClosedBeforeConnection(): Error & {
  code: "ERR_SOCKET_CLOSED_BEFORE_CONNECTION";
} {
  return codedError(
    new Error("Socket closed before the connection was established"),
    "ERR_SOCKET_CLOSED_BEFORE_CONNECTION",
  );
}

export function socketHandleAdopted(): Error & { code: "ERR_SOCKET_HANDLE_ADOPTED" } {
  return codedError(
    new Error("This socket handle has already been bound to another socket"),
    "ERR_SOCKET_HANDLE_ADOPTED",
  );
}

export function ipBlocked(address: string): Error & { code: "ERR_IP_BLOCKED" } {
  return codedError(new Error(`IP ${address} is blocked`), "ERR_IP_BLOCKED");
}

export function unsupported(api: string, reason: string): never {
  throw unsupportedNodeApi(api, reason);
}

export function deprecated(api: string, replacement: string): never {
  throw deprecatedNodeApi(api, replacement);
}
