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
// 71b8b174857e25106d39b61a9e6f30d927da8b01, lib/repl.js.
// Local changes: TypeScript class over Jco's readline port; evaluation through indirect `eval`
// (Node's `runInThisContext`) with acorn as the compile step; `useGlobal: false`,
// `breakEvalOnSigint`, `preview`, `.save`, `.load` and history files have no platform support and
// say so; `node:domain` is replaced by a local error sink; `process` is an optional global.
// See ./README.md for runtime boundaries and the upstream dependency audit.

import { EventEmitter as NodeEventEmitter } from "node:events";
import {
  codedError,
  deprecatedNodeApi,
  missingArgs,
  unsupportedNodeApi,
  validateFunction,
} from "../errors/core.js";
import { inspect, inspectDefaultOptions, type InspectOptions } from "../internal/inspect.js";
import { Module } from "../module/module-class.js";
import { createRequire } from "../module/require.js";
import { defer } from "../readline/compat.js";
import { History } from "../readline/history.js";
import { Interface, type Interface as ReadlineInterface } from "../readline/index.js";
import { kAddNewLineOnTTY, kLastCommandErrored, kMultilinePrompt } from "../readline/interface.js";
import { commonPrefix } from "../readline/utils.js";
import type {
  CompleterResult,
  Emitter,
  Key,
  ReadableInput,
  WritableOutput,
} from "../readline/types.js";
import { processTopLevelAwait } from "./await.js";
import { complete, type CompletionCallback } from "./completion.js";
import { Recoverable } from "./recoverable.js";
import type {
  EvalCallback,
  HistoryLoadedCallback,
  ReplCommand,
  ReplCommandDefinition,
  ReplDomainLike,
  ReplEvalFunction,
  ReplHistoryConfig,
  ReplLines,
  ReplOptions,
  ReplWriterFunction,
} from "./types.js";
import {
  REPL_MODE_SLOPPY,
  REPL_MODE_STRICT,
  getREPLResourceName,
  isAcornSyntaxError,
  isObjectLiteral,
  isRecoverableError,
  isValidSyntax,
  kContextId,
  parseScript,
  persistLexicalDeclarations,
  processGlobal,
  setupReverseSearch,
  shouldColorize,
  normalizeAcornError,
} from "./utils.js";

// Keep the runtime EventEmitter identity without leaking @types/node into declarations.
const EventEmitter: new () => Emitter = NodeEventEmitter as unknown as new () => Emitter;

const kBufferedCommandSymbol = Symbol("bufferedCommand");
const kLoadingSymbol = Symbol("loading");

/** Node's error for `breakEvalOnSigint` combined with a custom evaluator. */
function invalidReplEvalConfig() {
  return codedError(
    new TypeError('Cannot specify both "breakEvalOnSigint" and "eval" for REPL'),
    "ERR_INVALID_REPL_EVAL_CONFIG",
  );
}

const indirectEval: (code: string) => unknown = eval;

/**
 * Run a script in the global scope, exactly as `vm.runInThisContext` does.
 *
 * An indirect `eval` is the engine-neutral equivalent. The `sourceURL` comment names the script
 * the way Node names it (`REPL1`, `REPL2`, ...) on engines that honour it, and the function's own
 * name marks where evaluated frames end so `trimEvalFrames` can cut the REPL's internals out.
 */
function runInThisContext(code: string, file: string): unknown {
  return indirectEval(`${code}\n//# sourceURL=${file}`);
}

/**
 * Keep only the stack frames that belong to evaluated code.
 *
 * Node trims everything below the REPL frame through V8's stack hook; here the boundary is the
 * `runInThisContext` frame, which every engine names, plus the anonymous eval trampoline V8 and
 * QuickJS put directly above it.
 */
