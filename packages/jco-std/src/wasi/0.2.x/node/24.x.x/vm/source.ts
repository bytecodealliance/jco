import { parse } from "acorn";
import type { Node, Program } from "acorn";
import { ancestor, simple } from "acorn-walk";
import { unsupported, unsupportedModules } from "./unsupported.js";

export interface ParsedScript {
  sourceURL: string | undefined;
  sourceMapURL: string | undefined;
  hasGlobalDeclarations: boolean;
}

function isFunction(node: Node): boolean {
  return (
    node.type === "FunctionDeclaration" ||
    node.type === "FunctionExpression" ||
    node.type === "ArrowFunctionExpression"
  );
}

/** Parse as Script, not as a Function body: top-level return must be a syntax error. */
export function parseScript(source: string): ParsedScript {
  let sourceURL: string | undefined;

  let sourceMapURL: string | undefined;

  const program = parse(source, {
    ecmaVersion: "latest",
    sourceType: "script",
    onComment(block, text) {
      if (block) {
        return;
      }

      // Only actual line comments carry V8's metadata. A string containing the same
      // text, or a block comment, must not change these properties.
      const match = /^[#@]\s+source(Mapping)?URL=([^\s'"`]+)\s*$/.exec(text);
      if (match?.[1]) {
        sourceMapURL = match[2];
      } else if (match) {
        sourceURL = match[2];
      }
    },
  });

  rejectDynamicImports(program);

  return { sourceURL, sourceMapURL, hasGlobalDeclarations: hasGlobalDeclarations(program) };
}

/** An eval cannot create the persistent global bindings of a native vm.Script. */
function hasGlobalDeclarations(program: Program): boolean {
  let found = program.body.some(
    (node) =>
      node.type === "VariableDeclaration" ||
      node.type === "ClassDeclaration" ||
      node.type === "FunctionDeclaration",
  );

  ancestor(program, {
    VariableDeclaration(node, _state, parents) {
      if (node.kind === "var" && !parents.some(isFunction)) {
        found = true;
      }
    },
    FunctionDeclaration(_node, _state, parents) {
      // Sloppy block functions can introduce global var bindings through Annex B.
      if (!parents.slice(0, -1).some(isFunction)) {
        found = true;
      }
    },
  });

  return found;
}

export function rejectGlobalDeclarations(parsed: ParsedScript): void {
  if (parsed.hasGlobalDeclarations) {
    unsupported(
      "vm.Script global declarations",
      "indirect eval cannot preserve native VM global bindings; use globalThis properties or compileFunction() for local declarations",
    );
  }
}

export function rejectDynamicImports(program: Node): void {
  simple(program, {
    ImportExpression() {
      unsupportedModules("vm dynamic import()");
    },
  });
}

/** Keep a caller-supplied filename from adding executable lines to the source. */
export function namedSource(source: string, filename: string): string {
  const safeFilename = filename.replace(/[\r\n\u2028\u2029]/g, " ");
  return `${source}\n//# sourceURL=${safeFilename}`;
}
