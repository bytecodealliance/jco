// @ts-check
/**
 * A scripted terminal provider for `jco:node/tty@0.1.0`: descriptors 0-2 are a terminal of a
 * fixed size, reads deliver the scripted chunks, and everything written is captured.
 *
 * @param {{ input?: string[]; columns?: number; rows?: number }} [options]
 */
export function createTtyHost({ input = [], columns = 100, rows = 30 } = {}) {
    const pending = [...input];
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const state = { output: "", raw: /** @type {boolean[]} */ ([]), calls: /** @type {string[]} */ ([]) };
    const notATerminal = () => {
        throw {
            name: "SystemError",
            message: "TTY initialization failed: uv_tty_init returned EINVAL (invalid argument)",
            code: "ERR_TTY_INIT_FAILED",
            errno: { tag: "number", val: -22n },
            syscall: "uv_tty_init",
            info: {
                errno: { tag: "number", val: -22n },
                code: "EINVAL",
                message: "invalid argument",
                syscall: "uv_tty_init",
            },
        };
    };
    /** @satisfies {import("@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/tty").TtyProvider} */
    const host = {
        isTty(fd) {
            state.calls.push(`isTty ${fd}`);
            return fd <= 2;
        },
        open(fd, direction) {
            state.calls.push(`open ${fd} ${direction}`);
            if (fd > 2) {
                notATerminal();
            }
        },
        close(fd, direction) {
            state.calls.push(`close ${fd} ${direction}`);
        },
        windowSize(fd) {
            state.calls.push(`windowSize ${fd}`);
            return { columns, rows };
        },
        setRawMode(fd, enabled) {
            state.calls.push(`setRawMode ${fd} ${enabled}`);
            state.raw.push(enabled);
        },
        read(fd, maxBytes) {
            state.calls.push(`read ${fd} ${maxBytes}`);
            const chunk = pending.shift();
            return chunk === undefined ? new Uint8Array(0) : encoder.encode(chunk);
        },
        write(fd, data) {
            state.calls.push(`write ${fd} ${data.byteLength}`);
            state.output += decoder.decode(data);
        },
        environment() {
            state.calls.push("environment");
            return [["TERM", "xterm-256color"]];
        },
    };
    return { host, state };
}
