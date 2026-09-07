import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { componentEmbed, componentNew, componentWit } from "@bytecodealliance/jco-transpile/wasm-tools";

export interface ResolvedWit {
    witPath: string;
    worldName: string;
    cleanup(): Promise<void>;
}

/**
 * Resolve opt-in WIT features before handing the graph to component backends that
 * cannot enable them. Binary WIT dependencies preserve resource identities and
 * feature metadata. The source WIT, including upstream annotations, is untouched.
 */
export async function resolveWitFeatures(
    witPath: string,
    worldName: string | undefined,
    features: string[],
): Promise<ResolvedWit> {
    const core = await componentEmbed({
        witPath: resolve(witPath),
        world: worldName,
        dummy: true,
        features: { tag: "list", val: features },
    });
    const sections = WebAssembly.Module.customSections(new WebAssembly.Module(new Uint8Array(core)), "component-type");
    if (sections.length !== 1) {
        throw new Error("Expected one resolved WIT component-type section");
    }
    // The dummy component gives us a root world referring to the original graph.
    // Keep that graph once, in binary form, so multiple IO versions are not re-added.
    const world = await componentWit(await componentNew(core, []));
    const root = await mkdtemp(join(tmpdir(), "jco-wit-features-"));
    try {
        await mkdir(join(root, "deps"));
        await writeFile(join(root, "deps", "resolved.wasm"), new Uint8Array(sections[0]));
        await writeFile(join(root, "world.wit"), world.replace("package root:component;", "package jco:resolved-wit;"));
    } catch (error) {
        await rm(root, { recursive: true, force: true });
        throw error;
    }
    return { witPath: root, worldName: "root", cleanup: () => rm(root, { recursive: true, force: true }) };
}
