import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, test } from "vitest";
import { injectNodeWitImports, HTTPS_WASI_SOCKETS_WIT_REQUIREMENTS } from "../../src/node-wit.js";
import { worldMetadataFor } from "../../src/cmd/componentize.js";
import { resolveWitFeatures } from "../../src/wit-features.js";

test.concurrent("TLS WIT injection is idempotent and feature resolution preserves upstream sources", async (): Promise<void> => {
    const root = await mkdtemp(join(tmpdir(), "jco-tls-wit-"));
    try {
        const source = "package tests:tls; world untouched {} world component { export run: func(); }\n";
        await writeFile(join(root, "world.wit"), source);
        await injectNodeWitImports(root, "component", HTTPS_WASI_SOCKETS_WIT_REQUIREMENTS);
        const tlsPath = join(root, "deps/wasi-tls-0.2.0-draft/types.wit");
        const upstream = await readFile(tlsPath, "utf8");
        expect(upstream).toContain("@unstable(feature = tls)");
        expect(upstream).toContain("wasi:io/streams@0.2.6");
        expect(await injectNodeWitImports(root, "component", HTTPS_WASI_SOCKETS_WIT_REQUIREMENTS)).toBeUndefined();
        const world = await readFile(join(root, "world.wit"), "utf8");
        expect(world).toContain("world untouched {}");
        const resolved = await resolveWitFeatures(root, "component", ["tls"]);
        try {
            const metadata = await worldMetadataFor(resolved.witPath, resolved.worldName);
            expect(metadata.imports).toContainEqual(
                expect.objectContaining({ namespace: "wasi", package: "tls", interface: "types" }),
            );
            expect(metadata.imports).toContainEqual(
                expect.objectContaining({ namespace: "wasi", package: "sockets", interface: "tcp" }),
            );
            expect(metadata.exports).toEqual([]); // Free-standing functions are not interface metadata.
            expect(await readFile(tlsPath, "utf8")).toBe(upstream);
            expect(await readFile(join(root, "world.wit"), "utf8")).toBe(world);
        } finally {
            await resolved.cleanup();
        }
        expect((await worldMetadataFor(root, "component")).imports).toContainEqual(
            expect.objectContaining({ package: "tls" }),
        );
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
