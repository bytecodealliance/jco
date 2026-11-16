import type { CoreModule } from '../../runtime.js';

/**
 * Log runtime diagnostics when enabled at module load. Snapshot the environment
 * so hot runtime operations never read process.env.
 * @param args Values to log.
 */
export const debugLog: CoreModule['debugLog'] = (
    globalThis as typeof globalThis & { process?: { env?: { JCO_DEBUG?: unknown } } }
)?.process?.env?.JCO_DEBUG
    ? (...args) => console.debug(...args)
    : () => {};
