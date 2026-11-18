/**
 * Benchmark-only source substitutions. Each variant changes one cost relative to
 * DEBUG removal; these are probes, not production implementations or API proposals.
 * @param {string} source Runtime TypeScript source.
 * @param {string} id Source filename.
 * @param {string} variant Experiment name.
 * @returns {string} Transformed source.
 */
export function prototype(source, id, variant) {
    if (variant === 'direct-slots' && id.endsWith('/async-task/context.ts')) {
        return source.replace(
            'return getCurrentThread(context, meta.componentIdx, meta.threadID, meta.taskID)?.thread?.storage;',
            `if (meta.componentIdx === -1 || meta.threadID === undefined || meta.threadID === null || meta.threadID === 0) return undefined;
            const state = getOrCreateAsyncState(context.lookup, meta.componentIdx);
            const thread = state.threads.get(meta.threadID);
            return thread && thread.taskID() === meta.taskID ? thread.storage : undefined;`,
        );
    }
    if (variant === 'single-map-get' && id.endsWith('/intrinsics/component.ts')) {
        return source.replace(
            `if (!asyncState.has(componentIdx)) {\n        const newState = new ComponentAsyncState({ componentIdx });\n        asyncState.set(componentIdx, newState);\n    }\n    return asyncState.get(componentIdx)!;`,
            `let state = asyncState.get(componentIdx);
            if (state === undefined) {
                state = new ComponentAsyncState({ componentIdx });
                asyncState.set(componentIdx, state);
            }
            return state;`,
        );
    }
    if ((variant === 'param-cursor' || variant === 'cached-view') && id.endsWith('/intrinsics/lift.ts')) {
        const start = source.indexOf('export function liftFlatS32(');
        const end = source.indexOf('export function liftFlatU32(', start);
        let fn = source.slice(start, end);
        if (variant === 'param-cursor') {
            fn = fn
                .replace('ctx.params.length === 0', 'ctx.paramIndex >= ctx.params.length')
                .replace('val = ctx.params[0];', 'val = ctx.params[ctx.paramIndex++];')
                .replace('ctx.params = ctx.params.slice(1);', '');
        } else {
            fn = fn.replace(
                'new DataView(ctx.memory!.buffer).getInt32',
                `(ctx.cachedView?.buffer === ctx.memory!.buffer ? ctx.cachedView : (ctx.cachedView = new DataView(ctx.memory!.buffer))).getInt32`,
            );
        }
        return source.slice(0, start) + fn + source.slice(end);
    }
    return source;
}
