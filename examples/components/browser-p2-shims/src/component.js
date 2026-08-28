/**
 * Component operations exposed to the browser demo.
 *
 * Call path from this interface to the browser:
 *
 * 1. This code calls console.log(message) or console.error(message).
 * 2. ComponentizeJS lowers the call to a write on the output stream returned by
 *    wasi:cli/stdout.get-stdout or wasi:cli/stderr.get-stderr. The stream is a
 *    wasi:io/streams.output-stream resource.
 * 3. The Jco-generated wrapper routes those WASI imports through the object
 *    returned by WASIShim.getImportObject().
 * 4. The browser host handles the bytes. By default stdout calls console.log;
 *    the demo's customized stderr handler writes them to the page instead.
 */
export const cliDemo = {
    writeToStdout(message) {
        console.log(message);
    },

    writeToStderr(message) {
        console.error(message);
    },
};
