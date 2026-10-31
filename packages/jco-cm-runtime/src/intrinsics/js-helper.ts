import type { JsHelperModule } from '../runtime.js';

export const emptyFunc: JsHelperModule['emptyFunc'] = () => {};

/** Only selected DataView users allocate this owner; emptyFunc needs no cache. */
export const initializeDataViewCache: JsHelperModule['initializeDataViewCache'] = () => ({
    view: new DataView(new ArrayBuffer(0)),
});

export const dataView: JsHelperModule['dataView'] = (context, memory) =>
    context.view.buffer === memory.buffer ? context.view : (context.view = new DataView(memory.buffer));
