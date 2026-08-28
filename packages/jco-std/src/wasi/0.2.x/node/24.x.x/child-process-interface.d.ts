import type { HostSpawnOptions, HostSpawnOutput } from "./child-process/types.js";

export function spawnSync(
  command: string,
  args: string[],
  options: HostSpawnOptions,
): HostSpawnOutput;
