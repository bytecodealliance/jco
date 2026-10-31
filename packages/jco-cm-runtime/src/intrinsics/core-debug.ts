import type { CoreModule } from '../runtime.js';

export const debugLog: CoreModule['debugLog'] = (...args) => {
    const host = globalThis as typeof globalThis & { process?: { env?: { JCO_DEBUG?: unknown } } };
    if (!host?.process?.env?.JCO_DEBUG) {
        return;
    }
    console.debug(...args);
};
