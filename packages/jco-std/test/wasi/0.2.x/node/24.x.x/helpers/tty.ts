import type {
  TtyDirection,
  TtyError,
  TtyProvider,
  TtyWindowSize,
} from "../../../../../../src/wasi/0.2.x/node/24.x.x/tty/types.js";

/** Node's own `ERR_TTY_INIT_FAILED` for a descriptor that is not a terminal, as a WIT record. */
export const NOT_A_TERMINAL: TtyError = {
  name: "SystemError",
  message: "TTY initialization failed: uv_tty_init returned EINVAL (invalid argument)",
  code: "ERR_TTY_INIT_FAILED",
  errno: { tag: "number", val: -22n },
  syscall: "uv_tty_init",
  info: {
    errno: { tag: "number", val: -22n },
    code: "EINVAL",
    message: "invalid argument",
    syscall: "uv_tty_init",
  },
};

export interface FakeTerminalOptions {
  /** Descriptors that are terminals; everything else fails to open. Default: 0, 1 and 2. */
  terminals?: number[];
  /** The reported size, a function returning it, or `null` for a terminal without one. */
  size?: TtyWindowSize | (() => TtyWindowSize) | null;
  /** Chunks delivered by successive reads; exhausted input is the end of input. */
  input?: Array<string | Uint8Array>;
  environment?: Record<string, string>;
  /** Thrown by every `setRawMode`. */
  rawModeFailure?: TtyError;
  /** Thrown by every `read`. */
  readFailure?: TtyError;
  /** Thrown by every `write`. */
  writeFailure?: TtyError;
}

export interface FakeTerminal {
  host: TtyProvider;
  /** Every provider call, in order, as `name(args)`. */
  calls: string[];
  /** Everything written, decoded as UTF-8. */
  output: string;
  /** Raw mode per descriptor, as last set. */
  raw: Map<number, boolean>;
  /** Open handles per `direction:fd`, with acquisition counts. */
  handles: Map<string, number>;
}

/** A scripted terminal provider that records what the guest asked of it. */
export function fakeTerminal(options: FakeTerminalOptions = {}): FakeTerminal {
  const terminals = new Set(options.terminals ?? [0, 1, 2]);
  const input = [...(options.input ?? [])];
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const calls: string[] = [];
  const raw = new Map<number, boolean>();
  const handles = new Map<string, number>();
  const terminal: FakeTerminal = {
    calls,
    output: "",
    raw,
    handles,
    host: {
      isTty(fd) {
        calls.push(`isTty(${fd})`);
        return terminals.has(fd);
      },
      open(fd, direction: TtyDirection) {
        calls.push(`open(${fd}, ${direction})`);
        if (!terminals.has(fd)) {
          throw NOT_A_TERMINAL;
        }
        const key = `${direction}:${fd}`;
        handles.set(key, (handles.get(key) ?? 0) + 1);
      },
      close(fd, direction) {
        calls.push(`close(${fd}, ${direction})`);
        const key = `${direction}:${fd}`;
        const count = (handles.get(key) ?? 0) - 1;
        if (count > 0) {
          handles.set(key, count);
        } else {
          handles.delete(key);
        }
      },
      windowSize(fd) {
        calls.push(`windowSize(${fd})`);
        const size = typeof options.size === "function" ? options.size() : options.size;
        if (size === null) {
          throw {
            name: "Error",
            message: "getWindowSize ENOTSUP: the terminal reports no size",
            code: "ENOTSUP",
            syscall: "getWindowSize",
          } satisfies TtyError;
        }
        return size ?? { columns: 80, rows: 24 };
      },
      setRawMode(fd, enabled) {
        calls.push(`setRawMode(${fd}, ${enabled})`);
        if (options.rawModeFailure) {
          throw options.rawModeFailure;
        }
        raw.set(fd, enabled);
      },
      read(fd, maxBytes) {
        calls.push(`read(${fd}, ${maxBytes})`);
        if (options.readFailure) {
          throw options.readFailure;
        }
        const chunk = input.shift();
        if (chunk === undefined) {
          return new Uint8Array(0);
        }
        return typeof chunk === "string" ? encoder.encode(chunk) : chunk;
      },
      write(fd, data) {
        calls.push(`write(${fd}, ${data.byteLength})`);
        if (options.writeFailure) {
          throw options.writeFailure;
        }
        terminal.output += decoder.decode(data);
      },
      environment() {
        calls.push("environment()");
        return Object.entries(options.environment ?? {});
      },
    },
  };
  return terminal;
}

export function errorOf(fn: () => unknown): Error & Record<string, unknown> {
  try {
    fn();
  } catch (error) {
    if (error instanceof Error) {
      return error as Error & Record<string, unknown>;
    }
    throw new Error(`Expected an Error, got ${String(error)}`);
  }
  throw new Error("Expected operation to fail");
}

export function nextTick(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}
