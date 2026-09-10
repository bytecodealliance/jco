/*!
 * Portions of this directory are adapted from Node.js and DefinitelyTyped.
 * Copyright Node.js contributors. All rights reserved.
 * Copyright (c) Microsoft Corporation. All rights reserved.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to
 * deal in the Software without restriction, including without limitation the
 * rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */
/**
 * Node process facade, targeting nodejs/node v24.20.0 (MIT), commit
 * 71b8b174857e25106d39b61a9e6f30d927da8b01. Native operations stay on the host.
 * Hrtime subtraction and warning normalization below adapt internal/process/
 * per_thread.js and warning.js; process.js itself just reexports the singleton.
 * Local changes: typed WIT calls, lazy host data, guest microtasks, explicit errors
 * for engine hooks and deprecated APIs. See docs/src/interop/nodejs-builtins.md.
 */
import { EventEmitter } from "node:events";
import { callHost } from "../internal/host-error.js";
import { unsupportedNodeApi, invalidArgType, outOfRange } from "../errors/core.js";
import type { HostResult } from "../internal/wit-types.js";
import type {
  Id,
  Json,
  Metadata,
  ProcessError,
  ProcessHost,
  ProcessModule,
  ProcessReport,
  ReportOption,
  WarningOptions,
} from "./types.js";

import {
  unsupported,
  deprecated,
  string,
  boolean,
  integer,
  id,
  exitCode,
  path,
  previous,
  warning,
  makeError,
} from "./validation.js";
import { createEnvironment } from "./environment.js";
import { lazy, freeze } from "./objects.js";

