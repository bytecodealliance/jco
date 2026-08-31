import { stderr, stdout } from "node:process";

import type { ConsoleHost } from "./console/types.js";

interface NodeOutput {
  write(value: string): unknown;
  isTTY?: boolean;
  getColorDepth?(): number;
}

function output(stream: "stdout" | "stderr"): NodeOutput {
  return stream === "stdout" ? stdout : stderr;
}

/** Opt-in host adapter that passes guest console output to Node's real streams. */
export const write: ConsoleHost["write"] = (stream, value) => {
  output(stream).write(value);
};

export const isTerminal: ConsoleHost["isTerminal"] = (stream) => output(stream).isTTY === true;

export const colorDepth: ConsoleHost["colorDepth"] = (stream) =>
  output(stream).getColorDepth?.() ?? 1;

export default { colorDepth, isTerminal, write };
