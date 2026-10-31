import type { StreamEndConstructor, StreamEndBase } from '../runtime.js';
/** Type-only view of the selected constructor, allowing native method overrides. */
export type StreamEndSuperclass = Pick<StreamEndConstructor, 'CopyState' | 'CopyResult'> & {
    new (
        ...args: ConstructorParameters<StreamEndConstructor>
    ): Omit<StreamEndBase, 'drop'> & { drop(options?: { allowPendingEvent?: boolean }): void };
};
