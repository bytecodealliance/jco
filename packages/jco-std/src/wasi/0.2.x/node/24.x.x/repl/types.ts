// Signatures follow the MIT-licensed @types/node 24 repl declarations, adapted to the structural
// stream contracts of Jco's readline port so consumers do not need @types/node.

import type { REPLServer } from "./server.js";
import type {
  AsyncCompleter,
  Completer,
  PromiseCompleter,
  ReadableInput,
  WritableOutput,
} from "../readline/types.js";

/** The callback the evaluator reports through; `result` is present only on success. */
export type EvalCallback = (error: Error | null, result?: unknown) => void;

/**
 * A custom evaluator, as documented for `repl.start({ eval })`.
 *
 * `context` is always `globalThis` here: Jco supports only `useGlobal: true` (see the README).
 */
export type ReplEvalFunction = (
  code: string,
  context: object,
  file: string,
  callback: EvalCallback,
) => void;

/** What `writer` receives and returns. */
export type ReplWriterFunction = (value: unknown) => string;

/** A legacy `stream`/`socket` option, or the `process` object: something with both ends. */
export interface ReplDuplexLike {
  stdin?: ReadableInput;
  stdout?: WritableOutput;
}

/** The subset of Node's `process` the REPL reads when it is present as a global. */
export interface ProcessLike extends ReplDuplexLike {
  env?: Record<string, string | undefined>;
}

/** Node's `options.domain`, which the REPL binds evaluation through. */
export interface ReplDomainLike {
  on(event: "error", listener: (error: unknown) => void): unknown;
  emit(event: "error", error: unknown): boolean;
  bind<T extends (...args: never[]) => unknown>(fn: T): T;
  exit(): void;
}

export interface ReplOptions {
  prompt?: string;
  input?: ReadableInput;
  output?: WritableOutput;
  /** Legacy duplex stream option, replaced by `input`/`output`. */
  stream?: ReadableInput & WritableOutput & ReplDuplexLike;
  /** Legacy alias of `stream`. */
  socket?: ReadableInput & WritableOutput & ReplDuplexLike;
  terminal?: boolean;
  eval?: ReplEvalFunction;
  useColors?: boolean;
  useGlobal?: boolean;
  ignoreUndefined?: boolean;
  writer?: ReplWriterFunction;
  completer?: Completer | AsyncCompleter | PromiseCompleter;
  replMode?: symbol;
  breakEvalOnSigint?: boolean;
  preview?: boolean;
  historySize?: number;
  allowBlockingCompletions?: boolean;
  domain?: ReplDomainLike;
}

/** A REPL keyword command, as registered through `defineCommand`. */
export interface ReplCommand {
  help?: string;
  action: (this: REPLServer, rest: string) => void;
}

export type ReplCommandDefinition = ReplCommand | ((this: REPLServer, rest: string) => void);

export type HistoryLoadedCallback = (error: Error | null, repl: unknown) => void;

export interface ReplHistoryConfig {
  filePath?: string;
  size?: number;
  removeHistoryDuplicates?: boolean;
  onHistoryFileLoaded?: HistoryLoadedCallback;
}

/** `replServer.lines`: the evaluated lines, plus the nesting bookkeeping Node keeps on it. */
export interface ReplLines extends Array<string> {
  level: { line: number; depth: number }[];
}
