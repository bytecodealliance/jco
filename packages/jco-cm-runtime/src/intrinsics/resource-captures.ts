import type { ResourceTable } from '../runtime.js';
import { tableOwn } from './resource.js';

/** Captures for a synchronous leaf with a single handle table for this resource. */
export class IndexedResourceCaptures {
    slots: (object | undefined)[] | undefined = [];
    readonly #handles: ResourceTable;
    #reps?: Map<number, object>;

    constructor(handles: ResourceTable) {
        this.#handles = handles;
    }

    // The first handle table can register this object directly for shutdown.
    // Reading captures during registration would eagerly migrate live slots.
    // Shutdown requests the rep map only when it starts collecting owned handles.
    get handles(): ResourceTable {
        return this.#handles;
    }

    get captures(): Map<number, object> {
        return this.byRep();
    }

    /**
     * Automatically assigned reps can be looked up by guest handle, saving a
     * Map probe on each borrow. An explicit host rep can alias an existing rep
     * at a different handle. Migrate live slots before inserting it so every
     * subsequent borrow or drop observes the same capture.
     */
    byRep(): Map<number, object> {
        // Ordinary host-created resources stay in slots for their entire lifetime.
        // Allocate the fallback map when a caller first needs lookup by rep.
        const reps = (this.#reps ??= new Map<number, object>());
        if (this.slots) {
            for (let handle = 1; handle < this.slots.length; handle++) {
                const value = this.slots[handle];
                if (value !== undefined) {
                    reps.set(this.#handles[handle * 2 + 1] - tableOwn, value);
                }
            }
            this.slots = undefined;
        }
        return reps;
    }

    get(rep: number) {
        return this.byRep().get(rep);
    }

    set(rep: number, value: object) {
        this.byRep().set(rep, value);
    }

    delete(rep: number) {
        this.byRep().delete(rep);
    }
}
