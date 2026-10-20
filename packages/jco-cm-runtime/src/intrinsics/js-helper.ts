export interface JsHelperIntrinsics {
    emptyFunc(...args: unknown[]): void;
    dataView(memory: { readonly buffer: ArrayBufferLike }): DataView;
}

export function createJsHelperIntrinsics(): JsHelperIntrinsics {
    let view: DataView = new DataView(new ArrayBuffer(0));
    return {
        emptyFunc() {},
        dataView(memory) {
            return view.buffer === memory.buffer ? view : (view = new DataView(memory.buffer));
        },
    };
}
