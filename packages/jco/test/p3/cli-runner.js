import { argv } from "node:process";

import { _setPreopens as _setP3Preopens } from "@bytecodealliance/preview3-shim/filesystem";
import { _setPreopens as _setP2Preopens } from "@bytecodealliance/preview2-shim/filesystem";

import {
    _setArgs,
    _setCwd,
    _setTerminalStdin,
    _setTerminalStdout,
    _setTerminalStderr,
} from "@bytecodealliance/preview3-shim/cli";

const WASI_CLI_RUN_EXPORT = "wasi:cli/run@0.3.0";

const [, , esModuleHref, preopenDir, argsJson] = argv;
if (!esModuleHref || !preopenDir || !argsJson) {
    throw new Error("usage: cli-runner.mjs <esModuleHref> <preopenDir> <argsJson>");
}

_setArgs(JSON.parse(argsJson));
_setCwd(null);
_setTerminalStdin(null);
_setTerminalStdout(null);
_setTerminalStderr(null);
_setP3Preopens({ "/": preopenDir });
_setP2Preopens({ "/": preopenDir });

const esModule = await import(esModuleHref);
if (esModule.$init) {
    await esModule.$init;
}

const runIface = esModule[WASI_CLI_RUN_EXPORT] ?? esModule.run;
if (typeof runIface !== "object" || runIface === null || typeof runIface.run !== "function") {
    throw new Error(`${WASI_CLI_RUN_EXPORT}.run export missing`);
}

const result = await runIface.run();
if (result !== undefined) {
    throw new Error(`unexpected run result: ${JSON.stringify(result)}`);
}
