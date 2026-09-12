// Builds on jco-std's shared console formatter. Public option handling and ANSI
// metadata follow Node v24.20.0 lib/internal/util/inspect.js (MIT), commit
// 71b8b174857e25106d39b61a9e6f30d927da8b01. Native engine inspection is refused.
import { inspectValue, type InspectOptions } from "./format-core.js";
import {
  isBoxedPrimitive,
  isBooleanObject,
  isNumberObject,
  isStringObject,
  isBigIntObject,
} from "./types.js";
import { invalidArgType, unsupportedNodeApi } from "../errors/core.js";
import { validateObject } from "../internal/validation.js";
export type { InspectOptions } from "./format-core.js";

export interface InspectFunction {
  (value: unknown, options?: InspectOptions): string;

  (value: unknown, showHidden?: boolean, depth?: number | null, colors?: boolean): string;

  custom: symbol;
  defaultOptions: InspectOptions;
  colors: Record<string, [number, number]>;
  styles: Record<string, string>;
}

const defaults: InspectOptions = Object.seal({
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

function inspectImpl(
  value: unknown,
  options?: InspectOptions | boolean,
  depth?: number | null,
  colors?: boolean,
): string {
  const opts = {
    ...defaults,
    ...(typeof options === "boolean" ? { showHidden: options } : options),
  };
  if (arguments.length > 2) {
    opts.depth = depth;
  }
  if (arguments.length > 3) {
    opts.colors = colors;
  }
  if (opts.showProxy) {
    throw unsupportedNodeApi("util.inspect showProxy", "the engine does not expose proxy targets");
  }
  // Reuse the shared console renderer for simple cases; enhanced object traversal
  // below handles descriptors, circular references, sorting and collection limits.
  return render(value, opts, [], new Map(), 0);
}

export const inspect: InspectFunction = Object.assign(inspectImpl, {
  custom: Symbol.for("nodejs.util.inspect.custom"),
  defaultOptions: defaults,
  colors: Object.create(null) as Record<string, [number, number]>,
  styles: {
    special: "cyan",
    number: "yellow",
    bigint: "yellow",
    boolean: "yellow",
    undefined: "grey",
    null: "bold",
    string: "green",
    symbol: "green",
    date: "magenta",
    regexp: "red",
    module: "underline",
  },
});
Object.defineProperty(inspect, "name", { value: "inspect" });
Object.defineProperty(inspect, "defaultOptions", {
  enumerable: false,
  configurable: false,

  get: (): InspectOptions => defaults,

  set: (options: InspectOptions): void => {
    validateObject(options, "options");
    Object.assign(defaults, options);
  },
});

function stylize(text: string, type: string, opts: InspectOptions): string {
  const codes = inspect.colors[inspect.styles[type]];
  return opts.colors && codes ? `\x1b[${codes[0]}m${text}\x1b[${codes[1]}m` : text;
}

function quote(value: string): string {
  const mark = !value.includes("'")
    ? "'"
    : !value.includes('"')
      ? '"'
      : !value.includes("`") && !value.includes("${")
        ? "`"
        : "'";
  const escaped = value.replace(/[\x00-\x1f\x7f-\x9f\\'"`]/g, (char) => {
    if (char === mark || char === "\\") {
      return `\\${char}`;
    }
    const names: Record<string, string> = {
      "\n": "\\n",
      "\r": "\\r",
      "\t": "\\t",
      "\b": "\\b",
      "\f": "\\f",
      "\v": "\\v",
    };
    if (char in names) {
      return names[char];
    }
    return char.charCodeAt(0) < 32 || char.charCodeAt(0) >= 127
      ? `\\x${char.charCodeAt(0).toString(16).padStart(2, "0")}`
      : char;
  });
  return mark + escaped + mark;
}

// Adapted from Node v24.20.0 lib/internal/util/inspect.js, MIT, commit
// 71b8b174857e25106d39b61a9e6f30d927da8b01. Preserve decimal grouping without native bindings.
function numericString(value: number | bigint): string {
  const raw = Object.is(value, -0) ? "-0" : String(value);
  if (raw.includes("e")) {
    return raw;
  }
  const [integer, fraction] = raw.split(".");
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, "_");
  return (
    grouped +
    (fraction === undefined ? "" : "." + fraction.replace(/(\d{3})(?=\d)/g, "$1_")) +
    (typeof value === "bigint" ? "n" : "")
  );
}

const builtInObjects = new Set(
  Object.getOwnPropertyNames(globalThis).filter((name) => /^[A-Z][a-zA-Z0-9]+$/.test(name)),
);

// Adapted from the same upstream hasBuiltInToString; proxy unwrapping is unavailable.
function hasBuiltInToString(value: object): boolean {
  const hasString = typeof Reflect.get(value, "toString") === "function";
  const hasPrimitive = typeof Reflect.get(value, Symbol.toPrimitive) === "function";
  if (!hasString && !hasPrimitive) {
    return true;
  }

  const ownsConversion = (object: object): boolean =>
    (hasString && Object.hasOwn(object, "toString")) ||
    (hasPrimitive && Object.hasOwn(object, Symbol.toPrimitive));

  if (ownsConversion(value)) {
    return false;
  }
  let pointer: object | null = Object.getPrototypeOf(value);
  while (pointer && !ownsConversion(pointer)) {
    pointer = Object.getPrototypeOf(pointer);
  }
  const descriptor = pointer && Object.getOwnPropertyDescriptor(pointer, "constructor");
  return (
    !!descriptor &&
    typeof descriptor.value === "function" &&
    builtInObjects.has(descriptor.value.name)
  );
}

function render(
  value: unknown,
  opts: InspectOptions,
  ancestors: object[],
  circular: Map<object, number>,
  level: number,
  propertyWidth = 0,
): string {
  if (typeof value === "string") {
    const limit = opts.maxStringLength == null ? Infinity : Math.max(0, opts.maxStringLength);
    const text = quote(value.slice(0, limit));
    const extra =
      value.length > limit
        ? `... ${value.length - limit} more character${value.length - limit === 1 ? "" : "s"}`
        : "";
    return stylize(text, "string", opts) + extra;
  }
  if (value === null || (typeof value !== "object" && typeof value !== "function")) {
    let text = inspectValue(value, { colors: false });
    if (opts.numericSeparator && (typeof value === "number" || typeof value === "bigint")) {
      text = numericString(value);
    }
    return stylize(text, value === null ? "null" : typeof value, opts);
  }
  const object = value;
  if (opts.customInspect !== false) {
    const hook: unknown = Reflect.get(object, inspect.custom);
    if (
      typeof hook === "function" &&
      hook !== inspect &&
      object !== Object.getPrototypeOf(object)?.constructor?.prototype
    ) {
      const result: unknown = Reflect.apply(hook, object, [
        opts.depth == null ? null : opts.depth - level,
        { ...opts, stylize: (text: string, type: string): string => stylize(text, type, opts) },
        inspect,
      ]);
      if (result !== object) {
        return typeof result === "string"
          ? result
          : render(result, opts, ancestors, circular, level);
      }
    }
  }
  if (ancestors.includes(object)) {
    if (!circular.has(object)) {
      circular.set(object, circular.size + 1);
    }
    return stylize(`[Circular *${circular.get(object)}]`, "special", opts);
  }
  if (opts.depth !== null && level > (opts.depth ?? 2)) {
    return stylize(
      `[${Array.isArray(value) ? "Array" : value.constructor?.name || "Object"}]`,
      "special",
      opts,
    );
  }
  if (value instanceof Date) {
    return stylize(inspectValue(value, { colors: false }), "date", opts);
  }
  if (value instanceof RegExp) {
    return stylize(String(value), "regexp", opts);
  }
  if (value instanceof Error) {
    return inspectValue(value, opts);
  }
  if (value instanceof Promise || value instanceof WeakMap || value instanceof WeakSet) {
    if (opts.showHidden) {
      throw unsupportedNodeApi(
        "util.inspect hidden engine state",
        "promise and weak collection contents are not exposed",
      );
    }
    return `${value.constructor.name} { <${value instanceof Promise ? "state unavailable" : "items unknown"}> }`;
  }
  ancestors.push(object);
  try {
    const child: RenderChild = (item, width = 0) =>
      render(item, opts, ancestors, circular, level + 1, width);
    const parts = renderObject(object, opts, child);
    return typeof parts === "string"
      ? parts
      : layout(parts, opts, level, propertyWidth, circular.get(object));
  } finally {
    ancestors.pop();
  }
}

type RenderChild = (value: unknown, propertyWidth?: number) => string;

type RenderProperty = (key: PropertyKey) => string;

interface RenderParts {
  prefix: string;
  entries: string[];
  array?: boolean;
}

function renderProperty(
  object: object,
  key: PropertyKey,
  opts: InspectOptions,
  child: RenderChild,
): string {
  const descriptor = Object.getOwnPropertyDescriptor(object, key)!;
  const label =
    typeof key === "symbol"
      ? `[${stylize(String(key), "symbol", opts)}]`
      : !descriptor.enumerable
        ? `[${key}]`
        : /^[A-Za-z_$][\w$]*$/.test(String(key))
          ? String(key)
          : quote(String(key));
  let rendered: string;
  if ("value" in descriptor) {
    rendered = child(descriptor.value, label.length + 2);
  } else if (
    descriptor.get &&
    (opts.getters === true ||
      (opts.getters === "get" && !descriptor.set) ||
      (opts.getters === "set" && descriptor.set))
  ) {
    try {
      rendered = `[Getter${descriptor.set ? "/Setter" : ""}: ${child(Reflect.apply(descriptor.get, object, []))}]`;
    } catch (error) {
      rendered = `[Getter: <Inspection threw (${error instanceof Error ? error.message : String(error)})>]`;
    }
  } else {
    rendered = stylize(
      descriptor.get ? `[Getter${descriptor.set ? "/Setter" : ""}]` : "[Setter]",
      "special",
      opts,
    );
  }
  return `${label}: ${rendered}`;
}

function renderBoxed(
  value: object,
  keys: (string | symbol)[],
  opts: InspectOptions,
  property: RenderProperty,
): RenderParts | string {
  const intrinsic = isBooleanObject(value)
    ? Boolean.prototype.valueOf
    : isNumberObject(value)
      ? Number.prototype.valueOf
      : isStringObject(value)
        ? String.prototype.valueOf
        : isBigIntObject(value)
          ? BigInt.prototype.valueOf
          : Symbol.prototype.valueOf;
  const primitive: unknown = Reflect.apply(intrinsic, value, []);
  let prefix = `[${value.constructor.name}: ${render(primitive, { ...opts, colors: false }, [], new Map(), 0)}]`;
  const own = keys.filter(
    (key) =>
      !(
        typeof primitive === "string" &&
        typeof key === "string" &&
        (/^(0|[1-9]\d*)$/.test(key) || key === "length")
      ),
  );
  if (!own.length) {
    return stylize(prefix, typeof primitive, opts);
  }
  prefix += " ";
  return { prefix, entries: own.map(property) };
}

function renderArray(
  value: ArrayLike<unknown>,
  keys: (string | symbol)[],
  opts: InspectOptions,
  limit: number,
  child: RenderChild,
  property: RenderProperty,
): RenderParts {
  const array = value;
  const entries: string[] = [];
  let prefix = "";
  if (!Array.isArray(value)) {
    prefix = `${value.constructor.name}(${array.length}) `;
  }
  for (let i = 0; i < Math.min(array.length, limit); i++) {
    if (!Object.hasOwn(value, i)) {
      let count = 1;
      while (i + count < Math.min(array.length, limit) && !Object.hasOwn(value, i + count)) {
        count++;
      }
      entries.push(stylize(`<${count} empty item${count === 1 ? "" : "s"}>`, "undefined", opts));
      i += count - 1;
    } else {
      entries.push(child(array[i]));
    }
  }
  if (array.length > limit) {
    entries.push(`... ${array.length - limit} more item${array.length - limit === 1 ? "" : "s"}`);
  }
  for (const key of keys) {
    if (typeof key !== "string" || !/^(0|[1-9]\d*)$/.test(key)) {
      entries.push(property(key));
    }
  }
  return { prefix, entries, array: true };
}

function renderCollection(
  value: Map<unknown, unknown> | Set<unknown>,
  keys: (string | symbol)[],
  opts: InspectOptions,
  limit: number,
  child: RenderChild,
  property: RenderProperty,
): RenderParts {
  const entries: string[] = [];
  const prefix = `${value.constructor.name}(${value.size}) `;
  let i = 0;
  for (const entry of value) {
    if (i++ >= limit) {
      break;
    }
    if (value instanceof Map) {
      const pair = entry as [unknown, unknown];
      entries.push(`${child(pair[0])} => ${child(pair[1])}`);
    } else {
      entries.push(child(entry));
    }
  }
  if (value.size > limit) {
    entries.push(`... ${value.size - limit} more item${value.size - limit === 1 ? "" : "s"}`);
  }
  if (opts.sorted) {
    entries.sort(typeof opts.sorted === "function" ? opts.sorted : undefined);
  }
  for (const key of keys) {
    entries.push(property(key));
  }
  return { prefix, entries };
}

// Adapted from Node v24.20.0 lib/internal/util/inspect.js formatArrayBuffer (MIT),
// commit 71b8b174857e25106d39b61a9e6f30d927da8b01. Uses Uint8Array instead of Buffer.hexSlice.
function renderBuffer(
  value: ArrayBuffer | SharedArrayBuffer,
  keys: (string | symbol)[],
  opts: InspectOptions,
  limit: number,
  child: RenderChild,
  property: RenderProperty,
): RenderParts {
  const entries: string[] = [];
  const prefix = `${value.constructor.name} `;
  try {
    const bytes = new Uint8Array(value);
    let hex = Array.from(bytes.subarray(0, limit), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join(" ");
    if (bytes.length > limit) {
      hex += ` ... ${bytes.length - limit} more byte${bytes.length - limit === 1 ? "" : "s"}`;
    }
    entries.push(`${stylize("[Uint8Contents]", "special", opts)}: <${hex}>`);
  } catch {
    entries.push(stylize("(detached)", "special", opts));
  }
  entries.push(`${stylize("[byteLength]", "string", opts)}: ${child(value.byteLength)}`);
  for (const key of keys) {
    entries.push(property(key));
  }
  return { prefix, entries };
}

function renderView(
  value: DataView,
  keys: (string | symbol)[],
  opts: InspectOptions,
  child: RenderChild,
  property: RenderProperty,
): RenderParts {
  const entries: string[] = [];
  const prefix = "DataView ";
  entries.push(
    `${stylize("[byteLength]", "string", opts)}: ${child(value.byteLength)}`,
    `${stylize("[byteOffset]", "string", opts)}: ${child(value.byteOffset)}`,
    `${stylize("[buffer]", "string", opts)}: ${child(value.buffer, 10)}`,
  );
  for (const key of keys) {
    entries.push(property(key));
  }
  return { prefix, entries };
}

function renderPlain(
  value: object,
  keys: (string | symbol)[],
  opts: InspectOptions,
  property: RenderProperty,
): RenderParts | string {
  const entries: string[] = [];
  let prefix = "";
  if (typeof value === "function") {
    prefix = inspectValue(value, opts) + (keys.length ? " " : "");
  } else if (Object.getPrototypeOf(value) === null) {
    prefix = "[Object: null prototype] ";
  } else if (value.constructor?.name && value.constructor.name !== "Object") {
    prefix = `${value.constructor.name} `;
  }
  if (opts.sorted) {
    keys.sort(
      typeof opts.sorted === "function"
        ? (a, b) => (opts.sorted as (a: string, b: string) => number)(String(a), String(b))
        : (a, b) => String(a).localeCompare(String(b)),
    );
  }
  for (const key of keys) {
    entries.push(property(key));
  }
  if (typeof value === "function" && !entries.length) {
    return prefix;
  }
  return { prefix, entries };
}

function renderObject(
  value: object,
  opts: InspectOptions,
  child: RenderChild,
): RenderParts | string {
  const limit = opts.maxArrayLength == null ? Infinity : Math.max(0, opts.maxArrayLength);
  const boxed = isBoxedPrimitive(value);
  const keys = opts.showHidden
    ? Reflect.ownKeys(value)
    : Reflect.ownKeys(value).filter((key) =>
        Object.prototype.propertyIsEnumerable.call(value, key),
      );
  const property: RenderProperty = (key) => renderProperty(value, key, opts, child);

  if (boxed) {
    return renderBoxed(value, keys, opts, property);
  }
  if (Array.isArray(value) || (ArrayBuffer.isView(value) && !(value instanceof DataView))) {
    return renderArray(value as unknown as ArrayLike<unknown>, keys, opts, limit, child, property);
  }
  if (value instanceof Map || value instanceof Set) {
    return renderCollection(value, keys, opts, limit, child, property);
  }
  if (
    value instanceof ArrayBuffer ||
    (typeof SharedArrayBuffer === "function" && value instanceof SharedArrayBuffer)
  ) {
    return renderBuffer(value, keys, opts, limit, child, property);
  }
  if (value instanceof DataView) {
    return renderView(value, keys, opts, child, property);
  }
  return renderPlain(value, keys, opts, property);
}

function layout(
  { prefix, entries, array }: RenderParts,
  opts: InspectOptions,
  level: number,
  propertyWidth: number,
  id: number | undefined,
): string {
  const open = array ? "[" : "{";
  const close = array ? "]" : "}";
  const single = entries.length
    ? `${prefix}${open} ${entries.join(", ")} ${close}`
    : `${prefix}${open}${close}`;
  const reference = id ? `<ref *${id}> ` : "";
  if (
    entries.length &&
    (opts.compact === false ||
      single.replace(/\x1b\[[0-9;]*m/g, "").length + level * 2 + propertyWidth >
        (opts.breakLength ?? 80))
  ) {
    const indent = "  ".repeat(level + 1);
    return `${reference}${prefix}${open}\n${indent}${entries.join(`,\n${indent}`)}\n${"  ".repeat(level)}${close}`;
  }
  return reference + single;
}

export function format(...args: unknown[]): string {
  return formatWithOptions({}, ...args);
}

export function formatWithOptions(options: InspectOptions, ...args: unknown[]): string {
  if (typeof options !== "object" || options === null) {
    throw invalidArgType("inspectOptions", "Object", options);
  }
  if (!args.length) {
    return "";
  }
  if (typeof args[0] !== "string") {
    return args.map((v) => (typeof v === "string" ? v : inspect(v, options))).join(" ");
  }
  if (args.length === 1) {
    return args[0];
  }
  let index = 1;
  let text = args[0].replace(/%[sdifjoOc%]/g, (token) => {
    if (token === "%%") {
      return "%";
    }
    if (index >= args.length) {
      return token;
    }
    const value = args[index++];
    return formatSpecifier(token, value, options);
  });
  while (index < args.length) {
    const value = args[index++];
    text += ` ${typeof value === "string" ? value : inspect(value, options)}`;
  }
  return text;
}

function formatString(value: unknown, options: InspectOptions): string {
  if (typeof value === "object" && value !== null && hasBuiltInToString(value)) {
    return inspect(value, { ...options, colors: false, depth: 0, compact: 3 });
  }
  if (typeof value === "bigint" || typeof value === "number") {
    return inspect(value, { colors: false, numericSeparator: options.numericSeparator });
  }
  return String(value);
}

function formatNumber(token: string, value: unknown, options: InspectOptions): string {
  if (token !== "%f" && typeof value === "bigint") {
    return inspect(value, { colors: false, numericSeparator: options.numericSeparator });
  }
  if (typeof value === "symbol") {
    return "NaN";
  }
  const number =
    token === "%d"
      ? Number(value)
      : token === "%i"
        ? parseInt(String(value))
        : parseFloat(String(value));
  return inspect(number, { colors: false, numericSeparator: options.numericSeparator });
}

function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value) ?? "undefined";
  } catch (error) {
    if (error instanceof TypeError && /circular|cyclic/i.test(error.message)) {
      return "[Circular]";
    }
    throw error;
  }
}

function formatSpecifier(token: string, value: unknown, options: InspectOptions): string {
  switch (token) {
    case "%c":
      return "";
    case "%s":
      return formatString(value, options);
    case "%d":
    case "%i":
    case "%f":
      return formatNumber(token, value, options);
    case "%j":
      return formatJson(value);
    default:
      return inspect(value, token === "%o" ? { ...options, showHidden: true, depth: 4 } : options);
  }
}
