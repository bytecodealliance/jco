import { createBufferContext } from './call-context.js';
import type {
    RuntimeMemory,
    ManagedBufferOptions,
    ManagedBuffer as ManagedBufferType,
    BufferElementMetadata,
    BufferElementContext,
    CreateBufferOptions,
    ResourceTable,
    ResourceBufferContext,
    ManagedBufferConstructor,
    BufferManagerConstructor,
} from '../runtime.js';
import { debugLog } from './core/debug.js';
import { withConstructorStatics } from './core/shared-class.js';
import { tableFlag, tableRemove, tableCreateOwn } from './resource.js';

/**
 * Check that a guest buffer is aligned and lies within its memory.
 *
 * @param context - supplies the error to trap with
 * @param memory - memory holding the buffer, absent for a host-owned buffer
 * @param start - pointer to the first element
 * @param count - number of elements
 * @param elemMeta - metadata of the element type
 */
function validateGuestBuffer(
    context: Pick<ResourceBufferContext, 'RuntimeError'>,
    memory: RuntimeMemory | undefined,
    start: number | undefined,
    count: number,
    elemMeta: BufferElementMetadata,
) {
    if (!memory || elemMeta.isNone) {
        return;
    }
    if (start! % elemMeta.align32 !== 0) {
        throw new context.RuntimeError('buffer pointer not aligned');
    }
    if (start! + count * elemMeta.size32! > memory.buffer.byteLength) {
        throw new context.RuntimeError('buffer pointer out of bounds of memory');
    }
}

