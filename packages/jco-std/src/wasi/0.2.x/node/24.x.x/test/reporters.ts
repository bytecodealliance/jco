/**
 * Adapted from nodejs/node lib/{test/reporters.js,internal/test_runner/reporter/
 * {dot,junit,spec,lcov,utils}.js}, v24.20.0,
 * 71b8b174857e25106d39b61a9e6f30d927da8b01, MIT (see LICENSE).
 * Local changes: typed events, jco-std streams/path/inspect, no process/terminal
 * discovery or ANSI colors. JUnit hostname is empty; engine stack formatting and
 * human-readable coverage tables are intentionally simplified.
 */
import { Transform } from "../stream/index.js";
import type {
  TransformOptions,
  TransformCallback,
  Transform as TransformStream,
} from "../stream/types.js";
import { createPath } from "../path.js";
// Coverage events carry absolute file paths and their own working directory.
const posix = createPath({ initialCwd: () => "/", getEnvironment: () => [] });
import { inspect } from "../assert/inspect.js";
import { invalidArgType } from "./errors.js";
import type { TestEvent, TestEventSource, TestLocation, TestResult } from "./types.js";
import { tap } from "./tap.js";
export { tap };
export type { TestEvent, TestEventSource } from "./types.js";

function formatResult(
  type: "test:pass" | "test:fail",
  data: TestResult,
  showError = true,
  prefix = "",
  indent = "",
): string {
  let symbol = type === "test:pass" ? "✔ " : "✖ ";
  let title = `${data.name}${data.details.duration_ms ? ` (${data.details.duration_ms}ms)` : ""}`;
  if (data.skip !== undefined) {
    symbol = "﹣ ";
    title += ` # ${typeof data.skip === "string" && data.skip.length ? data.skip : "SKIP"}`;
  } else if (data.todo !== undefined) {
    title += ` # ${typeof data.todo === "string" && data.todo.length ? data.todo : "TODO"}`;
    if (type === "test:fail") {
      symbol = "⚠ ";
    }
  } else if (data.expectFailure !== undefined) {
    title += " # EXPECTED FAILURE";
  }
  const error = data.details.error;
  return `${prefix}${indent}${symbol}${title}${showError && error ? `\n${indent}  ${inspect(error.cause ?? error)}\n` : ""}`;
}
export async function* dot(source: TestEventSource): AsyncGenerator<string, void> {
  let count = 0;
  const failed: TestResult[] = [];
  for await (const { type, data } of source) {
    if (type === "test:pass") {
      yield ".";
    }
    if (type === "test:fail") {
      yield "X";
      failed.push(data);
    }
    if ((type === "test:pass" || type === "test:fail") && ++count === 20) {
      yield "\n";
      count = 0;
    }
  }
  yield "\n";
  if (failed.length) {
    yield "\nFailed tests:\n\n";
    for (const test of failed) {
      yield formatResult("test:fail", test);
    }
  }
}
interface XmlNode {
  tag?: string;
  attrs: Record<string, unknown>;
  nesting: number;
  children: (XmlNode | string)[];
  parent?: XmlNode;
  comment?: string;
}
function escapeContent(text = ""): string {
  return text.replace(/(&)(?!#\d{1,7};)/g, "&amp;").replace(/</g, "&lt;");
}
function escapeAttribute(text = ""): string {
  return escapeContent(text.replace(/\n/g, "&#10;").replace(/"/g, "&quot;"));
}
function xml(node: XmlNode | string): string {
  if (typeof node === "string") {
    return `${escapeContent(node)}\n`;
  }
  const indent = "\t".repeat(node.nesting + 1);
  if (node.comment !== undefined) {
    return `${indent}<!-- ${node.comment.replace(/--/g, "&#45;&#45;")} -->\n`;
  }
  const attrs = Object.entries(node.attrs)
    .map(([key, value]) => `${key}="${escapeAttribute(String(value))}"`)
    .join(" ");
  if (!node.children.length) {
    return `${indent}<${node.tag} ${attrs}/>\n`;
  }
  return `${indent}<${node.tag} ${attrs}>\n${node.children.map(xml).join("")}${indent}</${node.tag}>\n`;
}
function childNode(
  tag: string,
  nesting: number,
  attrs: Record<string, unknown>,
  children: string[] = [],
): XmlNode {
  return { tag, nesting, attrs, children };
}
export async function* junit(source: TestEventSource): AsyncGenerator<string, void> {
  yield '<?xml version="1.0" encoding="utf-8"?>\n';
  yield "<testsuites>\n";
  const roots: XmlNode[] = [];
  let current: XmlNode | undefined;
  function start(data: TestLocation): XmlNode {
    const node: XmlNode = {
      attrs: { name: data.name },
      nesting: data.nesting,
      parent: current,
      children: [],
    };
    if (current) {
      current.children.push(node);
    } else {
      roots.push(node);
    }
    return (current = node);
  }
  for await (const { type, data } of source) {
    if (type === "test:start") {
      start(data);
    } else if (type === "test:pass" || type === "test:fail") {
      const node =
        current?.attrs.name === data.name && current.nesting === data.nesting
          ? current
          : start(data);
      current = node.parent;
      node.attrs.time = (data.details.duration_ms / 1000).toFixed(6);
      const children = node.children.filter(
        (child): child is XmlNode => typeof child !== "string" && child.comment === undefined,
      );
      if (children.length) {
        node.tag = "testsuite";
        Object.assign(node.attrs, {
          disabled: 0,
          errors: 0,
          tests: children.length,
          failures: children.filter(
            (child) =>
              child.attrs.failures ||
              child.children.some((c) => typeof c !== "string" && c.tag === "failure"),
          ).length,
          skipped: children.filter(
            (child) =>
              child.attrs.skipped ||
              child.children.some((c) => typeof c !== "string" && c.tag === "skipped"),
          ).length,
          timestamp: new Date(Date.now() - data.details.duration_ms).toISOString(),
          hostname: "",
        });
      } else {
        node.tag = "testcase";
        node.attrs.classname = data.classname ?? "test";
        if (data.file) {
          node.attrs.file = data.file;
        }
        if (data.skip) {
          node.children.push(
            childNode("skipped", data.nesting + 1, { type: "skipped", message: data.skip }),
          );
        }
        if (data.todo) {
          node.children.push(
            childNode("skipped", data.nesting + 1, { type: "todo", message: data.todo }),
          );
        }
        if (type === "test:fail") {
          const error = data.details.error;
          node.children.push(
            childNode(
              "failure",
              data.nesting + 1,
              { type: error?.failureType ?? error?.code, message: error?.message.trim() ?? "" },
              [inspect(error)],
            ),
          );
          node.attrs.failure = error?.message ?? "";
        }
      }
    } else if (type === "test:diagnostic" || type === "test:log") {
      (current?.children ?? roots).push({
        attrs: {},
        nesting: data.nesting,
        children: [],
        comment: data.message,
      });
    }
  }
  for (const root of roots) {
    yield xml(root);
  }
  yield "</testsuites>\n";
}
function event(value: unknown): TestEvent {
  if (
    !value ||
    typeof value !== "object" ||
    !("type" in value) ||
    typeof value.type !== "string" ||
    !value.type.startsWith("test:")
  ) {
    throw invalidArgType("event", "TestEvent", value);
  }
  // Reporter streams consume the documented Node TestEvent discriminated union.
  return value as TestEvent;
}
class SpecReporter extends Transform {
  #stack: TestLocation[] = [];
  #failed: TestResult[] = [];
  constructor(_options?: TransformOptions) {
    super({ writableObjectMode: true });
  }
  _transform(chunk: unknown, _encoding: string, callback: TransformCallback): void {
    try {
      const { type, data } = event(chunk);
      let text = "";
      if (type === "test:start") {
        this.#stack.unshift(data);
      } else if (type === "test:pass" || type === "test:fail") {
        this.#stack.shift();
        while (this.#stack.length) {
          const parent = this.#stack.pop()!;
          text += `${"  ".repeat(parent.nesting)}▶ ${parent.name}\n`;
        }
        text = `${formatResult(type, data, false, text, "  ".repeat(data.nesting))}\n`;
        if (type === "test:fail" && data.details.error?.failureType !== "subtestsFailed") {
          this.#failed.push(data);
        }
      } else if (type === "test:stdout" || type === "test:stderr") {
        text = data.message;
      } else if (type === "test:diagnostic" || type === "test:log") {
        text = `${"  ".repeat(data.nesting)}ℹ ${data.message}\n`;
      } else if (type === "test:summary") {
        text = this.#failures();
      } else if (type === "test:coverage") {
        text = data.summary.files
          .map(
            (file) =>
              `ℹ ${file.path}: ${file.coveredLineCount}/${file.totalLineCount} lines covered\n`,
          )
          .join("");
      } else if (type === "test:interrupted") {
        text = `\nInterrupted while running:\n${data.tests.map((test) => `${"  ".repeat(test.nesting)}⚠ ${test.name}\n`).join("")}`;
      }
      callback(null, text || undefined);
    } catch (error) {
      callback(error instanceof Error ? error : new Error(String(error)));
    }
  }
  #failures(): string {
    if (!this.#failed.length) {
      return "";
    }
    const text = `\n✖ failing tests:\n${this.#failed.map((test) => formatResult("test:fail", test)).join("\n")}`;
    this.#failed = [];
    return text;
  }
}
class LcovReporter extends Transform {
  constructor(options?: TransformOptions) {
    super({ ...options, writableObjectMode: true });
  }
  _transform(chunk: unknown, _encoding: string, callback: TransformCallback): void {
    try {
      const item = event(chunk);
      if (item.type !== "test:coverage") {
        callback(null);
        return;
      }
      const { workingDirectory, files } = item.data.summary;
      let text = "TN:\n";
      for (const file of files) {
        text += `SF:${posix.relative(workingDirectory, file.path)}\n`;
        let counts = "";
        file.functions.forEach((fn, index): void => {
          const name = fn.name || `anonymous_${index}`;
          text += `FN:${fn.line},${name}\n`;
          counts += `FNDA:${fn.count},${name}\n`;
        });
        text += `${counts}FNF:${file.totalFunctionCount}\nFNH:${file.coveredFunctionCount}\n`;
        file.branches.forEach((branch, index): void => {
          text += `BRDA:${branch.line},${index},0,${branch.count}\n`;
        });
        text += `BRF:${file.totalBranchCount}\nBRH:${file.coveredBranchCount}\n`;
        for (const line of [...file.lines].sort((a, b) => a.line - b.line)) {
          text += `DA:${line.line},${line.count}\n`;
        }
        text += `LH:${file.coveredLineCount}\nLF:${file.totalLineCount}\nend_of_record\n`;
      }
      callback(null, text);
    } catch (error) {
      callback(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
export interface ReporterConstructor {
  (options?: TransformOptions): TransformStream;
  new (options?: TransformOptions): TransformStream;
}
// The public wrappers are both callable and constructible, like lib/test/reporters.js.
export const spec: ReporterConstructor = function spec(
  options?: TransformOptions,
): TransformStream {
  return new SpecReporter(options);
} as ReporterConstructor;
export const lcov: ReporterConstructor = function lcov(
  options?: TransformOptions,
): TransformStream {
  return new LcovReporter(options);
} as ReporterConstructor;
export interface Reporters {
  readonly dot: typeof dot;
  readonly junit: typeof junit;
  spec: ReporterConstructor;
  readonly tap: typeof tap;
  lcov: ReporterConstructor;
}
const reporters = {} as Reporters;
Object.defineProperties(reporters, {
  dot: { configurable: true, enumerable: true, get: (): typeof dot => dot },
  junit: { configurable: true, enumerable: true, get: (): typeof junit => junit },
  spec: { configurable: true, enumerable: true, value: spec },
  tap: { configurable: true, enumerable: true, get: (): typeof tap => tap },
  lcov: { configurable: true, enumerable: true, value: lcov },
});
export default reporters;
