// The Node provider and the built module on a real pseudo-terminal: descriptors 0-2 are a
// terminal of a known size, readline runs in terminal mode over the streams, raw mode is
// switched for the question and restored afterwards, and the answer arrives through a blocking
// read. Requires python3's pty module, so it is skipped where that is unavailable.
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { expect, test } from "vitest";
import which from "which";

const exec = promisify(execFile);
const python = which.sync("python3", { nothrow: true });
const helpers = new URL("../helpers/", import.meta.url);
const built = existsSync(
  fileURLToPath(
    new URL("../../../../../../dist/wasi/0.2.x/node/24.x.x/tty/core.js", import.meta.url),
  ),
);

test.skipIf(!python || !built || process.platform === "win32")(
  "drives readline through real terminal streams on a pseudo-terminal",
  async () => {
    const steps = [{ expect: "Name? " }, { send: "Ada\r" }, { expect: "REPORT " }, { send: "\n" }];
    const { stdout } = await exec(
      python as string,
      [
        fileURLToPath(new URL("tty-pty.py", helpers)),
        "40",
        "120",
        JSON.stringify(steps),
        process.execPath,
        fileURLToPath(new URL("tty-pty-child.mjs", helpers)),
      ],
      { timeout: 60_000 },
    );
    const { output, status } = JSON.parse(stdout) as { output: string; status: number };
    expect(status, output).toBe(0);
    // readline's cursor sequences precede the line, so locate the marker rather than the line start.
    const start = output.indexOf("REPORT ");
    expect(start, output).toBeGreaterThan(-1);
    const report = JSON.parse(output.slice(start + "REPORT ".length).split(/\r|\n/)[0]);
    expect(report).toEqual({
      isatty: [true, true, true],
      size: [120, 40],
      hasColors: expect.any(Boolean),
      depth: 8,
      rawBefore: false,
      terminal: true,
      answer: "Ada",
      rawDuring: true,
      rawAfter: false,
      events: [],
    });
    expect(output).toContain("Name? ");
  },
  90_000,
);
