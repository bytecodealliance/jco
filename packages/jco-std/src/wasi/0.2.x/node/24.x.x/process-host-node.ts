/** Opt-in provider. Every operation describes or controls the embedding Node process. */
import nodeProcess from "node:process";
import { Buffer } from "node:buffer";
import { serializeHostError } from "./internal/host-error.js";
import { unsupportedNodeApi } from "./errors/core.js";
import type { ProcessHost, ProcessPath, Warning, ProcessError, Identity } from "./process/types.js";

function capture<T>(fn: () => T): T {
  try {
    return fn();
  } catch (error) {
    const path =
      error instanceof Error && "path" in error && typeof error.path === "string"
        ? error.path
        : undefined;
    throw { ...serializeHostError(error), path } satisfies ProcessError;
  }
}

function path(value: ProcessPath): string | URL | Buffer {
  return value.tag === "bytes"
    ? Buffer.from(value.val)
    : value.tag === "url"
      ? new URL(value.val)
      : value.val;
}

function warning(value: Warning): Error {
  const error = new Error(value.message);
  Object.assign(error, value);
  return error;
}

const flags = {
  "no-deprecation": "noDeprecation",
  "throw-deprecation": "throwDeprecation",
  "trace-deprecation": "traceDeprecation",
  "trace-process-warnings": "traceProcessWarnings",
} as const;

const reportOptions = {
  compact: "compact",
  directory: "directory",
  filename: "filename",
  signal: "signal",
  "report-on-fatal-error": "reportOnFatalError",
  "report-on-signal": "reportOnSignal",
  "report-on-uncaught-exception": "reportOnUncaughtException",
  "exclude-env": "excludeEnv",
  "exclude-network": "excludeNetwork",
} as const;

function getId(kind: Identity): number {
  const fn = {
    uid: nodeProcess.getuid,
    euid: nodeProcess.geteuid,
    gid: nodeProcess.getgid,
    egid: nodeProcess.getegid,
  }[kind];
  if (!fn) {
    throw unsupportedNodeApi(`process.get${kind}`, "unavailable on this host platform");
  }
  return fn();
}

function setId(kind: Identity, value: number | string): void {
  const fn = {
    uid: nodeProcess.setuid,
    euid: nodeProcess.seteuid,
    gid: nodeProcess.setgid,
    egid: nodeProcess.setegid,
  }[kind];
  if (!fn) {
    throw unsupportedNodeApi(`process.set${kind}`, "unavailable on this host platform");
  }
  fn(value);
}

export const metadata: ProcessHost["metadata"] = () =>
  capture(() => ({
    arch: nodeProcess.arch,
    platform: nodeProcess.platform,
    pid: nodeProcess.pid,
    ppid: nodeProcess.ppid,
    argv: [...nodeProcess.argv],
    argv0: nodeProcess.argv0,
    execArgv: [...nodeProcess.execArgv],
    execPath: nodeProcess.execPath,
    version: nodeProcess.version,
    versions: Object.entries(nodeProcess.versions).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
    releaseJson: JSON.stringify(nodeProcess.release),
    configJson: JSON.stringify(nodeProcess.config),
    // Deprecated feature getters must not be read as a side effect of obtaining metadata.
    featuresJson: JSON.stringify(
      Object.fromEntries(
        Object.keys(nodeProcess.features)
          .filter((k) => !["ipv6", "uv", "tls_alpn", "tls_ocsp", "tls_sni"].includes(k))
          .map((k) => [k, Reflect.get(nodeProcess.features, k)]),
      ),
    ),
    hasPermission: nodeProcess.permission !== undefined,
  }));

export const getState: ProcessHost["getState"] = () =>
  capture(() => ({
    title: nodeProcess.title,
    debugPort: nodeProcess.debugPort,
    exitCode:
      nodeProcess.exitCode == null
        ? undefined
        : typeof nodeProcess.exitCode === "string"
          ? { tag: "text" as const, val: nodeProcess.exitCode }
          : { tag: "number" as const, val: nodeProcess.exitCode },
    noDeprecation: nodeProcess.noDeprecation,
    throwDeprecation: nodeProcess.throwDeprecation,
    traceDeprecation: nodeProcess.traceDeprecation,
    traceProcessWarnings: nodeProcess.traceProcessWarnings,
    sourceMapsEnabled: nodeProcess.sourceMapsEnabled,
    connected: nodeProcess.connected,
  }));

