export function emptyFunc() {}

export function initializeDataViewCache() {
    return { view: new DataView(new ArrayBuffer(0)) };
}

export function dataView(context, memory) {
    return context.view.buffer === memory.buffer ? context.view : (context.view = new DataView(memory.buffer));
}
