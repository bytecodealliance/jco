import { platform } from 'node:process';

import { _addPreopen, preopens } from '@bytecodealliance/preview2-shim/filesystem';

/** Preserve host-path WIT support with preview2-shim versions that start with no preopens. */
export function ensureWitFilesystemPreopen() {
    // Vendored components cache their preopens on the first filesystem call.
    // Keep the default root mount for later calls with other WIT paths.
    if (preopens.getDirectories().length === 0) {
        // The package declarations describe browser file data; Node uses a host path.
        (_addPreopen as (virtualPath: string, hostPath: string) => void)('/', platform === 'win32' ? '//' : '/');
    }
}
