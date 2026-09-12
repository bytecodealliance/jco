import { createV8 } from "../../../../../../src/wasi/0.2.x/node/24.x.x/v8/core.js";
import host from "../../../../../../src/wasi/0.2.x/node/24.x.x/v8-host-node.js";
import denied from "../../../../../../src/wasi/0.2.x/node/24.x.x/v8-host.js";

export const v8 = createV8(host);

export const blocked = createV8(denied);

export const deniedError = { name: "Error", code: "ERR_JCO_V8_ADAPTER_REQUIRED" };

export const unsupportedError = { name: "Error", code: "ERR_JCO_UNSUPPORTED_NODE_API" };

/** Isolate native flags and coverage changes from Vitest's own V8 isolate. */
export async function runNode(
  source: string,
  environment: Record<string, string> = {},
): Promise<string> {
  const { execFileSync } = await import("node:child_process");
  const host = new URL(
    "../../../../../../dist/wasi/0.2.x/node/24.x.x/v8-host-node.js",
    import.meta.url,
  ).href;
  const core = new URL("../../../../../../dist/wasi/0.2.x/node/24.x.x/v8/core.js", import.meta.url)
    .href;
  const script = `import host from ${JSON.stringify(host)};\nimport { createV8 } from ${JSON.stringify(core)};\nconst v8 = createV8(host);\n${source}`;

  return execFileSync(process.execPath, ["--input-type=module", "-e", script], {
    encoding: "utf8",
    env: { ...process.env, ...environment },
    timeout: 30_000,
  }).trim();
}
