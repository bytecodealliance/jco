import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";

import { expect, test, vi } from "vitest";

import { executeNodeScript as exec } from "../../../test/helpers/node.mjs";

vi.mock("node:child_process", async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, spawn: vi.fn(actual.spawn) };
});

test.each([0, 1])("exec waits for output to close after exit with code %s", async (code) => {
    const child = Object.assign(new EventEmitter(), {
        stdin: new PassThrough(),
        stdout: new PassThrough(),
        stderr: new PassThrough(),
    });
    vi.mocked(spawn).mockReturnValueOnce(child);
    let settled = false;
    const result = exec("fixture.mjs").finally(() => {
        settled = true;
    });
    const assertion =
        code === 0
            ? expect(result).resolves.toEqual({ stdout: "complete stdout", stderr: "complete stderr" })
            : expect(result).rejects.toThrow("STDOUT:\ncomplete stdout\nSTDERR:\ncomplete stderr");

    // Model Node's separate exit and close events without relying on inherited
    // grandchild pipe handles, which do not survive parent exit on Windows.
    child.emit("exit", code, null);
    await Promise.resolve();
    expect(settled).toBe(false);
    child.stdout.end("complete stdout");
    child.stderr.end("complete stderr");
    child.emit("close", code, null);
    await assertion;
});

test.each([0, 1])("exec captures buffered output with exit code %s", async (code) => {
    const directory = await mkdtemp(join(tmpdir(), "jco-exec-"));
    const stdout = "complete stdout\n".repeat(16_384);
    const stderr = "complete stderr\n".repeat(16_384);
    try {
        const runner = join(directory, "runner.mjs");
        await writeFile(
            runner,
            `
process.stdout.write(${JSON.stringify(stdout)});
process.stderr.write(${JSON.stringify(stderr)});
process.exitCode = ${code};
`,
        );
        await expect(exec(runner, { expectedExitCode: code })).resolves.toEqual({ stdout, stderr });
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});
