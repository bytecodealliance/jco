// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// Adapted from nodejs/node v24.20.0, commit
// 71b8b174857e25106d39b61a9e6f30d927da8b01, lib/internal/repl/utils.js and
// lib/internal/util/colors.js. Local changes: TypeScript types, ES intrinsics, acorn from npm
// rather than Node's vendored copy, `process` read as an optional global, and no inspector:
// `setupPreview` is omitted because Node itself disables previews without one.
// See ./README.md for runtime boundaries and the upstream dependency audit.

import { Parser, tokTypes, type Options, type Program, type TokenType } from "acorn";
import { builtinModules } from "../module/builtins.js";
import { clearScreenDown, cursorTo, moveCursor } from "../readline/callbacks.js";
import { kSetLine } from "../readline/interface.js";
import { kSubstringSearch } from "../readline/utils.js";
import type { Key, WritableOutput } from "../readline/types.js";
import type { ProcessLike } from "./types.js";

export const REPL_MODE_SLOPPY: unique symbol = Symbol("repl-sloppy");
export const REPL_MODE_STRICT: unique symbol = Symbol("repl-strict");
export const kContextId = Symbol("contextId");

/** The `process` global when one exists; the REPL never imports `node:process`. */
export function processGlobal(): ProcessLike | undefined {
  const candidate = (globalThis as { process?: unknown }).process;
  return candidate !== null && typeof candidate === "object"
    ? (candidate as ProcessLike)
    : undefined;
}

function env(name: string): string | undefined {
  return processGlobal()?.env?.[name];
}

/** Parse `code` as Node's REPL compiles it: a classic script, latest ECMAScript. */
export function parseScript(code: string, extra: Partial<Options> = {}): Program {
  return Parser.parse(code, { ecmaVersion: "latest", ...extra });
}

/** acorn's parse errors carry `pos`/`loc` and a ` (line:column)` message suffix Node strips. */
export interface AcornSyntaxError extends SyntaxError {
  pos: number;
  loc: { line: number; column: number };
}

export function isAcornSyntaxError(error: unknown): error is AcornSyntaxError {
  return error instanceof SyntaxError && typeof (error as AcornSyntaxError).pos === "number";
}

const KEYWORDS = new Set(
  (
    "break case catch class const continue debugger default delete do else enum export extends " +
    "false finally for function if import in instanceof new null return super switch this throw " +
    "true try typeof var void while with yield let static await async of"
  ).split(" "),
);

/** V8's wording for an unexpected token at `pos`: identifier, number, string, keyword, or char. */
function describeUnexpectedToken(code: string, pos: number): string {
  const char = code[pos];
  if (char === undefined) {
    return "Unexpected end of input";
  }
  if (/\d/.test(char)) {
    return "Unexpected number";
  }
  if (char === "'" || char === '"') {
    return "Unexpected string";
  }
  if (char === "`") {
    return "Unexpected template string";
  }
  const word = /^[A-Za-z_$][\w$]*/.exec(code.slice(pos))?.[0];
  if (word === undefined) {
    return `Unexpected token '${char}'`;
  }
  return KEYWORDS.has(word) ? `Unexpected token '${word}'` : `Unexpected identifier '${word}'`;
}

/**
 * Make an acorn parse error read like V8's: drop the trailing ` (line:column)`, and name the
 * offending token the way V8's `Unexpected token '.'` and `Unexpected end of input` do.
 *
 * Mutates and returns the same error, so identity and the `Recoverable.err` link are kept.
 */
export function normalizeAcornError<T extends Error>(error: T, code: string): T {
  if (isAcornSyntaxError(error)) {
    error.message = error.message.replace(/ \(\d+:\d+\)$/, "");
    if (error.message === "Unexpected token") {
      error.message = describeUnexpectedToken(code, error.pos);
    }
  }
  return error;
}

