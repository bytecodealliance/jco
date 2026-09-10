/** Adapted from nodejs/node lib/internal/test_runner/reporter/tap.js,
 * v24.20.0, 71b8b174857e25106d39b61a9e6f30d927da8b01, MIT (see LICENSE).
 * Typed events and portable error inspection replace internal bindings. YAML
 * error details omit engine stack frames; coverage uses a portable text summary. */
import type { TestEvent, TestEventSource } from "./types.js";
import { inspect } from "../assert/inspect.js";
export function tapEscape(input: string): string {
  return input
    .replaceAll("\b", "\\b")
    .replaceAll("\f", "\\f")
    .replaceAll("\t", "\\t")
    .replaceAll("\n", "\\n")
    .replaceAll("\r", "\\r")
    .replaceAll("\v", "\\v")
    .replaceAll("\\", "\\\\")
    .replaceAll("#", "\\#");
}
function yaml(indent: string, name: string, value: unknown): string {
  if (value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return `${indent}  ${name}: ${JSON.stringify(value)}\n`;
  }
  return `${indent}  ${name}: ${typeof value === "object" && value !== null ? JSON.stringify(inspect(value)) : String(value)}\n`;
}
export function formatTap(event: TestEvent): string {
  const { type, data } = event;
  switch (type) {
    case "test:pass":
    case "test:fail": {
      const indent = "    ".repeat(data.nesting);
      let line = `${indent}${type === "test:pass" ? "ok" : "not ok"} ${data.testNumber}`;
      if (data.name) {
        line += ` ${tapEscape(`- ${data.name}`)}`;
      }
      for (const [name, value] of [
        ["SKIP", data.skip],
        ["TODO", data.todo],
        ["EXPECTED FAILURE", data.expectFailure],
      ] as const) {
        if (value !== undefined) {
          line += ` # ${name}${typeof value === "string" && value.length ? ` ${tapEscape(value)}` : ""}`;
          break;
        }
      }
      line += `\n${indent}  ---\n`;
      line += yaml(indent, "duration_ms", data.details.duration_ms);
      line += yaml(indent, "type", data.details.type);
      const error = data.details.error;
      if (error) {
        line += yaml(indent, "failureType", error.failureType);
        line += yaml(indent, "error", error.message);
        line += yaml(indent, "code", error.code);
        if (error.cause !== undefined) {
          line += yaml(indent, "cause", error.cause);
        }
      }
      return `${line}${indent}  ...\n`;
    }
    case "test:start":
      return `${"    ".repeat(data.nesting)}# Subtest: ${tapEscape(data.name)}\n`;
    case "test:plan":
      return `${"    ".repeat(data.nesting)}1..${data.count}\n`;
    case "test:diagnostic":
    case "test:log":
      return `${"    ".repeat(data.nesting)}# ${tapEscape(data.message)}\n`;
    case "test:stdout":
    case "test:stderr":
      return data.message
        .split(/\n|\r\n/)
        .filter(Boolean)
        .map((line) => `# ${tapEscape(line)}\n`)
        .join("");
    case "test:interrupted":
      return data.tests
        .map(
          (test) =>
            `# ${tapEscape(`Interrupted while running: ${test.name}${test.file ? ` at ${test.file}:${test.line}:${test.column}` : ""}`)}\n`,
        )
        .join("");
    case "test:coverage":
      return data.summary.files
        .map(
          (file) =>
            `# ${tapEscape(file.path)}: ${file.coveredLineCount}/${file.totalLineCount} lines covered\n`,
        )
        .join("");
    default:
      return "";
  }
}
export async function* tap(source: TestEventSource): AsyncGenerator<string, void> {
  yield "TAP version 13\n";
  for await (const event of source) {
    const text = formatTap(event);
    if (text) {
      yield text;
    }
  }
}