export const setTitle: ProcessHost["setTitle"] = (value) =>
  capture(() => {
    nodeProcess.title = value;
  });

export const setDebugPort: ProcessHost["setDebugPort"] = (value) =>
  capture(() => {
    nodeProcess.debugPort = value;
  });

export const setExitCode: ProcessHost["setExitCode"] = (value) =>
  capture(() => {
    nodeProcess.exitCode = value?.val;
  });

export const setFlag: ProcessHost["setFlag"] = (name, value) =>
  capture(() => {
    nodeProcess[flags[name]] = value;
  });

export const envEntries: ProcessHost["envEntries"] = () =>
  capture(() =>
    Object.entries(nodeProcess.env).filter((e): e is [string, string] => e[1] !== undefined),
  );

export const envGet: ProcessHost["envGet"] = (name) => capture(() => nodeProcess.env[name]);

export const envSet: ProcessHost["envSet"] = (name, value) =>
  capture(() => {
    if (value === undefined) {
      delete nodeProcess.env[name];
    } else {
      nodeProcess.env[name] = value;
    }
  });

export const cwd: ProcessHost["cwd"] = () => capture(() => nodeProcess.cwd());

export const chdir: ProcessHost["chdir"] = (directory) =>
  capture(() => nodeProcess.chdir(directory));

export const cpuUsage: ProcessHost["cpuUsage"] = (previous) =>
  capture(() => nodeProcess.cpuUsage(previous));

export const threadCpuUsage: ProcessHost["threadCpuUsage"] = (previous) =>
  capture(() => nodeProcess.threadCpuUsage(previous));

export const memoryUsage: ProcessHost["memoryUsage"] = () =>
  capture(() => nodeProcess.memoryUsage());

export const rss: ProcessHost["rss"] = () => capture(() => nodeProcess.memoryUsage.rss());

export const resourceUsage: ProcessHost["resourceUsage"] = () =>
  capture(() => {
    const { userCPUTime, systemCPUTime, maxRSS, ...rest } = nodeProcess.resourceUsage();
    return { ...rest, userCpuTime: userCPUTime, systemCpuTime: systemCPUTime, maxRss: maxRSS };
  });

export const hrtime: ProcessHost["hrtime"] = () =>
  capture(() => {
    const [seconds, nanoseconds] = nodeProcess.hrtime();
    return { seconds, nanoseconds };
  });

export const uptime: ProcessHost["uptime"] = () => capture(() => nodeProcess.uptime());

export const availableMemory: ProcessHost["availableMemory"] = () =>
  capture(() => nodeProcess.availableMemory());

export const constrainedMemory: ProcessHost["constrainedMemory"] = () =>
  capture(() => nodeProcess.constrainedMemory());

export const getActiveResourcesInfo: ProcessHost["getActiveResourcesInfo"] = () =>
  capture(() => nodeProcess.getActiveResourcesInfo());

export const getIdCapability: ProcessHost["getId"] = (kind) => capture(() => getId(kind));

export { getIdCapability as getId };

export const setIdCapability: ProcessHost["setId"] = (kind, value) =>
  capture(() => setId(kind, value.val));

export { setIdCapability as setId };

export const getgroups: ProcessHost["getgroups"] = () =>
  capture(() => {
    if (!nodeProcess.getgroups) {
      throw unsupportedNodeApi("process.getgroups", "unavailable on this host platform");
    }
    return nodeProcess.getgroups();
  });

export const setgroups: ProcessHost["setgroups"] = (groups) =>
  capture(() => {
    if (!nodeProcess.setgroups) {
      throw unsupportedNodeApi("process.setgroups", "unavailable on this host platform");
    }
    nodeProcess.setgroups(groups.map((v) => v.val));
  });

export const initgroups: ProcessHost["initgroups"] = (user, extraGroup) =>
  capture(() => {
    const init = Reflect.get(nodeProcess, "initgroups") as
      | ((user: string | number, group: string | number) => void)
      | undefined;
    if (!init) {
      throw unsupportedNodeApi("process.initgroups", "unavailable on this host platform");
    }
    init(user.val, extraGroup.val);
  });

