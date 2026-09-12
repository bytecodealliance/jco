import { createPath } from "../../24.x.x/path.js";

/** VFS paths are POSIX paths and never consult the process working directory. */
export const path = createPath({ initialCwd: () => "/", getEnvironment: () => [] }).posix;
