import { WASI as NodeWASI } from "node:wasi";
import { describe, expect, test } from "vitest";
import { createWasi } from "../../../../../../src/wasi/0.2.x/node/24.x.x/wasi/core.js";
import {
  PREVIEW1_SYSCALLS,
  type Preview1Syscall,
  type SyscallParameter,
} from "../../../../../../src/wasi/0.2.x/node/24.x.x/wasi/syscalls.js";
import type { WasiSyscall } from "../../../../../../src/wasi/0.2.x/node/24.x.x/wasi/types.js";
import { describeDifferential } from "../helpers/assert.js";
import { failureOf, fakeWasiHost } from "../helpers/wasi.js";

function signatures(table: Record<string, WasiSyscall>): Record<string, [string, number]> {
  return Object.fromEntries(
    Object.entries(table).map(([name, fn]) => [name, [fn.name, fn.length]]),
  );
}

/** Arguments the binding converts: a small integer per `u32`, a BigInt per 64-bit parameter. */
function wellFormed(parameters: readonly SyscallParameter[]): Array<number | bigint> {
  return parameters.map((parameter) => (parameter === "u32" ? 1 : 1n));
}

/** Every call shape the binding answers before it looks for a memory, per syscall. */
function callMatrix(): Array<[string, Preview1Syscall, Array<number | bigint | string>]> {
  const matrix: Array<[string, Preview1Syscall, Array<number | bigint | string>]> = [];
  for (const [name, parameters] of PREVIEW1_SYSCALLS) {
    const ok = wellFormed(parameters);
    matrix.push([`${name} well-formed`, name, ok]);
    matrix.push([`${name} too few`, name, ok.slice(0, -1)]);
    matrix.push([`${name} too many`, name, [...ok, 0]]);
    parameters.forEach((parameter, index) => {
      for (const bad of parameter === "u32" ? [1n, -1, 1.5, 2 ** 32, "1", -0] : [1, "1"]) {
        const args = [...ok];
        args[index] = bad;
        matrix.push([`${name} argument ${index} = ${String(bad)}`, name, args]);
      }
    });
  }
  return matrix;
}

