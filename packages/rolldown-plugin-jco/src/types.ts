import type { FilterPattern } from "@rollup/pluginutils";
import type { transpile } from "@bytecodealliance/jco";

export type JcoTranspileOptions = NonNullable<Parameters<typeof transpile>[1]>;

export interface JcoPluginOptions {
    /**
     * Files handled by the plugin. All `.wasm` imports are included by default.
     */
    include?: FilterPattern;

    /**
     * Files excluded from component handling.
     */
    exclude?: FilterPattern;

    /**
     * Options forwarded to Jco. `name` and `outDir` are owned by the plugin.
     */
    transpile?: Omit<JcoTranspileOptions, "name" | "outDir">;

    /**
     * Override the deterministic name passed to Jco for a component.
     */
    name?: (id: string) => string;
}
