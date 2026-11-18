import type { CoreModule } from '../../runtime.js';

/**
 * Log runtime diagnostics when enabled at module load. Snapshot the environment
 * so hot runtime operations never read process.env.
 *
 * A logger which logs declares the message it takes and one which does nothing
 * declares no parameter, so that operations can tell them apart by `length` and
 * skip work which only serves logging.
 * Call sites use a DEBUG label so a bundler can remove argument evaluation too.
 * @param args Values to log.
 */
export const debugLog: CoreModule['debugLog'] = (
    globalThis as typeof globalThis & { process?: { env?: { JCO_DEBUG?: unknown } } }
)?.process?.env?.JCO_DEBUG
    ? (message, ...args) => console.debug(message, ...args)
    : () => {};
