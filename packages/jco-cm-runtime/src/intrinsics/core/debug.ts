import type { CoreModule } from '../../runtime.js';

/**
 * Whether `JCO_DEBUG` was set when the runtime was loaded.
 *
 * Read once: on Node.js, every access to `process.env` is a native property lookup, and
 * `debugLog` is called from hot intrinsics such as `context.get`.
 */
const DEBUG = Boolean(
    (globalThis as typeof globalThis & { process?: { env?: { JCO_DEBUG?: unknown } } })?.process?.env?.JCO_DEBUG,
);

/**
 * Log runtime debug output with `console.debug` when `JCO_DEBUG` was set at load time, and do
 * nothing otherwise.
 *
 * @param args - values passed to `console.debug`
 */
export const debugLog: CoreModule['debugLog'] = DEBUG
    ? (...args) => {
          console.debug(...args);
      }
    : () => {};
