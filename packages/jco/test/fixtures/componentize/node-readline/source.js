import readline, { Interface, createInterface, emitKeypressEvents } from "node:readline";
import promises, * as readlinePromises from "node:readline/promises";
import { EventEmitter } from "node:events";
import { Buffer } from "node:buffer";
import { Input, Output, suppliedCancellation } from "./streams.js";

export async function run() {
    const report = {};
    const input = new Input(),
        output = new Output();
    // Same question/answer/close flow as the Node documentation's simple example.
    const rl = readlinePromises.createInterface({ input, output });
    const answerPromise = rl.question("What do you think of Node.js? ");
    input.emit("data", "Useful!\n");
    const answer = await answerPromise;
    output.write(`Thank you for your valuable feedback: ${answer}\n`);
    rl.close();
    report.simple = output.text;
    report.moduleIdentity =
        readline.Interface === Interface &&
        readline.promises === promises &&
        promises.Interface === readlinePromises.Interface;
    report.eventIdentity = rl instanceof EventEmitter;

    const callbackInput = new Input();
    const callback = createInterface({ input: callbackInput });
    const lines = [];
    callback.on("line", (line) => lines.push(line));
    callback.question("Callback?", (answer) => {
        report.callbackAnswer = answer;
    });
    callbackInput.emit("data", "yes\r");
    callbackInput.emit("data", "\n");
    const bytes = Buffer.from("A🌍\r\n\nnext\rlast\u2028para\u2029tail");
    for (const byte of bytes) {
        callbackInput.emit("data", Buffer.from([byte]));
    }
    callbackInput.emit("end");
    report.lines = lines;
    report.cleanup = callbackInput.listenerCount("data") === 0 && callbackInput.listenerCount("error") === 0;

    const terminalInput = new Input();
    terminalInput.setRawMode = function (raw) {
        this.isRaw = raw;
        return this;
    };
    const terminalOutput = new Output();
    const terminal = createInterface({ input: terminalInput, output: terminalOutput, terminal: true, historySize: 2 });
    terminal.write("ab🌍c");
    terminal.write(null, { name: "left" });
    terminal.write(null, { name: "backspace" });
    terminal.write("X");
    report.editedLine = terminal.line;
    report.cursor = terminal.getCursorPos();
    terminal.write(null, { name: "return" });
    terminal.write(null, { name: "up" });
    report.history = [...terminal.history];
    report.recalled = terminal.line;
    terminal.close();
    report.rawReleased = terminalInput.isRaw === false;

    const completing = createInterface({
        input: new Input(),
        output: new Output(),
        terminal: true,
        completer: (line) => [["hello", "help"], line],
    });
    completing.write("he");
    completing.write(null, { name: "tab" });
    report.completion = completing.line;
    completing.close();
    const asyncCompleting = promises.createInterface({
        input: new Input(),
        output: new Output(),
        terminal: true,
        completer: async (line) => [["world", "work"], line],
    });
    asyncCompleting.write("wo");
    const resumed = new Promise((resolve) => asyncCompleting.once("resume", resolve));
    asyncCompleting.write(null, { name: "tab" });
    await resumed;
    report.promiseCompletion = asyncCompleting.line;
    asyncCompleting.close();

    const keyInput = new Input();
    emitKeypressEvents(keyInput);
    const keys = [];
    keyInput.on("keypress", (text, key) => keys.push([text ?? null, key.name, key.ctrl]));
    keyInput.emit("data", "a\x1b[");
    keyInput.emit("data", "1;5D");
    report.keys = keys;

    const actionOutput = new Output();
    const actions = new readlinePromises.Readline(actionOutput);
    actions.cursorTo(2, 1).moveCursor(-1, 3).clearLine(0).clearScreenDown();
    report.deferred = actionOutput.text === "";
    await actions.commit();
    actions.clearLine(1).rollback();
    await actions.commit();
    report.actions = actionOutput.text;

    const autoOutput = new Output();
    new readlinePromises.Readline(autoOutput, { autoCommit: true }).cursorTo(0);
    await Promise.resolve();
    report.autoCommit = autoOutput.text;

    const iterableInput = new Input();
    const iterable = createInterface({ input: iterableInput });
    const iterator = iterable[Symbol.asyncIterator]();
    iterableInput.emit("data", "first\nsecond\ntail");
    iterableInput.emit("end");
    report.iterated = [];
    for await (const line of iterator) {
        report.iterated.push(line);
    }

    const controller = typeof AbortController === "function" ? new AbortController() : suppliedCancellation();
    const cancellable = promises.createInterface({ input: new Input() });
    const pending = cancellable.question("cancel?", { signal: controller.signal });
    controller.abort("cancelled");
    try {
        await pending;
    } catch (error) {
        report.abort = [error.name, error.code, error.cause];
    }
    cancellable.close();
    try {
        await cancellable.question("closed?");
    } catch (error) {
        report.closedError = error.code;
    }
    return JSON.stringify(report);
}
