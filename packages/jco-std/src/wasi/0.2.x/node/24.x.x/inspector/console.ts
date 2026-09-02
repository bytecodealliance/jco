/**
 * `inspector.console` -- the console whose output is routed to the connected inspector front-end
 * rather than to stdout.
 *
 * Every method forwards to the host as `console-call(context, method, args-json)`. Arguments are
 * JSON-encoded, which is lossy for functions, symbols, cycles, and `undefined`; this is best-effort
 * and documented. The main object also carries `context(name)`, which returns a fresh console bound
 * to that named context.
 *
 * Node quirk reproduced faithfully: the main console spells the method `dirxml`, while the console
 * returned by `context()` spells it `dirXml`, and the context console has no nested `context`.
 */

import type { InspectorHost } from "./types.js";

/** Method names on `inspector.console` (besides `context`). */
const MAIN_METHODS = [
  "assert",
  "clear",
  "count",
  "countReset",
  "debug",
  "dir",
  "dirxml",
  "error",
  "group",
  "groupCollapsed",
  "groupEnd",
  "info",
  "log",
  "profile",
  "profileEnd",
  "table",
  "time",
  "timeEnd",
  "timeLog",
  "timeStamp",
  "trace",
  "warn",
] as const;

/** Method names on the console returned by `context()` -- note `dirXml`, and no `context`. */
const CONTEXT_METHODS = MAIN_METHODS.map((name) => (name === "dirxml" ? "dirXml" : name));

type ConsoleMethod = (...args: unknown[]) => void;
type InspectorConsoleContext = Record<string, ConsoleMethod>;
export type InspectorConsole = InspectorConsoleContext & {
  context(name: string): InspectorConsoleContext;
};

/**
 * JSON-encode a console argument list without throwing. Values JSON cannot carry become `null`,
 * matching how JSON.stringify already drops functions and `undefined`; a cyclic structure falls
 * back to an empty list so a stray `console.log` never breaks the caller.
 */
function encodeArgs(args: unknown[]): string {
  try {
    return (
      JSON.stringify(args, (_key, value) => (typeof value === "bigint" ? `${value}n` : value)) ??
      "[]"
    );
  } catch {
    return "[]";
  }
}

function buildContext(
  host: InspectorHost,
  context: string | undefined,
  methods: readonly string[],
): InspectorConsoleContext {
  const target: InspectorConsoleContext = {};
  for (const method of methods) {
    target[method] = (...args: unknown[]): void => {
      host.consoleCall(context, method, encodeArgs(args));
    };
  }
  return target;
}

/** Build `inspector.console`, forwarding to the host. */
export function createConsole(host: InspectorHost): InspectorConsole {
  const base = buildContext(host, undefined, MAIN_METHODS) as InspectorConsole;
  base.context = (name: string): InspectorConsoleContext =>
    buildContext(host, name, CONTEXT_METHODS);
  return base;
}
