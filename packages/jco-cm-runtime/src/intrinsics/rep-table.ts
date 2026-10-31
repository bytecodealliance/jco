import type { HandleIndexSpace, RepTableConstructor, TrapContext } from '../runtime.js';
import { debugLog } from './core-debug.js';
export function initializeRepTableClass(context: TrapContext): RepTableConstructor {
    const { RuntimeError } = context;
    class RepTable<T = unknown> {
        // Sentinel marking a freed slot; the freelist link for a freed slot
        // lives in the odd cell. This keeps get()/contains()/remove() on freed
        // reps well-defined (previously they returned/corrupted freelist links).
        static FREE = Symbol('RepTable.free');

        #data: (T | number | symbol | null)[] = [0, null];
        #size = 0;
        target: unknown;
        // An index space shared with the other handle kinds of a component
        // instance (see `getHandleIndexSpace`); without one, this table keeps
        // its own free list.
        #space: Pick<HandleIndexSpace, 'alloc' | 'release'> | null = null;

        constructor(args?: { target?: unknown; space?: Pick<HandleIndexSpace, 'alloc' | 'release'> }) {
            this.target = args?.target;
            this.#space = args?.space ?? null;
        }

        data() {
            return this.#data;
        }

        insert(val: T): number {
            if (this.#space !== null) {
                const rep = this.#space.alloc();
                this.#data[rep << 1] = val;
                this.#data[(rep << 1) + 1] = null;
                this.#size += 1;
                return rep;
            }
            debugLog('[RepTable#insert()] args', { val, target: this.target });
            const freeIdx = this.#data[0] as number;
            if (freeIdx === 0) {
                this.#data.push(val);
                this.#data.push(null);
                const rep = (this.#data.length >> 1) - 1;
                debugLog('[RepTable#insert()] inserted', { val, target: this.target, rep });
                this.#size += 1;
                return rep;
            }
            const placementIdx = freeIdx << 1;
            if (this.#data[placementIdx] !== RepTable.FREE) {
                throw new Error('corrupt rep table freelist: head does not point at a freed slot');
            }
            this.#data[0] = this.#data[placementIdx + 1];
            this.#data[placementIdx] = val;
            this.#data[placementIdx + 1] = null;
            debugLog('[RepTable#insert()] inserted', { val, target: this.target, rep: freeIdx });
            this.#size += 1;
            return freeIdx;
        }

        get(rep: number): T | undefined {
            debugLog('[RepTable#get()] args', { rep, target: this.target });
            if (rep === 0) {
                throw new RuntimeError('invalid resource rep during get, (cannot be 0)');
            }

            const baseIdx = rep << 1;
            const val = this.#data[baseIdx];
            if (val === RepTable.FREE) {
                return undefined;
            }
            return val as T;
        }

        contains(rep: number): boolean {
            debugLog('[RepTable#contains()] args', { rep, target: this.target });
            if (rep === 0) {
                throw new Error('invalid resource rep during contains, (cannot be 0)');
            }

            const baseIdx = rep << 1;
            const val = this.#data[baseIdx];
            return val !== RepTable.FREE && !!val;
        }

        remove(rep: number): T {
            debugLog('[RepTable#remove()] args', { rep, target: this.target });
            if (rep === 0) {
                throw new Error('invalid resource rep during remove, (cannot be 0)');
            }
            if (this.#space !== null) {
                const baseIdx = rep << 1;
                const val = this.#data[baseIdx];
                if (val === undefined || val === RepTable.FREE) {
                    throw new RuntimeError(`unknown handle index ${rep}`);
                }
                this.#data[baseIdx] = RepTable.FREE;
                this.#data[baseIdx + 1] = null;
                this.#size -= 1;
                this.#space.release(rep);
                return val as T;
            }
            if (this.#data.length === 2) {
                throw new Error('invalid');
            }

            const baseIdx = rep << 1;
            if (baseIdx >= this.#data.length) {
                throw new Error(`invalid rep [${rep}] during remove, out of range`);
            }
            const val = this.#data[baseIdx];
            if (val === RepTable.FREE) {
                throw new RuntimeError(`double removal of rep [${rep}] (already freed)`);
            }

            this.#data[baseIdx] = RepTable.FREE;
            this.#data[baseIdx + 1] = this.#data[0];
            this.#data[0] = rep;
            this.#size -= 1;

            return val as T;
        }

        size() {
            return this.#size;
        }

        clear() {
            debugLog('[RepTable#clear()] args', { target: this.target });
            if (this.#space) {
                for (let rep = 1; rep < this.#data.length / 2; rep++) {
                    if (this.#data[(rep << 1) + 1] === null && this.#data[rep << 1] !== RepTable.FREE) {
                        this.#space.release(rep);
                    }
                }
            }
            this.#size = 0;
            this.#data = [0, null];
        }
    }

    return RepTable;
}
