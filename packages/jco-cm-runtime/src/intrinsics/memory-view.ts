import type { RuntimeMemory } from '../runtime.js';

/** Reuse a full-memory view, refreshing after growth or a change of memory. */
export function memoryView(context: { memory?: RuntimeMemory | null; memoryView?: DataView }): DataView {
    const buffer = context.memory!.buffer;
    let view = context.memoryView;
    if (view === undefined || view.buffer !== buffer) {
        context.memoryView = view = new DataView(buffer);
    }
    return view;
}