/**
 * Rewrite top-level lexical declarations so they outlive the line.
 *
 * Node runs each line as a `vm.Script`, whose top-level `let`, `const` and `class` bindings live
 * in the realm's script scope and stay visible to later lines. An indirect `eval` -- the only
 * engine-neutral way to run a script here -- scopes those bindings to the eval itself, so
 * `let x = 1` would be gone by the next prompt. Rewriting them to `var` (a `class` to a `var`
 * initialised with the class expression) makes them global properties, which is exactly where
 * an eval'd `var` lands. Only direct children of the program are touched; blocks, loops and
 * function bodies keep their own scoping. The cost is that `const` is not enforced across lines
 * and a redeclaration on a later line is silently accepted -- the same trade Node documents for
 * lines containing `await`.
 */
export function persistLexicalDeclarations(code: string, ast: Program): string {
  const edits: { start: number; end: number; text: string }[] = [];
  for (const node of ast.body) {
    if (node.type === "VariableDeclaration" && node.kind !== "var") {
      edits.push({ start: node.start, end: node.start + node.kind.length, text: "var" });
    } else if (node.type === "ClassDeclaration") {
      edits.push({ start: node.start, end: node.start, text: `var ${node.id!.name} = ` });
    }
  }
  if (edits.length === 0) {
    return code;
  }
  let result = "";
  let cursor = 0;
  for (const edit of edits) {
    result += code.slice(cursor, edit.start) + edit.text;
    cursor = edit.end;
  }
  return result + code.slice(cursor);
}

/** The parts of acorn's parser the recoverable-error subclass overrides; not in its public types. */
interface ParserInternals {
  type: TokenType;
  input: string;
  lastTokStart: number;
  pos: number;
  nextToken(): void;
  raise(pos: number, message: string): never;
}

type ParserClass = typeof Parser;
type InternalParserClass = new (...args: never[]) => ParserInternals;

