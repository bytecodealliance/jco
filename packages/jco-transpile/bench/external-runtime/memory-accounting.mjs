/** Counter scope, not a total-process or complete native allocation model. */
export const memoryAccounting = Object.freeze({
    heapUsed: 'V8-managed JavaScript heap',
    external: 'V8 external-memory accounting; may include WebAssembly linear memory',
    arrayBuffers: 'Node ArrayBuffer accounting; not a complete WebAssembly linear-memory measure',
    overlap: 'These counters are not disjoint and must not be added together',
    exclusions: 'Not complete process RSS, native code, stacks, allocator overhead or reserved address space',
});
