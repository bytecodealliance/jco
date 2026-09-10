import repl, { REPLServer, Recoverable, start, isValidSyntax } from "node:repl";
import { Interface } from "node:readline";
import { EventEmitter } from "node:events";

// The application supplies streams; no host or node:process capability is needed.
class ArrayStream extends EventEmitter {
    text = "";
    resume() {
        return this;
    }
    pause() {
        return this;
    }
    write(chunk) {
        this.text += String(chunk);
        return true;
    }
    run(lines) {
        for (const line of lines) {
            this.emit("data", `${line}\n`);
        }
    }
}

function settle() {
    return Promise.resolve()
        .then(() => Promise.resolve())
        .then(() => Promise.resolve());
}

export async function run() {
    const report = {};
    report.moduleIdentity = repl.start === start && repl.REPLServer === REPLServer && repl.Recoverable === Recoverable;
    report.prototype = Object.getPrototypeOf(REPLServer.prototype) === Interface.prototype;
    report.builtinModules = repl.builtinModules.includes("fs") && !repl.builtinModules.some((m) => m.startsWith("_"));
    report.validSyntax = [isValidSyntax("{ a: 1 }"), isValidSyntax("function (")];

    const input = new ArrayStream();
    const output = new ArrayStream();
    const server = start({ prompt: "> ", input, output, useGlobal: true, terminal: false, useColors: false });
    const events = [];
    server.on("exit", () => events.push("exit"));
    server.context.injected = "from the host program";
    server.defineCommand("shout", {
        help: "Shout the rest",
        action(rest) {
            this.output.write(`${rest.toUpperCase()}\n`);
            this.displayPrompt();
        },
    });
    input.run([
        "1 + 1",
        "let replLet = 40",
        "replLet + 2",
        "function replFn(a,",
        "                b) {",
        "  return a * b",
        "}",
        "replFn(6, 7)",
        "{ a: 1, b: 'two' }",
        "injected",
        "_",
        "throw new Error('boom')",
        "_error.message",
        "foo bar",
        ".shout hello there",
        "const replAwaited = await Promise.resolve('awaited')",
    ]);
    await settle();
    await settle();
    input.run(["replAwaited", ".help", ".exit"]);
    await settle();
    report.closed = server.closed === true;
    report.events = events;
    report.lines = server.lines.length;
    report.output = output.text.replace(/^\s+at .*\n?/gm, "").replace(/^\S*@\S+:\d+:\d+\n?/gm, "");

    // The refusal for Node's default context mode fails fast, before any stream is touched.
    const untouched = new ArrayStream();
    let listeners = 0;
    untouched.on("newListener", () => listeners++);
    try {
        start({ input: untouched, output: untouched });
        report.refusal = "no error";
    } catch (error) {
        report.refusal = [error.code, listeners, untouched.text];
    }
    try {
        REPLServer({ input: untouched, output: untouched, useGlobal: true });
        report.deprecated = "no error";
    } catch (error) {
        report.deprecated = error.code;
    }
    return JSON.stringify(report);
}