// If the error is that we've unexpectedly ended the input,
// then let the user try to recover by adding more input.
// Note: `e` (the original exception) is not used by the current implementation,
// but may be needed in the future.
export function isRecoverableError(e: unknown, code: string): boolean {
  // For similar reasons as `defaultEval`, wrap expressions starting with a
  // curly brace with parenthesis.  Note: only the open parenthesis is added
  // here as the point is to test for potentially valid but incomplete
  // expressions.
  if (/^\s*\{/.test(code) && isRecoverableError(e, `(${code}`)) {
    return true;
  }

  let recoverable = false;

  // Determine if the point of any error raised is at the end of the input.
  // There are two cases to consider:
  //
  //   1.  Any error raised after we have encountered the 'eof' token.
  //       This prevents us from declaring partial tokens (like '2e') as
  //       recoverable.
  //
  //   2.  Three cases where tokens can legally span lines.  This is
  //       template, comment, and strings with a backslash at the end of
  //       the line, indicating a continuation.  Note that we need to look
  //       for the specific errors of 'unterminated' kind (not, for example,
  //       a syntax error in a ${} expression in a template), and the only
  //       way to do that currently is to look at the message.  Should Acorn
  //       change these messages in the future, this will lead to a test
  //       failure, indicating that this code needs to be updated.
  //
  const RecoverableParser = Parser.extend((Base: ParserClass) => {
    const Internal = Base as unknown as InternalParserClass;
    return class extends Internal {
      override nextToken(): void {
        super.nextToken();
        if (this.type === tokTypes.eof) {
          recoverable = true;
        }
      }
      override raise(pos: number, message: string): never {
        switch (message) {
          case "Unterminated template":
          case "Unterminated comment":
            recoverable = true;
            break;

          case "Unterminated string constant": {
            const token = this.input.slice(this.lastTokStart, this.pos);
            // See https://www.ecma-international.org/ecma-262/#sec-line-terminators
            if (/\\(?:\r\n?|\n|\u2028|\u2029)$/.test(token)) {
              recoverable = true;
            }
          }
        }
        return super.raise(pos, message);
      }
    } as unknown as ParserClass;
  });

  // Try to parse the code with acorn.  If the parse fails, ignore the acorn
  // error and return the recoverable status.
  try {
    RecoverableParser.parse(code, { ecmaVersion: "latest" });

    // Odd case: the underlying JS engine (V8, Chakra) rejected this input
    // but Acorn detected no issue.  Presume that additional text won't
    // address this issue.
    return false;
  } catch {
    return recoverable;
  }
}

const startsWithBraceRegExp = /^\s*{/;
const endsWithSemicolonRegExp = /;\s*$/;
export function isValidSyntax(input: string): boolean {
  try {
    Parser.parse(input, {
      ecmaVersion: "latest",
      allowAwaitOutsideFunction: true,
    });
    return true;
  } catch {
    try {
      Parser.parse(`_=${input}`, {
        ecmaVersion: "latest",
        allowAwaitOutsideFunction: true,
      });
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Checks if some provided code represents an object literal.
 * This is helpful to prevent confusing repl code evaluations where
 * strings such as `{ a : 1 }` would get interpreted as block statements
 * rather than object literals.
 * @param {string} code the code to check
 * @returns {boolean} true if the code represents an object literal, false otherwise
 */
export function isObjectLiteral(code: string): boolean {
  return startsWithBraceRegExp.test(code) && !endsWithSemicolonRegExp.test(code);
}

let nextREPLResourceNumber = 1;
// This prevents v8 code cache from getting confused and using a different
// cache from a resource of the same name
export function getREPLResourceName(): string {
  return `REPL${nextREPLResourceNumber++}`;
}

let _builtinLibs: string[] = builtinModules.filter((e) => e[0] !== "_" && !e.startsWith("node:"));

// Note: the `getReplBuiltinLibs` and `setReplBuiltinLibs` are functions used to provide getters and
//       setters for the `builtinModules` and `_builtinLibs` properties of the repl module and for making
//       sure that all internal repl modules share the same value, which can potentially be updated by users.
//       Also note that both `repl.builtinModules` and `repl._builtinLibs` are deprecated, once such properties
//       are removed these two functions should also be removed as no longer necessary.

export function getReplBuiltinLibs(): string[] {
  return _builtinLibs;
}

export function setReplBuiltinLibs(value: string[]): void {
  _builtinLibs = value;
}

/**
 * Node's `shouldColorize`, minus the `internal/tty` color-depth probe: `FORCE_COLOR` follows
 * Node's own parsing (only `0` and `false` disable), otherwise the stream decides.
 */
export function shouldColorize(stream: WritableOutput | null | undefined): boolean {
  const forced = env("FORCE_COLOR");
  if (forced !== undefined) {
    const normalized = forced.trim().toLowerCase();
    return normalized !== "0" && normalized !== "false";
  }
  const candidate = stream as
    | (WritableOutput & { getColorDepth?: () => number })
    | null
    | undefined;
  return (
    !!candidate?.isTTY &&
    (typeof candidate.getColorDepth === "function" ? candidate.getColorDepth() > 2 : true)
  );
}

/** The readline surface reverse search drives; a `REPLServer` satisfies it structurally. */
export interface ReverseSearchable {
  history: string[];
  historyIndex: number;
  line: string;
  cursor: number;
  useColors: boolean;
  output: WritableOutput | null | undefined;
  getPrompt(): string;
  getCursorPos(): { rows: number; cols: number };
  _getDisplayPos(str: string): { rows: number; cols: number };
  [kSetLine](line?: string): void;
  [kSubstringSearch]: string | null;
}

export function setupReverseSearch(repl: ReverseSearchable): {
  reverseSearch(string: string | ArrayBufferView | null, key: Key): boolean;
} {
  // Simple terminals can't use reverse search.
  if (env("TERM") === "dumb") {
    return {
      reverseSearch() {
        return false;
      },
    };
  }

  const alreadyMatched = new Set<string>();
  const labels: Record<string, string> = {
    r: "bck-i-search: ",
    s: "fwd-i-search: ",
  };
  let isInReverseSearch = false;
  let historyIndex = -1;
  let input = "";
  let cursor = -1;
  let dir: "r" | "s" = "r";
  let lastMatch = -1;
  let lastCursor = -1;
  let promptPos: { rows: number; cols: number };

  function checkAndSetDirectionKey(keyName: string | undefined): keyName is "r" | "s" {
    if (keyName === undefined || !labels[keyName]) {
      return false;
    }
    if (dir !== keyName) {
      // Reset the already matched set in case the direction is changed. That
      // way it's possible to find those entries again.
      alreadyMatched.clear();
      dir = keyName as "r" | "s";
    }
    return true;
  }

  function goToNextHistoryIndex() {
    // Ignore this entry for further searches and continue to the next
    // history entry.
    alreadyMatched.add(repl.history[historyIndex]);
    historyIndex += dir === "r" ? 1 : -1;
    cursor = -1;
  }

  function search() {
    // Just print an empty line in case the user removed the search parameter.
    if (input === "") {
      print(repl.line, `${labels[dir]}_`);
      return;
    }
    // Fix the bounds in case the direction has changed in the meanwhile.
    if (dir === "r") {
      if (historyIndex < 0) {
        historyIndex = 0;
      }
    } else if (historyIndex >= repl.history.length) {
      historyIndex = repl.history.length - 1;
    }
    // Check the history entries until a match is found.
    while (historyIndex >= 0 && historyIndex < repl.history.length) {
      let entry = repl.history[historyIndex];
      // Visualize all potential matches only once.
      if (alreadyMatched.has(entry)) {
        historyIndex += dir === "r" ? 1 : -1;
        continue;
      }
      // Match the next entry either from the start or from the end, depending
      // on the current direction.
      if (dir === "r") {
        // Update the cursor in case it's necessary.
        if (cursor === -1) {
          cursor = entry.length;
        }
        cursor = entry.lastIndexOf(input, cursor - 1);
      } else {
        cursor = entry.indexOf(input, cursor + 1);
      }
      // Match not found.
      if (cursor === -1) {
        goToNextHistoryIndex();
        // Match found.
      } else {
        if (repl.useColors) {
          const start = entry.slice(0, cursor);
          const end = entry.slice(cursor + input.length);
          entry = `${start}\x1B[4m${input}\x1B[24m${end}`;
        }
        print(entry, `${labels[dir]}${input}_`, cursor);
        lastMatch = historyIndex;
        lastCursor = cursor;
        // Explicitly go to the next history item in case no further matches are
        // possible with the current entry.
        if (
          (dir === "r" && cursor === 0) ||
          (dir === "s" && entry.length === cursor + input.length)
        ) {
          goToNextHistoryIndex();
        }
        return;
      }
    }
    print(repl.line, `failed-${labels[dir]}${input}_`);
  }

  function print(outputLine: string, inputLine: string, cursor = repl.cursor) {
    // TODO(BridgeAR): Resizing the terminal window hides the overlay. To fix
    // that, readline must be aware of this information. It's probably best to
    // add a couple of properties to readline that allow to do the following:
    // 1. Add arbitrary data to the end of the current line while not counting
    //    towards the line. This would be useful for the completion previews.
    // 2. Add arbitrary extra lines that do not count towards the regular line.
    //    This would be useful for both, the input preview and the reverse
    //    search. It might be combined with the first part?
    // 3. Add arbitrary input that is "on top" of the current line. That is
    //    useful for the reverse search.
    // 4. To trigger the line refresh, functions should be used to pass through
    //    the information. Alternatively, getters and setters could be used.
    //    That might even be more elegant.
    // The data would then be accounted for when calling `_refreshLine()`.
    // This function would then look similar to:
    //   repl.overlay(outputLine);
    //   repl.addTrailingLine(inputLine);
    //   repl.setCursor(cursor);
    // More potential improvements: use something similar to stream.cork().
    // Multiple cursor moves on the same tick could be prevented in case all
    // writes from the same tick are combined and the cursor is moved at the
    // tick end instead of after each operation.
    let rows = 0;
    if (lastMatch !== -1) {
      const line = repl.history[lastMatch].slice(0, lastCursor);
      rows = repl._getDisplayPos(`${repl.getPrompt()}${line}`).rows;
      cursorTo(repl.output, promptPos.cols);
    } else if (isInReverseSearch && repl.line !== "") {
      rows = repl.getCursorPos().rows;
      cursorTo(repl.output, promptPos.cols);
    }
    if (rows !== 0) {
      moveCursor(repl.output, 0, -rows);
    }

    if (isInReverseSearch) {
      clearScreenDown(repl.output);
      repl.output?.write(`${outputLine}\n${inputLine}`);
    } else {
      repl.output?.write(`\n${inputLine}`);
    }

    lastMatch = -1;

    // To know exactly how many rows we have to move the cursor back we need the
    // cursor rows, the output rows and the input rows.
    const prompt = repl.getPrompt();
    const cursorLine = prompt + outputLine.slice(0, cursor);
    const cursorPos = repl._getDisplayPos(cursorLine);
    const outputPos = repl._getDisplayPos(`${prompt}${outputLine}`);
    const inputPos = repl._getDisplayPos(inputLine);
    const inputRows = inputPos.rows - (inputPos.cols === 0 ? 1 : 0);

    rows = -1 - inputRows - (outputPos.rows - cursorPos.rows);

    moveCursor(repl.output, 0, rows);
    cursorTo(repl.output, cursorPos.cols);
  }

  function reset(string?: string) {
    isInReverseSearch = string !== undefined;

    // In case the reverse search ends and a history entry is found, reset the
    // line to the found entry.
    if (!isInReverseSearch) {
      if (lastMatch !== -1) {
        repl[kSetLine](repl.history[lastMatch]);
        repl.cursor = lastCursor;
        repl.historyIndex = lastMatch;
      }

      lastMatch = -1;

      // Clear screen and write the current repl.line before exiting.
      cursorTo(repl.output, promptPos.cols);
      moveCursor(repl.output, 0, promptPos.rows);
      clearScreenDown(repl.output);
      if (repl.line !== "") {
        repl.output?.write(repl.line);
        if (repl.line.length !== repl.cursor) {
          const { cols, rows } = repl.getCursorPos();
          cursorTo(repl.output, cols);
          moveCursor(repl.output, 0, rows);
        }
      }
    }

    input = string || "";
    cursor = -1;
    historyIndex = repl.historyIndex;
    alreadyMatched.clear();
  }

  function reverseSearch(string: string | ArrayBufferView | null, key: Key): boolean {
    if (!isInReverseSearch) {
      if (key.ctrl && checkAndSetDirectionKey(key.name)) {
        historyIndex = repl.historyIndex;
        promptPos = repl._getDisplayPos(`${repl.getPrompt()}`);
        print(repl.line, `${labels[dir]}_`);
        isInReverseSearch = true;
      }
    } else if (key.ctrl && checkAndSetDirectionKey(key.name)) {
      search();
    } else if (key.name === "backspace" || (key.ctrl && (key.name === "h" || key.name === "w"))) {
      reset(input.slice(0, input.length - 1));
      search();
      // Special handle <ctrl> + c and escape. Those should only cancel the
      // reverse search. The original line is visible afterwards again.
    } else if ((key.ctrl && key.name === "c") || key.name === "escape") {
      lastMatch = -1;
      reset();
      return true;
      // End search in case either enter is pressed or if any non-reverse-search
      // key (combination) is pressed.
    } else if (
      key.ctrl ||
      key.meta ||
      key.name === "return" ||
      key.name === "enter" ||
      typeof string !== "string" ||
      string === ""
    ) {
      reset();
      repl[kSubstringSearch] = "";
    } else {
      reset(`${input}${string}`);
      search();
    }
    return isInReverseSearch;
  }

  return { reverseSearch };
}
