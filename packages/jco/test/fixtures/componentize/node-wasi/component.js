import wasi, { WASI } from "node:wasi";

function failure(fn) {
    try {
        fn();
        return null;
    } catch (error) {
        if (typeof error !== "object" || error === null) {
            return { thrown: typeof error };
        }
        return {
            name: error.name,
            code: error.code,
            message: error.message,
            errno: error.errno,
            syscall: error.syscall,
            keys: Object.keys(error),
            typeError: error instanceof TypeError,
            rangeError: error instanceof RangeError,
        };
    }
}

export function run(mode, sandbox) {
    const report = {
        identity: wasi.WASI === WASI,
        keys: Object.keys(wasi),
        // Neither guest engine can instantiate a nested module; the shim's refusal names that.
        webAssembly: typeof WebAssembly,
        // Option validation is Node's and never consults the host.
        badVersion: failure(() => new WASI({ version: "preview2" })),
        badStdin: failure(() => new WASI({ version: "preview1", stdin: -1 })),
    };
    if (mode === "denied") {
        report.denied = failure(() => new WASI({ version: "preview1" }));
        return JSON.stringify(report);
    }

    const instance = new WASI({
        version: "preview1",
        args: ["app", 1],
        env: { KEEP: "1", DROP: undefined },
        preopens: { "/sandbox": sandbox },
    });
    report.importObject = Object.keys(instance.getImportObject());
    report.sameTable = instance.getImportObject().wasi_snapshot_preview1 === instance.wasiImport;
    report.syscalls = Object.keys(instance.wasiImport).length;
    report.procExit = [instance.wasiImport.proc_exit.name, instance.wasiImport.proc_exit.length];
    report.fdWrite = [instance.wasiImport.fd_write.name, instance.wasiImport.fd_write.length];
    report.notStarted = failure(() => instance.wasiImport.fd_write(1, 0, 0, 0));
    report.einval = instance.wasiImport.fd_write(1);
    report.exitCode = failure(() => instance.wasiImport.proc_exit(3));
    report.startShape = failure(() => instance.start({}));
    report.start = failure(() => instance.start({ exports: {} }));
    report.initialize = failure(() => instance.initialize({ exports: { memory: {} } }));
    report.unstable = Object.keys(new WASI({ version: "unstable" }).getImportObject());
    // uvwasi_init's own failures come back with Node's fields.
    report.missingPreopen = failure(() => new WASI({ version: "preview1", preopens: { "/x": `${sandbox}/missing` } }));
    report.filePreopen = failure(() => new WASI({ version: "preview1", preopens: { "/x": `${sandbox}/file` } }));
    report.badFd = failure(() => new WASI({ version: "preview1", stdin: 12345 }));
    report.lateReturnOnExit = failure(
        () => new WASI({ version: "preview1", returnOnExit: 1, preopens: { "/x": `${sandbox}/missing` } }),
    );
    return JSON.stringify(report);
}
