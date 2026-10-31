import type {
    HostStreamClassContext,
    HostStreamConstructor,
    HostStreamOptions,
    TaskLiftFn,
    TaskLowerFn,
    ExternalStream,
    StreamReadOptions,
    StreamReadableEnd,
    StreamWritableEnd,
} from '../runtime.js';
import { debugLog } from './core-debug.js';
import { getOrCreateAsyncState } from './component.js';
import { getStreamEnd } from './stream-state.js';
export function initializeHostStreamClass(_context: HostStreamClassContext): HostStreamConstructor {
    class HostStream {
        #componentIdx: number;
        #streamEndWaitableIdx: number;
        #streamTableIdx: number;

        #payloadLiftFn: TaskLiftFn;
        #payloadLowerFn: TaskLowerFn;

        #userStream: ExternalStream | undefined;

        #rep: number | null = null;

        constructor(args: HostStreamOptions) {
            debugLog('[HostStream#constructor()] args', args);
            if (args.componentIdx === undefined) {
                throw new TypeError('missing component idx');
            }
            this.#componentIdx = args.componentIdx;

            if (!args.payloadLiftFn) {
                throw new TypeError('missing payload lift fn');
            }
            this.#payloadLiftFn = args.payloadLiftFn;

            if (!args.payloadLowerFn) {
                throw new TypeError('missing payload lower fn');
            }
            this.#payloadLowerFn = args.payloadLowerFn;

            if (args.streamEndWaitableIdx === undefined) {
                throw new Error('missing stream idx');
            }
            if (args.streamTableIdx === undefined) {
                throw new Error('missing stream table idx');
            }
            this.#streamEndWaitableIdx = args.streamEndWaitableIdx;
            this.#streamTableIdx = args.streamTableIdx;
        }

        setRep(rep: number) {
            this.#rep = rep;
        }
        getStreamEndWaitableIdx() {
            return this.#streamEndWaitableIdx;
        }

        createUserStream() {
            if (this.#userStream) {
                return this.#userStream;
            }
            if (this.#rep === null) {
                throw new Error('unexpectedly missing rep for host stream');
            }

            const cstate = getOrCreateAsyncState(_context.lookup, this.#componentIdx);
            if (!cstate) {
                throw new Error(`missing async state for component [${this.#componentIdx}]`);
            }

            const streamEnd = getStreamEnd(_context.ends, {
                tableIdx: this.#streamTableIdx,
                streamEndWaitableIdx: this.#streamEndWaitableIdx,
            });
            if (!streamEnd) {
                throw new Error(
                    `missing stream [${this.#streamEndWaitableIdx}] (table [${this.#streamTableIdx}], component [${this.#componentIdx}]`,
                );
            }
            if (streamEnd.isDoneState()) {
                throw new _context.RuntimeError(
                    'cannot lift stream after being notified that the writable end dropped',
                );
            }
            if (streamEnd.isInSet()) {
                throw new _context.RuntimeError("cannot lift stream while it's in a waitable set");
            }

            return new _context.Stream({
                isReadable: streamEnd.isReadable(),
                isWritable: streamEnd.isWritable(),
                globalRep: this.#rep,
                readFn: async (opts: StreamReadOptions) => {
                    return await (streamEnd as StreamReadableEnd).read(opts);
                },
                writeFn: async (v: unknown) => {
                    await (streamEnd as StreamWritableEnd).write(v);
                },
                // The host may dispose while an already-completed read is
                // between event publication and its polling continuation.
                // Preserve that event for the in-flight host promise.
                dropFn: () => streamEnd.drop({ allowPendingEvent: true }),
            });
        }
    }

    return HostStream;
}
