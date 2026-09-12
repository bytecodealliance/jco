/**
 * V8's structured stack traces, for engines that only produce a string.
 *
 * `Error.prepareStackTrace` is not part of the language: it is a V8 extension that Node
 * exposes, and Node-shaped packages use it to read a stack frame by frame rather than by
 * parsing text. `depd` -- which Express, `body-parser`, `http-errors` and `send` all load --
 * does exactly that while it is being imported, so without this a component fails before it
 * ever handles a request.
 *
 * The component engines produce a stack string instead, so the frames are recovered by
 * parsing it. What comes back answers the `CallSite` methods that matter for locating a
 * frame; the ones that need engine internals to answer honestly say what they do not know
 * rather than inventing it.
 */

/** A frame, as V8's `CallSite` presents one. */
export interface CallSite {
  /** Source file the frame is in, or `null` when the engine did not name one. */
  getFileName(): string | null;

  /** 1-based line number, or `null`. */
  getLineNumber(): number | null;

  /** 1-based column number, or `null`. */
  getColumnNumber(): number | null;

  /** Function name, or `null` for an anonymous frame. */
  getFunctionName(): string | null;

  /** V8 reports the receiver's type name; nothing here can, so this is always `null`. */
  getTypeName(): string | null;

  /** V8 reports the method name a function was called as; this is always `null`. */
  getMethodName(): string | null;

  /** The function itself, which a parsed stack cannot recover. */
  getFunction(): undefined;

  /** Where an `eval` call originated, or `null`. */
  getEvalOrigin(): string | null;

  /** Whether the frame is a native (engine-internal) frame. */
  isNative(): boolean;

  /** Whether the frame is inside `eval`. */
  isEval(): boolean;

  /** Whether the frame is a constructor call, which a parsed stack cannot tell. */
  isConstructor(): boolean;

  /** Whether the frame is at the top level of a module. */
  isToplevel(): boolean;

  /** Whether the frame is in a promise's async continuation, which is not recoverable here. */
  isAsync(): boolean;

  /** Whether the frame is a promise combinator's, which is not recoverable here. */
  isPromiseAll(): boolean;

  /** The frame rendered the way V8 renders one. */
  toString(): string;
}

/** One frame's parsed contents. */
interface Frame {
  functionName: string | null;
  fileName: string | null;
  lineNumber: number | null;
  columnNumber: number | null;
  isEval: boolean;
  evalOrigin: string | null;
}

/**
 * SpiderMonkey renders a frame as `name@file:line:column`, with an empty name for a
 * top-level frame.
 */
const SPIDERMONKEY_FRAME = /^(?<name>.*?)@(?<location>.*?):(?<line>\d+):(?<column>\d+)$/;

/** V8 renders a frame as `    at name (file:line:column)`, or `    at file:line:column`. */
const V8_FRAME = /^\s*at\s+(?:(?<name>.*?)\s+\()?(?<location>.*?):(?<line>\d+):(?<column>\d+)\)?$/;

function parseFrame(line: string): Frame | undefined {
  const match = SPIDERMONKEY_FRAME.exec(line) ?? V8_FRAME.exec(line);
  if (!match?.groups) {
    return undefined;
  }
  const { name, location, line: lineNumber, column } = match.groups;
  // An `eval` frame carries its origin ahead of the location, in both renderings.
  const evalSeparator = location.lastIndexOf(" > eval");
  const isEval = evalSeparator !== -1 || location.startsWith("eval");
  return {
    functionName: name ? name : null,
    fileName: evalSeparator === -1 ? location || null : location.slice(evalSeparator + 7) || null,
    lineNumber: Number(lineNumber),
    columnNumber: Number(column),
    isEval,
    evalOrigin: evalSeparator === -1 ? null : location.slice(0, evalSeparator),
  };
}

function toCallSite(frame: Frame): CallSite {
  const location = `${frame.fileName ?? "<anonymous>"}:${frame.lineNumber ?? 0}:${frame.columnNumber ?? 0}`;
  return {
    getFileName: () => frame.fileName,
    getLineNumber: () => frame.lineNumber,
    getColumnNumber: () => frame.columnNumber,
    getFunctionName: () => frame.functionName,
    getTypeName: () => null,
    getMethodName: () => null,
    getFunction: () => undefined,
    getEvalOrigin: () => frame.evalOrigin,
    isNative: () => frame.fileName === null,
    isEval: () => frame.isEval,
    isConstructor: () => false,
    isToplevel: () => frame.functionName === null,
    isAsync: () => false,
    isPromiseAll: () => false,
    toString: () => (frame.functionName ? `${frame.functionName} (${location})` : location),
  };
}

/**
 * Parse an engine stack string into V8-shaped call sites.
 *
 * @param stack - the engine's stack string
 * @param skipUntil - drop every frame up to and including the first one for this function,
 *   which is how `Error.captureStackTrace()`'s `constructorOpt` hides its own frames
 * @returns one call site per frame the string named
 */
export function parseCallSites(stack: string, skipUntil?: string): CallSite[] {
  const frames: Frame[] = [];
  for (const line of stack.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    const frame = parseFrame(trimmed);
    if (frame) {
      frames.push(frame);
    }
  }
  if (skipUntil) {
    const index = frames.findIndex((frame) => frame.functionName === skipUntil);
    if (index >= 0) {
      frames.splice(0, index + 1);
    }
  }
  return frames.map(toCallSite);
}
