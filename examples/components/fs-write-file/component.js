// For more information on how to use WASI filesystem interfaces
//
// see: https://github.com/WebAssembly/WASI/tree/main/proposals/filesystem/wit
import { getDirectories } from "wasi:filesystem/preopens@0.2.8";

// This text encoder will be created at compile & JS VM snapshot time,
// it will not be re-created on every call of the `run` export.
const TEXT_ENCODER = new TextEncoder();

const FILENAME = "output.txt";

export const test = {
    run() {
        const preopens = getDirectories();
        if (preopens.length === 0) { throw "ERROR: no preopens"; }

        // We expect that we have at least one preopen, and take the first one,
        // in which we will write the output file
        const dirDescriptor = preopens[0][0];

        // NOTE: fs operations (open, write, sync) will throw if they fail
        const f = dirDescriptor.openAt(
            {symlinkFollow: false},
            FILENAME,
            { create: true },
            { write: true },
        );

        f.write(TEXT_ENCODER.encode("Hello world, from component!"), 0);

        f.sync();

        return "SUCCESS: wrote file";
    }
};
