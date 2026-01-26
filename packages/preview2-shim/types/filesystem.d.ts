export type * as preopens from './interfaces/wasi-filesystem-preopens.d.ts';
export type * as types from './interfaces/wasi-filesystem-types.d.ts';

import type { Descriptor } from './interfaces/wasi-filesystem-types.d.ts';

/**
 * Replace all preopens with the given set.
 * @param preopens - Map of virtual paths to host paths
 */
export function _setPreopens(preopens: Record<string, string>): void;

/**
 * Add a single preopen mapping.
 * @param virtualPath - The virtual path visible to the guest
 * @param hostPreopen - The host filesystem path
 */
export function _addPreopen(virtualPath: string, hostPreopen: string): void;

/**
 * Clear all preopens, giving the guest no filesystem access.
 * Call this immediately after import to disable default full filesystem access.
 */
export function _clearPreopens(): void;

/**
 * Get current preopens configuration.
 * @returns Array of [descriptor, virtualPath] pairs
 */
export function _getPreopens(): Array<[Descriptor, string]>;
