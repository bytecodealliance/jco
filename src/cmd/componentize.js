import { stderr } from "node:process";
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
  const { component, debug } = await componentizeFn(source, {
    sourceName: basename(jsSource),

    enableAot: opts.aot,
    wevalBin: opts.wevalBin,

    witPath: resolve(opts.wit),
    worldName: opts.worldName,

    disableFeatures: opts.disable,
    enableFeatures: opts.enable,

    preview2Adapter: opts.preview2Adapter,

    debug: {
      bindings: opts.debugBindings,
      bindingsDir: opts.debugBindingsDir,
      binary: opts.debugBinary,
      binaryPath: opts.debugBinaryPath,
      enableWizerLogging: opts.debugEnableWizerLogging,
    },
  });

  await writeFile(opts.out, component);
  if (debug) {
    stderr.write(
      c`{cyan DEBUG} Debug output\n${JSON.stringify(debug, null, 2)}\n`,
    );
  }

  console.log(c`{green OK} Successfully written {bold ${opts.out}}.`);
}
