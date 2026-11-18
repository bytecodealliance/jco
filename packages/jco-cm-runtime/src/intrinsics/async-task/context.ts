import type {
    AsyncTaskModule,
    AsyncThread,
    ContextSlotGlobals,
    TaskMeta,
    TaskRegisters,
    ThreadLookupContext,
} from '../../runtime.js';
import { typeCheckValidI32 } from './helpers.js';
import { debugLog } from '../core/debug.js';
import { registerSlot } from '../task-context.js';
import { getOrCreateAsyncState } from '../component.js';

/**
 * A core module that keeps the context slots a component instance's code
 * accesses in mutable globals, and exports a getter and a setter function for
 * each slot. While no slots are loaded into the globals, the functions call the
 * imported JS implementations instead:
 *
 * ```wat
 * (module
 *   (import "context" "get0" (func $get0 (result i32)))
 *   (import "context" "set0" (func $set0 (param i32)))
 *   (import "context" "get1" (func $get1 (result i32)))
 *   (import "context" "set1" (func $set1 (param i32)))
 *   (global $loaded (export "loaded") (mut i32) (i32.const 0))
 *   (global $slot0 (export "slot0") (mut i32) (i32.const 0))
 *   (global $slot1 (export "slot1") (mut i32) (i32.const 0))
 *   (func (export "get0") (result i32)
 *     (if (result i32) (global.get $loaded)
 *       (then (global.get $slot0))
 *       (else (call $get0))))
 *   (func (export "set0") (param i32)
 *     (if (global.get $loaded)
 *       (then (global.set $slot0 (local.get 0)))
 *       (else (call $set0 (local.get 0)))))
 *   ;; ... and likewise "get1" and "set1" for $slot1
 * )
 * ```
 *
 * A guest that imports these functions reads and writes its context slots
 * without leaving WebAssembly. Toolchains keep the shadow stack pointer in a
 * context slot, so a guest may do so in every function prologue.
 *
 * The bytes are only created for an instance which accesses its context.
 *
 * @returns the bytes of the module
 */
// prettier-ignore
const contextSlotsModule = () => new Uint8Array([
    0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x09, 0x02, 0x60, 0x00, 0x01, 0x7f, 0x60,
    0x01, 0x7f, 0x00, 0x02, 0x3d, 0x04, 0x07, 0x63, 0x6f, 0x6e, 0x74, 0x65, 0x78, 0x74, 0x04, 0x67,
    0x65, 0x74, 0x30, 0x00, 0x00, 0x07, 0x63, 0x6f, 0x6e, 0x74, 0x65, 0x78, 0x74, 0x04, 0x73, 0x65,
    0x74, 0x30, 0x00, 0x01, 0x07, 0x63, 0x6f, 0x6e, 0x74, 0x65, 0x78, 0x74, 0x04, 0x67, 0x65, 0x74,
    0x31, 0x00, 0x00, 0x07, 0x63, 0x6f, 0x6e, 0x74, 0x65, 0x78, 0x74, 0x04, 0x73, 0x65, 0x74, 0x31,
    0x00, 0x01, 0x03, 0x05, 0x04, 0x00, 0x01, 0x00, 0x01, 0x06, 0x10, 0x03, 0x7f, 0x01, 0x41, 0x00,
    0x0b, 0x7f, 0x01, 0x41, 0x00, 0x0b, 0x7f, 0x01, 0x41, 0x00, 0x0b, 0x07, 0x36, 0x07, 0x06, 0x6c,
    0x6f, 0x61, 0x64, 0x65, 0x64, 0x03, 0x00, 0x05, 0x73, 0x6c, 0x6f, 0x74, 0x30, 0x03, 0x01, 0x05,
    0x73, 0x6c, 0x6f, 0x74, 0x31, 0x03, 0x02, 0x04, 0x67, 0x65, 0x74, 0x30, 0x00, 0x04, 0x04, 0x73,
    0x65, 0x74, 0x30, 0x00, 0x05, 0x04, 0x67, 0x65, 0x74, 0x31, 0x00, 0x06, 0x04, 0x73, 0x65, 0x74,
    0x31, 0x00, 0x07, 0x0a, 0x3d, 0x04, 0x0c, 0x00, 0x23, 0x00, 0x04, 0x7f, 0x23, 0x01, 0x05, 0x10,
    0x00, 0x0b, 0x0b, 0x10, 0x00, 0x23, 0x00, 0x04, 0x40, 0x20, 0x00, 0x24, 0x01, 0x05, 0x20, 0x00,
    0x10, 0x01, 0x0b, 0x0b, 0x0c, 0x00, 0x23, 0x00, 0x04, 0x7f, 0x23, 0x02, 0x05, 0x10, 0x02, 0x0b,
    0x0b, 0x10, 0x00, 0x23, 0x00, 0x04, 0x40, 0x20, 0x00, 0x24, 0x02, 0x05, 0x20, 0x00, 0x10, 0x03,
    0x0b, 0x0b,
]);

