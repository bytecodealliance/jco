// Console behavior in this module is adapted from Node.js v24.19.0's
// lib/internal/console/{constructor,global}.js and lib/internal/cli_table.js.
// Node.js is distributed under the MIT license. See https://github.com/nodejs/node.

import { unsupportedNodeApi } from "../errors/core.js";

import { inspect as inspectValue, type InspectOptions } from "../internal/inspect.js";
import { formatArgs as format } from "../util/format-core.js";
export type { InspectOptions } from "../internal/inspect.js";
const clocks = new WeakMap<object, () => number>();
const consoleMethods = [
  "log",
  "info",
  "debug",
  "warn",
  "error",
  "dir",
  "time",
  "timeEnd",
  "timeLog",
  "trace",
  "assert",
  "clear",
  "count",
  "countReset",
  "group",
  "groupEnd",
  "table",
  "dirxml",
  "groupCollapsed",
] as const;

export interface WritableStream {
  write(value: string, callback?: (error?: Error | null) => void): unknown;

  listenerCount?(event: string): number;

  once?(event: string, listener: (error?: Error) => void): unknown;

  removeListener?(event: string, listener: (error?: Error) => void): unknown;

  isTTY?: boolean;

  getColorDepth?(): number;
}

export interface ConsoleOptions {
  stdout: WritableStream;
  stderr?: WritableStream;
  ignoreErrors?: boolean;
  colorMode?: boolean | "auto";
  inspectOptions?: InspectOptions | ReadonlyMap<WritableStream, InspectOptions>;
  groupIndentation?: number;
}

export interface ConsoleProviders {
  write(stream: "stdout" | "stderr", value: string): void;

  isTerminal?(stream: "stdout" | "stderr"): boolean;

  colorDepth?(stream: "stdout" | "stderr"): number;

  now?: () => number;
}

type ConsoleMethod = (this: ConsoleImplementation, ...args: unknown[]) => unknown;

function isWritableStream(value: unknown): value is WritableStream {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof (value as WritableStream).write === "function"
  );
}

function validateStream(value: unknown, name: string): asserts value is WritableStream {
  if (!isWritableStream(value)) {
    throw new TypeError(`${name} must have a write() method`);
  }
}

