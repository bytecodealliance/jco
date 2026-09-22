export async function makeValue() {
    return wit.Future.from(42, wit.Future.U32).readable;
}

export async function makeNestedValue() {
    const inner = wit.Future.from(44, wit.Future.U32).readable;
    return wit.Future.from(inner, wit.Future.FUTURE_U32).readable;
}

export async function readValue(value) {
    try {
        if (typeof value.then === "function") {
            throw new Error("Guest future handles must not be thenable");
        }
        const firstRead = value.read();
        if (value.read() !== firstRead) {
            throw new Error("Pending future reads must share a Promise");
        }
        const result = await firstRead;
        if (value.read() !== firstRead) {
            throw new Error("Completed future reads must share a Promise");
        }
        return result;
    } finally {
        value[Symbol.dispose]();
    }
}
