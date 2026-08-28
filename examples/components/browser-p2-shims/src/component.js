/**
 * Component operations exposed to the browser demo.
 *
 * ComponentizeJS connects console.log and console.error to WASI CLI stdout
 * and stderr. The embedding page decides what those streams actually do.
 */
export const cliDemo = {
    writeToStdout(message) {
        console.log(message);
    },

    writeToStderr(message) {
        console.error(message);
    },
};
