import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, test } from "vitest";
import { injectNodeWitImports, HTTPS_WASI_SOCKETS_WIT_REQUIREMENTS } from "../../src/node-wit.js";
import { worldMetadataFor } from "../../src/cmd/componentize.js";

test.concurrent("TLS WIT injection is idempotent and shares IO 0.2.12 without feature handling", async (): Promise<void> => {
    const root = await mkdtemp(join(tmpdir(), "jco-tls-wit-"));
    try {
        const source = "package tests:tls; world untouched {} world component { export run: func(); }\n";
        await writeFile(join(root, "world.wit"), source);
        await injectNodeWitImports(root, "component", HTTPS_WASI_SOCKETS_WIT_REQUIREMENTS);
        const tlsPath = join(root, "deps/wasi-tls-0.2.0-draft/types.wit");
        const contract = await readFile(tlsPath, "utf8");
        expect(contract).not.toContain("@unstable");
        expect(contract).toContain("wasi:io/streams@0.2.12");
        expect(contract).toContain("is-available: func() -> bool");
        expect(await injectNodeWitImports(root, "component", HTTPS_WASI_SOCKETS_WIT_REQUIREMENTS)).toBeUndefined();
        const world = await readFile(join(root, "world.wit"), "utf8");
        expect(world).toContain("world untouched {}");
        const metadata = await worldMetadataFor(root, "component");
        expect(metadata.imports).toContainEqual(
            expect.objectContaining({ namespace: "wasi", package: "tls", interface: "types" }),
        );
        expect(metadata.imports).toContainEqual(
            expect.objectContaining({ namespace: "wasi", package: "sockets", interface: "tcp" }),
        );
        expect(metadata.exports).toEqual([]); // Free-standing functions are not interface metadata.
        expect(metadata.imports).toContainEqual(
            expect.objectContaining({
                package: "io",
                interface: "streams",
                version: expect.objectContaining({ patch: 12n }),
            }),
        );
        expect(
            metadata.imports.filter((iface) => iface.package === "io").every((iface) => iface.version?.patch === 12n),
        ).toBe(true);
        expect(metadata.imports.some((iface) => iface.namespace === "jco")).toBe(false);
        expect(await readFile(tlsPath, "utf8")).toBe(contract);
        expect(await readFile(join(root, "world.wit"), "utf8")).toBe(world);
        expect((await worldMetadataFor(root, "component")).imports).toContainEqual(
            expect.objectContaining({ package: "tls" }),
        );
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
