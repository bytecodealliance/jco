import { Buffer } from "node:buffer";
import process from "node:process";

import { describe, expect, test, vi } from "vitest";

import { createChildProcess } from "../../../../../../src/wasi/0.2.x/node/24.x.x/child-process/core.js";
import * as denyHost from "../../../../../../src/wasi/0.2.x/node/24.x.x/child-process-host.js";
import * as nodeHost from "../../../../../../src/wasi/0.2.x/node/24.x.x/child-process-host-node.js";
import type {
  ChildProcessHost,
  HostSpawnOptions,
} from "../../../../../../src/wasi/0.2.x/node/24.x.x/child-process/types.js";

const childProcess = createChildProcess(nodeHost);

describe("node:child_process guest adapter", () => {
  test("the default host denies process spawning", () => {
    expect(() => denyHost.spawnSync("ignored", [], {} as HostSpawnOptions)).toThrow(
      expect.objectContaining({ code: "ERR_JCO_CHILD_PROCESS_ADAPTER_REQUIRED" }),
    );
  });

  test("spawnSync returns Buffer output and Node-compatible status fields", () => {
    const result = childProcess.spawnSync(process.execPath, [
      "-e",
      'process.stdout.write("out"); process.stderr.write("err")',
    ]);
    expect(result.status).toBe(0);
    expect(result.signal).toBeNull();
    expect(result.pid).toBeGreaterThan(0);
    expect(Buffer.isBuffer(result.stdout)).toBe(true);
    expect(result.stdout?.toString()).toBe("out");
    expect(result.stderr?.toString()).toBe("err");
    expect(result.output).toEqual([null, result.stdout, result.stderr]);
  });

  test("supports string encoding", () => {
    const result = childProcess.spawnSync(
      process.execPath,
      ["-e", 'process.stdout.write("héllo")'],
      {
        encoding: "utf8",
      },
    );
    expect(result.stdout).toBe("héllo");
  });

  test("passes stdin, cwd, and environment through the host capability", () => {
    const script = [
      "let input = '';",
      "process.stdin.setEncoding('utf8');",
      "process.stdin.on('data', chunk => input += chunk);",
      "process.stdin.on('end', () => process.stdout.write([input, process.cwd(), process.env.JCO_CHILD].join('|')));",
    ].join("");
    const result = childProcess.spawnSync(process.execPath, ["-e", script], {
      input: "guest-input",
      cwd: new URL("file:///tmp/"),
      env: { JCO_CHILD: "present" },
      encoding: "utf8",
    });
    expect(result.stdout).toBe("guest-input|/tmp|present");
  });

  test("execFileSync returns stdout and throws with output on nonzero exit", () => {
    expect(
      childProcess.execFileSync(process.execPath, ["-e", 'process.stdout.write("ok")'], {
        encoding: "utf8",
      }),
    ).toBe("ok");

    expect(() =>
      childProcess.execFileSync(process.execPath, [
        "-e",
        'process.stdout.write("out"); process.stderr.write("err"); process.exit(7)',
      ]),
    ).toThrow(expect.objectContaining({ code: 7, status: 7 }));
  });

  test("execSync uses the host shell", () => {
    expect(
      childProcess.execSync(`\"${process.execPath}\" -e \"process.stdout.write('shell')\"`, {
        encoding: "utf8",
      }),
    ).toBe("shell");
  });

  test("reports spawn failures in the spawnSync result", () => {
    const result = childProcess.spawnSync("jco-command-that-does-not-exist");
    expect(result.status).toBeNull();
    expect(result.error).toEqual(expect.objectContaining({ code: "ENOENT" }));
  });

  test("normalizes options into component-safe WIT values", () => {
    const spawnSync = vi.fn<ChildProcessHost["spawnSync"]>(() => ({ status: 0 }));
    const adapter = createChildProcess({ spawnSync });
    adapter.spawnSync("command", ["arg"], {
      env: { VALUE: 42, OMIT: undefined },
      input: new Uint8Array([1, 2]),
      timeout: 12,
      maxBuffer: 34,
      shell: true,
      stdio: "ignore",
      windowsHide: true,
      windowsVerbatimArguments: true,
      uid: 1,
      gid: 2,
    });
    expect(spawnSync).toHaveBeenCalledWith("command", ["arg"], {
      cwd: undefined,
      cwdIsUrl: false,
      env: [["VALUE", "42"]],
      input: new Uint8Array([1, 2]),
      timeout: 12n,
      killSignal: "SIGTERM",
      maxBuffer: 34n,
      shell: "",
      stdio: ["ignore", "ignore", "ignore"],
      windowsHide: true,
      windowsVerbatimArguments: true,
      uid: 1,
      gid: 2,
    });
  });

  test("does not require a URL global when cwd is omitted", () => {
    const spawnSync = vi.fn<ChildProcessHost["spawnSync"]>(() => ({ status: 0 }));
    vi.stubGlobal("URL", undefined);
    try {
      createChildProcess({ spawnSync }).spawnSync("command");
      expect(spawnSync).toHaveBeenCalledWith(
        "command",
        [],
        expect.objectContaining({ cwdIsUrl: false }),
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  test.each([
    ["spawn", () => childProcess.spawn(process.execPath)],
    ["exec", () => childProcess.exec("true")],
    ["execFile", () => childProcess.execFile(process.execPath)],
    ["fork", () => childProcess.fork()],
    ["ChildProcess", () => new childProcess.ChildProcess()],
  ])("fails explicitly for unsupported asynchronous API %s", (_name, invoke) => {
    expect(invoke).toThrow(expect.objectContaining({ code: "ERR_JCO_UNSUPPORTED_NODE_API" }));
  });

  test("validates command and numeric options before crossing the boundary", () => {
    expect(() => childProcess.spawnSync("", [])).toThrow(/cannot be empty/);
    expect(() => childProcess.spawnSync("x", { timeout: -1 })).toThrow(/timeout.*out of range/);
    expect(() => childProcess.spawnSync("x", { maxBuffer: Number.MAX_SAFE_INTEGER + 1 })).toThrow(
      /maxBuffer.*out of range/,
    );
  });
});
