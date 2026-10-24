import { isAbsolute, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Load the same public subpaths from an npm package, directory, or file URL. */
export function createRuntimeLoader(base) {
    if (!(base instanceof URL) && (typeof base !== 'string' || !base.trim())) {
        throw new TypeError('runtime base must be a non-empty package name, directory, or file URL');
    }
    let directory;
    if (base instanceof URL || base.startsWith('file:')) {
        directory = new URL(base);
        if (directory.protocol !== 'file:' || directory.search || directory.hash) {
            throw new TypeError('runtime directory URLs must use file: without a query or fragment');
        }
        if (!directory.pathname.endsWith('/')) {
            directory.pathname += '/';
        }
    } else if (isAbsolute(base) || /^(?:\.{1,2})(?:\/|$)/.test(base)) {
        directory = pathToFileURL(resolve(base) + sep);
    }

    const packageBase = directory ? undefined : base.replace(/\/+$/, '');
    return (suffix = '') =>
        import(
            directory
                ? new URL(`${suffix || 'index'}.js`, directory).href
                : suffix
                  ? `${packageBase}/${suffix}`
                  : packageBase
        );
}
