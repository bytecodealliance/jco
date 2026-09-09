/**
 * Portable value inspection shared by `node:console` and `node:repl`.
 *
 * Locally written, guided by Node.js v24.20.0's `lib/internal/util/inspect.js` behavior; no Node
 * implementation code is copied. It covers the presentation the console and REPL shims need --
 * primitives, colors, depth, `[Circular]`, custom inspection hooks, arrays, Map, Set, typed arrays,
 * dates, regular expressions, errors and plain objects -- and deliberately not Node's line
 * breaking (`breakLength`/`compact`), `showProxy`, `showHidden`, getters or sorting.
 */

const customInspect = Symbol.for("nodejs.util.inspect.custom");

/**
 * An error's stack, led by its `name: message` header.
 *
 * V8 and SpiderMonkey put the header on the stack's first line; QuickJS stores frames only, and a
 * stack whose frames have been trimmed away may be empty. Node's inspector rebuilds the header in
 * the same situations.
 */
function errorText(error: Error): string {
  const name = typeof error.name === "string" && error.name ? error.name : "Error";
  const message = typeof error.message === "string" ? error.message : "";
  const header = message ? `${name}: ${message}` : name;
  const stack = typeof error.stack === "string" ? error.stack : "";
  if (stack === "") {
    return header;
  }
  // Only a stack made purely of frames is missing its header; anything else -- a normal V8 or
  // SpiderMonkey stack, or one decorated with source context -- is returned untouched.
  return stack.split("\n").every(isFrameLine) ? `${header}\n${stack}` : stack;
}

/** A V8/QuickJS `    at …` frame or a SpiderMonkey `name@file:line:col` frame. */
function isFrameLine(line: string): boolean {
  return /^\s+at\s/.test(line) || /^[^\s@]*@\S+:\d+:\d+$/.test(line);
}

/** `{ a, b }` with entries, `{}` without: Node prints empty containers without inner padding. */
function wrap(open: string, entries: string[], close: string): string {
  return entries.length === 0 ? `${open}${close}` : `${open} ${entries.join(", ")} ${close}`;
}

export interface InspectOptions {
  showHidden?: boolean;
  colors?: boolean;
  depth?: number | null;
  maxArrayLength?: number | null;
  maxStringLength?: number | null;
  breakLength?: number;
  compact?: boolean | number;
  customInspect?: boolean;
  showProxy?: boolean;
  sorted?: boolean | ((left: string, right: string) => number);
  getters?: boolean | "get" | "set";
  numericSeparator?: boolean;
}

function quote(value: string): string {
  return `'${value
    .replaceAll("\\", "\\\\")
    .replaceAll("'", "\\'")
    .replaceAll("\n", "\\n")
    .replaceAll("\r", "\\r")
    .replaceAll("\t", "\\t")}'`;
}

function color(code: number, value: string, enabled: boolean): string {
  return enabled ? `\u001b[${code}m${value}\u001b[39m` : value;
}

function primitive(value: unknown, colors: boolean): string | undefined {
  if (value === undefined) {
    return color(90, "undefined", colors);
  }
  if (value === null) {
    return colors ? "\u001b[1mnull\u001b[22m" : "null";
  }
  if (typeof value === "string") {
    return color(32, quote(value), colors);
  }
  if (typeof value === "number") {
    return color(33, Object.is(value, -0) ? "-0" : String(value), colors);
  }
  if (typeof value === "bigint") {
    return color(33, `${value}n`, colors);
  }
  if (typeof value === "boolean") {
    return color(33, String(value), colors);
  }
  if (typeof value === "symbol") {
    return color(32, String(value), colors);
  }
  if (typeof value === "function") {
    return color(36, `[Function${value.name ? `: ${value.name}` : ""}]`, colors);
  }
  return undefined;
}

export function inspect(
  value: unknown,
  options: InspectOptions = {},
  seen = new Set<object>(),
  level = 0,
): string {
  const simple = primitive(value, options.colors === true);
  if (simple !== undefined) {
    return simple;
  }

  const object = value as object;
  if (seen.has(object)) {
    return color(36, "[Circular]", options.colors === true);
  }
  const depth = options.depth === undefined ? 2 : options.depth;
  if (depth !== null && level > depth) {
    const name = object.constructor?.name ?? "Object";
    return color(36, `[${name}]`, options.colors === true);
  }

  if (options.customInspect !== false) {
    const hook = (object as { [customInspect]?: unknown })[customInspect];
    if (typeof hook === "function") {
      return String(hook.call(object, depth === null ? null : depth - level, options, inspect));
    }
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "Invalid Date" : value.toISOString();
  }
  if (value instanceof RegExp) {
    return String(value);
  }
  if (value instanceof Error) {
    return errorText(value);
  }

  seen.add(object);
  let result: string;
  if (Array.isArray(value)) {
    const limit = options.maxArrayLength === null ? value.length : (options.maxArrayLength ?? 100);
    const entries = value.slice(0, limit).map((item) => inspect(item, options, seen, level + 1));
    if (value.length > limit) {
      entries.push(`... ${value.length - limit} more item${value.length - limit === 1 ? "" : "s"}`);
    }
    result = wrap("[", entries, "]");
  } else if (value instanceof Map) {
    const entries = Array.from(
      value,
      ([key, item]) =>
        `${inspect(key, options, seen, level + 1)} => ${inspect(item, options, seen, level + 1)}`,
    );
    result = wrap(`Map(${value.size}) {`, entries, "}");
  } else if (value instanceof Set) {
    const entries = Array.from(value, (item) => inspect(item, options, seen, level + 1));
    result = wrap(`Set(${value.size}) {`, entries, "}");
  } else if (ArrayBuffer.isView(value)) {
    const typed = value as unknown as { readonly length?: number; [index: number]: unknown };
    const length = typed.length ?? 0;
    const entries = Array.from({ length }, (_, index) =>
      inspect(typed[index], options, seen, level + 1),
    );
    result = wrap(`${object.constructor?.name ?? "TypedArray"}(${length}) [`, entries, "]");
  } else {
    const entries = Object.keys(object).map((key) => {
      const displayKey = /^[A-Za-z_$][\w$]*$/.test(key) ? key : quote(key);
      const item = (object as Record<string, unknown>)[key];
      return `${displayKey}: ${inspect(item, options, seen, level + 1)}`;
    });
    const prefix =
      object.constructor && object.constructor !== Object ? `${object.constructor.name} ` : "";
    result = wrap(`${prefix}{`, entries, "}");
  }
  seen.delete(object);
  return result;
}

/**
 * Node's `util.inspect.defaultOptions`, key for key.
 *
 * Carried in full so option objects derived from it keep Node's shape even though the portable
 * inspector honors only a subset.
 */
export const inspectDefaultOptions: Readonly<Required<InspectOptions>> = Object.freeze({
  showHidden: false,
  depth: 2,
  colors: false,
  customInspect: true,
  showProxy: false,
  maxArrayLength: 100,
  maxStringLength: 10000,
  breakLength: 80,
  compact: 3,
  sorted: false,
  getters: false,
  numericSeparator: false,
});
