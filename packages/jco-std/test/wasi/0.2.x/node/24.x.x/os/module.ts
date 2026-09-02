import nativeOs from "node:os";
import { describe, expect, test, vi } from "vitest";

import * as denyHost from "../../../../../../src/wasi/0.2.x/node/24.x.x/os-host.js";
import * as nodeHost from "../../../../../../src/wasi/0.2.x/node/24.x.x/os-host-node.js";
import { createOs } from "../../../../../../src/wasi/0.2.x/node/24.x.x/os/core.js";
import type { OsHost } from "../../../../../../src/wasi/0.2.x/node/24.x.x/os/types.js";

describe("node:os module", () => {
  test("matches the stable Node 24 module surface", () => {
    const os = createOs(nodeHost);

    expect(Object.keys(os).sort()).toEqual(Object.keys(nativeOs).sort());
    expect(Object.getOwnPropertyDescriptor(os, "constants")).toEqual(
      expect.objectContaining({ configurable: false, enumerable: true, writable: false }),
    );
    expect(Object.getOwnPropertyDescriptor(os, "EOL")).toEqual(
      expect.objectContaining({ configurable: true, enumerable: true, writable: false }),
    );
    expect(Object.getPrototypeOf(os.constants)).toBeNull();
    expect(Object.getPrototypeOf(os.constants.errno)).toBeNull();
    expect(Object.isFrozen(os.constants.signals)).toBe(true);
  });

  test("passes machine information through the opt-in Node host", () => {
    const os = createOs(nodeHost);

    expect(os.arch()).toBe(nativeOs.arch());
    expect(os.availableParallelism()).toBe(nativeOs.availableParallelism());
    const cpus = os.cpus();
    expect(cpus).toHaveLength(nativeOs.cpus().length);
    if (cpus[0]) {
      expect(cpus[0]).toEqual(
        expect.objectContaining({
          model: expect.any(String),
          speed: expect.any(Number),
          times: expect.objectContaining({ user: expect.any(Number), idle: expect.any(Number) }),
        }),
      );
    }
    expect(os.endianness()).toBe(nativeOs.endianness());
    expect(os.freemem()).toBeGreaterThanOrEqual(0);
    expect(os.homedir()).toBe(nativeOs.homedir());
    expect(os.hostname()).toBe(nativeOs.hostname());
    expect(os.loadavg()).toHaveLength(3);
    expect(os.loadavg().every(Number.isFinite)).toBe(true);
    expect(os.machine()).toBe(nativeOs.machine());
    let nativeInterfaces: ReturnType<typeof nativeOs.networkInterfaces> | undefined;
    try {
      nativeInterfaces = nativeOs.networkInterfaces();
    } catch (error) {
      // Restricted CI containers can deny uv_interface_addresses. The adapter
      // must surface the same structured Node system error in that case.
      expect(() => os.networkInterfaces()).toThrow(
        expect.objectContaining({
          code: (error as NodeJS.ErrnoException).code,
          syscall: (error as NodeJS.ErrnoException).syscall,
        }),
      );
      nativeInterfaces = undefined;
    }
    if (nativeInterfaces !== undefined) {
      expect(os.networkInterfaces()).toEqual(nativeInterfaces);
    }
    expect(os.platform()).toBe(nativeOs.platform());
    expect(os.release()).toBe(nativeOs.release());
    expect(os.tmpdir()).toBe(nativeOs.tmpdir());
    expect(os.totalmem()).toBe(nativeOs.totalmem());
    expect(os.type()).toBe(nativeOs.type());
    expect(os.uptime()).toBeGreaterThan(0);
    expect(os.version()).toBe(nativeOs.version());
    expect(os.EOL).toBe(nativeOs.EOL);
    expect(os.devNull).toBe(nativeOs.devNull);
    expect(os.constants).toEqual(nativeOs.constants);
  });

  test("preserves string and Buffer user information", () => {
    const os = createOs(nodeHost);

    expect(os.userInfo()).toEqual(nativeOs.userInfo());
    const buffered = os.userInfo({ encoding: "buffer" });
    const nativeBuffered = nativeOs.userInfo({ encoding: "buffer" });
    expect(buffered).toEqual(nativeBuffered);
    expect(Buffer.isBuffer(buffered.username)).toBe(true);
    expect(Buffer.isBuffer(buffered.homedir)).toBe(true);
  });

  test("adds Node coercion hooks to scalar functions", () => {
    const os = createOs(nodeHost);

    expect(`${os.arch}`).toBe(nativeOs.arch());
    expect(Number(os.totalmem)).toBe(nativeOs.totalmem());
    expect(Number(os.uptime)).toBeGreaterThan(0);
    expect(Object.hasOwn(os.cpus, Symbol.toPrimitive)).toBe(false);
  });

  test("denies machine inspection by default with a stable error", () => {
    const os = createOs(denyHost);

    expect(os.EOL).toBe("\n");
    expect(os.devNull).toBe("/dev/null");
    for (const invoke of [
      () => os.arch(),
      () => os.availableParallelism(),
      () => os.cpus(),
      () => os.endianness(),
      () => os.freemem(),
      () => os.getPriority(),
      () => os.homedir(),
      () => os.hostname(),
      () => os.loadavg(),
      () => os.machine(),
      () => os.networkInterfaces(),
      () => os.platform(),
      () => os.release(),
      () => os.setPriority(0),
      () => os.tmpdir(),
      () => os.totalmem(),
      () => os.type(),
      () => os.uptime(),
      () => os.userInfo(),
      () => os.version(),
    ]) {
      expect(invoke).toThrow(expect.objectContaining({ code: "ERR_JCO_OS_ADAPTER_REQUIRED" }));
    }
  });

  test("validates priority arguments before calling the provider", () => {
    const setPriority = vi.fn<OsHost["setPriority"]>(() => ({ tag: "ok", val: undefined }));
    const os = createOs({ ...denyHost, setPriority });

    expect(() => os.setPriority(2.5)).toThrow(
      expect.objectContaining({ code: "ERR_OUT_OF_RANGE" }),
    );
    expect(() => os.setPriority(20)).toThrow(expect.objectContaining({ code: "ERR_OUT_OF_RANGE" }));
    expect(() => os.setPriority(2147483648, 0)).toThrow(
      expect.objectContaining({ code: "ERR_OUT_OF_RANGE" }),
    );
    expect(setPriority).not.toHaveBeenCalled();

    os.setPriority(12);
    os.setPriority(34, -5);
    expect(setPriority).toHaveBeenNthCalledWith(1, 0, 12);
    expect(setPriority).toHaveBeenNthCalledWith(2, 34, -5);
  });

  test("reconstructs structured provider failures as Node system errors", () => {
    const getPriority: OsHost["getPriority"] = () => ({
      tag: "err",
      val: {
        name: "SystemError",
        message: "A system error occurred: no such process returned by uv_os_getpriority",
        code: "ERR_SYSTEM_ERROR",
        errno: { tag: "number", val: -3n },
        syscall: "uv_os_getpriority",
        info: {
          errno: { tag: "number", val: -3n },
          code: "ESRCH",
          message: "no such process",
          syscall: "uv_os_getpriority",
        },
      },
    });
    const os = createOs({ ...denyHost, getPriority });

    expect(() => os.getPriority(123)).toThrow(
      expect.objectContaining({
        name: "SystemError",
        code: "ERR_SYSTEM_ERROR",
        errno: -3,
        syscall: "uv_os_getpriority",
        info: expect.objectContaining({ code: "ESRCH", errno: -3 }),
      }),
    );
  });
});
