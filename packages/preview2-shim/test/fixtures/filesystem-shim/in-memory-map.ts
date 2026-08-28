import type { FilesystemShim } from "../../../types/instantiation.js";
import type { FileData } from "../../../src/browser/filesystem.js";

type BrowserFilesystemModule = Pick<
    typeof import("../../../src/browser/filesystem.js"),
    "createFilesystem" | "InMemoryFilesystemAdapter"
>;

/**
 * Minimal example of an application-owned browser filesystem shim.
 *
 * Named roots and all of their file data live only in this Map. The preview2
 * browser filesystem supplies the WASI descriptor implementation; this shim
 * decides what application capability each sandbox preopen property names.
 */
export class MapFilesystemShim implements FilesystemShim {
    readonly roots = new Map<string, FileData>();
    readonly types;
    readonly preopens;
    readonly #browserFilesystem: BrowserFilesystemModule;
    readonly #adapter: InstanceType<BrowserFilesystemModule["InMemoryFilesystemAdapter"]>;

    constructor(browserFilesystem: BrowserFilesystemModule) {
        this.#browserFilesystem = browserFilesystem;
        this.#adapter = new browserFilesystem.InMemoryFilesystemAdapter();
        const empty = this.#createFilesystem({});
        this.types = empty.types;
        this.preopens = empty.preopens;
    }

    createPreopens(preopens: Record<string, unknown>) {
        const capabilities: Record<string, string> = {};
        for (const [guestPath, property] of Object.entries(preopens)) {
            if (typeof property !== "string") {
                throw new TypeError(`Map filesystem preopen ${guestPath} must name a root`);
            }
            capabilities[guestPath] = property;
        }
        return this.#createFilesystem(capabilities).preopens;
    }

    #createFilesystem(preopens: Record<string, string>) {
        return this.#browserFilesystem.createFilesystem({
            adapter: {
                getRoot: (name: string) => {
                    const root = this.roots.get(name);
                    if (!root) {
                        throw new TypeError(`unknown Map filesystem root ${JSON.stringify(name)}`);
                    }
                    return this.#adapter.getRoot(root);
                },
            },
            preopens,
        });
    }
}

export function createMapFilesystemShim(browserFilesystem: BrowserFilesystemModule) {
    const filesystem = new MapFilesystemShim(browserFilesystem);
    filesystem.roots.set("data", {
        dir: {
            "hello.txt": { source: "hello from a Map" },
            scratch: { dir: {} },
        },
    });
    return filesystem;
}
