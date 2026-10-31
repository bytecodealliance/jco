import type { FutureEndBase, FutureEndConstructor, FutureEndOptions } from '../runtime.js';

// Model the prototype override as a method while the public structural contract
// exposes readonly function capabilities. Assignment retains the selected constructor.
export type FutureEndSuperclass = Pick<FutureEndConstructor, 'CopyResult' | 'CopyState'> & {
    new (options: FutureEndOptions): Omit<FutureEndBase, 'drop'> & { drop(): void };
};