export function createProcess(host: ProcessHost): ProcessModule {
  const call = <T>(fn: () => T | HostResult<T, ProcessError>): T => callHost(fn, makeError);
  const process = new EventEmitter() as unknown as ProcessModule;
  let metadata: Metadata | undefined;
  const info = (): Metadata => (metadata ??= call(() => host.metadata()));
  const property = (name: string, get: () => unknown, set?: (value: unknown) => void): void => {
    Object.defineProperty(process, name, { get, set, enumerable: true, configurable: true });
  };
  for (const name of ["arch", "platform", "pid", "ppid", "argv0", "execPath", "version"] as const) {
    property(name, () => info()[name]);
  }
  process.argv = lazy<string[]>([], () => info().argv);
  process.execArgv = lazy<string[]>([], () => info().execArgv);
  Object.assign(process, {
    versions: lazy<Record<string, string>>({}, () => Object.fromEntries(info().versions)),
    release: lazy({}, () => JSON.parse(info().releaseJson)),
    config: lazy({}, () => freeze(JSON.parse(info().configJson)) as object),
    features: lazy({}, () => {
      const features = JSON.parse(info().featuresJson) as Record<string, Json>;
      for (const name of ["ipv6", "uv", "tls_alpn", "tls_ocsp", "tls_sni"]) {
        Object.defineProperty(features, name, {
          get: () =>
            deprecated(
              `features.${name}`,
              name.startsWith("tls_") ? "process.features.tls" : undefined,
            ),
          enumerable: true,
          configurable: true,
        });
      }
      return features;
    }),
  });
  property(
    "title",
    () => call(() => host.getState()).title,
    (value) => call(() => host.setTitle(String(value))),
  );
  property(
    "debugPort",
    () => call(() => host.getState()).debugPort,
    (value) => {
      if (typeof value !== "number") {
        throw invalidArgType("debugPort", "number", value);
      }
      call(() => host.setDebugPort(value));
    },
  );
  property(
    "exitCode",
    () => call(() => host.getState()).exitCode?.val,
    (value) => call(() => host.setExitCode(exitCode(value))),
  );
  for (const [name, flag] of [
    ["noDeprecation", "no-deprecation"],
    ["throwDeprecation", "throw-deprecation"],
    ["traceDeprecation", "trace-deprecation"],
    ["traceProcessWarnings", "trace-process-warnings"],
  ] as const) {
    property(
      name,
      () => call(() => host.getState())[name],
      (value) => {
        boolean(value, name);
        call(() => host.setFlag(flag, value));
      },
    );
  }
  for (const name of ["sourceMapsEnabled", "connected"] as const) {
    property(name, () => call(() => host.getState())[name]);
  }
  process.env = createEnvironment(host, call);
  process.cwd = () => call(() => host.cwd());
  process.chdir = (directory) => {
    string(directory, "directory");
    call(() => host.chdir(directory));
  };
  process.cpuUsage = (value) => call(() => host.cpuUsage(previous(value)));
  process.threadCpuUsage = (value) => call(() => host.threadCpuUsage(previous(value)));
  process.memoryUsage = Object.assign(() => call(() => host.memoryUsage()), {
    rss: () => call(() => host.rss()),
  });
  process.resourceUsage = () => {
    const { userCpuTime, systemCpuTime, maxRss, ...rest } = call(() => host.resourceUsage());
    return { ...rest, userCPUTime: userCpuTime, systemCPUTime: systemCpuTime, maxRSS: maxRss };
  };
  // Tuple subtraction adapted from Node's MIT-licensed per_thread.js hrtime().
  process.hrtime = Object.assign(
    (time?: [number, number]): [number, number] => {
      const { seconds, nanoseconds: nanos } = call(() => host.hrtime());
      if (time === undefined) {
        return [seconds, nanos];
      }
      if (!Array.isArray(time)) {
        throw invalidArgType("time", "Array", time);
      }
      if (time.length !== 2) {
        throw outOfRange("time", "2", time.length);
      }
      const sec = seconds - time[0],
        nsec = nanos - time[1];
      return [nsec < 0 ? sec - 1 : sec, nsec < 0 ? nsec + 1e9 : nsec];
    },
    {
      bigint: () => {
        const { seconds, nanoseconds } = call(() => host.hrtime());
        return BigInt(seconds) * 1000000000n + BigInt(nanoseconds);
      },
    },
  );
  for (const name of ["uptime", "availableMemory", "constrainedMemory"] as const) {
    process[name] = () => call(() => host[name]());
  }
  process.getActiveResourcesInfo = () => call(() => host.getActiveResourcesInfo());
  for (const kind of ["uid", "euid", "gid", "egid"] as const) {
    process[`get${kind}`] = () => call(() => host.getId(kind));
    process[`set${kind}`] = (value) => call(() => host.setId(kind, id(value, "id")));
  }
  // Numeric WIT lists lift as typed arrays on some engines; Node returns an Array.
  process.getgroups = () => Array.from(call(() => host.getgroups()));
  process.setgroups = (groups) => {
    if (!Array.isArray(groups)) {
      throw invalidArgType("groups", "Array", groups);
    }
    call(() => host.setgroups(groups.map((v, i) => id(v, `groups[${i}]`))));
  };
  process.initgroups = (user, extraGroup) =>
    call(() => host.initgroups(id(user, "user"), id(extraGroup, "extraGroup")));
  process.kill = (pid, signal = "SIGTERM") => {
    // Node deliberately accepts integer-like PID strings. Preserve that legacy coercion.
    if (pid != (pid | 0)) {
      throw invalidArgType("pid", "number", pid);
    }
    const s =
      typeof signal === "number" && signal === (signal | 0)
        ? { tag: "number" as const, val: signal }
        : { tag: "name" as const, val: signal || "SIGTERM" };
    if (typeof s.val !== "string" && s.tag === "name") {
      throw Object.assign(new TypeError(`Unknown signal: ${String(signal)}`), {
        code: "ERR_UNKNOWN_SIGNAL",
      });
    }
    call(() => host.kill(pid | 0, s as Id));
    return true;
  };
  process.umask = ((mask?: number | string): number => {
    if (mask === undefined) {
      deprecated("umask()", "process.umask(mask)");
    }
    if (typeof mask === "string") {
      return call(() => host.umask({ tag: "text", val: mask }));
    }
    integer(mask, "mask", 0, 4294967295);
    return call(() => host.umask({ tag: "number", val: mask }));
  }) as ProcessModule["umask"];
  process.exit = (code) => {
    call(() => host.exit(exitCode(code)));
    throw unsupportedNodeApi("process.exit", "host provider returned instead of terminating");
  };
  process.abort = () => {
    call(() => host.abort());
    throw unsupportedNodeApi("process.abort", "host provider returned instead of terminating");
  };
  process.execve = (file, args = [], env) => {
    string(file, "execPath");
    if (!Array.isArray(args)) {
      throw invalidArgType("args", "Array", args);
    }
    for (const [i, arg] of args.entries()) {
      string(arg, `args[${i}]`);
    }
    let entries: [string, string][] | undefined;
    if (env !== undefined) {
      if (typeof env !== "object" || env === null || Array.isArray(env)) {
        throw invalidArgType("env", "Object", env);
      }
      entries = Object.entries(env);
      for (const [key, value] of entries) {
        string(value, `env.${key}`);
      }
    }
    call(() => host.execve(file, args, entries));
    throw unsupportedNodeApi(
      "process.execve",
      "host provider returned instead of replacing the process",
    );
  };
  process.loadEnvFile = (value) => call(() => host.loadEnvFile(path(value)));
  process.setSourceMapsEnabled = (value) => {
    boolean(value, "enabled");
    call(() => host.setSourceMapsEnabled(value));
  };
  process.nextTick = (callback, ...args) => {
    if (typeof callback !== "function") {
      throw invalidArgType("callback", "Function", callback);
    }
    queueMicrotask(() => callback(...args));
  };
  // Refable protocol from Node per_thread.js; objects stay in the guest realm.
  for (const method of ["ref", "unref"] as const) {
    process[method] = (value) => {
      if (value === null || value === undefined) {
        return;
      }
      const object = Object(value);
      const fn = Reflect.get(object, Symbol.for(`nodejs.${method}`)) || Reflect.get(object, method);
      if (typeof fn === "function") {
        Reflect.apply(fn, value, []);
      }
    };
  }
  process.emitWarning = (
    value: string | Error,
    typeOrOptions?: string | WarningOptions,
    code?: string,
    ctor?: (...args: never[]) => unknown,
  ): void => {
    if (typeOrOptions === "DeprecationWarning" && process.noDeprecation) {
      return;
    }
    let type: unknown = typeOrOptions,
      detail: string | undefined;
    if (
      typeOrOptions !== null &&
      typeof typeOrOptions === "object" &&
      !Array.isArray(typeOrOptions)
    ) {
      type = typeOrOptions.type || "Warning";
      code = typeOrOptions.code;
      ctor = typeOrOptions.ctor;
      detail = typeof typeOrOptions.detail === "string" ? typeOrOptions.detail : undefined;
    } else if (typeof typeOrOptions === "function") {
      ctor = typeOrOptions;
      type = "Warning";
      code = undefined;
    }
    if (type !== undefined) {
      string(type, "type");
    }
    if (typeof code === "function") {
      ctor = code;
      code = undefined;
    } else if (code !== undefined) {
      string(code, "code");
    }
    if (typeof value !== "string" && !(value instanceof Error)) {
      throw invalidArgType("warning", ["Error", "string"], value);
    }
    const error =
      typeof value === "string"
        ? Object.assign(new Error(value), {
            name: (type as string) || "Warning",
            ...(code === undefined ? {} : { code }),
            ...(detail === undefined ? {} : { detail }),
          })
        : value;
    if (
      typeof value === "string" &&
      typeof ctor === "function" &&
      typeof Error.captureStackTrace === "function"
    ) {
      Error.captureStackTrace(error, ctor);
    }
    if (error.name === "DeprecationWarning") {
      const state = call(() => host.getState());
      if (state.noDeprecation) {
        return;
      }
      if (state.throwDeprecation) {
        call(() => host.emitWarning(warning(error)));
        return;
      }
    }
    call(() => host.emitWarning(warning(error)));
    queueMicrotask(() => process.emit("warning", error));
  };
  const report = {} as ProcessReport;
  for (const [name, option] of Object.entries({
    compact: "compact",
    directory: "directory",
    filename: "filename",
    signal: "signal",
    reportOnFatalError: "report-on-fatal-error",
    reportOnSignal: "report-on-signal",
    reportOnUncaughtException: "report-on-uncaught-exception",
    excludeEnv: "exclude-env",
    excludeNetwork: "exclude-network",
  }) as [keyof Omit<ProcessReport, "getReport" | "writeReport">, ReportOption][]) {
    Object.defineProperty(report, name, {
      enumerable: true,
      configurable: true,
      get: () => call(() => host.getReportOptions())[name],
      set: (value: unknown) => {
        if (["directory", "filename", "signal"].includes(name)) {
          string(value, name);
          call(() => host.setReportOption(option, { tag: "text", val: value }));
        } else {
          boolean(value, name);
          call(() => host.setReportOption(option, { tag: "boolean", val: value }));
        }
      },
    });
  }
  report.getReport = (error) =>
    JSON.parse(call(() => host.getReport(error === undefined ? undefined : warning(error))));
  report.writeReport = (filename?: string | Error, error?: Error): string => {
    if (filename instanceof Error) {
      error = filename;
      filename = undefined;
    }
    if (filename !== undefined) {
      string(filename, "filename");
    }
    return call(() => host.writeReport(filename, error === undefined ? undefined : warning(error)));
  };
  Object.defineProperty(process, "report", { value: report, enumerable: true, configurable: true });
  const permission = {
    has: (scope: string, reference?: string | URL | Uint8Array): boolean => {
      string(scope, "scope");
      return call(() => host.permissionHas(scope, path(reference)));
    },
  };
  property("permission", () => (info().hasPermission ? permission : undefined));
  class AllowedFlags extends Set<string> {
    #loaded = false;
    #flags: string[] = [];
    #load(): void {
      if (!this.#loaded) {
        const flags = (this.#flags = call(() => host.allowedFlags()));
        for (const flag of flags) {
          super.add(flag);
        }
        this.#loaded = true;
      }
    }
    override has(value: string): boolean {
      return typeof value === "string" && call(() => host.allowedFlag(value));
    }
    override get size(): number {
      this.#load();
      return this.#flags.length;
    }
    override entries(): SetIterator<[string, string]> {
      this.#load();
      return super.entries();
    }
    override keys(): SetIterator<string> {
      this.#load();
      return super.keys();
    }
    override values(): SetIterator<string> {
      this.#load();
      return super.values();
    }
    override [Symbol.iterator](): SetIterator<string> {
      return this.values();
    }
    override forEach(
      callback: (value: string, key: string, set: Set<string>) => void,
      thisArg?: unknown,
    ): void {
      this.#load();
      this.#flags.forEach((value) => callback.call(thisArg, value, value, this));
    }
    override add(_value: string): this {
      return this;
    }
    override delete(_value: string): boolean {
      return false;
    }
    override clear(): void {}
  }
  Object.defineProperty(process, "allowedNodeEnvironmentFlags", {
    value: new AllowedFlags(),
    enumerable: true,
    configurable: true,
  });
  Object.defineProperty(process, "finalization", {
    value: {
      register: () => unsupported("finalization.register"),
      registerBeforeExit: () => unsupported("finalization.registerBeforeExit"),
      unregister: () => unsupported("finalization.unregister"),
    },
    enumerable: true,
  });
  for (const name of ["stdin", "stdout", "stderr", "channel"] as const) {
    property(name, () => unsupported(name));
  }
  property("mainModule", () => deprecated("mainModule", "require.main"));
  property("domain", () => deprecated("domain", "AsyncLocalStorage"));
  for (const name of [
    "getBuiltinModule",
    "dlopen",
    "setUncaughtExceptionCaptureCallback",
    "hasUncaughtExceptionCaptureCallback",
    "disconnect",
    "send",
    "openStdin",
  ] as const) {
    process[name] = () => unsupported(name);
  }
  process.binding = () => deprecated("binding", "public Node APIs");
  process.assert = () => deprecated("assert", "node:assert");
  for (const method of [
    "on",
    "addListener",
    "once",
    "prependListener",
    "prependOnceListener",
  ] as const) {
    const original = process[method];
    process[method] = function (event, listener) {
      if (event === "multipleResolves") {
        deprecated("'multipleResolves' event");
      }
      if (
        typeof event === "string" &&
        (/^SIG/.test(event) ||
          [
            "beforeExit",
            "exit",
            "disconnect",
            "message",
            "rejectionHandled",
            "uncaughtException",
            "uncaughtExceptionMonitor",
            "unhandledRejection",
            "worker",
            "workerMessage",
          ].includes(event))
      ) {
        unsupported(`'${event}' event`);
      }
      return original.call(this, event, listener);
    };
  }
  process.on = process.addListener;
  process.off = process.removeListener;
  Object.defineProperty(process, Symbol.toStringTag, { value: "process", configurable: true });
  return process;
}
