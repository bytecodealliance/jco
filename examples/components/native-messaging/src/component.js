import { getStdin } from 'wasi:cli/stdin@0.2.12';
import { getStdout } from 'wasi:cli/stdout@0.2.12';

import { readMessage, writeMessage } from './utils.js';

export const run = {
    run() {
        const input = getStdin();
        const output = getStdout();

        for (let message = readMessage(input); message !== null; message = readMessage(input)) {
            writeMessage(output, message);
        }
    },
};
