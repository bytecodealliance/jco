import type {
    HostFutureClassContext,
    HostFutureConstructor,
    HostFutureOptions,
    FutureValue,
    TaskLiftFn,
    TaskLowerFn,
} from '../runtime.js';
import { debugLog } from './core-debug.js';
import { getOrCreateAsyncState } from './component.js';
import { getFutureEnd } from './future-state.js';
export function initializeHostFutureClass(_context: HostFutureClassContext): HostFutureConstructor {
    class HostFuture {
        #componentIdx: number;
        #futureEndWaitableIdx: number;
        #futureTableIdx: number;

        #payloadLiftFn: TaskLiftFn;
        #payloadLowerFn: TaskLowerFn;

        #userFuture?: FutureValue;

        #rep: number | null = null;

        constructor(args: HostFutureOptions) {
            debugLog('[HostFuture#constructor()] args', args);
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

            const cstate = getOrCreateAsyncState(_context.lookup, this.#componentIdx);
            if (!cstate) {
                throw new Error(`missing async state for component [${this.#componentIdx}]`);
            }

            const futureEnd = getFutureEnd(_context.ends, {
                tableIdx: this.#futureTableIdx,
                futureEndWaitableIdx: this.#futureEndWaitableIdx,
            });
            if (!futureEnd) {
                throw new Error(
                    `missing future [${this.#futureEndWaitableIdx}] (table [${this.#futureTableIdx}], component [${this.#componentIdx}]`,
                );
            }
            if (futureEnd.isDoneState()) {
                throw new _context.RuntimeError('cannot lift future after previous read succeeded');
            }
            if (futureEnd.isInSet()) {
                throw new _context.RuntimeError("cannot lift future while it's in a waitable set");
            }

            return futureEnd.promise();
        }
    }

    return HostFuture;
}