export const kill: ProcessHost["kill"] = (pid, signal) =>
  capture(() => nodeProcess.kill(pid, signal.val));

export const umask: ProcessHost["umask"] = (mask) => capture(() => nodeProcess.umask(mask.val));

export const exit: ProcessHost["exit"] = (code) => capture(() => nodeProcess.exit(code?.val));

export const abort: ProcessHost["abort"] = () => capture(() => nodeProcess.abort());

export const execve: ProcessHost["execve"] = (file, args, env) =>
  capture(() => {
    if (!nodeProcess.execve) {
      throw unsupportedNodeApi("process.execve", "unavailable on this host platform");
    }
    nodeProcess.execve(file, args, env === undefined ? nodeProcess.env : Object.fromEntries(env));
  });

export const loadEnvFile: ProcessHost["loadEnvFile"] = (value) =>
  capture(() => nodeProcess.loadEnvFile(value === undefined ? undefined : path(value)));

export const setSourceMapsEnabled: ProcessHost["setSourceMapsEnabled"] = (value) =>
  capture(() => nodeProcess.setSourceMapsEnabled(value));

export const emitWarning: ProcessHost["emitWarning"] = (value) =>
  capture(() => nodeProcess.emitWarning(warning(value)));

export const permissionHas: ProcessHost["permissionHas"] = (scope, reference) =>
  capture(() => {
    if (!nodeProcess.permission) {
      throw unsupportedNodeApi(
        "process.permission.has",
        "the host was started without --permission",
      );
    }
    return Reflect.apply(nodeProcess.permission.has, nodeProcess.permission, [
      scope,
      reference === undefined ? undefined : path(reference),
    ]) as boolean;
  });

export const getReport: ProcessHost["getReport"] = (error) =>
  capture(() =>
    JSON.stringify(nodeProcess.report.getReport(error === undefined ? undefined : warning(error))),
  );

export const writeReport: ProcessHost["writeReport"] = (filename, error) =>
  capture(() =>
    nodeProcess.report.writeReport(filename, error === undefined ? undefined : warning(error)),
  );

export const getReportOptions: ProcessHost["getReportOptions"] = () =>
  capture(() => ({
    compact: nodeProcess.report.compact,
    directory: nodeProcess.report.directory,
    filename: nodeProcess.report.filename,
    signal: nodeProcess.report.signal,
    reportOnFatalError: nodeProcess.report.reportOnFatalError,
    reportOnSignal: nodeProcess.report.reportOnSignal,
    reportOnUncaughtException: nodeProcess.report.reportOnUncaughtException,
    excludeEnv: nodeProcess.report.excludeEnv,
    excludeNetwork: Reflect.get(nodeProcess.report, "excludeNetwork") as boolean,
  }));

export const setReportOption: ProcessHost["setReportOption"] = (name, value) =>
  capture(() => {
    Reflect.set(nodeProcess.report, reportOptions[name], value.val);
  });

export const allowedFlags: ProcessHost["allowedFlags"] = () =>
  capture(() => {
    const flags: string[] = [];
    nodeProcess.allowedNodeEnvironmentFlags.forEach((flag) => flags.push(flag));
    return flags;
  });

export const allowedFlag: ProcessHost["allowedFlag"] = (value) =>
  capture(() => nodeProcess.allowedNodeEnvironmentFlags.has(value));

const host: ProcessHost = {
  metadata,
  getState,
  setTitle,
  setDebugPort,
  setExitCode,
  setFlag,
  envEntries,
  envGet,
  envSet,
  cwd,
  chdir,
  cpuUsage,
  threadCpuUsage,
  memoryUsage,
  rss,
  resourceUsage,
  hrtime,
  uptime,
  availableMemory,
  constrainedMemory,
  getActiveResourcesInfo,
  getId: getIdCapability,
  setId: setIdCapability,
  getgroups,
  setgroups,
  initgroups,
  kill,
  umask,
  exit,
  abort,
  execve,
  loadEnvFile,
  setSourceMapsEnabled,
  emitWarning,
  permissionHas,
  getReport,
  writeReport,
  getReportOptions,
  setReportOption,
  allowedFlags,
  allowedFlag,
};

export default host;
