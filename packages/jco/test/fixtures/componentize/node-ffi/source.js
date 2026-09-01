import ffi, { DynamicLibrary, getInt32, setInt32, toBuffer, toString } from "node:ffi";

/** Call something expected to refuse, and report the code it refused with. */
function refusal(call) {
    try {
        call();
        return "DID NOT THROW";
    } catch (error) {
        return error.code ?? error.name;
    }
}

export function run() {
    // No path: resolve symbols from the host process image, which links libc.
    const lib = new DynamicLibrary(null);

    const abs = lib.getFunction("abs", { arguments: ["int32"], return: "int32" });
    const malloc = lib.getFunction("malloc", { arguments: ["uint64"], return: "pointer" });
    const free = lib.getFunction("free", { arguments: ["pointer"], return: "void" });
    const strlen = lib.getFunction("strlen", { arguments: ["pointer"], return: "uint64" });

    const pointer = malloc(64n);

    // A real read/write round trip through host memory.
    setInt32(pointer, 0, 123456);
    const readBack = getInt32(pointer, 0);

    // A string written into host memory, measured by native code, and read back.
    ffi.exportString("hello ffi", pointer, 64);
    const text = toString(pointer);
    const nativeLength = strlen(pointer);
    const bytes = [...toBuffer(pointer, 5)];

    free(pointer);

    const result = {
        // Native calls really executed on the host.
        abs: abs(-7),
        allocated: typeof pointer === "bigint" && pointer !== 0n,
        readBack,
        text,
        nativeLength: String(nativeLength),
        bytes,
        symbolIsBigInt: typeof lib.getSymbol("abs") === "bigint",
        eventLoop: typeof ffi.getCurrentEventLoop() === "bigint",
        suffix: ffi.suffix,

        // What a component cannot express, refused rather than silently wrong.
        rawPointer: refusal(() => ffi.getRawPointer(new ArrayBuffer(8))),
        liveView: refusal(() => toBuffer(pointer, 4, false)),
        callback: refusal(() => lib.registerCallback({ arguments: [], return: "void" }, () => {})),
        bufferArgument: refusal(() => lib.getFunction("memcpy", { arguments: ["buffer"], return: "void" })),
    };

    lib.close();
    result.afterClose = refusal(() => lib.getSymbol("abs"));
    return JSON.stringify(result);
}