/** The number of context slots each thread has. */
const SLOT_COUNT = 2;

/**
 * Find the live thread that a task register names.
 *
 * @param context - capabilities for locating a component's threads
 * @param meta - the identity the register holds, if any
 * @returns the thread, or `undefined` when the register is empty or its thread no longer exists
 */
function resolveThread(context: ThreadLookupContext, meta: TaskMeta | null | undefined): AsyncThread | undefined {
    if (!meta || meta.componentIdx === -1 || !meta.threadID) {
        return undefined;
    }
    const { threads } = getOrCreateAsyncState(context.lookup, meta.componentIdx);
    const thread = threads.get(meta.threadID) as AsyncThread | undefined;
    return thread && thread.taskID() === meta.taskID ? thread : undefined;
}

/**
 * Find the context slots that `context.get` and `context.set` act on.
 *
 * A guest function called through {@link guardCannotLeave} with fresh context slots uses those.
 * Otherwise guest code uses the register of its own component. A FACT adapter has no component
 * index, and a post-return may run after the thread its component's register names has exited;
 * both use the executing thread.
 *
 * @param context - capabilities for locating a component's threads and the executing registers
 * @param componentIdx - index of the component instance calling the built-in, if it has one
 * @param operation - name of the calling built-in, for the error message
 * @returns the slots of the thread the call runs on
 */
function activeSlots(context: ThreadLookupContext, componentIdx: number | undefined, operation: string): number[] {
    const { registers } = context;
    const own =
        componentIdx === undefined || componentIdx === null
            ? undefined
            : resolveThread(context, registers[registerSlot(componentIdx)]);
    const slots = registers.freshContextSlots ?? (own ?? resolveThread(context, registers.current))?.storage;
    if (!slots) {
        throw new Error(
            `missing/incomplete global current thread meta for component idx [${componentIdx}] during context ${operation}`,
        );
    }
    return slots;
}

/**
 * Find the globals which hold the values of some context slots, if any do.
 *
 * @param registers - the task registers of the store
 * @param storage - the context slots
 * @returns the globals `storage` is loaded into
 */
function globalsHolding(registers: TaskRegisters, storage: number[]): ContextSlotGlobals | undefined {
    return registers.contextSlots?.components.find((globals) => globals.storage === storage);
}

/**
 * Make a component instance's globals hold the values of `next`, after moving
 * the values they hold now back to the slots those belong to.
 *
 * @param globals - the globals of the instance
 * @param next - the context slots to load, if any
 */
function loadSlots(globals: ContextSlotGlobals, next: number[] | undefined): void {
    const previous = globals.storage;
    if (previous === next) {
        return;
    }

    for (let slot = 0; slot < SLOT_COUNT; slot++) {
        if (previous !== undefined) {
            previous[slot] = globals.slots[slot]!.value;
        }
        if (next !== undefined) {
            globals.slots[slot]!.value = next[slot]!;
        }
    }
    globals.storage = next;
    globals.loaded.value = next === undefined ? 0 : 1;
}

/**
 * Load a component instance's globals with the context slots of the thread its
 * code accesses, selected as {@link activeSlots} does.
 *
 * @param context - capabilities for locating a component's threads and the executing registers
 * @param globals - the globals of the instance
 */
function syncInstance(context: ThreadLookupContext, globals: ContextSlotGlobals): void {
    const { registers } = context;

    // Fresh context slots are loaded by `guardCannotLeave`, into the globals
    // of the one instance whose code it runs.
    if (registers.freshContextSlots !== undefined) {
        loadSlots(globals, undefined);
        return;
    }
    const own = resolveThread(context, registers[globals.componentIdx]);
    globals.followsExecutingTask = own === undefined;
    const thread = own ?? resolveThread(context, registers.current);

    // Only a thread of the instance itself is loaded. A thread of another
    // instance is the executing thread a post-return falls back to: its slots
    // may be loaded into that instance's globals, so the accessors call into
    // JS to reach them.
    loadSlots(globals, thread?.componentIdx() === globals.componentIdx ? thread.storage : undefined);
}

