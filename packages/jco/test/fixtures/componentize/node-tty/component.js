import tty, { ReadStream, WriteStream, isatty } from "node:tty";
import { createInterface } from "node:readline";

/** A descriptor no process has open, so it is never a terminal. */
const CLOSED_FD = 4096;

function failure(fn) {
    try {
        fn();
        return null;
    } catch (error) {
        return {
            name: error.name,
            code: error.code,
            message: error.message,
            errno: error.errno,
            syscall: error.syscall,
            info: error.info ?? null,
            rangeError: error instanceof RangeError,
        };
    }
}

function chain(value) {
    const names = [];
    for (
        let proto = Object.getPrototypeOf(value);
        proto && proto !== Object.prototype;
        proto = Object.getPrototypeOf(proto)
    ) {
        names.push(proto.constructor.name);
    }
    return names;
}

export function run(mode) {
    const report = {
        identity: tty.isatty === isatty && tty.ReadStream === ReadStream && tty.WriteStream === WriteStream,
        // Out-of-range descriptors are rejected in the guest without consulting the host.
        outOfRange: [-1, 1.5, "1", 2147483648, null].map((fd) => isatty(fd)),
        invalidFd: failure(() => new WriteStream(-1)),
    };
    if (mode === "denied") {
        report.denied = [
            failure(() => isatty(1)),
            failure(() => new ReadStream(0)),
            failure(() => new WriteStream(1)),
            failure(() => WriteStream.prototype.getColorDepth.call(undefined)),
        ].map((error) => error?.code);
        return JSON.stringify(report);
    }
    report.isatty = [0, 1, 2, CLOSED_FD].map((fd) => isatty(fd));
    report.notATerminal = failure(() => new WriteStream(CLOSED_FD));
    if (!isatty(1)) {
        // Without a terminal the constructors fail the way Node's do on the same descriptor.
        report.init = failure(() => new WriteStream(1));
        return JSON.stringify(report);
    }

    const output = new WriteStream(1);
    const input = new ReadStream(0);
    report.size = output.getWindowSize();
    report.isTTY = [input.isTTY, output.isTTY, input.isRaw];
    report.depth = output.getColorDepth({ TERM: "xterm-256color" });
    report.hasColors = [
        output.hasColors(16, { TERM: "xterm" }),
        output.hasColors(256, { TERM: "xterm" }),
        output.hasColors({ COLORTERM: "truecolor" }),
    ];
    report.chain = chain(output);
    const events = [];
    output.on("resize", () => events.push("resize"));
    output._refreshSize();
    output.cursorTo(0);
    output.clearLine(0);
    output.write("Hello ");

    const rl = createInterface({ input, output });
    report.terminal = rl.terminal;
    report.rawDuringQuestion = input.isRaw;
    rl.question("Name? ", (answer) => {
        report.answer = answer;
        rl.close();
        report.rawAfter = input.isRaw;
    });
    // A synchronous export cannot wait for the stream scheduler to start flowing, so pull the
    // terminal directly: each read blocks until input arrives and emits 'data' before returning.
    while (report.answer === undefined && input.read() !== null) {
        // keep pulling
    }
    report.events = events;
    output.write(`REPORT ${JSON.stringify(report)}\n`);
    // Wait for the runner's acknowledgement before releasing the terminal, so nothing written
    // above is lost when a pseudo-terminal's last slave descriptor closes.
    input.read();
    input.destroy();
    output.destroy();
    return JSON.stringify(report);
}
