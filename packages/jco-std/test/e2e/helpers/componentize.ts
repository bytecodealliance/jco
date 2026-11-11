import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import { componentize as componentizeCurrent } from "@bytecodealliance/componentize-js";
import { componentize as componentizeLegacy } from "@bytecodealliance/componentize-js-0-19-3";

const packageDir = fileURLToPath(new URL("../../../", import.meta.url));

// Resolve each componentizer's own shim: pnpm may hoist a different version from the test's.
// Use Node's loader so external componentizers and the harness share the same module instance.
// Grant only the fixture package directory to the WIT splicer.
for (const name of [
  "@bytecodealliance/componentize-js",
  "@bytecodealliance/componentize-js-0-19-3",
]) {
  const componentizerRequire = createRequire(import.meta.resolve(name));
  const filesystem = componentizerRequire("@bytecodealliance/preview2-shim/filesystem") as {
    preopens: { getDirectories(): [unknown, string][] };
    _addPreopen(guest: string, host: string): void;
  };
  if (
    !filesystem.preopens
      .getDirectories()
      .some((entry: [unknown, string]) => entry[1] === packageDir)
  ) {
    filesystem._addPreopen(packageDir, packageDir);
  }
}

export { componentizeCurrent, componentizeLegacy };