/**
 * Bring the context slot globals of every component instance up to date.
 *
 * Which slots an instance's code accesses depends on the task registers and on
 * which threads are live. Registers are watched for writes (see
 * {@link watchRegister}); code which changes a component's thread table must
 * call this.
 *
 * @param registers - the task registers of the store
 */
export function syncContextSlots(registers: TaskRegisters): void {
    const state = registers.contextSlots;
    if (state === undefined) {
        return;
    }
    for (const globals of state.components) {
        syncInstance(state.context, globals);
    }
}

/**
 * Run `onWrite` after every write to one task register.
 *
 * Registers are written from many places (entering and leaving tasks, and
 * restoring a task when a suspended stack resumes), including by runtime
 * providers which replace those operations. Watching the register itself keeps
 * the globals correct whichever code performs the write.
 *
 * @param registers - the task registers of the store
 * @param key - the register to watch
 * @param onWrite - brings the globals which depend on the register up to date
 */
function watchRegister(
    registers: TaskRegisters,
    key: number | 'current' | 'freshContextSlots',
    onWrite: () => void,
): void {
    let value: unknown = registers[key];
    Object.defineProperty(registers, key, {
        enumerable: true,
        configurable: true,
        get: () => value,
        set(next: unknown) {
            value = next;
            onWrite();
        },
    });
}

/**
 * Get the context slot globals of a component instance, creating them when the
 * host can instantiate WebAssembly modules synchronously.
 *
 * @param context - capabilities for locating a component's threads and the executing registers
 * @param componentIdx - index of the component instance
 * @returns the globals, or `undefined` if they cannot be created
 */
function contextSlotGlobals(context: ThreadLookupContext, componentIdx: number): ContextSlotGlobals | undefined {
    const { registers } = context;
    const existing = registers.contextSlots?.components.find((globals) => globals.componentIdx === componentIdx);
    if (existing) {
        return existing;
    }

    // Use the host's implementation rather than a selected one, which may
    // not instantiate synchronously (or at all).
    const wasm = (globalThis as { WebAssembly?: typeof WebAssembly }).WebAssembly;
    if (typeof wasm?.Module !== 'function' || typeof wasm.Instance !== 'function') {
        return undefined;
    }
    let exports: WebAssembly.Exports;
    try {
        exports = new wasm.Instance(new wasm.Module(contextSlotsModule()), {
            context: {
                get0: contextGet.bind(null, context, { componentIdx, slot: 0 }),
                set0: contextSet.bind(null, context, { componentIdx, slot: 0 }),
                get1: contextGet.bind(null, context, { componentIdx, slot: 1 }),
                set1: contextSet.bind(null, context, { componentIdx, slot: 1 }),
            },
        }).exports;
    } catch {
        // E.g. a content security policy which forbids compilation here.
        return undefined;
    }
    const globals: ContextSlotGlobals = {
        componentIdx,
        loaded: exports.loaded as WebAssembly.Global<'i32'>,
        slots: [exports.slot0 as WebAssembly.Global<'i32'>, exports.slot1 as WebAssembly.Global<'i32'>],
        getters: [exports.get0 as () => number, exports.get1 as () => number],
        setters: [exports.set0 as (value: number) => void, exports.set1 as (value: number) => void],
        storage: undefined,
        followsExecutingTask: true,
    };

    if (registers.contextSlots === undefined) {
        const components: ContextSlotGlobals[] = [];
        registers.contextSlots = { context, components };
        watchRegister(registers, 'freshContextSlots', () => syncContextSlots(registers));

        // The executing task only selects the thread of an instance whose own
        // register names no live thread.
        watchRegister(registers, 'current', () => {
            for (const other of components) {
                if (other.followsExecutingTask) {
                    syncInstance(context, other);
                }
            }
        });
    }
    registers.contextSlots.components.push(globals);
    watchRegister(registers, componentIdx, () => syncInstance(context, globals));
    syncInstance(context, globals);
    return globals;
}

/**
 * Create the function a core module imports for `canon context.get` or
 * `canon context.set` on one slot.
 *
 * Code that belongs to a component instance gets a WebAssembly function over
 * that instance's context slot globals where possible, and a JS function
 * otherwise. Debug logging also selects JS functions, which log each access.
 *
 * @param _context - capabilities for locating a component's threads and the executing registers
 * @param ctx - the slot, and the component instance of the importing code, if any
 * @param operation - whether the function reads or writes the slot
 * @returns the function to import
 */
