import nodeConsole from "node:console";
import process from "node:process";
import { describe, expect, test, vi } from "vitest";
import {
  Console,
  createConsole,
  type WritableStream,
} from "../../../../../../src/wasi/0.2.x/node/24.x.x/console/core.js";
import * as denyHost from "../../../../../../src/wasi/0.2.x/node/24.x.x/console-host.js";
import * as nodeHost from "../../../../../../src/wasi/0.2.x/node/24.x.x/console-host-node.js";

function capture(fail = false): WritableStream & { value: string } {
  return {
    value: "",
    write(value: string) {
      if (fail) {
        throw new Error("write failed");
      }
      this.value += value;
    },
  };
}

function pair() {
  const stdout = capture();
  const stderr = capture();
  return { stdout, stderr, console: new Console({ stdout, stderr, colorMode: false }) };
}

describe("node:console module", () => {
  test("matches the stable Node 24 constructor surface", () => {
    const expected = Reflect.ownKeys(nodeConsole.Console.prototype).filter(
      (key) => typeof key === "string",
    );
    expect(Reflect.ownKeys(Console.prototype).filter((key) => typeof key === "string")).toEqual(
      expected,
    );
    expect(Console.name).toBe("Console");
    expect(Console.prototype.dirxml).toBe(Console.prototype.log);
    expect(Console.prototype.groupCollapsed).toBe(Console.prototype.group);
  });

  test("supports options, positional, and call-without-new construction", () => {
    const stdout = capture();
    const stderr = capture();
    const positional = new Console(stdout, stderr, false);
    const options = new Console({ stdout, stderr, ignoreErrors: false, groupIndentation: 4 });
    const callable = Reflect.apply(Console, undefined, [stdout]);

    expect(positional).toBeInstanceOf(Console);
    expect(options).toBeInstanceOf(Console);
    expect(callable).toBeInstanceOf(Console);
    expect(positional._stdout).toBe(stdout);
    expect(positional._stderr).toBe(stderr);
    expect(Object.prototype.toString.call(options)).toBe("[object console]");
    expect(options.log).not.toBe(Console.prototype.log);
    expect(options.log.name).toBe("log");
    expect(Object.keys(options)).not.toContain("_stdout");
  });

  test("validates constructor inputs", () => {
    expect(() => new Console({} as WritableStream)).toThrow(/write/);
    expect(() => new Console({ stdout: capture(), colorMode: "invalid" as "auto" })).toThrow(
      TypeError,
    );
    expect(() => new Console({ stdout: capture(), groupIndentation: -1 })).toThrow(RangeError);
    expect(() => new Console({ stdout: capture(), groupIndentation: 1.5 })).toThrow(RangeError);
    const stream = capture();
    expect(
      () =>
        new Console({
          stdout: stream,
          inspectOptions: new Map([[stream, { colors: true }]]),
          colorMode: false,
        }),
    ).toThrow(TypeError);
    expect(
      () => new Console({ stdout: capture(), inspectOptions: { colors: true }, colorMode: false }),
    ).toThrow(TypeError);
    expect(() => new Console({ stdout: capture(), inspectOptions: { sorted: true } })).toThrow(
      expect.objectContaining({ code: "ERR_JCO_UNSUPPORTED_NODE_API" }),
    );
  });

  test("routes methods and matches representative Node formatting", () => {
    const { console, stdout, stderr } = pair();
    console.log("%s %d %i %f %j %o %O %%", "x", "2.5", "2.9", "2.5", { a: 1 }, { a: 1 }, { a: 1 });
    console.info(Symbol("x"), 1n, null, undefined);
    console.debug({ a: 1, b: "x" }, [1, "x"], new Map([["a", 1]]), new Set([1]), /x/g);
    console.warn("warning");
    console.error("error");

    expect(stdout.value).toBe(
      'x 2.5 2 2.5 {"a":1} { a: 1 } { a: 1 } %\n' +
        "Symbol(x) 1n null undefined\n" +
        "{ a: 1, b: 'x' } [ 1, 'x' ] Map(1) { 'a' => 1 } Set(1) { 1 } /x/g\n",
    );
    expect(stderr.value).toBe("warning\nerror\n");
  });

  test("implements assertions, counts, and groups with per-instance state", () => {
    const first = pair();
    const second = pair();
    first.console.assert(true, "ignored");
    first.console.assert(false, "bad %s", "value");
    first.console.count();
    first.console.count("item");
    first.console.count("item");
    second.console.count("item");
    first.console.countReset("item");
    first.console.countReset("missing");
    first.console.group("group");
    first.console.log("one\ntwo");
    first.console.groupEnd();

    expect(first.stdout.value).toBe("default: 1\nitem: 1\nitem: 2\ngroup\n  one\n  two\n");
    expect(second.stdout.value).toBe("item: 1\n");
    expect(first.stderr.value).toBe(
      "Assertion failed: bad value\nCount for 'missing' does not exist\n",
    );
  });

  test("uses an injected clock for timers", () => {
    const stdout: string[] = [];
    const values = [10, 10.5, 12];
    const console = createConsole({
      write: (_stream, value) => stdout.push(value),
      now: () => values.shift()!,
    });
    console.time("work");
    console.timeLog("work", "half");
    console.timeEnd("work");
    expect(stdout.join("")).toBe("work: 0.5ms half\nwork: 2ms\n");
  });

  test("renders Node-style tables", () => {
    const { console, stdout } = pair();
    console.table([
      { name: "Ada", ready: true },
      { name: "Lin", ready: false },
    ]);
    expect(stdout.value).toContain("┌─────────┬───────┬───────┐");
    expect(stdout.value).toContain("│ (index) │ name  │ ready │");
    expect(stdout.value).toContain("│ 0       │ 'Ada' │ true  │");
    console.table(new Map([["key", 1]]));
    expect(stdout.value).toContain("(iteration index)");
    expect(stdout.value).toContain("Key");
    expect(stdout.value).toContain("Values");
  });

  test("supports dir, trace, inspector no-ops, and TTY clear", () => {
    const { console, stdout, stderr } = pair();
    console.dir({ nested: { value: 1 } }, { depth: 0 });
    console.trace("location", 1);
    expect(stdout.value).toContain("{ nested: [Object] }");
    expect(stderr.value).toMatch(/^Trace: location 1/m);

    const module = createConsole({ write: () => undefined });
    expect(() => module.profile("profile")).not.toThrow();
    expect(() => module.profileEnd("profile")).not.toThrow();
    expect(() => module.timeStamp("mark")).not.toThrow();

    const tty = capture();
    tty.isTTY = true;
    new Console(tty).clear();
    expect(tty.value).toBe("\u001b[1;1H\u001b[0J");
  });

  test("honors ignoreErrors", () => {
    expect(() => new Console(capture(true)).log("ignored")).not.toThrow();
    expect(() =>
      new Console({ stdout: capture(true), ignoreErrors: false }).log("visible"),
    ).toThrow("write failed");
  });

  test("the default host denies output without assuming Node support", () => {
    for (const invoke of [
      () => denyHost.write("stdout", "denied\n"),
      () => denyHost.isTerminal("stdout"),
      () => denyHost.colorDepth("stdout"),
    ]) {
      expect(invoke).toThrow(expect.objectContaining({ code: "ERR_JCO_CONSOLE_ADAPTER_REQUIRED" }));
    }
  });

  test("routes complete messages through the runtime-neutral host boundary", () => {
    const write = vi.fn();
    const console = createConsole({ write });
    console.log("out %d", 1);
    console.error("err %d", 2);
    expect(write).toHaveBeenNthCalledWith(1, "stdout", "out 1\n");
    expect(write).toHaveBeenNthCalledWith(2, "stderr", "err 2\n");
  });

  test("the opt-in Node host passes output to the real process streams", () => {
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      nodeHost.write("stdout", "out\n");
      nodeHost.write("stderr", "err\n");
      expect(stdout).toHaveBeenCalledWith("out\n");
      expect(stderr).toHaveBeenCalledWith("err\n");
      expect(nodeHost.isTerminal("stdout")).toBe(process.stdout.isTTY === true);
      expect(nodeHost.colorDepth("stdout")).toBe(process.stdout.getColorDepth?.() ?? 1);
    } finally {
      stdout.mockRestore();
      stderr.mockRestore();
    }
  });
});