function trimEvalFrames(stack: string): string {
  const lines = stack.split("\n");
  const boundary = lines.findIndex((line, index) => index > 0 && line.includes("runInThisContext"));
  if (boundary === -1) {
    return stack;
  }
  const kept = lines.slice(0, boundary);
  if (/^\s*at eval \((?:<anonymous>|native)\)\s*$/.test(kept[kept.length - 1] ?? "")) {
    kept.pop();
  }
  // Node also drops the script's own top-level frame (its function name is null); engines name
  // that frame `eval`, `<eval>`, or nothing at all.
  if (/^(?:\s*at (?:eval|<eval>) \(|@)/.test(kept[kept.length - 1] ?? "")) {
    kept.pop();
  }
  return kept.join("\n");
}

/**
 * Node decorates a compile error with the offending source line and a caret under the failing
 * column. acorn reports the position, so the same decoration is built here and kept beside the
 * error until it is printed.
 */
const arrowMessages = new WeakMap<object, string>();
function decorateSyntaxError(error: Error, code: string): void {
  if (!isAcornSyntaxError(error) || arrowMessages.has(error)) {
    return;
  }
  const line = code.split("\n")[error.loc.line - 1];
  if (line === undefined) {
    return;
  }
  arrowMessages.set(error, `${line}\n${" ".repeat(error.loc.column)}^\n\n`);
}

/**
 * Whether the engine keeps the legacy `RegExp.$1`..`$9` statics the REPL saves and restores
 * around each evaluation. SpiderMonkey has them; QuickJS does not.
 */
const legacyRegExpStatics = Object.prototype.hasOwnProperty.call(RegExp, "$1");
type RegExpStatics = Record<string, string>;

/**
 * Stands in for the `node:domain` instance Node's REPL binds evaluation through.
 *
 * Synchronous exceptions from the evaluator are routed to `'error'`, which is what the REPL relies
 * on. Errors thrown later by asynchronous work started from evaluated code are not: a domain
 * captured those through async hooks, which a component does not have.
 */
class ReplDomain extends EventEmitter implements ReplDomainLike {
  bind<T extends (...args: never[]) => unknown>(fn: T): T {
    // oxlint-disable-next-line typescript/no-this-alias -- The wrapper keeps its own `this`.
    const domain = this;
    return function (this: unknown, ...args: never[]) {
      try {
        return fn.apply(this, args);
      } catch (error) {
        domain.emit("error", error);
        return undefined;
      }
    } as T;
  }
  exit(): void {}
}

/** The default `writer`, `util.inspect` with `writer.options`, which callers may edit in place. */
export interface ReplWriter extends ReplWriterFunction {
  options: InspectOptions;
}

// This is the default "writer" value, if none is passed in the REPL options,
// and it can be overridden by custom print functions, such as `probe` or
// `eyes.js`.
export const writer: ReplWriter = Object.assign(
  (obj: unknown): string => inspect(obj, writer.options),
  { options: { ...inspectDefaultOptions, showProxy: true } as InspectOptions },
);

function isError(value: unknown): value is Error {
  return value instanceof Error;
}

/** acorn's message for a module-only statement in a script, standing in for V8's. */
const acornImportErrorStr = "'import' and 'export' may appear only with 'sourceType: module'";
const importErrorStr = "Cannot use import statement outside a module";

// Converts static import statement to dynamic import statement
function toDynamicImport(codeLine: string): string {
  let dynamicImportStatement = "";
  const ast = parseScript(codeLine, { sourceType: "module" });
  for (const node of ast.body) {
    if (node.type !== "ImportDeclaration") {
      continue;
    }
    const awaitDynamicImport = `await import(${JSON.stringify(node.source.value)});`;
    if (node.specifiers.length === 0) {
      dynamicImportStatement += awaitDynamicImport;
    } else if (
      node.specifiers.length === 1 &&
      node.specifiers[0].type === "ImportNamespaceSpecifier"
    ) {
      dynamicImportStatement += `const ${node.specifiers[0].local.name} = ${awaitDynamicImport}`;
    } else {
      const importNames = node.specifiers
        .map((specifier) => {
          const local = specifier.local.name;
          const imported =
            specifier.type === "ImportSpecifier"
              ? specifier.imported.type === "Identifier"
                ? specifier.imported.name
                : String(specifier.imported.value)
              : undefined;
          return local === imported ? local : `${imported ?? "default"}: ${local}`;
        })
        .join(", ");
      dynamicImportStatement += `const { ${importNames} } = ${awaitDynamicImport}`;
    }
  }
  return dynamicImportStatement;
}

type LegacyArgs = [
  prompt?: string | ReplOptions,
  stream?: ReplOptions["stream"],
  eval_?: ReplEvalFunction,
  useGlobal?: boolean,
  ignoreUndefined?: boolean,
  replMode?: symbol,
];

export class ReplServerCore extends Interface {
  declare context: object;
  declare commands: Record<string, ReplCommand>;
  declare lines: ReplLines;
  declare last: unknown;
  declare lastError: unknown;
  declare underscoreAssigned: boolean;
  declare underscoreErrAssigned: boolean;
  declare useGlobal: boolean;
  declare useColors: boolean;
  declare ignoreUndefined: boolean;
  declare replMode: symbol;
  declare editorMode: boolean;
  declare breakEvalOnSigint: boolean;
  declare allowBlockingCompletions: boolean;
  declare _domain: ReplDomainLike;
  declare _initialPrompt: string;
  declare _closingOnFlush?: boolean;
  declare eval: ReplEvalFunction;
  declare writer: ReplWriterFunction;
  declare inputStream: ReadableInput;
  declare outputStream: WritableOutput | null | undefined;
  declare [kContextId]: undefined;
  /** Readline's underscore aliases, installed on `Interface.prototype` at runtime. */
  declare _ttyWrite: (d: string | ArrayBufferView | null, key?: Key) => void;
  declare _sawKeyPress: boolean;
  declare _previousKey: Key | null;
  declare _getDisplayPos: (str: string) => { rows: number; cols: number };
  declare [kBufferedCommandSymbol]: string;
  declare [kLoadingSymbol]: boolean;

  constructor(...args: LegacyArgs) {
    let [prompt, stream, eval_, useGlobal, ignoreUndefined, replMode] = args;
    let options: ReplOptions;
    if (prompt !== null && typeof prompt === "object") {
      // An options object was given.
      options = { ...prompt };
      stream = options.stream || options.socket;
      eval_ = options.eval;
      useGlobal = options.useGlobal;
      ignoreUndefined = options.ignoreUndefined;
      prompt = options.prompt;
      replMode = options.replMode;
    } else {
      options = {};
    }

    if (!options.input && !options.output) {
      // Legacy API, passing a 'stream'/'socket' option.
      // Use stdin and stdout as the default streams if none were given.
      const source = stream ?? processGlobal();
      if (source === undefined) {
        throw unsupportedNodeApi(
          "repl.start() without input and output streams",
          "there is no `process` global to supply stdin and stdout; pass the `input` and `output` " +
            "options (or a `stream`) explicitly",
        );
      }

      // We're given a duplex readable/writable Stream, like a `net.Socket`
      // or a custom object with 2 streams, or the `process` object.
      options.input = (source.stdin ?? source) as ReadableInput;
      options.output = (source.stdout ?? source) as WritableOutput;
    }
    if (!options.input || !options.output) {
      throw unsupportedNodeApi(
        "repl.start() with only one of input and output",
        "a component REPL has no default stream to fill in the other side; pass both",
      );
    }

    if (options.terminal === undefined) {
      options.terminal = options.output.isTTY;
    }
    options.terminal = !!options.terminal;

    if (options.terminal && options.useColors === undefined) {
      // If possible, check if stdout supports colors or not.
      options.useColors = shouldColorize(options.output);
    }

    // Node routes previews through the inspector and disables them when it has none. A component
    // has none, so `preview` is accepted and has no effect.

    if (options.breakEvalOnSigint && eval_) {
      // Allowing this would not reflect user expectations.
      // breakEvalOnSigint affects only the behavior of the default eval().
      throw invalidReplEvalConfig();
    }
    if (options.breakEvalOnSigint) {
      throw unsupportedNodeApi(
        "repl option breakEvalOnSigint",
        "a component has no signal watchdog that could interrupt a running evaluation",
      );
    }
    if (!useGlobal) {
      throw unsupportedNodeApi(
        "repl option useGlobal: false (Node's default)",
        "the platform cannot create a second realm for a separate REPL context; pass " +
          "`useGlobal: true` to evaluate against the global scope, which is exact",
      );
    }
    if (replMode === REPL_MODE_STRICT) {
      throw unsupportedNodeApi(
        "repl option replMode: REPL_MODE_STRICT",
        "a strict-mode script evaluated through the engine's eval cannot bind declarations in " +
          "the global scope, so nothing would persist between lines; use REPL_MODE_SLOPPY",
      );
    }

    // The readline completer is only ever called after construction, so it may look `this` up
    // through a box that is filled in once `super()` has returned.
    const box: { repl?: ReplServerCore } = {};
    function completer(text: string, cb: CompletionCallback) {
      const repl = box.repl!;
      complete.call(repl, text, repl.editorMode ? repl.completeOnEditorMode(cb) : cb);
    }

    // All the parameters in the object are defining the "input" param of the
    // InterfaceConstructor.
    super({
      input: options.input,
      output: options.output,
      completer: options.completer || completer,
      terminal: options.terminal,
      historySize: options.historySize,
      prompt: prompt,
    });
    box.repl = this;
    // oxlint-disable-next-line typescript/no-this-alias -- Preserve upstream listener closures.
    const self = this;

    Object.defineProperty(this, "inputStream", {
      get: () => this.input,
      set: (val: ReadableInput) => {
        this.input = val;
      },
      enumerable: false,
      configurable: true,
    });
    Object.defineProperty(this, "outputStream", {
      get: () => this.output,
      set: (val: WritableOutput | null | undefined) => {
        this.output = val;
      },
      enumerable: false,
      configurable: true,
    });

    this.allowBlockingCompletions = !!options.allowBlockingCompletions;
    this.useColors = !!options.useColors;
    this._domain = options.domain || new ReplDomain();
    this.useGlobal = !!useGlobal;
    this.ignoreUndefined = !!ignoreUndefined;
    this.replMode = replMode || REPL_MODE_SLOPPY;
    this.underscoreAssigned = false;
    this.last = undefined;
    this.underscoreErrAssigned = false;
    this.lastError = undefined;
    this.breakEvalOnSigint = !!options.breakEvalOnSigint;
    this.editorMode = false;
    // Context id for use with the inspector protocol.
    this[kContextId] = undefined;
    this[kLastCommandErrored] = false;

    const savedRegExMatches = ["", "", "", "", "", "", "", "", "", ""];
    const sep = "\u0000\u0000\u0000";
    const regExMatcher = new RegExp(
      `^${sep}(.*)${sep}(.*)${sep}(.*)${sep}(.*)` +
        `${sep}(.*)${sep}(.*)${sep}(.*)${sep}(.*)` +
        `${sep}(.*)$`,
    );

    eval_ ||= defaultEval;

    // Pause taking in new input, and store the keys in a buffer.
    const pausedBuffer: (
      | [type: "key", payload: [string | ArrayBufferView | null, Key], isCompletionEnabled: boolean]
      | [type: "close"]
    )[] = [];
    let paused = false;
    function pause() {
      paused = true;
    }

    function unpause() {
      if (!paused) {
        return;
      }
      paused = false;
      let entry;
      const tmpCompletionEnabled = self.isCompletionEnabled;
      while ((entry = pausedBuffer.shift()) !== undefined) {
        switch (entry[0]) {
          case "key": {
            const [d, key] = entry[1];
            self.isCompletionEnabled = entry[2];
            self._ttyWrite(d, key);
            break;
          }
          case "close":
            self.emit("exit");
            break;
        }
        if (paused) {
          break;
        }
      }
      self.isCompletionEnabled = tmpCompletionEnabled;
    }

    function defaultEval(code: string, context: object, file: string, cb: EvalCallback) {
      let result: unknown;
      let wrappedErr: Error | undefined;
      let err: Error | null = null;
      let wrappedCmd = false;
      let awaitPromise = false;
      const input = code;

      if (isObjectLiteral(code) && isValidSyntax(code)) {
        // Add parentheses to make sure `code` is parsed as an expression
        code = `(${code.trim()})\n`;
        wrappedCmd = true;
      }

      // Top-level await is always enabled, as it is by default in Node.
      if (code.includes("await")) {
        try {
          const potentialWrappedCode = processTopLevelAwait(code);
          if (potentialWrappedCode !== null) {
            code = potentialWrappedCode;
            wrappedCmd = true;
            awaitPromise = true;
          }
        } catch (error) {
          const e = error as Error;
          let recoverableError = false;
          if (e.name === "SyntaxError") {
            // Remove all "await"s and attempt running the script
            // in order to detect if error is truly non recoverable
            const fallbackCode = code.replace(/\bawait\b/g, "");
            try {
              parseScript(fallbackCode);
            } catch (fallbackError) {
              if (isRecoverableError(fallbackError, fallbackCode)) {
                recoverableError = true;
                err = new Recoverable(e);
              }
            }
          }
          if (!recoverableError) {
            err = e;
          }
        }
      }

      // First, create the Script object to check the syntax
      if (code === "\n") {
        return cb(null);
      }

      if (err === null) {
        while (true) {
          try {
            // Node compiles a `vm.Script` here; acorn is the engine-neutral compile step, and its
            // syntax tree drives the script-scope emulation (see `persistLexicalDeclarations`).
            code = persistLexicalDeclarations(code, parseScript(code));
          } catch (error) {
            if (wrappedCmd) {
              // Unwrap and try again
              wrappedCmd = false;
              awaitPromise = false;
              code = input;
              wrappedErr = error as Error;
              continue;
            }
            // Preserve original error for wrapped command
            const parseError = wrappedErr || (error as Error);
            const parsed = wrappedErr ? `(${input.trim()})\n` : code;
            decorateSyntaxError(parseError, parsed);
            normalizeAcornError(parseError, parsed);
            if (isRecoverableError(parseError, code)) {
              err = new Recoverable(parseError);
            } else {
              err = parseError;
            }
          }
          break;
        }
      }

      // This will set the values from `savedRegExMatches` to corresponding
      // predefined RegExp properties `RegExp.$1`, `RegExp.$2` ... `RegExp.$9`
      if (legacyRegExpStatics) {
        regExMatcher.exec(savedRegExMatches.join(sep));
      }

      let finished = false;
      function finishExecution(err: Error | null, result?: unknown) {
        if (finished) {
          return;
        }
        finished = true;

        // After executing the current expression, store the values of RegExp
        // predefined properties back in `savedRegExMatches`
        if (legacyRegExpStatics) {
          for (let idx = 1; idx < savedRegExMatches.length; idx += 1) {
            savedRegExMatches[idx] = (RegExp as unknown as RegExpStatics)[`$${idx}`];
          }
        }

        if (err) {
          cb(err);
        } else {
          cb(null, result);
        }
      }

      if (!err) {
        try {
          result = runInThisContext(code, file);
        } catch (error) {
          // Node hands a runtime error straight to the active domain and never reaches the
          // callback, so the line is not recorded in `lines`; the local sink takes the same path.
          self._domain.emit("error", error);
          self._domain.exit();
          return;
        }

        if (awaitPromise) {
          pause();
          const promise = result as Promise<{ value?: unknown } | undefined>;

          (async () => {
            try {
              const result = (await promise)?.value;
              finishExecution(null, result);
            } catch (error) {
              if (error) {
                self._domain.emit("error", error);
                self._domain.exit();
                return;
              }
              finishExecution(error as Error);
            } finally {
              unpause();
            }
          })();
        }
      }

      if (!awaitPromise || err) {
        finishExecution(err, result);
      }
    }

    self.eval = self._domain.bind(eval_);

    self._domain.on("error", function debugDomainError(e: unknown) {
      let errStack = "";

      if (typeof e === "object" && e !== null) {
        if (isError(e)) {
          if (e.stack) {
            if (e.name === "SyntaxError") {
              // Remove stack trace. Engines format frames differently, so rebuild the first line
              // rather than pattern-matching V8's `    at` prefix, and lead with the source
              // caret Node's own compile errors carry.
              e.stack = `${arrowMessages.get(e) ?? ""}${e.name}: ${e.message}\n`;
              if (e.message.includes(importErrorStr) || e.message.includes(acornImportErrorStr)) {
                e.message =
                  "Cannot use import statement inside the Node.js " +
                  "REPL, alternatively use dynamic import: " +
                  toDynamicImport(self.lines.at(-1) ?? "");
                e.stack = e.stack.replace(/SyntaxError:.*\n/, `SyntaxError: ${e.message}\n`);
              }
            } else {
              e.stack = trimEvalFrames(e.stack);
            }
          }
          errStack = self.writer(e);

          // Remove one line error braces to keep the old style in place.
          if (errStack[0] === "[" && errStack[errStack.length - 1] === "]") {
            errStack = errStack.slice(1, -1);
          }
        }
      }

      if (!self.underscoreErrAssigned) {
        self.lastError = e;
      }

      if (errStack === "") {
        errStack = self.writer(e);
      }
      const lines = errStack.split(/(?<=\n)/);
      let matched = false;

      errStack = "";
      for (const line of lines) {
        if (!matched && /^\[?([A-Z][a-z0-9_]*)*Error/.test(line)) {
          errStack +=
            (writer.options.breakLength ?? 0) >= line.length
              ? `Uncaught ${line}`
              : `Uncaught:\n${line}`;
          matched = true;
        } else {
          errStack += line;
        }
      }
      if (!matched) {
        const ln = lines.length === 1 ? " " : ":\n";
        errStack = `Uncaught${ln}${errStack}`;
      }
      // Normalize line endings.
      errStack += errStack.endsWith("\n") ? "" : "\n";
      self.output!.write(errStack);
      self.clearBufferedCommand();
      self.lines.level = [];
      if (!self.closed) {
        self.displayPrompt();
      }
    });

    self.clearBufferedCommand();

    self.resetContext();

    this.commands = Object.create(null) as Record<string, ReplCommand>;
    defineDefaultCommands(this);

    // Figure out which "writer" function to use
    self.writer = options.writer || writer;

    if (self.writer === writer) {
      // Conditionally turn on ANSI coloring.
      writer.options.colors = self.useColors;
    }

    function _parseREPLKeyword(this: ReplServerCore, keyword: string, rest: string): boolean {
      const cmd = this.commands[keyword];
      if (cmd) {
        cmd.action.call(this, rest);
        return true;
      }
      return false;
    }

    self.on("close", function emitExit() {
      if (paused) {
        pausedBuffer.push(["close"]);
        return;
      }
      self.emit("exit");
    });

    let sawSIGINT = false;
    let sawCtrlD = false;
    self.on("SIGINT", function onSigInt() {
      const empty = self.line.length === 0;
      self.clearLine();
      _turnOffEditorMode(self);

      const cmd = self[kBufferedCommandSymbol];
      if (!(cmd && cmd.length > 0) && empty) {
        if (sawSIGINT) {
          self.close();
          sawSIGINT = false;
          return;
        }
        self.output!.write("(To exit, press Ctrl+C again or Ctrl+D or type .exit)\n");
        sawSIGINT = true;
      } else {
        sawSIGINT = false;
      }

      self.clearBufferedCommand();
      self.lines.level = [];
      self.displayPrompt();
    });

    self.on("line", function onLine(cmd: string) {
      cmd ||= "";
      sawSIGINT = false;

      if (self.editorMode) {
        self[kBufferedCommandSymbol] += cmd + "\n";

        // code alignment
        const matches = self._sawKeyPress && !self[kLoadingSymbol] ? /^\s+/.exec(cmd) : null;
        if (matches) {
          const prefix = matches[0];
          self.write(prefix);
          self.line = prefix;
          self.cursor = prefix.length;
        }
        _memory.call(self, cmd);
        return;
      }

      // Check REPL keywords and empty lines against a trimmed line input.
      const trimmedCmd = cmd.trim();

      // Check to see if a REPL keyword was used. If it returns true,
      // display next prompt and return.
      if (trimmedCmd) {
        if (
          trimmedCmd.charAt(0) === "." &&
          trimmedCmd.charAt(1) !== "." &&
          Number.isNaN(Number.parseFloat(trimmedCmd))
        ) {
          const matches = /^\.([^\s]+)\s*(.*)$/.exec(trimmedCmd);
          const keyword = matches?.[1] ?? "";
          const rest = matches?.[2] ?? "";
          if (_parseREPLKeyword.call(self, keyword, rest) === true) {
            return;
          }
          if (!self[kBufferedCommandSymbol]) {
            self.output!.write("Invalid REPL keyword\n");
            finish(null);
            return;
          }
        }
      }

      const evalCmd = self[kBufferedCommandSymbol] + cmd + "\n";

      self.eval(evalCmd, self.context, getREPLResourceName(), finish);

      function finish(e: Error | null, ...rest: [result?: unknown]) {
        _memory.call(self, cmd);

        if (
          e &&
          !self[kBufferedCommandSymbol] &&
          cmd.trim().startsWith("npm ") &&
          !(e instanceof Recoverable)
        ) {
          self.output!.write(
            "npm should be run outside of the " +
              "Node.js REPL, in your normal shell.\n" +
              "(Press Ctrl+D to exit.)\n",
          );
          self.displayPrompt();
          return;
        }

        // If error was SyntaxError and not JSON.parse error
        // We can start a multiline command
        if (e instanceof Recoverable && !sawCtrlD) {
          if (self.terminal) {
            self[kAddNewLineOnTTY]();
          } else {
            self[kBufferedCommandSymbol] += cmd + "\n";
            self.displayPrompt();
          }
          return;
        }

        if (e) {
          self._domain.emit("error", (e as Recoverable).err || e);
          self[kLastCommandErrored] = true;
        }

        // Clear buffer if no SyntaxErrors
        self.clearBufferedCommand();
        sawCtrlD = false;

        // If we got any output - print it (if no error)
        const ret = rest[0];
        if (
          !e &&
          // When an invalid REPL command is used, error message is printed
          // immediately. We don't have to print anything else. So, only when
          // the second argument to this function is there, print it.
          rest.length === 1 &&
          (!self.ignoreUndefined || ret !== undefined)
        ) {
          if (!self.underscoreAssigned) {
            self.last = ret;
          }
          self.output!.write(self.writer(ret) + "\n");
        }

        // If the REPL sever hasn't closed display prompt again (unless we already
        // did by emitting the 'error' event on the domain instance).
        if (!self.closed && !e) {
          self[kLastCommandErrored] = false;
          self.displayPrompt();
        }
      }
    });

    self.on("SIGCONT", function onSigCont() {
      if (self.editorMode) {
        self.output!.write(`${self._initialPrompt}.editor\n`);
        self.output!.write("// Entering editor mode (Ctrl+D to finish, Ctrl+C to cancel)\n");
        self.output!.write(`${self[kBufferedCommandSymbol]}\n`);
        self.prompt(true);
      } else {
        self.displayPrompt(true);
      }
    });

    const { reverseSearch } = setupReverseSearch(this);

    // Wrap readline tty to enable editor mode and pausing.
    const ttyWrite = self._ttyWrite.bind(self);
    self._ttyWrite = (d: string | ArrayBufferView | null, key?: Key) => {
      key ||= {};
      if (paused) {
        pausedBuffer.push(["key", [d, key], self.isCompletionEnabled]);
        return;
      }
      if (!self.editorMode || !self.terminal) {
        // Before exiting, make sure to clear the line.
        if (key.ctrl && key.name === "d" && self.cursor === 0 && self.line.length === 0) {
          self.clearLine();
        }
        if (!reverseSearch(d, key)) {
          ttyWrite(d, key);
        }
        return;
      }

      // Editor mode
      if (key.ctrl && !key.shift) {
        switch (key.name) {
          // TODO(BridgeAR): There should not be a special mode necessary for full
          // multiline support.
          case "d": // End editor mode
            _turnOffEditorMode(self);
            sawCtrlD = true;
            ttyWrite(d, { name: "return" });
            break;
          case "n": // Override next history item
          case "p": // Override previous history item
            break;
          default:
            ttyWrite(d, key);
        }
      } else {
        switch (key.name) {
          case "up": // Override previous history item
          case "down": // Override next history item
            break;
          case "tab":
            // Prevent double tab behavior
            self._previousKey = null;
            ttyWrite(d, key);
            break;
          default:
            ttyWrite(d, key);
        }
      }
    };

    self.displayPrompt();
  }

  setupHistory(historyConfig: ReplHistoryConfig | string = {}, cb?: HistoryLoadedCallback): void {
    // TODO(puskin94): necessary because historyConfig can be a string for backwards compatibility
    const options: ReplHistoryConfig =
      typeof historyConfig === "string" ? { filePath: historyConfig } : historyConfig;

    if (typeof cb === "function") {
      options.onHistoryFileLoaded = cb;
    }

    // Node's history manager keeps the in-memory list and, given a path, mirrors it to a file. A
    // component has no filesystem to mirror to, so the path takes Node's own "could not open"
    // route and the session keeps its in-memory history.
    this.historyManager = new History(this, {
      history: [...this.history],
      size: options.size ?? this.historySize,
      removeHistoryDuplicates: options.removeHistoryDuplicates,
    });
    if (options.filePath) {
      this.output!.write(
        "\nError: Could not open history file.\nREPL session history will not be persisted.\n",
      );
    }
    options.onHistoryFileLoaded?.(null, this);
  }

  clearBufferedCommand(): void {
    this[kBufferedCommandSymbol] = "";
  }

  override close(): void {
    if (this.terminal && this.historyManager.isFlushing && !this._closingOnFlush) {
      this._closingOnFlush = true;
      this.once("flushHistory", () => super.close());

      return;
    }
    defer(() => super.close());
  }

  createContext(): object {
    // Only the global context is supported (see the constructor), and Node defines the module
    // scaffolding on it just the same.
    const context = globalThis;

    const replModule = new Module("<repl>");

    Object.defineProperty(context, "module", {
      configurable: true,
      writable: true,
      value: replModule,
    });
    Object.defineProperty(context, "require", {
      configurable: true,
      writable: true,
      value: createRequire("<repl>"),
    });

    // Node also installs lazy getters here that `require()` every core module on first use. A
    // component has no loader, so nothing is installed: an unimported builtin name is a
    // ReferenceError, not a getter that throws.

    return context;
  }

  resetContext(): void {
    this.context = this.createContext();
    this.underscoreAssigned = false;
    this.underscoreErrAssigned = false;
    // TODO(BridgeAR): Deprecate the lines.
    this.lines = Object.assign([] as string[], { level: [] }) as ReplLines;

    Object.defineProperty(this.context, "_", {
      configurable: true,
      get: () => this.last,
      set: (value: unknown) => {
        this.last = value;
        if (!this.underscoreAssigned) {
          this.underscoreAssigned = true;
          this.output!.write("Expression assignment to _ now disabled.\n");
        }
      },
    });

    Object.defineProperty(this.context, "_error", {
      configurable: true,
      get: () => this.lastError,
      set: (value: unknown) => {
        this.lastError = value;
        if (!this.underscoreErrAssigned) {
          this.underscoreErrAssigned = true;
          this.output!.write("Expression assignment to _error now disabled.\n");
        }
      },
    });

    // Allow REPL extensions to extend the new context
    this.emit("reset", this.context);
  }

  displayPrompt(preserveCursor?: boolean): void {
    let prompt = this._initialPrompt;
    if (this[kBufferedCommandSymbol].length) {
      prompt = kMultilinePrompt.description!;
    }

    // Do not overwrite `_initialPrompt` here
    super.setPrompt(prompt);
    this.prompt(preserveCursor);
  }

  // When invoked as an API method, overwrite _initialPrompt
  override setPrompt(prompt: string): void {
    this._initialPrompt = prompt;
    super.setPrompt(prompt);
  }

  complete(line: string, callback: CompletionCallback): void {
    (this.completer as (line: string, callback: CompletionCallback) => void).call(
      this,
      line,
      callback,
    );
  }

  completeOnEditorMode(callback: CompletionCallback): CompletionCallback {
    return (err, results) => {
      if (err) {
        return callback(err);
      }

      const [completions, completeOn = ""] = results as CompleterResult;
      let result = completions.filter(Boolean);

      if (completeOn && result.length !== 0) {
        result = [commonPrefix(result)];
      }

      callback(null, [result, completeOn]);
    };
  }

  defineCommand(keyword: string, cmd: ReplCommandDefinition): void {
    let command: ReplCommand;
    if (typeof cmd === "function") {
      command = { action: cmd };
    } else {
      validateFunction(cmd.action, "cmd.action");
      command = cmd;
    }
    this.commands[keyword] = command;
  }
}

// Node's `_memory` records every line and tries to track brace depth for tab completion inside
// function bodies. Its depth arithmetic (`dw.length - up.length` on two numbers) is NaN in Node
// 24, so `lines.level` never gains an entry there; that observable behaviour is kept, minus the
// dead arithmetic.
function _memory(this: ReplServerCore, cmd: string | undefined) {
  this.lines ||= Object.assign([] as string[], { level: [] }) as ReplLines;
  this.lines.level ||= [];

  // Save the line so I can do magic later
  if (cmd) {
    const len = this.lines.level.length ? this.lines.level.length - 1 : 0;
    this.lines.push("  ".repeat(len) + cmd);
  } else {
    // I don't want to not change the format too much...
    this.lines.push("");
  }

  if (!cmd) {
    this.lines.level = [];
  }
}

function _turnOnEditorMode(repl: ReplServerCore) {
  repl.editorMode = true;
  Interface.prototype.setPrompt.call(repl, "");
}

function _turnOffEditorMode(repl: ReplServerCore) {
  repl.editorMode = false;
  repl.setPrompt(repl._initialPrompt);
}

function defineDefaultCommands(repl: ReplServerCore) {
  repl.defineCommand("break", {
    help: "Sometimes you get stuck, this gets you out",
    action: function (this: ReplServerCore) {
      this.clearBufferedCommand();
      this.displayPrompt();
    },
  });

  repl.defineCommand("clear", {
    help: "Alias for .break",
    action: function (this: ReplServerCore) {
      this.clearBufferedCommand();
      this.displayPrompt();
    },
  });

  repl.defineCommand("exit", {
    help: "Exit the REPL",
    action: function (this: ReplServerCore) {
      this.close();
    },
  });

  repl.defineCommand("help", {
    help: "Print this help message",
    action: function (this: ReplServerCore) {
      const names = Object.keys(this.commands).sort();
      const longestNameLength = Math.max(...names.map((name) => name.length));
      for (const name of names) {
        const cmd = this.commands[name];
        const spaces = " ".repeat(longestNameLength - name.length + 3);
        const line = `.${name}${cmd.help ? spaces + cmd.help : ""}\n`;
        this.output!.write(line);
      }
      this.output!.write("\nPress Ctrl+C to abort current expression, Ctrl+D to exit the REPL\n");
      this.displayPrompt();
    },
  });

  // `.save` and `.load` need a filesystem, which a component does not have by default. Node's own
  // response to an I/O failure is a one-line message and a fresh prompt; that is what they do here.
  repl.defineCommand("save", {
    help: "Save all evaluated commands in this REPL session to a file",
    action: function (this: ReplServerCore, file: string) {
      if (file === "") {
        this.output!.write(`${missingArgs("file").message}\n`);
      } else {
        this.output!.write(`Failed to save: ${file}\n`);
      }
      this.displayPrompt();
    },
  });

  repl.defineCommand("load", {
    help: "Load JS from a file into the REPL session",
    action: function (this: ReplServerCore, file: string) {
      if (file === "") {
        this.output!.write(`${missingArgs("file").message}\n`);
      } else {
        this.output!.write(`Failed to load: ${file}\n`);
      }
      this.displayPrompt();
    },
  });
  if (repl.terminal) {
    repl.defineCommand("editor", {
      help: "Enter editor mode",
      action(this: ReplServerCore) {
        _turnOnEditorMode(this);
        this.output!.write("// Entering editor mode (Ctrl+D to finish, Ctrl+C to cancel)\n");
      },
    });
  }
}

export type REPLServer = ReplServerCore;

export interface REPLServerConstructor {
  new (options?: ReplOptions): REPLServer;
  new (
    prompt?: string,
    stream?: ReplOptions["stream"],
    eval_?: ReplEvalFunction,
    useGlobal?: boolean,
    ignoreUndefined?: boolean,
    replMode?: symbol,
  ): REPLServer;
  prototype: REPLServer;
}

/**
 * Node's `REPLServer` is a plain function whose prototype chain is grafted onto `Interface`.
 * Calling it without `new` is a runtime deprecation there (DEP0185) and a refusal here.
 */
export const REPLServer: REPLServerConstructor = function REPLServer(
  this: unknown,
  prompt?: string | ReplOptions,
  stream?: ReplOptions["stream"],
  eval_?: ReplEvalFunction,
  useGlobal?: boolean,
  ignoreUndefined?: boolean,
  replMode?: symbol,
): REPLServer {
  if (!new.target) {
    throw deprecatedNodeApi("REPLServer() called without new (DEP0185)", "new REPLServer()");
  }
  return Reflect.construct(
    ReplServerCore,
    [prompt, stream, eval_, useGlobal, ignoreUndefined, replMode],
    new.target,
  ) as REPLServer;
} as unknown as REPLServerConstructor;
REPLServer.prototype = ReplServerCore.prototype;
Object.defineProperty(REPLServer.prototype, "constructor", {
  value: REPLServer,
  writable: true,
  configurable: true,
});
Object.setPrototypeOf(REPLServer, Interface);

// Prompt is a string to print on each line for the prompt,
// source is a stream to use for I/O, defaulting to stdin/stdout.
export function start(options?: ReplOptions): REPLServer;
export function start(
  prompt?: string,
  source?: ReplOptions["stream"],
  eval_?: ReplEvalFunction,
  useGlobal?: boolean,
  ignoreUndefined?: boolean,
  replMode?: symbol,
): REPLServer;
export function start(
  prompt?: string | ReplOptions,
  source?: ReplOptions["stream"],
  eval_?: ReplEvalFunction,
  useGlobal?: boolean,
  ignoreUndefined?: boolean,
  replMode?: symbol,
): REPLServer {
  return new REPLServer(prompt as string, source, eval_, useGlobal, ignoreUndefined, replMode);
}

export { REPL_MODE_SLOPPY, REPL_MODE_STRICT, Recoverable, isValidSyntax };
export type { ReadlineInterface };