function displayWidth(value: string): number {
  return Array.from(value.replace(/\u001b\[[0-9;]*m/g, "")).length;
}

function renderTable(headings: string[], columns: string[][]): string {
  const widths = headings.map(displayWidth);
  const rowCount = Math.max(0, ...columns.map((column) => column.length));
  for (let column = 0; column < columns.length; column++) {
    for (const value of columns[column]) {
      widths[column] = Math.max(widths[column], displayWidth(value));
    }
  }
  const divider = widths.map((width) => "─".repeat(width + 2));

  const row = (values: string[]) =>
    `│ ${values.map((value, index) => value + " ".repeat(widths[index] - displayWidth(value))).join(" │ ")} │`;

  const lines = [`┌${divider.join("┬")}┐`, row(headings), `├${divider.join("┼")}┤`];
  for (let index = 0; index < rowCount; index++) {
    lines.push(row(columns.map((column) => column[index] ?? "")));
  }
  lines.push(`└${divider.join("┴")}┘`);
  return lines.join("\n");
}

function duration(milliseconds: number): string {
  if (milliseconds < 1_000) {
    return `${Number(milliseconds.toFixed(3))}ms`;
  }
  if (milliseconds < 60_000) {
    return `${(milliseconds / 1_000).toFixed(3)}s`;
  }
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
  const seconds = ((milliseconds % 60_000) / 1_000).toFixed(3).padStart(6, "0");
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${seconds} (h:m:ss.mmm)`;
  }
  return `${minutes}:${seconds} (m:ss.mmm)`;
}

function isInspectOptionsMap(
  value: InspectOptions | ReadonlyMap<WritableStream, InspectOptions>,
): value is ReadonlyMap<WritableStream, InspectOptions> {
  return "get" in value && typeof value.get === "function";
}

const unsupportedInspectOptions = [
  "showHidden",
  "maxStringLength",
  "breakLength",
  "compact",
  "showProxy",
  "sorted",
  "getters",
  "numericSeparator",
] as const;

function validateInspectOptions(value: unknown): asserts value is InspectOptions {
  if (value === null || typeof value !== "object") {
    throw new TypeError("options.inspectOptions must be an object or a Map");
  }
  for (const key of unsupportedInspectOptions) {
    if ((value as InspectOptions)[key] !== undefined) {
      // These options depend on Node's full util.inspect implementation. Failing
      // explicitly avoids accepting configuration that the portable inspector ignores.
      throw unsupportedNodeApi(
        `console inspect option '${key}'`,
        "it depends on Node's full util.inspect implementation, which the portable inspector does not provide",
      );
    }
  }
}

function optionsFor(
  options: InspectOptions | ReadonlyMap<WritableStream, InspectOptions> | undefined,
  stream: WritableStream,
): InspectOptions {
  if (options && isInspectOptionsMap(options)) {
    return options.get(stream) ?? {};
  }
  return options ?? {};
}

class ConsoleImplementation {
  readonly _stdout!: WritableStream;
  readonly _stderr!: WritableStream;
  readonly _ignoreErrors!: boolean;
  private readonly colorMode: boolean | "auto";
  private readonly inspectOptions?: InspectOptions | ReadonlyMap<WritableStream, InspectOptions>;
  private readonly groupIndentation: number;
  private readonly counts = new Map<string, number>();
  private readonly times = new Map<string, number>();
  private indentation = "";

  constructor(
    options: ConsoleOptions | WritableStream,
    stderr?: WritableStream,
    ignoreErrors = true,
  ) {
    let normalized: ConsoleOptions;
    if (isWritableStream(options)) {
      normalized = { stdout: options, stderr, ignoreErrors };
    } else if (options !== null && typeof options === "object") {
      normalized = options;
    } else {
      throw new TypeError("Console expects a writable stdout stream or an options object");
    }

    validateStream(normalized.stdout, "options.stdout");
    const errorStream = normalized.stderr ?? normalized.stdout;
    validateStream(errorStream, "options.stderr");
    if (
      normalized.colorMode !== undefined &&
      normalized.colorMode !== true &&
      normalized.colorMode !== false &&
      normalized.colorMode !== "auto"
    ) {
      throw new TypeError('options.colorMode must be true, false, or "auto"');
    }
    if (normalized.inspectOptions !== undefined) {
      if (normalized.inspectOptions === null || typeof normalized.inspectOptions !== "object") {
        throw new TypeError("options.inspectOptions must be an object or a Map");
      }
      const inspectValues = isInspectOptionsMap(normalized.inspectOptions)
        ? normalized.inspectOptions.values()
        : [normalized.inspectOptions];
      for (const inspectOptions of inspectValues) {
        validateInspectOptions(inspectOptions);
        if (inspectOptions.colors !== undefined && normalized.colorMode !== undefined) {
          throw new TypeError(
            "options.inspectOptions.colors and options.colorMode cannot both be set",
          );
        }
      }
    }
    const indentation = normalized.groupIndentation ?? 2;
    if (!Number.isInteger(indentation) || indentation < 0 || indentation > 1_000) {
      throw new RangeError("options.groupIndentation must be an integer between 0 and 1000");
    }

    Object.defineProperties(this, {
      _stdout: { value: normalized.stdout, writable: true, configurable: true },
      _stderr: { value: errorStream, writable: true, configurable: true },
      _ignoreErrors: {
        value: normalized.ignoreErrors ?? true,
        writable: true,
        configurable: true,
      },
    });
    this.colorMode = normalized.colorMode ?? "auto";
    this.inspectOptions = normalized.inspectOptions;
    this.groupIndentation = indentation;
    clocks.set(this, () => globalThis.performance?.now() ?? Date.now());
    Object.defineProperty(this, Symbol.toStringTag, { value: "console", configurable: true });
    for (const method of consoleMethods) {
      const bound = (this[method] as ConsoleMethod).bind(this);
      Object.defineProperty(bound, "name", { value: method, configurable: true });
      Object.defineProperty(this, method, {
        value: bound,
        writable: true,
        configurable: true,
        enumerable: true,
      });
    }
  }

  #inspection(stream: WritableStream, additions: InspectOptions = {}): InspectOptions {
    const configured = optionsFor(this.inspectOptions, stream);
    const automaticColors =
      this.colorMode === true ||
      (this.colorMode === "auto" && stream.isTTY === true && (stream.getColorDepth?.() ?? 1) > 1);
    return { colors: automaticColors, ...configured, ...additions };
  }

  #output(stream: WritableStream, value: string): void {
    const indented = this.indentation + value.replaceAll("\n", `\n${this.indentation}`) + "\n";
    if (!this._ignoreErrors) {
      stream.write(indented);
      return;
    }
    try {
      stream.write(indented, () => undefined);
    } catch {
      // Node's console is a diagnostic utility and ignores ordinary stream errors by default.
    }
  }

  #stdout(args: unknown[]): void {
    this.#output(this._stdout, format(args, this.#inspection(this._stdout)));
  }

  #stderr(args: unknown[]): void {
    this.#output(this._stderr, format(args, this.#inspection(this._stderr)));
  }

  log(...args: unknown[]): void {
    this.#stdout(args);
  }

  info(...args: unknown[]): void {
    this.#stdout(args);
  }

  debug(...args: unknown[]): void {
    this.#stdout(args);
  }

  warn(...args: unknown[]): void {
    this.#stderr(args);
  }

  error(...args: unknown[]): void {
    this.#stderr(args);
  }

  dir(value: unknown, options: InspectOptions = {}): void {
    validateInspectOptions(options);
    this.#output(
      this._stdout,
      inspectValue(value, this.#inspection(this._stdout, { customInspect: false, ...options })),
    );
  }

  time(label: unknown = "default"): void {
    const key = String(label);
    if (this.times.has(key)) {
      this.warn(`Label '${key}' already exists for console.time()`);
      return;
    }
    this.times.set(key, clocks.get(this)!());
  }

  timeEnd(label: unknown = "default"): void {
    const key = String(label);
    const start = this.times.get(key);
    if (start === undefined) {
      this.warn(`No such label '${key}' for console.timeEnd()`);
      return;
    }
    this.times.delete(key);
    this.log(`${key}: ${duration(clocks.get(this)!() - start)}`);
  }

  timeLog(label: unknown = "default", ...data: unknown[]): void {
    const key = String(label);
    const start = this.times.get(key);
    if (start === undefined) {
      this.warn(`No such label '${key}' for console.timeLog()`);
      return;
    }
    this.log(`${key}: ${duration(clocks.get(this)!() - start)}`, ...data);
  }

  trace(...args: unknown[]): void {
    const error = new Error(format(args, this.#inspection(this._stderr)));
    error.name = "Trace";
    this.error(error.stack ?? `${error.name}: ${error.message}`);
  }

  assert(expression: unknown, ...args: unknown[]): void {
    if (expression) {
      return;
    }
    if (typeof args[0] === "string") {
      args[0] = `Assertion failed: ${args[0]}`;
    } else {
      args.unshift("Assertion failed");
    }
    this.warn(...args);
  }

  clear(): void {
    if (this._stdout.isTTY) {
      this._stdout.write("\u001b[1;1H\u001b[0J");
    }
  }

  count(label: unknown = "default"): void {
    const key = String(label);
    const value = (this.counts.get(key) ?? 0) + 1;
    this.counts.set(key, value);
    this.log(`${key}: ${value}`);
  }

  countReset(label: unknown = "default"): void {
    const key = String(label);
    if (!this.counts.delete(key)) {
      this.warn(`Count for '${key}' does not exist`);
    }
  }

  group(...data: unknown[]): void {
    if (data.length > 0) {
      this.log(...data);
    }
    this.indentation += " ".repeat(this.groupIndentation);
  }

  groupEnd(): void {
    this.indentation = this.indentation.slice(0, -this.groupIndentation);
  }

  table(data: unknown, properties?: readonly unknown[]): void {
    if (properties !== undefined && !Array.isArray(properties)) {
      throw new TypeError("properties must be an array");
    }
    if (data === null || typeof data !== "object") {
      this.log(data);
      return;
    }

    const inspect = (value: unknown) =>
      inspectValue(value, this.#inspection(this._stdout, { depth: 0, maxArrayLength: 3 }));

    let indexHeading = "(index)";
    if (data instanceof Map) {
      const entries = Array.from(data.entries());
      const indexes = entries.map((_, index) => inspect(index));
      this.log(
        renderTable(
          ["(iteration index)", "Key", "Values"],
          [
            indexes,
            entries.map(([key]) => inspect(key)),
            entries.map(([, value]) => inspect(value)),
          ],
        ),
      );
      return;
    }
    if (data instanceof Set) {
      const values = Array.from(data.values());
      this.log(
        renderTable(
          ["(iteration index)", "Values"],
          [values.map((_, index) => inspect(index)), values.map(inspect)],
        ),
      );
      return;
    }
    const entries = Object.entries(data);
    if (Array.isArray(data)) {
      indexHeading = "(index)";
    }
    const requested = properties?.map(String);
    const keys =
      requested ??
      Array.from(
        new Set(
          entries.flatMap(([, value]) =>
            value !== null && typeof value === "object" ? Object.keys(value) : [],
          ),
        ),
      );
    const headings = [indexHeading, ...keys];
    const columns = [
      entries.map(([key]) => key),
      ...keys.map((key) =>
        entries.map(([, value]) =>
          value !== null && typeof value === "object" && Object.hasOwn(value, key)
            ? inspect((value as Record<string, unknown>)[key])
            : "",
        ),
      ),
    ];
    const primitives = entries.some(
      ([, value]) => value === null || (typeof value !== "object" && typeof value !== "function"),
    );
    if (primitives && requested === undefined) {
      headings.push("Values");
      columns.push(
        entries.map(([, value]) =>
          value !== null && (typeof value === "object" || typeof value === "function")
            ? ""
            : inspect(value),
        ),
      );
    }
    this.log(renderTable(headings, columns));
  }

  dirxml(...args: unknown[]): void {
    this.log(...args);
  }

  groupCollapsed(...args: unknown[]): void {
    this.group(...args);
  }
}

for (const method of consoleMethods) {
  Object.defineProperty(ConsoleImplementation.prototype, method, {
    ...Object.getOwnPropertyDescriptor(ConsoleImplementation.prototype, method),
    enumerable: true,
  });
}
Object.defineProperty(ConsoleImplementation.prototype, "dirxml", {
  value: ConsoleImplementation.prototype.log,
  writable: true,
  configurable: true,
  enumerable: true,
});
Object.defineProperty(ConsoleImplementation.prototype, "groupCollapsed", {
  value: ConsoleImplementation.prototype.group,
  writable: true,
  configurable: true,
  enumerable: true,
});

export const Console = new Proxy(ConsoleImplementation, {
  apply(
    _target,
    _thisArgument,
    argumentsList: [ConsoleOptions | WritableStream, WritableStream?, boolean?],
  ) {
    return new ConsoleImplementation(...argumentsList);
  },
});
Object.defineProperty(Console, "name", { value: "Console", configurable: true });

export interface ConsoleModule extends ConsoleImplementation {
  Console: typeof Console;

  profile(label?: string): void;

  profileEnd(label?: string): void;

  timeStamp(label?: string): void;
}

function hostStream(providers: ConsoleProviders, name: "stdout" | "stderr"): WritableStream {
  return {
    get isTTY() {
      return providers.isTerminal?.(name) ?? false;
    },

    getColorDepth: providers.colorDepth ? () => providers.colorDepth!(name) : undefined,

    write(value: string): void {
      providers.write(name, value);
    },
  };
}

/** Create the shared `node:console` module object backed by an explicit host provider. */
export function createConsole(providers: ConsoleProviders): ConsoleModule {
  const instance = new ConsoleImplementation(
    hostStream(providers, "stdout"),
    hostStream(providers, "stderr"),
  );
  if (providers.now) {
    clocks.set(instance, providers.now);
  }
  const module = instance as ConsoleModule;
  module.Console = Console;
  // These methods only communicate with an attached inspector in Node. A component
  // has no Node inspector, so Node's no-inspector behavior is a deliberate no-op.
  module.profile = () => undefined;
  module.profileEnd = () => undefined;
  module.timeStamp = () => undefined;
  return module;
}
