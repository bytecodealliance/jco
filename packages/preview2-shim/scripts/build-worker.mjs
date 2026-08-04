import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { rolldown } from "rolldown";

const packageDir = fileURLToPath(new URL("../", import.meta.url));
const outputDir = fileURLToPath(new URL("../dist/io/", import.meta.url));
const bundle = await rolldown({
    input: fileURLToPath(new URL("../dist/io/worker-thread.js", import.meta.url)),
    external: /^node:/,
    platform: "node",
});

try {
    await bundle.write({
        dir: outputDir,
        format: "esm",
        entryFileNames: "worker-thread.bundle.js",
        codeSplitting: false,
    });
} finally {
    await bundle.close();
}

const workerOutputs = (await readdir(outputDir)).filter((file) =>
    file.startsWith("worker-thread.bundle"),
);
if (workerOutputs.length !== 1 || workerOutputs[0] !== "worker-thread.bundle.js") {
    throw new Error(
        `Expected exactly one self-contained worker-thread.bundle.js in ${packageDir}, received: ${workerOutputs.join(", ")}`,
    );
}

const workerSource = await readFile(
    new URL("../dist/io/worker-thread.bundle.js", import.meta.url),
    "utf8",
);
const relativeDependency =
    /(?:\b(?:import|export)\b[^;]*?\bfrom\s*|\bimport\s*\()\s*["']\.|\bnew\s+URL\(\s*["']\./;
if (relativeDependency.test(workerSource)) {
    throw new Error("worker-thread.bundle.js must not contain relative JavaScript dependencies");
}
