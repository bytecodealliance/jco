export interface ListenOptions {
  port?: number;
  host?: string;
  backlog?: number;
  path?: string;
  exclusive?: boolean;
  ipv6Only?: boolean;
  reusePort?: boolean;
  signal?: AbortSignal;
}

export interface ParsedListenArguments {
  options: ListenOptions;
  callback: (() => void) | undefined;
}

function invalidArgValue(name: string, value: unknown): Error {
  return Object.assign(
    new TypeError(`The argument '${name}' is invalid. Received ${String(value)}`),
    {
      code: "ERR_INVALID_ARG_VALUE",
    },
  );
}

function invalidArgType(name: string, value: unknown): Error {
  return Object.assign(
    new TypeError(
      `The "${name}" argument must be of type object, string, or number. Received ${String(value)}`,
    ),
    { code: "ERR_INVALID_ARG_TYPE" },
  );
}

/** Shared overload normalization for Node-style net-backed server `listen()` methods. */
export function parseListenArguments(args: readonly unknown[]): ParsedListenArguments {
  const values = [...args];
  const callback = typeof values.at(-1) === "function" ? (values.pop() as () => void) : undefined;
  const first = values.shift();
  if (typeof first === "object" && first !== null) {
    return { options: { ...(first as ListenOptions) }, callback };
  }
  if (typeof first === "string" && !/^\d+$/.test(first)) {
    return { options: { path: first }, callback };
  }
  const port = typeof first === "string" ? Number(first) : first;
  if (typeof port !== "number" || !Number.isInteger(port) || port < 0 || port > 65_535) {
    throw invalidArgValue("options.port", first);
  }
  const options: ListenOptions = { port };
  if (typeof values[0] === "string") {
    options.host = values.shift() as string;
  }
  if (typeof values[0] === "number") {
    options.backlog = values.shift() as number;
  }
  if (values.length > 0) {
    throw invalidArgType("options", first);
  }
  return { options, callback };
}
