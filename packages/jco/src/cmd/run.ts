import { rm, mkdir, writeFile, symlink } from "node:fs/promises";
import { basename, resolve, extname } from "node:path";
import { spawn } from "node:child_process";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { getTmpDir, styleText } from "../common.js";
import { transpileCmd } from "./transpile.js";

const DEFAULT_SERVE_HOST = "localhost";

export interface GetSandboxSetupArgs {
    sandbox?: boolean;
    sandboxEnvSet?: readonly string[];
    sandboxEnvInherit?: boolean;
    sandboxFsPreopen?: readonly string[];
    sandboxNetInherit?: boolean;
}

interface RunComponentOptions extends GetSandboxSetupArgs {
    jcoDir?: string;
    jcoImport?: string;
    jcoImportBindings?: "js" | "optimized" | "hybrid" | "direct-optimized";
    jcoMap?: string[];
    jcoTrace?: boolean;
}

export type RunOptions = RunComponentOptions;

export interface ServeOptions extends RunComponentOptions {
    host?: string;
    port?: string;
}

export async function run(componentPath: string, args: string[], opts: RunOptions) {
    // Ensure that `args` is an array
    args = [...args];
    return runComponent(
        componentPath,
        args,
        opts,
        `
    if (!mod.run || !mod.run.run) {
      console.error('Not a valid command component to execute.');
      process.exit(1);
    }
    try {
      mod.run.run();
      // for stdout flushing
      await new Promise(resolve => setTimeout(resolve));
      process.exit(0);
    }
    catch (e) {
      console.error(e);
      process.exit(1);
    }
  `,
    );
}

export async function serve(componentPath: string, args: string[], opts: ServeOptions) {
    let tryFindPort = false;
    let { port, host } = opts;
    if (port === undefined) {
        tryFindPort = true;
        port = "8000";
    }
    // Ensure that `args` is an array
    args = [...args];
    host = host ?? DEFAULT_SERVE_HOST;
    return runComponent(
        componentPath,
        args,
        opts,
        `
    import { HTTPServer } from '@bytecodealliance/preview2-shim/http';
    const server = new HTTPServer(mod.incomingHandler);
    let port = ${port};
    ${
        tryFindPort
            ? `
    while (true) {
      try {
        server.listen(port, ${JSON.stringify(host)});
        break;
      } catch (e) {
        if (e.code !== 'EADDRINUSE')
          throw e;
      }
      port++;
    }
    `
            : `server.listen(port, ${JSON.stringify(host)})`
    }
    console.error(\`Server listening @ ${host}:${port}...\`);
  `,
    );
}

