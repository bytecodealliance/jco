import nodePath from "node:path";

import { createPath, type PathModule } from "../../../../../../src/wasi/0.2.x/node/24.x.x/path.js";

/** Fixed working directories so cwd-dependent operations are deterministic without WASI. */
export const POSIX_CWD = "/workspace";
export const WIN32_CWD = "D:\\workspace";

/** The shim over explicit providers: a fixed initial cwd and an empty environment. */
export function path(initialCwd: () => string | undefined = () => POSIX_CWD): PathModule {
  return createPath({ initialCwd, getEnvironment: () => [] });
}

export type Flavor = "posix" | "win32";

/**
 * Each namespace of the shim paired with Node's own and the cwd it was given, for differential
 * checks. Node's `resolve` and `relative` consult `process.cwd()`, so an oracle that must agree
 * with the shim prepends that cwd as the first segment instead.
 */
export function flavors(): ReadonlyArray<
  readonly [Flavor, PathModule, typeof nodePath.posix, string]
> {
  const module = createPath({ initialCwd: () => POSIX_CWD, getEnvironment: () => [] });
  const win32 = createPath({ initialCwd: () => WIN32_CWD, getEnvironment: () => [] });
  return [
    ["posix", module.posix, nodePath.posix, POSIX_CWD],
    ["win32", win32.win32, nodePath.win32, WIN32_CWD],
  ] as const;
}
