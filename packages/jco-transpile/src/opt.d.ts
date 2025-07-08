/**
 * @typedef {{
 *  quiet: boolean,
 *  asyncify?: boolean,
 *  optArgs?: string[],
 *  noVerify?: boolean
 * }} OptimizeOptions
 */
/**
 * @typedef {{
 *  component: Uint8Array,
 *  compressionInfo: { beforeBytes: number, afterBytes: number }[],
 * }} OptimizeResult
 */
/**
 * Perform optimization for a given component
 *
 * @param {Uint8Array} componentBytes
 * @param {OptimizeOptions} [opts]
 * @returns {Promise<OptimizeResult>}
 */
export declare function runOptimizeComponent(componentBytes: any, opts: any): Promise<{
    component: Uint8Array<any>;
    compressionInfo: any;
}>;