export const contextSlotAccessor: AsyncTaskModule['contextSlotAccessor'] = (_context, ctx, operation) => {
    const { componentIdx, slot } = ctx;
    if (slot === undefined || slot < 0 || slot >= SLOT_COUNT) {
        throw new TypeError('invalid slot');
    }
    const logs = debugLog.length > 0;
    const globals = componentIdx === undefined || logs ? undefined : contextSlotGlobals(_context, componentIdx);
    if (globals === undefined) {
        return operation === 'get' ? contextGet.bind(null, _context, ctx) : contextSet.bind(null, _context, ctx);
    }
    return operation === 'get' ? globals.getters[slot]! : globals.setters[slot]!;
};

/** Implements `canon context.set`. */
export function contextSet(
    _context: ThreadLookupContext,
    ctx: {
        componentIdx?: number;
        slot: number;
    },
    value: number,
): ReturnType<AsyncTaskModule['contextSet']> {
    const { slot } = ctx;
    if (slot === undefined) {
        throw new TypeError('missing slot');
    }
    if (!typeCheckValidI32(value)) {
        throw new Error('invalid value for context set (not valid i32)');
    }
    const storage = activeSlots(_context, ctx.componentIdx, 'set');
    DEBUG: debugLog('[contextSet()] args', { slot, value, storage, componentIdx: ctx.componentIdx });
    if (slot < 0 || slot >= storage.length) {
        throw new Error('invalid slot for current thread');
    }

    // Slots which are loaded into an instance's globals live there.
    const globals = globalsHolding(_context.registers, storage);
    if (globals === undefined) {
        storage[slot] = value;
    } else {
        globals.slots[slot]!.value = value;
    }
}

/** Implements `canon context.get`. */
export function contextGet(
    _context: ThreadLookupContext,
    ctx: {
        componentIdx?: number;
        slot: number;
    },
): ReturnType<AsyncTaskModule['contextGet']> {
    const { slot } = ctx;
    if (slot === undefined) {
        throw new TypeError('missing slot');
    }
    const storage = activeSlots(_context, ctx.componentIdx, 'get');
    DEBUG: debugLog('[contextGet()] args', { slot, storage, componentIdx: ctx.componentIdx });
    if (slot < 0 || slot >= storage.length) {
        throw new Error('invalid slot for current thread');
    }

    // Slots which are loaded into an instance's globals live there.
    const globals = globalsHolding(_context.registers, storage);
    return globals === undefined ? storage[slot]! : globals.slots[slot]!.value;
}

/**
 * Wrap a guest function that the host calls while lifting or lowering (a realloc or a
 * post-return) so that each call runs without leaving its component instance.
 *
 * The Canonical ABI clears `may_leave` around both. A function that may not leave its component
 * instance can neither call out of it nor suspend, so it has finished by the time the call
 * returns, even where the call yields a promise; `may_leave` is therefore restored on return.
 *
 * A realloc additionally runs as though on a fresh thread (`freshContextSlots`): the host may
 * call it while one of the guest's tasks is suspended or while none of its threads is executing,
 * so it reads zeroed context slots and what it writes to them is discarded when it returns. No
 * thread's own slots are involved, and the registers keep naming what was executing. Only the
 * wrapped function can run until the call returns, so one set of fresh slots serves every
 * component.
 *
 * @param context - capabilities for locating component state and the executing registers
 * @param componentIdx - index of the component instance that owns the function
 * @param fn - the guest function to wrap
 * @param freshContextSlots - whether calls run with zeroed context slots of their own
 * @returns a function with the same signature
 */
export function guardCannotLeave<A extends unknown[], T>(
    context: ThreadLookupContext,
    componentIdx: number,
    fn: (...args: A) => T,
    freshContextSlots = false,
): (...args: A) => T {
    const { registers } = context;
    return (...args) => {
        const state = getOrCreateAsyncState(context.lookup, componentIdx);
        const previousMayLeave = state.mayLeave;

        state.mayLeave = false;
        if (freshContextSlots) {
            const slots = [0, 0];
            registers.freshContextSlots = slots;

            // Only this instance's code runs until the call returns.
            const globals = registers.contextSlots?.components.find((other) => other.componentIdx === componentIdx);
            if (globals !== undefined) {
                loadSlots(globals, slots);
            }
        }
        try {
            return fn(...args);
        } finally {
            if (freshContextSlots) {
                registers.freshContextSlots = undefined;
            }
            state.mayLeave = previousMayLeave;
        }
    };
}
