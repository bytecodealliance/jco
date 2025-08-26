import { streams } from './io.js';
const { InputStream, OutputStream } = streams;

export { _setEnv, _setArgs, environment } from './environment.js';
export { _setCwd } from './config.js';

const symbolDispose = Symbol.dispose ?? Symbol.for('dispose');

class ComponentExit extends Error {
    constructor(code) {
        super(`Component exited ${code === 0 ? 'successfully' : 'with error'}`);
        this.exitError = true;
        this.code = code;
    }
}

export const exit = {
    exit(status) {
        throw new ComponentExit(status.tag === 'err' ? 1 : 0);
    },
    exitWithCode(code) {
        throw new ComponentExit(code);
    },
};

/**
 * @param {import('../common/io.js').InputStreamHandler} handler
 */
export function _setStdin(handler) {
    stdinStream.handler = handler;
}
/**
 * @param {import('../common/io.js').OutputStreamHandler} handler
 */
export function _setStderr(handler) {
    stderrStream.handler = handler;
}
/**
 * @param {import('../common/io.js').OutputStreamHandler} handler
 */
export function _setStdout(handler) {
    stdoutStream.handler = handler;
}

const stdinStream = new InputStream({
    blockingRead(_len) {
        // TODO
    },
    subscribe() {
        // TODO
    },
    [symbolDispose]() {
        // TODO
    },
});
let textDecoder = new TextDecoder();
const stdoutStream = new OutputStream({
    write(contents) {
        if (contents[contents.length - 1] == 10) {
            // console.log already appends a new line
            contents = contents.subarray(0, contents.length - 1);
        }
        console.log(textDecoder.decode(contents));
    },
    blockingFlush() {},
    [symbolDispose]() {},
});
const stderrStream = new OutputStream({
    write(contents) {
        if (contents[contents.length - 1] == 10) {
            // console.error already appends a new line
            contents = contents.subarray(0, contents.length - 1);
        }
        console.error(textDecoder.decode(contents));
    },
    blockingFlush() {},
    [symbolDispose]() {},
});

export const stdin = {
    InputStream,
    getStdin() {
        return stdinStream;
    },
};

export const stdout = {
    OutputStream,
    getStdout() {
        return stdoutStream;
    },
};

export const stderr = {
    OutputStream,
    getStderr() {
        return stderrStream;
    },
};

class TerminalInput {}
class TerminalOutput {}

const terminalStdoutInstance = new TerminalOutput();
const terminalStderrInstance = new TerminalOutput();
const terminalStdinInstance = new TerminalInput();

export const terminalInput = {
    TerminalInput,
};

export const terminalOutput = {
    TerminalOutput,
};

export const terminalStderr = {
    TerminalOutput,
    getTerminalStderr() {
        return terminalStderrInstance;
    },
};

export const terminalStdin = {
    TerminalInput,
    getTerminalStdin() {
        return terminalStdinInstance;
    },
};

export const terminalStdout = {
    TerminalOutput,
    getTerminalStdout() {
        return terminalStdoutInstance;
    },
};
