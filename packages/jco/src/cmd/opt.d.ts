export function opt(componentPath: any, opts: any, program: any): Promise<void>;
/**
 *
 * @param {Uint8Array} componentBytes
 * @param {{ quiet: boolean, asyncify?: boolean, optArgs?: string[], noVerify?: boolean }} opts?
 * @returns {Promise<{ component: Uint8Array, compressionInfo: { beforeBytes: number, afterBytes: number }[] >}
 */
export function optimizeComponent(componentBytes: Uint8Array, opts: {
    quiet: boolean;
    asyncify?: boolean;
    optArgs?: string[];
    noVerify?: boolean;
}): Promise<{
    component: Uint8Array;
    compressionInfo: {
        beforeBytes: number;
        afterBytes: number;
    }[];
}>;
//# sourceMappingURL=opt.d.ts.map