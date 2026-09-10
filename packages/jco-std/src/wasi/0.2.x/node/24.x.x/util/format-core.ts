// Console behavior in this module is adapted from Node.js v24.19.0's
// lib/internal/console/{constructor,global}.js and lib/internal/cli_table.js,
// commit cdc1b38d40cb567b7ad0b39c86addf830a0af0ae.
// Node.js is distributed under the MIT license. See https://github.com/nodejs/node.

// Shared console formatting core, extracted without changing its output.

import { inspect as inspectValue, type InspectOptions } from "../internal/inspect.js";
export { inspect as inspectValue, type InspectOptions } from "../internal/inspect.js";

function json(value: unknown): string {
  try {
    return JSON.stringify(value) ?? "undefined";
  } catch (error) {
    if (error instanceof TypeError && /circular/i.test(error.message)) {
      return "[Circular]";
    }
    throw error;
  }
}

function formatNumber(value: unknown, integer: boolean): string {
  if (typeof value === "bigint") {
    return `${value}n`;
  }
  if (typeof value === "symbol") {
    return "NaN";
  }
  const number = Number(value);
  return String(integer ? Math.trunc(number) : number);
}

export function formatArgs(args: unknown[], options: InspectOptions): string {
  if (args.length === 0) {
    return "";
  }
  if (typeof args[0] !== "string") {
    return args.map((value) => inspectValue(value, options)).join(" ");
  }

  let index = 1;
  const formatted = args[0].replace(/%[sdifjoOc%]/g, (token) => {
    if (token === "%%") {
      return "%";
    }
    if (token === "%c") {
      if (index < args.length) {
        index++;
      }
      return "";
    }
    if (index >= args.length) {
      return token;
    }
    const value = args[index++];
    switch (token) {
      case "%s":
        return typeof value === "object" && value !== null
          ? inspectValue(value, { ...options, colors: false, depth: 0 })
          : String(value);
      case "%d":
      case "%f":
        return formatNumber(value, false);
      case "%i":
        return formatNumber(typeof value === "string" ? Number.parseInt(value, 10) : value, true);
      case "%j":
        return json(value);
      default:
        return inspectValue(value, token === "%o" ? { ...options, depth: 4 } : options);
    }
  });
  if (index === args.length) {
    return formatted;
  }
  return `${formatted} ${args
    .slice(index)
    .map((value) => (typeof value === "string" ? value : inspectValue(value, options)))
    .join(" ")}`;
}
