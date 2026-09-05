/** Overload normalization adapted from nodejs/node v24.19.0 `lib/net.js`, commit
 * cdc1b38d40cb567b7ad0b39c86addf830a0af0ae (MIT license). Uses a local normalization symbol. */

export const normalizedArgsSymbol = Symbol("normalizedArgs");

export type NormalizedArgs = [
  options: Record<string, unknown>,
  callback: ((...args: unknown[]) => void) | null,
] & {
  [normalizedArgsSymbol]: true;
};

function isPipeName(value: unknown): value is string {
  return typeof value === "string" && !(Number(value) >= 0);
}

export function normalizeArgs(args: readonly unknown[]): NormalizedArgs {
  let options: Record<string, unknown>;
  if (args.length === 0) {
    options = {};
  } else if (typeof args[0] === "object" && args[0] !== null) {
    options = args[0] as Record<string, unknown>;
  } else if (isPipeName(args[0])) {
    options = { path: args[0] };
  } else {
    options = { port: args[0] };
    if (typeof args[1] === "string") {
      options.host = args[1];
    }
  }
  const last = args.at(-1);
  const result = [options, typeof last === "function" ? last : null] as NormalizedArgs;
  result[normalizedArgsSymbol] = true;
  return result;
}
