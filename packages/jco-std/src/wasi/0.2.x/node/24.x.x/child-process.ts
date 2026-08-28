import { spawnSync as hostSpawnSync } from "jco:node/child-process@0.1.0";

import { createChildProcess } from "./child-process/core.js";

const childProcess = createChildProcess({ spawnSync: hostSpawnSync });

export const ChildProcess = childProcess.ChildProcess;
export const exec = childProcess.exec;
export const execFile = childProcess.execFile;
export const execFileSync = childProcess.execFileSync;
export const execSync = childProcess.execSync;
export const fork = childProcess.fork;
export const spawn = childProcess.spawn;
export const spawnSync = childProcess.spawnSync;
export default childProcess;
