import type {
    RuntimeMemory,
    ManagedBufferOptions,
    ManagedBuffer,
    BufferElementMetadata,
    BufferElementContext,
    CreateBufferOptions,
    ResourceTable,
    ResourceBufferContext,
    ManagedBufferConstructor,
    BufferManagerConstructor,
} from '../runtime.js';
import { debugLog } from './core-debug.js';
import { tableFlag, tableRemove, tableCreateOwn } from './resource.js';

export function initializeManagedBufferClass(context: ResourceBufferContext): ManagedBufferConstructor {
    class ManagedBuffer {
        static MAX_LENGTH = 2 ** 28 - 1;
        #componentIdx: number;
        #memory?: RuntimeMemory;

        #elemMeta: BufferElementMetadata;
        #start?: number;
        #ptr: number;
        capacity: number;
        processed = 0;
        #hostOnlyData!: unknown[]; // initial data (only filled out for host-owned)
        target: unknown;

        static validateGuestBuffer(
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

        constructor(args: ManagedBufferOptions) {
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

            ManagedBuffer.validateGuestBuffer(args.memory, args.start, args.capacity, args.elemMeta);

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

        read(count: number, opts: { transferResources?: boolean } = {}): unknown[] {
            debugLog('[ManagedBuffer#read()] args', { count });
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
                    values = this.#hostOnlyData.slice(0, count);
                    this.#hostOnlyData = this.#hostOnlyData.slice(count);
                } else if (this.#elemMeta.payloadTypeName === 'U8') {
                    values = Array.from(new Uint8Array(this.#memory!.buffer, this.#ptr, count));
                    this.#ptr += count;
                } else {
                    let currentCount = count;
                    let startPtr = this.#ptr;
                    if (this.#elemMeta.stringEncoding === undefined) {
                        throw new Error('string encoding unknown during read');
                    }
                    let liftCtx: BufferElementContext = {
                        storagePtr: startPtr,
                        memory: this.#memory!,
                        componentIdx: this.#componentIdx,
                        stringEncoding: this.#elemMeta.stringEncoding,
                        liftResource: opts.transferResources
                            ? (handle, tableIdx) => {
                                  const { rep } = tableRemove(context, context.tables[tableIdx], handle);
                                  return { rep };
                              }
                            : undefined,
                    };
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
            debugLog('[ManagedBuffer#write()] args', { values });

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
                    this.#hostOnlyData = this.#hostOnlyData.concat(values);
                } else if (this.#elemMeta.payloadTypeName === 'U8') {
                    new Uint8Array(this.#memory!.buffer, this.#ptr, values.length).set(values as number[]);
                    this.#ptr += values.length;
                } else {
                    let startPtr = this.#ptr;
                    if (this.#elemMeta.stringEncoding === undefined) {
                        throw new Error('string encoding unknown during write');
                    }

                    const lowerCtx: BufferElementContext = {
                        memory: this.#memory!,
                        storagePtr: startPtr,
                        componentIdx: this.#componentIdx,
                        stringEncoding: this.#elemMeta.stringEncoding,
                        realloc: this.#elemMeta.getReallocFn?.(),
                        getReallocFn: this.#elemMeta.getReallocFn,
                        lowerResource: opts.transferResources
                            ? (value, tableIdx) => {
                                  let table = context.tables[tableIdx];
                                  if (!table) {
                                      table = [tableFlag, 0] as ResourceTable;
                                      table._createdReps = new Set();
                                      context.tables[tableIdx] = table;
                                  }
                                  return tableCreateOwn(context.indexSpaces, table, value.rep);
                              }
                            : undefined,
                    };
                    for (const v of values) {
                        lowerCtx.vals = [v];
                        this.#elemMeta.lowerFn!(lowerCtx);
                    }

                    this.#ptr = lowerCtx.storagePtr;
                }
            }

            this.processed += values.length;
        }
    }

    return ManagedBuffer;
}
export function initializeBufferManagerClass(ManagedBuffer: ManagedBufferConstructor): BufferManagerConstructor {
    class BufferManager {
        #buffers = new Map<number, Map<bigint, ManagedBuffer>>();
        #bufferIDs = new Map<number, bigint>();

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
            debugLog('[BufferManager#getBuffer()] args', { componentIdx, bufferID });
            return this.#buffers.get(componentIdx)?.get(bufferID);
        }

        createBuffer(args: CreateBufferOptions) {
            debugLog('[BufferManager#createBuffer()] args', args);
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

            const buffer = new ManagedBuffer({
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
            debugLog('[BufferManager#deleteBuffer()] args', { componentIdx, bufferID });
            return this.#buffers.get(componentIdx)?.delete(bufferID);
        }
    }

    return BufferManager;
}
