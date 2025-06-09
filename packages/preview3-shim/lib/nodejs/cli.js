import process from 'node:process';
import { Readable } from 'node:stream';

import { ResourceWorker } from './workers/resource-worker.js';
import { StreamReader } from './stream.js';

export {
    _appendEnv,
    _setEnv,
    _setArgs,
    _setCwd,
    _setTerminalStdin,
    _setTerminalStdout,
    _setTerminalStderr,
    environment,
    exit,
    terminalInput,
    terminalOutput,
    terminalStdin,
    terminalStdout,
    terminalStderr,
} from '@bytecodealliance/preview2-shim/cli';

let WORKER = null;
function worker() {
    return (WORKER ??= new ResourceWorker(
        new URL('./workers/cli-worker.js', import.meta.url)
    ));
}

export const stdin = {
    /**
     * Creates a StreamReader that reads from standard input.
     *
     * WIT:
     * ```
     * get-stdin: func() -> stream<u8>;
     * ```
     *
     * @returns {StreamReader} A reader for the process standard input.
     */
    getStdin() {
        const stream = Readable.toWeb(process.stdin);
        return new StreamReader(stream);
    },
};

export const stdout = {
    /**
     * Pipes the output of a StreamReader to standard output.
     *
     * WIT:
     * ```
     * set-stdout: func(data: stream<u8>);
     * ```
     *
     * @param {StreamReader} streamReader - The reader whose output will be written to stdout.
     */
    setStdout(streamReader) {
        const stream = streamReader.intoReadableStream();
        worker().run({ op: 'stdout', stream }, [stream]);
    },
};

export const stderr = {
    /**
     * Pipes the output of a StreamReader to standard error.
     *
     * WIT:
     * ```
     * set-stderr: func(data: stream<u8>);
     * ```
     *
     * @param {StreamReader} streamReader - The reader whose output will be written to stderr.
     */
    setStdout(streamReader) {
        const stream = streamReader.intoReadableStream();
        worker().run({ op: 'stderr', stream }, [stream]);
    },
};
