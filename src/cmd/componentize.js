import { freemem } from "node:os";
import { readFile, writeFile } from "node:fs/promises";
import { resolve, basename } from "node:path";

import c from "chalk-template";

export async function componentize(jsSource, opts) {
  const { componentize: componentizeFn } = await eval(
    'import("@bytecodealliance/componentize-js")',
  );
  if (opts.disable?.includes("all")) {
    opts.disable = ["stdio", "random", "clocks", "http"];
  }
  const source = await readFile(jsSource, "utf8");
  const { component } = await componentizeFn(source, {
    enableAot: opts.aot,
    aotMinStackSizeBytes: opts.aotMinStackSizeBytes ?? defaultMinStackSize(),
    wevalBin: opts.wevalBin,
    sourceName: basename(jsSource),
    witPath: resolve(opts.wit),
    worldName: opts.worldName,
    disableFeatures: opts.disable,
    enableFeatures: opts.enable,
    preview2Adapter: opts.preview2Adapter,
  });
  await writeFile(opts.out, component);
  console.log(c`{green OK} Successfully written {bold ${opts.out}}.`);
}

/**
 * Calculate the min stack size depending on free memory
 *
 * @param {number} freeMemoryBytes - Amount of free memory in the system, in bytes  (if not provided, os.freemem() is used)
 * @returns {number} The minimum stack size that should be used as a default.
 */
function defaultMinStackSize(freeMemoryBytes) {
  freeMemoryBytes = freeMemoryBytes ?? freemem();
  return Math.max(8 * 1024 * 1024, Math.floor(freeMemoryBytes * 0.1));
}
