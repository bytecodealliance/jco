/**
 * @typedef {{
 *   wit: string,
 *   out: string,
 *   worldName?: string,
 *   bundle?: boolean,
 *   bundleConfig?: string,
 *   aot?: boolean,
 *   aotMinStackSizeBytes?: number,
 *   wevalBin?: string,
 *   disable?: string[],
 *   enable?: string[],
 *   debug?: boolean,
 *   preview2Adapter?: string,
 *   debugStarlingmonkeyBuild?: boolean,
 *   engine?: string,
 *   debugBindings?: boolean,
 *   debugBindingsDir?: string,
 *   debugBinary?: boolean,
 *   debugBinaryPath?: string,
 *   debugEnableWizerLogging?: boolean,
 * }} ComponentizeOptions
 */
/**
 * Componentize a JavaScript entry module against a WIT world.
 *
 * @param {string} jsSource
 * @param {ComponentizeOptions} opts
 */
export function componentize(jsSource: string, opts: ComponentizeOptions): Promise<void>;
export type ComponentizeOptions = {
    wit: string;
    out: string;
    worldName?: string;
    bundle?: boolean;
    bundleConfig?: string;
    aot?: boolean;
    aotMinStackSizeBytes?: number;
    wevalBin?: string;
    disable?: string[];
    enable?: string[];
    debug?: boolean;
    preview2Adapter?: string;
    debugStarlingmonkeyBuild?: boolean;
    engine?: string;
    debugBindings?: boolean;
    debugBindingsDir?: string;
    debugBinary?: boolean;
    debugBinaryPath?: string;
    debugEnableWizerLogging?: boolean;
};
//# sourceMappingURL=componentize.d.ts.map