function defineManagedBuffer() {
    return class ManagedBuffer {
        static MAX_LENGTH = 2 ** 28 - 1;
        #context: ResourceBufferContext;
        // What one `initializeManagedBufferClass` call shares between the instances it constructs.
        #store: object;
        #componentIdx: number;
        #memory?: RuntimeMemory;

        #elemMeta: BufferElementMetadata;
        #start?: number;
        #ptr: number;
        capacity: number;
        processed = 0;
        #hostOnlyData!: unknown[]; // initial data (only filled out for host-owned)
        #hostBytes: Uint8Array | null = null;
        #hostByteLength = 0;
        #hostOffset = 0;
        #hostDataBorrowed = true;
        target: unknown;

        /**
         * Whether a value was constructed through one `initializeManagedBufferClass` call.
         *
         * @param value - any value
         * @param store - the store of that call
         * @returns whether the value is an instance belonging to that store
         */
        static constructedIn(value: unknown, store: object): value is ManagedBuffer {
            return typeof value === 'object' && value !== null && #store in value && value.#store === store;
        }

        constructor(context: ResourceBufferContext, store: object, args: ManagedBufferOptions) {
            this.#context = context;
            this.#store = store;
            if (args.capacity > ManagedBuffer.MAX_LENGTH) {
                throw new Error(`buffer size [${args.capacity}] greater than max length`);
            }
            if (args.componentIdx === undefined) {
                throw new TypeError('missing/invalid component idx');
            }
            if (args.capacity === undefined) {
                throw new TypeError('missing/invalid capacity');
            }
            if (!args.elemMeta || typeof args.elemMeta.align32 !== 'number') {
                throw new TypeError('missing/invalid element metadata');
            }

            if (!args.memory && args.start === undefined && args.data === undefined) {
                throw new TypeError('either memory and start ptr or data must be provided for managed buffers');
            }

            if (args.memory && args.start == undefined) {
                throw new TypeError('missing/invalid start ptr, depsite memory being present');
            }

            validateGuestBuffer(context, args.memory, args.start, args.capacity, args.elemMeta);

            this.#componentIdx = args.componentIdx;
            this.#memory = args.memory;
            this.#start = args.start;
            this.#ptr = this.#start!;
            this.capacity = args.capacity;
            this.#elemMeta = args.elemMeta;

            if (args.data !== undefined && !Array.isArray(args.data)) {
                throw new TypeError('host-only data must be an array');
            }
            this.#hostOnlyData = args.data!;

            this.target = args.target;
        }

        setTarget(tgt: unknown) {
            this.target = tgt;
        }

        remaining() {
            return this.capacity - this.processed;
        }

        componentIdx() {
            return this.#componentIdx;
        }

        getElemMeta() {
            return this.#elemMeta;
        }

        isHostOwned() {
            return !this.#memory;
        }

        /** Copy bytes in bulk; return false for another provider or a non-byte payload. */
        copyTo(target: ManagedBufferType, count: number): boolean {
            if (
                target === this ||
                !ManagedBuffer.constructedIn(target, this.#store) ||
                this.#elemMeta.payloadTypeName !== 'U8' ||
                target.#elemMeta.payloadTypeName !== 'U8'
            ) {
                return false;
            }
            if (
                (!this.#memory && !this.#hostBytes) ||
                (!target.#memory && !target.#hostBytes && target.#hostOnlyData.length !== 0)
            ) {
                return false;
            }
            if (!Number.isInteger(count) || count < 0 || count > this.remaining() || count > target.remaining()) {
                throw new RangeError('byte copy exceeds remaining buffer capacity');
            }
            const source = this.#memory
                ? new Uint8Array(this.#memory.buffer, this.#ptr, count)
                : this.#hostBytes!.subarray(this.#hostOffset, this.#hostOffset + count);
            if (source.length !== count) {
                throw new RangeError('byte copy exceeds available host data');
            }
            if (target.#memory) {
                new Uint8Array(target.#memory.buffer, target.#ptr, count).set(source);
                target.#ptr += count;
            } else {
                const length = target.#hostByteLength + count;
                if (!target.#hostBytes || target.#hostBytes.length < length) {
                    const bytes = new Uint8Array(
                        Math.min(target.capacity, Math.max(length, (target.#hostBytes?.length ?? 0) * 2, 64)),
                    );
                    if (target.#hostBytes) {
                        bytes.set(target.#hostBytes.subarray(0, target.#hostByteLength));
                    }
                    target.#hostBytes = bytes;
                }
                target.#hostBytes.set(source, target.#hostByteLength);
                target.#hostByteLength = length;
            }
            if (this.#memory) {
                this.#ptr += count;
            } else {
                this.#hostOffset += count;
            }
            this.processed += count;
            target.processed += count;
            return true;
        }

        /** Return an owned byte chunk; guest memory never escapes to the host. */
        readBytes(count: number): Uint8Array | undefined {
            if (this.#elemMeta.payloadTypeName !== 'U8' || (!this.#memory && !this.#hostBytes)) {
                return undefined;
            }
            if (!Number.isInteger(count) || count <= 0 || count > this.capacity) {
                throw new RangeError('invalid byte read count');
            }
            let bytes: Uint8Array;
            if (this.#memory) {
                bytes = new Uint8Array(this.#memory.buffer, this.#ptr, count).slice();
                this.#ptr += count;
            } else {
                if (this.#hostOffset + count > this.#hostByteLength) {
                    throw new RangeError('byte read exceeds available host data');
                }
                bytes = this.#hostBytes!.slice(this.#hostOffset, this.#hostOffset + count);
                this.#hostOffset += count;
            }
            this.processed += count;
            return bytes;
        }

        read(count: number, opts: { transferResources?: boolean } = {}): unknown[] {
            DEBUG: debugLog('[ManagedBuffer#read()] args', { count });
            if (this.#hostBytes) {
                return Array.from(this.readBytes(count)!);
            }
            if (count === undefined || count <= 0) {
                throw new TypeError(`missing/invalid count [${count}]`);
            }

            const cap = this.capacity;
            if (count > cap) {
                throw new Error(`cannot read [${count}] elements from buffer with capacity [${cap}]`);
            }

            let values: unknown[] = [];
            if (this.#elemMeta.isNone) {
                values = [...new Array(count)].map(() => null);
            } else {
                if (this.isHostOwned()) {
                    values = this.#hostOnlyData.slice(this.#hostOffset, this.#hostOffset + count);
                    if (this.#hostDataBorrowed) {
                        // Preserve snapshots held by the caller of the constructor.
                        this.#hostOnlyData = this.#hostOnlyData.slice(this.#hostOffset + count);
                        this.#hostDataBorrowed = false;
                        this.#hostOffset = 0;
                    } else {
                        this.#hostOnlyData.fill(undefined, this.#hostOffset, this.#hostOffset + count);
                        this.#hostOffset += count;
                        if (this.#hostOffset === this.#hostOnlyData.length) {
                            this.#hostOnlyData = [];
                            this.#hostOffset = 0;
                        } else if (this.#hostOffset >= 1024 && this.#hostOffset * 2 >= this.#hostOnlyData.length) {
                            this.#hostOnlyData = this.#hostOnlyData.slice(this.#hostOffset);
                            this.#hostOffset = 0;
                        }
                    }
                } else if (this.#elemMeta.payloadTypeName === 'U8') {
                    values = Array.from(new Uint8Array(this.#memory!.buffer, this.#ptr, count));
                    this.#ptr += count;
                } else {
                    let currentCount = count;
                    let startPtr = this.#ptr;
                    if (this.#elemMeta.stringEncoding === undefined) {
                        throw new Error('string encoding unknown during read');
                    }
                    let liftCtx: BufferElementContext = createBufferContext({
                        storagePtr: startPtr,
                        memory: this.#memory!,
                        componentIdx: this.#componentIdx,
                        stringEncoding: this.#elemMeta.stringEncoding,
                        liftResource: opts.transferResources
                            ? (handle, tableIdx) => {
                                  const { rep } = tableRemove(this.#context, this.#context.tables[tableIdx], handle);
                                  return { rep };
                              }
                            : undefined,
                    });
                    if (currentCount < 0) {
                        throw new Error('unexpectedly invalid count');
                    }
                    while (currentCount > 0) {
                        const [value] = this.#elemMeta.liftFn!(liftCtx);
                        values.push(value);
                        currentCount -= 1;
                    }
                    this.#ptr = liftCtx.storagePtr;
                }
            }

            this.processed += count;
            return values;
        }

        write(values: unknown[], opts: { transferResources?: boolean } = {}): void {
            DEBUG: debugLog('[ManagedBuffer#write()] args', { values });

            if (!Array.isArray(values)) {
                throw new TypeError('values input to write() must be an array');
            }
            let rc = this.remaining();
            if (values.length > rc) {
                throw new Error(
                    `cannot write [${values.length}] elements to managed buffer with remaining capacity [${rc}]`,
                );
            }

            if (this.#elemMeta.isNone) {
                if (!values.every((v) => v === null)) {
                    throw new Error('non-null values in write() to unit managed buffer');
                }
            } else {
                if (this.isHostOwned()) {
                    if (this.#hostBytes) {
                        this.#hostOnlyData = Array.from(
                            this.#hostBytes.subarray(this.#hostOffset, this.#hostByteLength),
                        );
                        this.#hostBytes = null;
                        this.#hostByteLength = 0;
                        this.#hostOffset = 0;
                        this.#hostDataBorrowed = false;
                    }
                    if (this.#hostDataBorrowed) {
                        this.#hostOnlyData = this.#hostOnlyData.slice(this.#hostOffset);
                        this.#hostOffset = 0;
                        this.#hostDataBorrowed = false;
                    }
                    for (const value of values) {
                        this.#hostOnlyData.push(value);
                    }
                } else if (this.#elemMeta.payloadTypeName === 'U8') {
                    new Uint8Array(this.#memory!.buffer, this.#ptr, values.length).set(values as number[]);
                    this.#ptr += values.length;
                } else {
                    let startPtr = this.#ptr;
                    if (this.#elemMeta.stringEncoding === undefined) {
                        throw new Error('string encoding unknown during write');
                    }

                    const lowerCtx: BufferElementContext = createBufferContext({
                        memory: this.#memory!,
                        storagePtr: startPtr,
                        componentIdx: this.#componentIdx,
                        stringEncoding: this.#elemMeta.stringEncoding,
                        realloc: this.#elemMeta.getReallocFn?.(),
                        getReallocFn: this.#elemMeta.getReallocFn,
                        lowerResource: opts.transferResources
                            ? (value, tableIdx) => {
                                  let table = this.#context.tables[tableIdx];
                                  if (!table) {
                                      table = [tableFlag, 0] as ResourceTable;
                                      table._createdReps = new Set();
                                      this.#context.tables[tableIdx] = table;
                                  }
                                  return tableCreateOwn(this.#context.indexSpaces, table, value.rep);
                              }
                            : undefined,
                    });
                    for (const v of values) {
                        lowerCtx.vals = [v];
                        this.#elemMeta.lowerFn!(lowerCtx);
                    }

                    this.#ptr = lowerCtx.storagePtr;
                }
            }

            this.processed += values.length;
        }
    };
}
let sharedManagedBuffer: ReturnType<typeof defineManagedBuffer>;

export function initializeManagedBufferClass(context: ResourceBufferContext): ManagedBufferConstructor {
    const ManagedBuffer = (sharedManagedBuffer ??= defineManagedBuffer());
    const store: object = {};

    /**
     * Construct a buffer that uses the context.
     *
     * @param args - options of the buffer
     * @returns the buffer
     */
    class StoreManagedBuffer extends ManagedBuffer {
        constructor(args: ManagedBufferOptions) {
            super(context, store, args);
        }
    }
    return withConstructorStatics(StoreManagedBuffer, {
        MAX_LENGTH: { value: ManagedBuffer.MAX_LENGTH, enumerable: true },
        validateGuestBuffer: {
            value: (
                memory: RuntimeMemory | undefined,
                start: number | undefined,
                count: number,
                elemMeta: BufferElementMetadata,
            ) => validateGuestBuffer(context, memory, start, count, elemMeta),
        },
    });
}

function defineBufferManager() {
    return class BufferManager {
        #ManagedBuffer: ManagedBufferConstructor;

        #buffers = new Map<number, Map<bigint, ManagedBufferType>>();
        #bufferIDs = new Map<number, bigint>();

        constructor(ManagedBuffer: ManagedBufferConstructor) {
            this.#ManagedBuffer = ManagedBuffer;
        }

        // NOTE: componentIdx === -1 indicates the host
        getNextBufferID(componentIdx: number): bigint {
            const current = this.#bufferIDs.get(componentIdx);
            if (current === undefined) {
                this.#bufferIDs.set(componentIdx, 1n);
                return 1n;
            }
            const next = current + 1n;
            this.#bufferIDs.set(componentIdx, next);
            return next;
        }

        getBuffer(componentIdx: number, bufferID: bigint) {
            DEBUG: debugLog('[BufferManager#getBuffer()] args', { componentIdx, bufferID });
            return this.#buffers.get(componentIdx)?.get(bufferID);
        }

        createBuffer(args: CreateBufferOptions) {
            DEBUG: debugLog('[BufferManager#createBuffer()] args', args);
            if (!args || typeof args !== 'object') {
                throw new TypeError('missing/invalid argument object');
            }

            if (args.start === undefined && args.data === undefined) {
                throw new TypeError('either a starting pointer or initial values must be provided');
            }

            if (args.start !== undefined && args.componentIdx === undefined) {
                throw new TypeError('missing/invalid component idx');
            }
            if (args.count === undefined) {
                throw new TypeError('missing/invalid obj count');
            }
            if (!args.elemMeta) {
                throw new TypeError('missing/invalid element metadata for use with managed buffer');
            }

            const { componentIdx } = args;

            if (!this.#buffers.has(componentIdx)) {
                this.#buffers.set(componentIdx, new Map());
            }
            const instanceBuffers = this.#buffers.get(componentIdx)!;

            const nextBufID = this.getNextBufferID(componentIdx);

            const buffer = new this.#ManagedBuffer({
                componentIdx,
                memory: args.memory,
                start: args.start,
                capacity: args.count,
                elemMeta: args.elemMeta,
                data: args.data,
                target: args.target,
            });

            if (instanceBuffers.has(nextBufID)) {
                throw new Error(`managed buffer with ID [${nextBufID}] already exists`);
            }
            instanceBuffers.set(nextBufID, buffer);

            return { id: nextBufID, buffer };
        }

        deleteBuffer(componentIdx: number, bufferID: bigint) {
            DEBUG: debugLog('[BufferManager#deleteBuffer()] args', { componentIdx, bufferID });
            return this.#buffers.get(componentIdx)?.delete(bufferID);
        }
    };
}
let sharedBufferManager: ReturnType<typeof defineBufferManager>;

export function initializeBufferManagerClass(ManagedBuffer: ManagedBufferConstructor): BufferManagerConstructor {
    const BufferManager = (sharedBufferManager ??= defineBufferManager());
    /**
     * Construct a manager of buffers of the given class.
     *
     * @returns the manager
     */
    class StoreBufferManager extends BufferManager {
        constructor() {
            super(ManagedBuffer);
        }
    }
    return StoreBufferManager;
}

/** Prefer a provider's bulk byte copy and retain the generic resource-aware fallback. */
export function transferBuffer(
    source: ManagedBufferType,
    target: ManagedBufferType,
    count: number,
    options: { transferResources?: boolean } = {},
): void {
    if (source.copyTo?.(target, count)) {
        return;
    }
    target.write(source.read(count, options), options);
}
