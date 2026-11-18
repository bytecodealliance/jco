/** A private cursor leaves the public params property as the unconsumed array. */
interface ParamsContext {
    params?: unknown[];
}
interface ParamCursor {
    values: unknown[];
    offset: number;
    exposed: boolean;
}
let cursorKey: symbol | undefined;

/** Materialize only when a consumer observes the public array. */
function getParams(this: ParamsContext): unknown[] {
    const cursor = cursorFor(this)!;
    if (cursor.offset !== 0) {
        cursor.values = cursor.values.slice(cursor.offset);
        cursor.offset = 0;
    }
    cursor.exposed = true;
    return cursor.values;
}

/** Replacing params starts a new argument sequence. */
function setParams(this: ParamsContext, values: unknown[]) {
    const cursor = cursorFor(this)!;
    cursor.values = values;
    cursor.offset = 0;
    cursor.exposed = true;
}

/** Register a runtime-owned context whose params accessor was created with it. */
export function initializeParams(context: ParamsContext, values: unknown[]): void {
    // Allocate this capability only when a cursor is requested, never on import.
    cursorKey ??= Symbol('jco flat parameter cursor');
    Object.defineProperty(context, cursorKey, {
        value: { values, offset: 0, exposed: true },
    });
    // Adding a new accessor with shared functions keeps V8's context layout stable.
    // Converting an existing data property would put caller objects in dictionary mode.
    Object.defineProperty(context, 'params', {
        get: getParams,
        set: setParams,
        enumerable: true,
        configurable: true,
    });
}

/** Caller-created contexts retain ordinary array properties and accessors. */
function cursorFor(context: ParamsContext): ParamCursor | undefined {
    return cursorKey ? (context as ParamsContext & { [key: symbol]: ParamCursor | undefined })[cursorKey] : undefined;
}

/** Count remaining flat arguments without allocating their suffix. */
export function remainingParams(context: ParamsContext): number {
    const cursor = cursorFor(context);
    return cursor ? cursor.values.length - cursor.offset : context.params!.length;
}

/** Read one argument relative to the current position. */
export function readParam(context: ParamsContext, index: number): unknown {
    const cursor = cursorFor(context);
    return cursor ? cursor.values[cursor.offset + index] : context.params![index];
}

/** Copy a fixed-size list without materializing the rest of the arguments. */
export function copyParams(context: ParamsContext, count: number): unknown[] {
    const cursor = cursorFor(context);
    return cursor ? cursor.values.slice(cursor.offset, cursor.offset + count) : context.params!.slice(0, count);
}

/** Advance, detaching from any array previously exposed to a caller. */
export function consumeParams(context: ParamsContext, count: number): void {
    const cursor = cursorFor(context);
    if (!cursor) {
        context.params = context.params!.slice(count);
    } else if (cursor.exposed) {
        // Retained input/params arrays must not alias subsequent consumption.
        cursor.values = cursor.values.slice(cursor.offset + count);
        cursor.offset = 0;
        cursor.exposed = false;
    } else {
        cursor.offset = Math.min(cursor.values.length, cursor.offset + count);
    }
}

/** Read and consume an unconverted scalar with one cursor lookup. */
export function takeParam(context: ParamsContext, error: string): unknown {
    const cursor = cursorFor(context);
    if (!cursor) {
        if (context.params!.length === 0) {
            throw new Error(error);
        }
        const value = context.params![0];
        context.params = context.params!.slice(1);
        return value;
    }
    if (cursor.offset === cursor.values.length) {
        throw new Error(error);
    }
    const value = cursor.values[cursor.offset];
    if (cursor.exposed) {
        cursor.values = cursor.values.slice(cursor.offset + 1);
        cursor.offset = 0;
        cursor.exposed = false;
    } else {
        cursor.offset++;
    }
    return value;
}

/** Whether a context was prepared for repeated flat-argument consumption. */
export function hasParamCursor(context: ParamsContext): boolean {
    return cursorFor(context) !== undefined;
}
