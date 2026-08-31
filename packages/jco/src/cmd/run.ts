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
    isolateRequests?: "instance" | "worker";
    isolateWorkerPoolSize?: number;
    port?: string;
}

interface IncomingHandler {
    handle(request: unknown, responseOutparam: unknown): unknown;
}

export function createRequestIsolatedHandler(
    instantiate: (
        getCoreModule: (path: string) => WebAssembly.Module,
        imports: Record<string, unknown>,
    ) => { incomingHandler?: IncomingHandler },
    getCoreModule: (path: string) => WebAssembly.Module,
    getImportObject: () => Record<string, unknown>,
): IncomingHandler {
    return {
        handle(request, responseOutparam) {
            const instance = instantiate(getCoreModule, getImportObject());
            if (typeof instance.incomingHandler?.handle !== "function") {
                throw new Error("Not a valid HTTP server component to execute.");
            }
            return instance.incomingHandler.handle(request, responseOutparam);
        },
    };
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
    const workerPoolSize = opts.isolateWorkerPoolSize ?? 50;
    if (!Number.isInteger(workerPoolSize) || workerPoolSize < 1) {
        throw new Error("--isolate-worker-pool-size must be a positive integer");
    }
    const isolatedHandler =
        opts.isolateRequests === "instance"
            ? `(${createRequestIsolatedHandler.toString()})(
      mod.instantiate,
      getCoreModule,
      () => new WASIShim().getImportObject()
    )`
            : "mod.incomingHandler";
    return runComponent(
        componentPath,
        args,
        opts,
        opts.isolateRequests === "worker"
            ? `
    import http from 'node:http';
    import { Worker } from 'node:worker_threads';

    const workerUrl = new URL('./_serve_worker.js', import.meta.url);
    const workerPoolSize = ${workerPoolSize};
    const idleWorkers = [];
    const workerWaiters = [];

    function createWorker() {
      return new Promise((resolve, reject) => {
        const worker = new Worker(workerUrl);
        const onError = error => { cleanup(); reject(error); };
        const onExit = code => {
          cleanup();
          reject(new Error(\`Request worker exited during startup with code \${code}\`));
        };
        const onMessage = ({ port, error }) => {
          cleanup();
          if (error) {
            worker.terminate();
            reject(new Error(error));
          } else {
            resolve({ worker, port });
          }
        };
        const cleanup = () => {
          worker.off('error', onError);
          worker.off('exit', onExit);
          worker.off('message', onMessage);
        };
        worker.once('error', onError);
        worker.once('exit', onExit);
        worker.once('message', onMessage);
      });
    }

    function releaseWorker(entry) {
      const waiter = workerWaiters.shift();
      if (waiter) waiter(entry);
      else idleWorkers.push(entry);
    }

    function replenishWorker() {
      createWorker().then(releaseWorker, error => {
        console.error('Unable to replenish isolated request worker:', error);
        setTimeout(replenishWorker, 100);
      });
    }

    function retireWorker(entry) {
      entry.worker.terminate().finally(replenishWorker);
    }

    function acquireWorker() {
      const entry = idleWorkers.shift();
      if (entry) return Promise.resolve(entry);
      return new Promise(resolve => workerWaiters.push(resolve));
    }

    idleWorkers.push(...await Promise.all(Array.from({ length: workerPoolSize }, createWorker)));

    const server = http.createServer(async (request, response) => {
      let entry;
      let upstream;
      let settled = false;
      let aborted = false;
      request.once('aborted', () => {
        aborted = true;
        upstream?.destroy();
        if (entry && !settled) {
          settled = true;
          retireWorker(entry);
        }
      });
      entry = await acquireWorker();
      if (aborted) {
        retireWorker(entry);
        return;
      }
      const { worker, port: workerPort } = entry;
      const fail = error => {
        if (settled) return;
        settled = true;
        if (!response.headersSent) response.writeHead(502);
        response.end('Isolated component request failed');
        console.error(error);
        retireWorker(entry);
      };
      worker.once('error', fail);
      worker.once('exit', code => {
        if (!settled) fail(new Error(\`Request worker exited with code \${code}\`));
      });
      upstream = http.request({
        hostname: '127.0.0.1',
        port: workerPort,
        method: request.method,
        path: request.url,
        headers: request.headers,
      }, workerResponse => {
        response.writeHead(workerResponse.statusCode ?? 500, workerResponse.headers);
        workerResponse.pipe(response);
        workerResponse.once('end', () => {
          settled = true;
          retireWorker(entry);
        });
      });
      upstream.once('error', fail);
      request.pipe(upstream);
    });
    let port = ${port};
    while (true) {
      try {
        await new Promise((resolve, reject) => {
          const onError = error => { server.off('listening', onListening); reject(error); };
          const onListening = () => { server.off('error', onError); resolve(); };
          server.once('error', onError);
          server.once('listening', onListening);
          server.listen(port, ${JSON.stringify(host)});
        });
        break;
      } catch (error) {
        if (${tryFindPort} && error.code === 'EADDRINUSE') { port++; continue; }
        throw error;
      }
    }
    console.error(\`Server listening @ ${host}:\${port}...\`);
  `
            : `
    import { HTTPServer } from '@bytecodealliance/preview2-shim/http';
    ${
        opts.isolateRequests === "instance"
            ? `
    import { readFileSync } from 'node:fs';
    import { WASIShim } from '@bytecodealliance/preview2-shim/instantiation';
    const coreModules = new Map();
    function getCoreModule(path) {
      let module = coreModules.get(path);
      if (!module) {
        module = new WebAssembly.Module(readFileSync(new URL(path, import.meta.url)));
        coreModules.set(path, module);
      }
      return module;
    }
    `
            : ""
    }
    const server = new HTTPServer(${isolatedHandler});
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

async function runComponent(
    componentPath: string,
    args: string[],
    opts: RunComponentOptions & { isolateRequests?: "instance" | "worker" },
    executor: string,
) {
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
                instantiation: opts.isolateRequests ? "sync" : undefined,
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
        // Expose jco-std's default-deny Node host shims (child-process, cluster) to the component.
        try {
            const jcoStdPath = resolve(
                fileURLToPath(
                    import.meta.resolve("@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/child-process/host"),
                ),
                "../../../../../../",
            );
            try {
                await symlink(jcoStdPath, resolve(modulesDir, "jco-std"), "dir");
            } catch (e) {
                if ((e as NodeJS.ErrnoException).code !== "EEXIST") {
                    throw e;
                }
            }
        } catch (e) {
            // Older jco-std releases do not contain this optional capability.
            // A component that imports it will surface the missing provider at runtime.
            if ((e as NodeJS.ErrnoException).code !== "ERR_PACKAGE_PATH_NOT_EXPORTED") {
                throw e;
            }
        }

        // Make the deny-by-default node:console host available to generated code.
        // Selecting an output-capable provider still requires an explicit --map.
        try {
            const jcoStdPath = resolve(
                fileURLToPath(import.meta.resolve("@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/console/host")),
                "../../../../../../",
            );
            try {
                await symlink(jcoStdPath, resolve(modulesDir, "jco-std"), "dir");
            } catch (e) {
                if ((e as NodeJS.ErrnoException).code !== "EEXIST") {
                    throw e;
                }
            }
        } catch (e) {
            // Older jco-std releases do not contain this optional capability.
            if ((e as NodeJS.ErrnoException).code !== "ERR_PACKAGE_PATH_NOT_EXPORTED") {
                throw e;
            }
        }

        // Make the deny-by-default node:dns host available to generated code.
        // Network access still requires an explicit provider mapping.
        try {
            const jcoStdPath = resolve(
                fileURLToPath(import.meta.resolve("@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/dns/host")),
                "../../../../../../",
            );
            try {
                await symlink(jcoStdPath, resolve(modulesDir, "jco-std"), "dir");
            } catch (e) {
                if ((e as NodeJS.ErrnoException).code !== "EEXIST") {
                    throw e;
                }
            }
        } catch (e) {
            // Older jco-std releases do not contain this optional capability.
            if ((e as NodeJS.ErrnoException).code !== "ERR_PACKAGE_PATH_NOT_EXPORTED") {
                throw e;
            }
        }

        const runPath = resolve(outDir, "_run.js");
        const sandboxSetup = getSandboxSetup(opts);
        if (opts.isolateRequests === "worker") {
            await writeFile(
                resolve(outDir, "_serve_worker.js"),
                `
      ${jcoImport ? `import ${JSON.stringify(pathToFileURL(jcoImport))}` : ""}
      import { parentPort } from 'node:worker_threads';
      import { readFileSync } from 'node:fs';
      import { HTTPServer } from '@bytecodealliance/preview2-shim/http';
      import { WASIShim } from '@bytecodealliance/preview2-shim/instantiation';
      ${sandboxSetup}
      try {
        process.argv[1] = ${JSON.stringify(name)};
        const mod = await import('./${name}.js');
        const coreModules = new Map();
        const getCoreModule = path => {
          let module = coreModules.get(path);
          if (!module) {
            module = new WebAssembly.Module(readFileSync(new URL(path, import.meta.url)));
            coreModules.set(path, module);
          }
          return module;
        };
        const instance = mod.instantiate(getCoreModule, new WASIShim().getImportObject());
        const server = new HTTPServer(instance.incomingHandler);
        server.listen(0, '127.0.0.1');
        parentPort.postMessage({ port: server.address().port });
      } catch (error) {
        parentPort.postMessage({ error: error?.stack ?? String(error) });
      }
    `,
            );
        }
        await writeFile(
            runPath,
            `
      ${jcoImport && opts.isolateRequests !== "worker" ? `import ${JSON.stringify(pathToFileURL(jcoImport))}` : ""}
      import process from 'node:process';
      ${sandboxSetup}
      try {
        process.argv[1] = "${name}";
      } catch {}
      ${opts.isolateRequests === "worker" ? "" : `const mod = await import('./${name}.js');`}
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
