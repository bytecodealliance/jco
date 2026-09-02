import {
  arch as hostArch,
  availableParallelism as hostAvailableParallelism,
  cpus as hostCpus,
  endianness as hostEndianness,
  freemem as hostFreemem,
  getPriority as hostGetPriority,
  getStaticProperties as hostGetStaticProperties,
  homedir as hostHomedir,
  hostname as hostHostname,
  loadavg as hostLoadavg,
  machine as hostMachine,
  networkInterfaces as hostNetworkInterfaces,
  platform as hostPlatform,
  release as hostRelease,
  setPriority as hostSetPriority,
  tmpdir as hostTmpdir,
  totalmem as hostTotalmem,
  type as hostType,
  uptime as hostUptime,
  userInfo as hostUserInfo,
  version as hostVersion,
} from "jco:node/os@0.1.0";

import { createOs } from "./os/core.js";

const os = createOs({
  getStaticProperties: hostGetStaticProperties,
  arch: hostArch,
  availableParallelism: hostAvailableParallelism,
  cpus: hostCpus,
  endianness: hostEndianness,
  freemem: hostFreemem,
  getPriority: hostGetPriority,
  homedir: hostHomedir,
  hostname: hostHostname,
  loadavg: hostLoadavg,
  machine: hostMachine,
  networkInterfaces: hostNetworkInterfaces,
  platform: hostPlatform,
  release: hostRelease,
  setPriority: hostSetPriority,
  tmpdir: hostTmpdir,
  totalmem: hostTotalmem,
  type: hostType,
  uptime: hostUptime,
  userInfo: hostUserInfo,
  version: hostVersion,
});

export const EOL = os.EOL;
export const arch = os.arch;
export const availableParallelism = os.availableParallelism;
export const constants = os.constants;
export const cpus = os.cpus;
export const devNull = os.devNull;
export const endianness = os.endianness;
export const freemem = os.freemem;
export const getPriority = os.getPriority;
export const homedir = os.homedir;
export const hostname = os.hostname;
export const loadavg = os.loadavg;
export const machine = os.machine;
export const networkInterfaces = os.networkInterfaces;
export const platform = os.platform;
export const release = os.release;
export const setPriority = os.setPriority;
export const tmpdir = os.tmpdir;
export const totalmem = os.totalmem;
export const type = os.type;
export const uptime = os.uptime;
export const userInfo = os.userInfo;
export const version = os.version;
export default os;

export type * from "./os/types.js";
