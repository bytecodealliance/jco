import { adapterRequiredMessage } from "./internal/deny-host.js";
import type { ProcessHost, ProcessError } from "./process/types.js";

const denied = (): never => {
  throw {
    name: "Error",
    message: adapterRequiredMessage("node:process"),
    code: "ERR_JCO_PROCESS_ADAPTER_REQUIRED",
  } satisfies ProcessError;
};
export const metadata: ProcessHost["metadata"] = denied;
export const getState: ProcessHost["getState"] = denied;
export const setTitle: ProcessHost["setTitle"] = denied;
export const setDebugPort: ProcessHost["setDebugPort"] = denied;
export const setExitCode: ProcessHost["setExitCode"] = denied;
export const setFlag: ProcessHost["setFlag"] = denied;
export const envEntries: ProcessHost["envEntries"] = denied;
export const envGet: ProcessHost["envGet"] = denied;
export const envSet: ProcessHost["envSet"] = denied;
export const cwd: ProcessHost["cwd"] = denied;
export const chdir: ProcessHost["chdir"] = denied;
export const cpuUsage: ProcessHost["cpuUsage"] = denied;
export const threadCpuUsage: ProcessHost["threadCpuUsage"] = denied;
export const memoryUsage: ProcessHost["memoryUsage"] = denied;
export const rss: ProcessHost["rss"] = denied;
export const resourceUsage: ProcessHost["resourceUsage"] = denied;
export const hrtime: ProcessHost["hrtime"] = denied;
export const uptime: ProcessHost["uptime"] = denied;
export const availableMemory: ProcessHost["availableMemory"] = denied;
export const constrainedMemory: ProcessHost["constrainedMemory"] = denied;
export const getActiveResourcesInfo: ProcessHost["getActiveResourcesInfo"] = denied;
export const getId: ProcessHost["getId"] = denied;
export const setId: ProcessHost["setId"] = denied;
export const getgroups: ProcessHost["getgroups"] = denied;
export const setgroups: ProcessHost["setgroups"] = denied;
export const initgroups: ProcessHost["initgroups"] = denied;
export const kill: ProcessHost["kill"] = denied;
export const umask: ProcessHost["umask"] = denied;
export const exit: ProcessHost["exit"] = denied;
export const abort: ProcessHost["abort"] = denied;
export const execve: ProcessHost["execve"] = denied;
export const loadEnvFile: ProcessHost["loadEnvFile"] = denied;
export const setSourceMapsEnabled: ProcessHost["setSourceMapsEnabled"] = denied;
export const emitWarning: ProcessHost["emitWarning"] = denied;
export const permissionHas: ProcessHost["permissionHas"] = denied;
export const getReport: ProcessHost["getReport"] = denied;
export const writeReport: ProcessHost["writeReport"] = denied;
export const getReportOptions: ProcessHost["getReportOptions"] = denied;
export const setReportOption: ProcessHost["setReportOption"] = denied;
export const allowedFlags: ProcessHost["allowedFlags"] = denied;
export const allowedFlag: ProcessHost["allowedFlag"] = denied;
export default {
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
  getId,
  setId,
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
} satisfies ProcessHost;
