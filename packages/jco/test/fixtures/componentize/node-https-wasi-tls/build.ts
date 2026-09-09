import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { bundleComponentSource } from "../../../../dist/bundle.js";
import { componentize } from "../../../../dist/cmd/componentize.js";
import { nodeBuiltinPlugin } from "../../../../dist/node-builtins.js";
import { injectNodeWitImports, type NodeWitRequirement } from "../../../../dist/node-wit.js";
import { transpileBytes, writeFiles } from "@bytecodealliance/jco-transpile";
import { componentWit } from "@bytecodealliance/jco-transpile/wasm-tools";

const root = resolve(process.argv[2]);
const backend = process.argv[3];
if (backend !== "starlingmonkey" && backend !== "quickjs") {
    throw new Error("unknown backend");
}
const fixture = fileURLToPath(new URL("./", import.meta.url));
const std = fileURLToPath(new URL("../../../../../jco-std/dist/wasi/0.2.x/node/24.x.x/", import.meta.url));
await mkdir(root, { recursive: true });
await cp(join(fixture, "wit"), join(root, "wit"), { recursive: true });
const requirements: NodeWitRequirement[] = [];
const source = await bundleComponentSource(join(fixture, "component.js"), {
    external: [/^jco:/],
    plugins: [
        nodeBuiltinPlugin(
            { imports: [], exports: [] },
            {
                nodejsHttpVia: "wasi-sockets",
                wasiSocketsVersion: backend === "starlingmonkey" ? "0.2.10" : "0.2.12",
                httpsCoreModule: join(std, "https/core.js"),
                httpCoreModule: join(std, "http/core.js"),
                httpWasiSocketsImplementationModule: join(std, "http/impl/wasi-sockets/index.js"),
                onWitRequirement: (requirement: NodeWitRequirement): void => {
                    requirements.push(requirement);
                },
            },
        ),
    ],
});
await injectNodeWitImports(join(root, "wit"), "component", requirements);
await writeFile(join(root, "bundle.js"), source);
await componentize(join(root, "bundle.js"), {
    wit: join(root, "wit"),
    worldName: "component",
    backend,
    backendQjsDisableAysnc: false,
    ...(backend === "starlingmonkey" ? { disable: ["http"] } : {}),
    out: join(root, "component.wasm"),
});
const bytes = await readFile(join(root, "component.wasm"));
await writeFile(join(root, "imports.wit"), await componentWit(bytes));
const { files } = await transpileBytes(bytes, {
    name: "guest",
    instantiation: "async",
    base64Cutoff: 0,
    map: {
        ...Object.fromEntries(
            ["cli", "clocks", "filesystem", "http", "io", "random", "sockets"].map((name) => [
                `wasi:${name}/*`,
                `${name}#*`,
            ]),
        ),
        "wasi:tls/types@0.2.0-draft": "tls",
    },
});
await writeFiles(Object.fromEntries(Object.entries(files).map(([name, bytes]) => [join(root, name), bytes])));
await writeFile(join(root, "package.json"), '{"type":"module"}\n');
console.log("built", backend);
