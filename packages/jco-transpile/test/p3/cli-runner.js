import process, { argv } from 'node:process';

import { _setPreopens as _setP3Preopens } from '@bytecodealliance/preview3-shim/filesystem';
import { _forbiddenHeaders } from '@bytecodealliance/preview3-shim/http';
import { _setPreopens as _setP2Preopens } from '@bytecodealliance/preview2-shim/filesystem';
import { _setArgs as _setP2Args, _setCwd as _setP2Cwd } from '@bytecodealliance/preview2-shim/cli';

import {
    _setArgs as _setP3Args,
    _setCwd as _setP3Cwd,
    _setTerminalStdin,
    _setTerminalStdout,
    _setTerminalStderr,
} from '@bytecodealliance/preview3-shim/cli';

const WASI_CLI_RUN_EXPORT = 'wasi:cli/run@0.3.0';

function reportUnhandled(error) {
    console.error(error?.stack ?? error);
    // A detected deadlock says only that the event loop stopped. What was waiting is
    // attached to the error, and this is the last chance to print it: the run ends here,
    // and on CI the captured output is all anyone gets.
    if (error?.deadlockDetail) {
        console.error(`deadlock detail: ${JSON.stringify(error.deadlockDetail, null, 2)}`);
    }
    process.exit(1);
}

process.once('uncaughtException', reportUnhandled);
process.once('unhandledRejection', reportUnhandled);

const [, , esModuleHref, preopenDir, argsJson] = argv;
if (!esModuleHref || !preopenDir || !argsJson) {
    throw new Error('usage: cli-runner.mjs <esModuleHref> <preopenDir> <argsJson>');
}

const args = JSON.parse(argsJson);
_setP2Args(args);
_setP3Args(args);
_setP2Cwd(null);
_setP3Cwd(null);
_setTerminalStdin(null);
_setTerminalStdout(null);
_setTerminalStderr(null);
_setP3Preopens({ '/': preopenDir });
_setP2Preopens({ '/': preopenDir });
_forbiddenHeaders.value.add('custom-forbidden-header');

try {
    const esModule = await import(esModuleHref);
    if (esModule.$init) {
        await esModule.$init;
    }

    const runIface = esModule[WASI_CLI_RUN_EXPORT] ?? esModule.run;
    if (typeof runIface !== 'object' || runIface === null || typeof runIface.run !== 'function') {
        throw new Error(`${WASI_CLI_RUN_EXPORT}.run export missing`);
    }

    const result = await runIface.run();
    if (result !== undefined) {
        throw new Error(`unexpected run result: ${JSON.stringify(result)}`);
    }
} catch (error) {
    console.error(error?.stack ?? error);
    process.exitCode = 1;
}