describe("wasi.wasiImport", () => {
  test("is a plain object of Node's 46 preview1 syscalls, own and enumerable", () => {
    const { WASI } = createWasi(fakeWasiHost().host);
    const { wasiImport } = new WASI({ version: "preview1" });
    expect(Object.keys(wasiImport).sort()).toEqual(PREVIEW1_SYSCALLS.map(([name]) => name).sort());
    expect(Object.keys(wasiImport)).toHaveLength(46);
    for (const name of Object.keys(wasiImport)) {
      expect(Object.getOwnPropertyDescriptor(wasiImport, name)).toMatchObject({
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
  });

  test("binds each syscall under Node's bound name with Node's arity", () => {
    const { WASI } = createWasi(fakeWasiHost().host);
    const { wasiImport } = new WASI({ version: "preview1", returnOnExit: false });
    expect(signatures(wasiImport)).toEqual(
      Object.fromEntries(
        PREVIEW1_SYSCALLS.map(([name, parameters]) => [name, [`bound ${name}`, parameters.length]]),
      ),
    );
    expect(Object.hasOwn(wasiImport.fd_write, "prototype")).toBe(false);
  });

  test("raises ERR_WASI_NOT_STARTED from every well-formed call, without touching the provider", () => {
    const fake = fakeWasiHost();
    const { WASI } = createWasi(fake.host);
    const { wasiImport } = new WASI({ version: "preview1", returnOnExit: false });
    for (const [name, parameters] of PREVIEW1_SYSCALLS) {
      expect(
        failureOf(() => wasiImport[name](...wellFormed(parameters))),
        name,
      ).toMatchObject({
        name: "Error",
        code: "ERR_WASI_NOT_STARTED",
        message: "wasi.start() has not been called",
        keys: ["code"],
      });
    }
    expect(fake.calls).toHaveLength(1);
  });

  test("answers UVWASI_EINVAL, without throwing, to a call the binding cannot convert", () => {
    const { WASI } = createWasi(fakeWasiHost().host);
    const { wasiImport } = new WASI({ version: "preview1", returnOnExit: false });
    // Wrong count, then each argument of the wrong kind or out of the u32 range.
    expect(wasiImport.fd_write(1, 0, 0)).toBe(28);
    expect(wasiImport.fd_write(1, 0, 0, 0, 0)).toBe(28);
    expect(wasiImport.sched_yield(0)).toBe(28);
    expect(wasiImport.fd_close(-1)).toBe(28);
    expect(wasiImport.fd_close(1.5)).toBe(28);
    expect(wasiImport.fd_close(2 ** 32)).toBe(28);
    expect(wasiImport.fd_close(1n)).toBe(28);
    expect(wasiImport.fd_close("1" as never)).toBe(28);
    expect(wasiImport.fd_seek(1, 0, 0, 0)).toBe(28);
    expect(failureOf(() => wasiImport.fd_seek(1, -1n, 0, 0))?.code).toBe("ERR_WASI_NOT_STARTED");
    expect(failureOf(() => wasiImport.fd_close(2 ** 32 - 1))?.code).toBe("ERR_WASI_NOT_STARTED");
  });

  test("replaces proc_exit with the return-on-exit hook by default", () => {
    const { WASI } = createWasi(fakeWasiHost().host);
    const wasi = new WASI({ version: "preview1" });
    expect(wasi.wasiImport.proc_exit.name).toBe("bound wasiReturnOnProcExit");
    expect(wasi.wasiImport.proc_exit.length).toBe(1);
    // Node records the code and throws a symbol WebAssembly cannot catch.
    expect(failureOf(() => wasi.wasiImport.proc_exit(7))).toMatchObject({
      name: "symbol",
      message: "Symbol(kExitCode)",
    });
    const explicit = new WASI({ version: "preview1", returnOnExit: true });
    expect(explicit.wasiImport.proc_exit.name).toBe("bound wasiReturnOnProcExit");
    const native = new WASI({ version: "preview1", returnOnExit: false });
    expect(native.wasiImport.proc_exit.name).toBe("bound proc_exit");
    expect(failureOf(() => native.wasiImport.proc_exit(7))?.code).toBe("ERR_WASI_NOT_STARTED");
    expect(native.wasiImport.proc_exit(7, 0)).toBe(28);
  });

  test("is a fresh table per instance", () => {
    const { WASI } = createWasi(fakeWasiHost().host);
    const a = new WASI({ version: "preview1" });
    const b = new WASI({ version: "preview1" });
    expect(a.wasiImport).not.toBe(b.wasiImport);
    expect(a.wasiImport.fd_write).not.toBe(b.wasiImport.fd_write);
  });
});

describeDifferential("wasi.wasiImport against Node", () => {
  test("matches Node's syscall names, bound names and arities", () => {
    const { WASI } = createWasi(fakeWasiHost().host);
    for (const returnOnExit of [true, false]) {
      const portable = new WASI({ version: "preview1", returnOnExit }).wasiImport;
      const native = new NodeWASI({ version: "preview1", returnOnExit }).wasiImport;
      expect(Object.keys(portable).sort()).toEqual(Object.keys(native).sort());
      expect(signatures(portable)).toEqual(signatures(native as Record<string, WasiSyscall>));
    }
  });

  test("answers every call shape before start exactly as Node does", () => {
    const { WASI } = createWasi(fakeWasiHost().host);
    const portable = new WASI({ version: "preview1", returnOnExit: false }).wasiImport;
    const native = new NodeWASI({ version: "preview1", returnOnExit: false }).wasiImport as Record<
      string,
      WasiSyscall
    >;
    for (const [label, name, args] of callMatrix()) {
      const outcome = (table: Record<string, WasiSyscall>): unknown => {
        const call = (): unknown => table[name](...(args as Array<number | bigint>));
        return failureOf(call) ?? { returned: call() };
      };
      expect(outcome(portable), label).toEqual(outcome(native));
      // At least one side of every comparison is a definite answer, never a scoping accident.
      expect(outcome(native)).not.toMatchObject({ name: "ReferenceError" });
    }
  });
});
