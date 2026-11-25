import type {
    HostFutureClassContext,
    HostFutureConstructor,
    HostFutureOptions,
    FutureValue,
    TaskLiftFn,
    TaskLowerFn,
} from '../../runtime.js';
import { debugLog } from '../core/debug.js';
import { getOrCreateAsyncState } from '../component.js';
import { getFutureEnd } from './state.js';

function defineHostFuture() {
    return class HostFuture {
        #context: HostFutureClassContext;

        #componentIdx: number;
        #futureEndWaitableIdx: number;
        #futureTableIdx: number;

        #payloadLiftFn: TaskLiftFn;
        #payloadLowerFn: TaskLowerFn;

        #userFuture?: FutureValue;

        #rep: number | null = null;

        constructor(context: HostFutureClassContext, args: HostFutureOptions) {
            DEBUG: debugLog('[HostFuture#constructor()] args', args);
            this.#context = context;
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

            if (args.futureEndWaitableIdx === undefined) {
                throw new Error('missing future idx');
            }
            if (args.futureTableIdx === undefined) {
                throw new Error('missing future table idx');
            }
            this.#futureEndWaitableIdx = args.futureEndWaitableIdx;
            this.#futureTableIdx = args.futureTableIdx;
        }

        setRep(rep: number) {
            this.#rep = rep;
        }
        getFutureEndWaitableIdx() {
            return this.#futureEndWaitableIdx;
        }

        createUserFuture() {
            if (this.#userFuture) {
                return this.#userFuture;
            }
            if (this.#rep === null) {
                throw new Error('unexpectedly missing rep for host future');
            }

            const cstate = getOrCreateAsyncState(this.#context.lookup, this.#componentIdx);
            if (!cstate) {
                throw new Error(`missing async state for component [${this.#componentIdx}]`);
            }

            const futureEnd = getFutureEnd(this.#context.ends, {
                tableIdx: this.#futureTableIdx,
                futureEndWaitableIdx: this.#futureEndWaitableIdx,
            });
            if (!futureEnd) {
                throw new Error(
                    `missing future [${this.#futureEndWaitableIdx}] (table [${this.#futureTableIdx}], component [${this.#componentIdx}]`,
                );
            }
            if (futureEnd.isDoneState()) {
                throw new this.#context.RuntimeError('cannot lift future after previous read succeeded');
            }
            if (futureEnd.isInSet()) {
                throw new this.#context.RuntimeError("cannot lift future while it's in a waitable set");
            }
            futureEnd.markHostHeld();

            return futureEnd.promise();
        }
    };
}
let sharedHostFuture: ReturnType<typeof defineHostFuture>;

/** Create host wrappers that look up endpoints in the selected future tables. */
export function initializeHostFutureClass(_context: HostFutureClassContext): HostFutureConstructor {
    const HostFuture = (sharedHostFuture ??= defineHostFuture());
    /**
     * Construct a host future that uses the context.
     *
     * @param args - options of the host future
     * @returns the host future
     */
    class StoreHostFuture extends HostFuture {
        constructor(args: HostFutureOptions) {
            super(_context, args);
        }
    }
    return StoreHostFuture;
}
