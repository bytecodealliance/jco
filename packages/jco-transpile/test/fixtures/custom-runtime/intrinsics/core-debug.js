// Independent API-v2 implementation; type-only contract imports are erased.
export const debugLog = (...args) => {
    const host = globalThis;
    if (!host?.process?.env?.JCO_DEBUG) {
        return;
    }
    console.debug(...args);
};
