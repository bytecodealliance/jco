import type { StreamEndConstructor, StreamPayloadEnd } from '../../runtime.js';
/** Type-only view of the selected constructor, leaving the direction for the subclass to define. */
export type StreamEndSuperclass = Pick<StreamEndConstructor, 'CopyState' | 'CopyResult'> & {
    new (
        ...args: ConstructorParameters<StreamEndConstructor>
    ): Omit<StreamPayloadEnd, 'isReadable' | 'isWritable' | '_transfer'>;
};