async function runComponent(componentPath: string, args: string[], opts: RunComponentOptions, executor: string) {
    const jcoImport = opts.jcoImport ? resolve(opts.jcoImport) : null;

    const name = basename(componentPath.slice(0, -extname(componentPath).length || Infinity));
    const outDir = opts.jcoDir || (await getTmpDir());
    if (opts.jcoDir) {
        await mkdir(outDir, { recursive: true });
    }

    try {
        try {
            await transpileCmd(componentPath, {
                name,
                quiet: true,
                noTypescript: true,
                wasiShim: true,
                outDir,
                tracing: opts.jcoTrace,
                map: opts.jcoMap ? Object.fromEntries(opts.jcoMap.map((mapping) => mapping.split("="))) : undefined,
                importBindings: opts.jcoImportBindings,
            });
        } catch (e) {
            throw new Error("Unable to transpile command for execution", {
                cause: e,
            });
        }

        await writeFile(resolve(outDir, "package.json"), JSON.stringify({ type: "module" }));

        let preview2ShimPath;
        try {
            preview2ShimPath = resolve(
                fileURLToPath(import.meta.resolve("@bytecodealliance/preview2-shim")),
                "../../../",
            );
        } catch (err) {
            const error = err as Error;
            let msg = `${styleText(["red", "bold"], "error")} Failed to resolve ${styleText("bold", "@bytecodealliance/preview2-shim")}, ensure it is installed.`;
            msg += `\nERROR:\n${error.toString()}`;
            throw new Error(msg);
        }

        const modulesDir = resolve(outDir, "node_modules", "@bytecodealliance");
        await mkdir(modulesDir, { recursive: true });

        try {
            await symlink(preview2ShimPath, resolve(modulesDir, "preview2-shim"), "dir");
        } catch (e) {
            if ((e as NodeJS.ErrnoException).code !== "EEXIST") {
                throw e;
            }
        }

        const runPath = resolve(outDir, "_run.js");
        const sandboxSetup = getSandboxSetup(opts);
        await writeFile(
            runPath,
            `
      ${jcoImport ? `import ${JSON.stringify(pathToFileURL(jcoImport))}` : ""}
      import process from 'node:process';
      ${sandboxSetup}
      try {
        process.argv[1] = "${name}";
      } catch {}
      const mod = await import('./${name}.js');
      ${executor}
    `,
        );

        const nodePath = process.env.JCO_RUN_PATH || process.argv[0];

        process.exitCode = await new Promise((resolve, reject) => {
            const cp = spawn(
                nodePath,
                [...(process.env.JCO_RUN_ARGS ? process.env.JCO_RUN_ARGS.split(" ") : []), runPath, ...args],
                { stdio: "inherit" },
            );

            cp.on("error", reject);
            cp.on("exit", resolve);
        });
    } finally {
        try {
            if (!opts.jcoDir) {
                await rm(outDir, { recursive: true });
            }
        } catch {
            // empty
        }
    }
}

export function getSandboxSetup(opts: GetSandboxSetupArgs): string {
    if (!opts.sandbox) {
        if (
            opts.sandboxEnvSet?.length ||
            opts.sandboxEnvInherit ||
            opts.sandboxFsPreopen?.length ||
            opts.sandboxNetInherit
        ) {
            throw new Error("sandbox grants require --sandbox");
        }
        return "";
    }

    const env: Record<string, string> = opts.sandboxEnvInherit
        ? Object.fromEntries(
              Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
          )
        : {};
    for (const entry of opts.sandboxEnvSet ?? []) {
        const separator = entry.indexOf("=");
        const name = separator === -1 ? entry : entry.slice(0, separator);
        if (!name) {
            throw new Error("--sandbox-env-set requires a non-empty variable name");
        }
        const value = separator === -1 ? process.env[name] : entry.slice(separator + 1);
        if (value !== undefined) {
            env[name] = value;
        }
    }

    const preopens: Array<[guest: string, host: string]> = [];
    for (const entry of opts.sandboxFsPreopen ?? []) {
        const separator = entry.indexOf("::");
        const host = separator === -1 ? entry : entry.slice(0, separator);
        const guest = separator === -1 ? entry : entry.slice(separator + 2);
        if (!host || !guest) {
            throw new Error("--sandbox-fs-preopen must be HOST or HOST::GUEST");
        }
        preopens.push([guest, resolve(host)]);
    }

    const configurePreopens = [
        "_setPreopens({});",
        ...preopens.map(([guest, host]) => `_addPreopen(${JSON.stringify(guest)}, ${JSON.stringify(host)});`),
    ].join("\n      ");

    return `
      import { _setEnv, _setCwd } from '@bytecodealliance/preview2-shim/cli';
      import { _setPreopens, _addPreopen } from '@bytecodealliance/preview2-shim/filesystem';
      import { _denyDnsLookup, _denyTcp, _denyUdp } from '@bytecodealliance/preview2-shim/sockets';
      _setEnv(${JSON.stringify(env)});
      _setCwd(undefined);
      ${configurePreopens}
      ${opts.sandboxNetInherit ? "" : "_denyDnsLookup(); _denyTcp(); _denyUdp();"}
    `;
}
