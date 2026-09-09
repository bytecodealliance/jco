// Drives a scripted REPL session through either Jco's `node:repl` port or Node's own module, the
// way upstream's tests do with `test/common/arraystream.js`, and normalizes the two engine-specific
// things in the output: stack frame lines and the trailing prompt left by an open session.
import { EventEmitter } from "node:events";
import nativeRepl from "node:repl";
import repl from "../../../../../../src/wasi/0.2.x/node/24.x.x/repl.js";

/** Upstream's ArrayStream: an emitter that looks enough like a duplex stream for the REPL. */
export class ArrayStream extends EventEmitter {
  readable = true;
  writable = true;
  text = "";
  isTTY?: boolean;
  columns?: number;
  rows?: number;
  isRaw?: boolean;
  pause(): this {
    return this;
  }
  resume(): this {
    return this;
  }
  setRawMode(mode: boolean): this {
    this.isRaw = mode;
    return this;
  }
  write(chunk: unknown): boolean {
    this.text += String(chunk);
    return true;
  }
  run(lines: readonly string[]): void {
    for (const line of lines) {
      this.emit("data", `${line}\n`);
    }
  }
}

/** The surface both REPL implementations expose that the sessions below read. */
export interface SessionRepl {
  on(event: string, listener: (...args: never[]) => unknown): unknown;
  once(event: string, listener: (...args: never[]) => unknown): unknown;
  close(): void;
  closed?: boolean;
  lines: string[];
  context: object;
  last: unknown;
  lastError: unknown;
  commands: Record<string, { help?: string; action: (rest: string) => void }>;
  line: string;
  cursor: number;
  history: string[];
  input: unknown;
  output: unknown;
  editorMode: boolean;
  terminal: boolean;
  useColors: boolean;
  write(data: string | null, key?: object): void;
  setPrompt(prompt: string): void;
  getPrompt(): string;
  displayPrompt(preserveCursor?: boolean): void;
  clearBufferedCommand(): void;
  defineCommand(keyword: string, cmd: unknown): void;
  setupHistory(config: unknown, cb?: unknown): void;
  complete(line: string, cb: (err: Error | null, result?: [string[], string]) => void): void;
}

export type ReplApi = {
  start(options: Record<string, unknown>): SessionRepl;
};

export const portable = repl as unknown as ReplApi;
export const native = nativeRepl as unknown as ReplApi;

export interface SessionOptions extends Record<string, unknown> {
  terminal?: boolean;
  prompt?: string;
}

export interface Session {
  repl: SessionRepl;
  input: ArrayStream;
  output: ArrayStream;
  events: string[];
  /** Everything written to `output`, with frames normalized. */
  text(): string;
  /** Let queued microtasks and timers run, so awaited lines settle. */
  settle(): Promise<void>;
  /** Close the session if it is still open and wait for `'exit'`. */
  finish(): Promise<string>;
}

export function normalizeFrames(text: string): string {
  return text
    .replace(/^\s+at .*\n?/gm, "    at <frame>\n")
    .replace(/^\S*@\S+:\d+:\d+\n?/gm, "    at <frame>\n");
}

export async function settle(): Promise<void> {
  for (let i = 0; i < 3; i++) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/** Start a REPL over array streams; `useGlobal: true` is what the port supports. */
export function open(api: ReplApi, options: SessionOptions = {}): Session {
  const input = new ArrayStream();
  const output = new ArrayStream();
  if (options.terminal) {
    output.isTTY = true;
    output.columns = 80;
    output.rows = 24;
  }
  const events: string[] = [];
  const instance = api.start({
    prompt: "> ",
    input,
    output,
    useGlobal: true,
    terminal: false,
    useColors: false,
    ...options,
  });
  for (const event of ["exit", "reset", "close", "SIGINT"]) {
    instance.on(event, () => events.push(event));
  }
  return {
    repl: instance,
    input,
    output,
    events,
    text: () => normalizeFrames(output.text),
    settle,
    async finish() {
      await settle();
      if (!instance.closed) {
        instance.close();
      }
      await settle();
      return normalizeFrames(output.text);
    },
  };
}

/** Run `lines` through a fresh REPL and return the normalized transcript. */
export async function transcript(
  api: ReplApi,
  lines: readonly string[],
  options: SessionOptions = {},
): Promise<string> {
  const session = open(api, options);
  session.input.run(lines);
  return session.finish();
}

/** Run the same lines through both implementations and return both transcripts. */
export async function both(
  lines: readonly string[],
  options: SessionOptions = {},
): Promise<{ actual: string; expected: string }> {
  const actual = await transcript(portable, lines, options);
  const expected = await transcript(native, lines, options);
  return { actual, expected };
}

export function errorCode(action: () => unknown): string | undefined {
  try {
    action();
  } catch (error) {
    return (error as { code?: string }).code;
  }
  return undefined;
}
