import type { Shape as ExportedShape } from './interfaces/exports/test-interface-sides-types.js';
import type { Shape as ImportedShape } from './interfaces/test-interface-sides-types.js';
import type * as Store from './interfaces/exports/test-interface-sides-store.js';

declare const store: typeof Store;
declare const exported: ExportedShape;
declare const imported: ImportedShape;

store.put(exported);

// @ts-expect-error an object of a matching shape is not an instance of the generated class
store.put({ area: () => 1, [Symbol.dispose]() {} });

// @ts-expect-error a resource of the host is not the resource that the component exports
store.put(imported);

/** The host provides classes of its own for the resources that the component imports. */
class HostShape {
    #area: number;

    constructor(origin: { x: number; y: number }) {
        this.#area = origin.x * origin.y;
    }

    area(): number {
        return this.#area;
    }
}

export const hostShape: ImportedShape = new HostShape({ x: 1, y: 2 });
