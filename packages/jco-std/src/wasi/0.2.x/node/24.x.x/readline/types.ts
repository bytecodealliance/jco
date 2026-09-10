// Signatures follow the MIT-licensed @types/node 24.13.3 readline declarations.
// Structural stream contracts are local and do not require @types/node in consumers.
/** Structural stream contracts: callers may supply Node streams or portable event emitters. */
export type Listener = (...args: never[]) => unknown;

export interface Emitter {
  on(event: string | symbol, listener: Listener): this;

  once(event: string | symbol, listener: Listener): this;

  addListener(event: string | symbol, listener: Listener): this;

  off(event: string | symbol, listener: Listener): this;

  removeListener(event: string | symbol, listener: Listener): this;

  removeAllListeners(event?: string | symbol): this;

  prependListener(event: string | symbol, listener: Listener): this;

  prependOnceListener(event: string | symbol, listener: Listener): this;

  emit(event: string | symbol, ...args: unknown[]): boolean;

  listenerCount(event: string | symbol, listener?: Listener): number;

  listeners(event: string | symbol): Listener[];

  rawListeners(event: string | symbol): Listener[];

  eventNames(): (string | symbol)[];

  setMaxListeners(n: number): this;

  getMaxListeners(): number;
}

export interface ReadableInput {
  on(event: string | symbol, listener: Listener): this;

  removeListener(event: string | symbol, listener: Listener): this;

  emit(event: string | symbol, ...args: unknown[]): boolean;

  listenerCount(event: string | symbol): number;

  resume(): this;

  pause(): this;

  isRaw?: boolean;

  setRawMode?(mode: boolean): this;
}

export type WriteCallback = (error?: Error | null) => void;

export interface WritableOutput {
  write(data: string, callback?: WriteCallback): boolean;

  on?(event: string, listener: Listener): this;

  removeListener?(event: string, listener: Listener): this;

  isTTY?: boolean;
  columns?: number;
  writable?: boolean;
}

export interface Key {
  sequence?: string;
  name?: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  code?: string;
}

export type CompleterResult = [completions: string[], matched: string];

export type Completer = (line: string) => CompleterResult;

export type AsyncCompleter = (
  line: string,
  callback: (err?: Error | null, result?: CompleterResult) => void,
) => void;

export type PromiseCompleter = (line: string) => CompleterResult | Promise<CompleterResult>;

export interface InterfaceOptions {
  input: ReadableInput;
  output?: WritableOutput | null;
  completer?: Completer | AsyncCompleter | PromiseCompleter;
  terminal?: boolean;
  history?: string[];
  historySize?: number;
  removeHistoryDuplicates?: boolean;
  prompt?: string;
  crlfDelay?: number;
  escapeCodeTimeout?: number;
  tabSize?: number;
  signal?: AbortSignal;
}

export interface QuestionOptions {
  signal?: AbortSignal;
}

export interface CursorPosition {
  rows: number;
  cols: number;
}
