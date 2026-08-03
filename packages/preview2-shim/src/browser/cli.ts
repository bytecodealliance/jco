import type {
    environment as EnvironmentNamespace,
    exit as ExitNamespace,
    stderr as StderrNamespace,
    stdin as StdinNamespace,
    stdout as StdoutNamespace,
    terminalInput as TerminalInputNamespace,
    terminalOutput as TerminalOutputNamespace,
    terminalStderr as TerminalStderrNamespace,
    terminalStdin as TerminalStdinNamespace,
    terminalStdout as TerminalStdoutNamespace,
} from "../../types/cli.js";
import {
    inputStreamCreate,
    outputStreamCreate,
    pollableCreate,
    type InputStreamHandler,
    type OutputStreamHandler,
} from "./io.js";
export { _setEnv, _setArgs, environment } from "./environment.js";
export { _setCwd } from "./config.js";

const symbolDispose = Symbol.dispose ?? Symbol.for("dispose");
class ComponentExit extends Error {
    exitError = true;
    code: number;

    constructor(code: number) {
        super(`Component exited ${code === 0 ? "successfully" : "with error"}`);
        this.code = code;
    }
}

export const exit: typeof ExitNamespace = {
    exit(status: ExitNamespace.Result<void, void>): never {
        throw new ComponentExit(status.tag === "err" ? 1 : 0);
    },
    // @ts-expect-error - Available only wasi-cli v0.2.12
    exitWithCode(code: number): never {
        throw new ComponentExit(code);
    },
};

export function _setStdin(handler: InputStreamHandler): void {
    stdinStream.handler = handler;
}

export function _setStderr(handler: OutputStreamHandler): void {
    stderrStream.handler = handler;
}

export function _setStdout(handler: OutputStreamHandler): void {
    stdoutStream.handler = handler;
}

export interface BrowserCliConfig {
    environment?: Record<string, string>;
    arguments?: string[];
    initialCwd?: string;
    stdin?: InputStreamHandler;
    stdout?: OutputStreamHandler;
    stderr?: OutputStreamHandler;
}

const stdinStream = inputStreamCreate({
    blockingRead() {
        throw { tag: "closed" };
    },
    subscribe() {
        return pollableCreate();
    },
    [symbolDispose]() {},
});

function consoleStream(writeLine: (line: string) => void): OutputStreamHandler {
    const decoder = new TextDecoder();
    let pending = "";

    const emitCompleteLines = () => {
        const lines = pending.split("\n");
        pending = lines.pop()!;
        for (const line of lines) {
            writeLine(line.endsWith("\r") ? line.slice(0, -1) : line);
        }
    };

    return {
        write(contents: Uint8Array) {
            pending += decoder.decode(contents, { stream: true });
            emitCompleteLines();
        },
        flush() {
            pending += decoder.decode();
            if (pending) {
                writeLine(pending);
            }
            pending = "";
        },
        blockingFlush() {
            this.flush?.();
        },
        drop() {
            this.flush?.();
        },
    };
}

const stdoutStream = outputStreamCreate(consoleStream((line) => console.log(line)));

const stderrStream = outputStreamCreate(consoleStream((line) => console.error(line)));

export const stdin: typeof StdinNamespace = {
    getStdin() {
        return stdinStream;
    },
};

export const stdout: typeof StdoutNamespace = {
    getStdout() {
        return stdoutStream;
    },
};

export const stderr: typeof StderrNamespace = {
    getStderr() {
        return stderrStream;
    },
};

class TerminalInput implements TerminalInputNamespace.TerminalInput {}
class TerminalOutput implements TerminalOutputNamespace.TerminalOutput {}

export const terminalInput: typeof TerminalInputNamespace = {
    TerminalInput,
};

export const terminalOutput: typeof TerminalOutputNamespace = {
    TerminalOutput,
};

export const terminalStderr: typeof TerminalStderrNamespace = {
    getTerminalStderr() {
        return undefined;
    },
};

export const terminalStdin: typeof TerminalStdinNamespace = {
    getTerminalStdin() {
        return undefined;
    },
};

export const terminalStdout: typeof TerminalStdoutNamespace = {
    getTerminalStdout() {
        return undefined;
    },
};

/** Create isolated browser CLI interfaces without changing compatibility globals. */
export function createCli(config: BrowserCliConfig = {}): {
    environment: typeof EnvironmentNamespace;
    exit: typeof ExitNamespace;
    stdin: typeof StdinNamespace;
    stdout: typeof StdoutNamespace;
    stderr: typeof StderrNamespace;
    terminalInput: typeof TerminalInputNamespace;
    terminalOutput: typeof TerminalOutputNamespace;
    terminalStdin: typeof TerminalStdinNamespace;
    terminalStdout: typeof TerminalStdoutNamespace;
    terminalStderr: typeof TerminalStderrNamespace;
} {
    const stdinInstance = inputStreamCreate(
        config.stdin ?? {
            blockingRead() {
                throw { tag: "closed" };
            },
            subscribe: () => pollableCreate(),
        },
    );
    const stdoutInstance = outputStreamCreate(
        config.stdout ?? consoleStream((line) => console.log(line)),
    );
    const stderrInstance = outputStreamCreate(
        config.stderr ?? consoleStream((line) => console.error(line)),
    );
    const env = Object.entries(config.environment ?? {});
    const args = [...(config.arguments ?? [])];
    const cwd = config.initialCwd ?? "/";

    return {
        environment: {
            getEnvironment: () => env.map(([key, value]) => [key, value] as [string, string]),
            getArguments: () => [...args],
            initialCwd: () => cwd,
        },
        exit,
        stdin: { getStdin: () => stdinInstance },
        stdout: { getStdout: () => stdoutInstance },
        stderr: { getStderr: () => stderrInstance },
        terminalInput,
        terminalOutput,
        terminalStdin,
        terminalStdout,
        terminalStderr,
    };
}
