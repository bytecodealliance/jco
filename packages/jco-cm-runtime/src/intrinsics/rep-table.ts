import type { HandleIndexSpace, RepTableConstructor, TrapContext } from '../runtime.js';
import { debugLog } from './core/debug.js';
import { withConstructorStatics } from './core/shared-class.js';

// Canonical ABI `Table.MAX_LENGTH`: no index above it names an entry.
const MAX_LENGTH = 2 ** 28 - 1;

function defineRepTable() {
    return class RepTable<T = unknown> {
        #context: TrapContext;
        // What one `initializeRepTableClass` call shares between the instances it constructs.
        #store: { readonly free: symbol };

        #data: (T | number | symbol | null)[] = [0, null];
        #size = 0;
        target: unknown;
        // An index space shared with the other handle kinds of a component
        // instance (see `getHandleIndexSpace`); without one, this table keeps
        // its own free list.
        #space: Pick<HandleIndexSpace, 'alloc' | 'release'> | null = null;

        constructor(
            context: TrapContext,
            store: { readonly free: symbol },
            args?: { target?: unknown; space?: Pick<HandleIndexSpace, 'alloc' | 'release'> },
        ) {
            this.#context = context;
            this.#store = store;
            this.target = args?.target;
            this.#space = args?.space ?? null;
        }

        data() {
            return this.#data;
        }

        /**
         * Find the slot of `rep` in `#data`, or -1 if `rep` is outside the table
         * (Canonical ABI `Table.get`). `rep << 1` would wrap at 2 ** 31 and alias a live entry.
         *
         * @param rep - the index to look up
         * @returns the index of the entry's value in `#data`, or -1
         */
        #slot(rep: number): number {
            if (!Number.isInteger(rep) || rep <= 0 || rep > MAX_LENGTH) {
                return -1;
            }
            const idx = rep * 2;
            return idx < this.#data.length ? idx : -1;
        }

        insert(val: T): number {
            if (this.#space !== null) {
                const rep = this.#space.alloc();
                this.#data[rep * 2] = val;
                this.#data[rep * 2 + 1] = null;
                this.#size += 1;
                return rep;
            }
            DEBUG: debugLog('[RepTable#insert()] args', { val, target: this.target });
            const freeIdx = this.#data[0] as number;
            if (freeIdx === 0) {
                this.#data.push(val);
                this.#data.push(null);
                const rep = (this.#data.length >> 1) - 1;
                DEBUG: debugLog('[RepTable#insert()] inserted', { val, target: this.target, rep });
                this.#size += 1;
                return rep;
            }
            const placementIdx = freeIdx * 2;
            // The freelist is maintained internally; guest handle checks remain unconditional.
            SAFETY: if (this.#data[placementIdx] !== this.#store.free) {
                throw new Error('corrupt rep table freelist: head does not point at a freed slot');
            }
            this.#data[0] = this.#data[placementIdx + 1];
            this.#data[placementIdx] = val;
            this.#data[placementIdx + 1] = null;
            DEBUG: debugLog('[RepTable#insert()] inserted', { val, target: this.target, rep: freeIdx });
            this.#size += 1;
            return freeIdx;
        }

        get(rep: number): T | undefined {
            DEBUG: debugLog('[RepTable#get()] args', { rep, target: this.target });
            if (rep === 0) {
                throw new this.#context.RuntimeError('invalid resource rep during get, (cannot be 0)');
            }

            const baseIdx = this.#slot(rep);
            if (baseIdx < 0) {
                return undefined;
            }
            const val = this.#data[baseIdx];
            if (val === this.#store.free) {
                return undefined;
            }
            return val as T;
        }

        contains(rep: number): boolean {
            DEBUG: debugLog('[RepTable#contains()] args', { rep, target: this.target });
            if (rep === 0) {
                throw new Error('invalid resource rep during contains, (cannot be 0)');
            }

            const baseIdx = this.#slot(rep);
            if (baseIdx < 0) {
                return false;
            }
            const val = this.#data[baseIdx];
            return val !== this.#store.free && !!val;
        }

        remove(rep: number): T {
            DEBUG: debugLog('[RepTable#remove()] args', { rep, target: this.target });
            if (rep === 0) {
                throw new Error('invalid resource rep during remove, (cannot be 0)');
            }
            const baseIdx = this.#slot(rep);
            if (baseIdx < 0) {
                throw new this.#context.RuntimeError(`unknown handle index ${rep}`);
            }
            if (this.#space !== null) {
                const val = this.#data[baseIdx];
                if (val === undefined || val === this.#store.free) {
                    throw new this.#context.RuntimeError(`unknown handle index ${rep}`);
                }
                this.#data[baseIdx] = this.#store.free;
                this.#data[baseIdx + 1] = null;
                this.#size -= 1;
                this.#space.release(rep);
                return val as T;
            }
            const val = this.#data[baseIdx];
            if (val === this.#store.free) {
                throw new this.#context.RuntimeError(`double removal of rep [${rep}] (already freed)`);
            }

            this.#data[baseIdx] = this.#store.free;
            this.#data[baseIdx + 1] = this.#data[0];
            this.#data[0] = rep;
            this.#size -= 1;

            return val as T;
        }

        size() {
            return this.#size;
        }

        clear() {
            DEBUG: debugLog('[RepTable#clear()] args', { target: this.target });
            if (this.#space) {
                for (let rep = 1; rep < this.#data.length / 2; rep++) {
                    if (this.#data[rep * 2 + 1] === null && this.#data[rep * 2] !== this.#store.free) {
                        this.#space.release(rep);
                    }
                }
            }
            this.#size = 0;
            this.#data = [0, null];
        }
    };
}
let sharedRepTable: ReturnType<typeof defineRepTable>;

export function initializeRepTableClass(context: TrapContext): RepTableConstructor {
    const RepTable = (sharedRepTable ??= defineRepTable());
    // Sentinel marking a freed slot; the freelist link for a freed slot
    // lives in the odd cell. This keeps get()/contains()/remove() on freed
    // reps well-defined (previously they returned/corrupted freelist links).
    const store: { readonly free: symbol } = { free: Symbol('RepTable.free') };

    /**
     * Construct a table that uses the context.
     *
     * @param options - options of the table
     * @returns the table
     */
    class ContextRepTable extends RepTable {
        constructor(options?: ConstructorParameters<typeof RepTable>[2]) {
            super(context, store, options);
        }
    }
    return withConstructorStatics(ContextRepTable, {
        FREE: { value: store.free, enumerable: true },
    });
}
