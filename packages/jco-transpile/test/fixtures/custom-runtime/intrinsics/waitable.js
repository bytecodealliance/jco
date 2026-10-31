import { storeEventInComponentMemory } from './host.js';

import { debugLog } from './core-debug.js';
import { promiseWithResolvers } from './core-promises.js';
import { getOrCreateAsyncState } from './component.js';
import { getCurrentTask } from './task-operations.js';

/** Fresh class identity per store, with no state or platform capability required. */
export function initializeWaitableClass() {
    class Waitable {
        #componentIdx;

        #pendingEventFn = null;

        #promise;
        #resolve;
        #reject;

        #waitableSet = null;

        #hasSyncWaiter = false;

        #idx = null; // to component-global waitables

        target;

        constructor(args) {
            const { componentIdx } = args;
            this.#componentIdx = componentIdx;
            this.target = args.target;
            this.#resetPromise();
        }

        componentIdx() {
            return this.#componentIdx;
        }
        isInSet() {
            return this.#waitableSet !== null;
        }

        idx() {
            return this.#idx;
        }
        setIdx(idx) {
            if (idx === 0) {
                throw new Error('waitable idx cannot be zero');
            }
            this.#idx = idx;
        }

        setTarget(tgt) {
            this.target = tgt;
        }

        #resetPromise() {
            const { promise, resolve, reject } = promiseWithResolvers();
            this.#promise = promise;
            this.#resolve = resolve;
            this.#reject = reject;
        }

        resolve() {
            this.#resolve();
        }
        reject(err) {
            this.#reject(err);
        }
        promise() {
            return this.#promise;
        }

        hasPendingEvent() {
            // debugLog('[Waitable#hasPendingEvent()]', {
            //     componentIdx: this.#componentIdx,
            //     waitable: this,
            //     waitableSet: this.#waitableSet,
            //     hasPendingEvent: this.#pendingEventFn !== null,
            // });
            return this.#pendingEventFn !== null;
        }

        setPendingEvent(fn) {
            debugLog('[Waitable#setPendingEvent()] args', {
                waitable: this,
                inSet: this.#waitableSet,
            });
            this.#pendingEventFn = fn;
        }

        getPendingEvent() {
            debugLog('[Waitable#getPendingEvent()] args', {
                waitable: this,
                inSet: this.#waitableSet,
                hasPendingEvent: this.#pendingEventFn !== null,
            });
            if (this.#pendingEventFn === null) {
                return null;
            }
            const eventFn = this.#pendingEventFn;
            this.#pendingEventFn = null;
            const e = eventFn();
            this.#resetPromise();
            return e;
        }

        join(waitableSet) {
            debugLog('[Waitable#join()] args', {
                waitable: this,
                waitableSet: waitableSet,
                isRemoval: waitableSet === null,
            });

            if (waitableSet === undefined) {
                throw new TypeError('waitable set must be not be undefined');
            }

            if (this.#waitableSet) {
                this.#waitableSet.removeWaitable(this);
            }

            this.#waitableSet = waitableSet;

            if (waitableSet) {
                waitableSet.addWaitable(this);
            }
        }

        drop() {
            debugLog('[Waitable#drop()] args', {
                componentIdx: this.#componentIdx,
                waitable: this,
            });
            this.join(null);
        }

        async waitForPendingEvent(args) {
            const { cstate } = args;
            if (!cstate) {
                throw new TypeError('missing component state');
            }

            if (this.#waitableSet !== null || this.#hasSyncWaiter) {
                throw new Error('waitable is already in a set/has a sync waiter');
            }
            this.#hasSyncWaiter = true;
            try {
                await cstate.waitUntil({
                    cancellable: false,
                    readyFn: () => this.hasPendingEvent(),
                });
            } finally {
                this.#hasSyncWaiter = false;
            }
        }
    }

    return Waitable;
}

/** Only the selected, live cancellation code is captured by this constructor. */
export function initializeWaitableSetClass(asyncEventCode) {
    class WaitableSet {
        #componentIdx;
        #waitables = [];

        #waiting = 0;

        target;

        constructor(componentIdx) {
            if (componentIdx === undefined) {
                throw new TypeError('missing/invalid component idx');
            }
            this.#componentIdx = componentIdx;
            this.target = `component [${this.#componentIdx}] waitable set`;
        }

        componentIdx() {
            return this.#componentIdx;
        }

        numWaitables() {
            return this.#waitables.length;
        }
        numWaiting() {
            return this.#waiting;
        }

        incrementNumWaiting(n) {
            this.#waiting += n ?? 1;
        }
        decrementNumWaiting(n) {
            this.#waiting -= n ?? 1;
        }

        targets() {
            return this.#waitables.map((w) => w.target);
        }

        setTarget(tgt) {
            this.target = tgt;
        }

        shuffleWaitables() {
            this.#waitables = this.#waitables
                .map((value) => ({ value, sort: Math.random() }))
                .sort((a, b) => a.sort - b.sort)
                .map(({ value }) => value);
        }

        removeWaitable(waitable) {
            const existing = this.#waitables.find((w) => w === waitable);
            if (!existing) {
                return undefined;
            }
            this.#waitables = this.#waitables.filter((w) => w !== waitable);
            return waitable;
        }

        addWaitable(waitable) {
            this.removeWaitable(waitable);
            this.#waitables.push(waitable);
        }

        hasPendingEvent() {
            debugLog('[WaitableSet#hasPendingEvent()] args', {
                componentIdx: this.#componentIdx,
                waitableSet: this,
                waitableSetTargets: this.targets(),
            });
            const waitable = this.#waitables.find((w) => w.hasPendingEvent());
            return waitable !== undefined;
        }

        getPendingEvent() {
            debugLog('[WaitableSet#getPendingEvent()] args', {
                componentIdx: this.#componentIdx,
                waitableSet: this,
            });
            for (const waitable of this.#waitables) {
                if (!waitable.hasPendingEvent()) {
                    continue;
                }
                const event = waitable.getPendingEvent();
                debugLog('[WaitableSet#getPendingEvent()] found pending event', {
                    waitable,
                    event,
                });
                return event;
            }
            throw new Error('no waitables had a pending event');
        }

        tryWait(opts) {
            debugLog('[WaitableSet#tryWait()] args', { opts });
            // TODO(threads): this task should be the thread
            const { readyFn, task, cancellable } = opts;

            const isReady = () => {
                const hasPendingEvent = this.hasPendingEvent();
                const ready = readyFn();
                return ready && hasPendingEvent;
            };
            const finishWait = (keepGoing) => {
                const event = keepGoing
                    ? this.getPendingEvent()
                    : {
                          code: asyncEventCode.TASK_CANCELLED,
                          payload0: 0,
                          payload1: 0,
                      };
                return event;
            };

            if (task.deliverPendingCancel({ cancellable })) {
                return finishWait(false);
            }
            if (isReady()) {
                return finishWait(true);
            }
            return null;
        }

        waitUntil(opts) {
            debugLog('[WaitableSet#waitUntil()] args', { opts });
            const event = this.tryWait(opts);
            if (event !== null) {
                return event;
            }

            const { readyFn, task, cancellable } = opts;
            const isReady = () => readyFn() && this.hasPendingEvent();
            this.incrementNumWaiting();

            return task.suspendUntil({ readyFn: isReady, cancellable }).then(
                (keepGoing) => {
                    // Resumed without an event because the task was torn down
                    // (e.g. the store trapped): that is not a cancellation the
                    // guest may observe and act on.
                    if (!keepGoing && task.isErrored()) {
                        this.decrementNumWaiting();
                        throw task.isErrored();
                    }
                    const readyEvent = keepGoing
                        ? this.getPendingEvent()
                        : {
                              code: asyncEventCode.TASK_CANCELLED,
                              payload0: 0,
                              payload1: 0,
                          };
                    this.decrementNumWaiting();
                    return readyEvent;
                },
                (err) => {
                    this.decrementNumWaiting();
                    throw err;
                },
            );
        }

        waitUntilCallback(opts, onEvent) {
            debugLog('[WaitableSet#waitUntilCallback()] args', { opts });
            const event = this.tryWait(opts);
            if (event !== null) {
                onEvent(event);
                return;
            }

            const { readyFn, task, cancellable } = opts;
            this.incrementNumWaiting();
            task.suspendUntilCallback(
                {
                    readyFn: () => readyFn() && this.hasPendingEvent(),
                    cancellable,
                },
                (keepGoing) => {
                    const resumedEvent = keepGoing
                        ? this.getPendingEvent()
                        : {
                              code: asyncEventCode.TASK_CANCELLED,
                              payload0: 0,
                              payload1: 0,
                          };
                    this.decrementNumWaiting();
                    onEvent(resumedEvent);
                },
            );
        }
    }

    return WaitableSet;
}

export function waitableSetNew(context, componentIdx) {
    const { WaitableSet } = context;
    debugLog('[waitableSetNew()] args', { componentIdx });

    const state = getOrCreateAsyncState(context.lookup, componentIdx);
    if (!state) {
        throw new Error(`missing async state for component idx [${componentIdx}]`);
    }

    const wset = new WaitableSet(componentIdx);
    const rep = state.handles.insert(wset);
    if (typeof rep !== 'number') {
        throw new Error(`invalid/missing waitable set rep [${rep}]`);
    }

    debugLog('[waitableSetNew()] created waitable set', { componentIdx, rep });
    return rep;
}

export function waitableSetWait(context, ctx, waitableSetRep, resultPtr, syncOnly = false) {
    const { RuntimeError, WaitableSet } = context;
    debugLog('[waitableSetWait()] args', { ctx, waitableSetRep, resultPtr });
    const { componentIdx, memoryIdx, getMemoryFn } = ctx;

    const taskMeta = getCurrentTask(context.taskLookup, componentIdx);
    if (!taskMeta) {
        throw Error('invalid/missing async task meta');
    }

    const task = taskMeta.task;
    if (!task) {
        throw Error('invalid/missing async task');
    }

    if (task.componentIdx() !== componentIdx) {
        throw Error(`task component [${task.componentIdx()}] !== executing component [${componentIdx}]`);
    }

    const memory = getMemoryFn();

    const cstate = getOrCreateAsyncState(context.lookup, componentIdx);
    const wset = cstate.handles.get(waitableSetRep);
    if (!(wset instanceof WaitableSet)) {
        throw new RuntimeError(`non-waitable set returned from component state handles @ [${waitableSetRep}]`);
    }

    const storeEvent = (event) => {
        const options = {
            memory,
            ptr: resultPtr,
            event,
            componentIdx,
            task,
            memoryIdx,
        };
        return storeEventInComponentMemory(options);
    };
    // Built-in waits never deliver cancellation. Only the
    // callback event loop's wait is cancellable.
    const waitOpts = { readyFn: () => true, task, cancellable: false };
    const event = syncOnly ? wset.tryWait(waitOpts) : wset.waitUntil(waitOpts);
    if (event === null) {
        return -1;
    }
    if (event && 'then' in event) {
        return event.then(storeEvent);
    }
    return storeEvent(event);
}

export function waitableSetPoll(context, ctx, waitableSetRep, resultPtr) {
    const { RuntimeError, WaitableSet, events: asyncEventCode } = context;
    const { componentIdx, memoryIdx, getMemoryFn } = ctx;
    debugLog('[waitableSetPoll()] args', {
        componentIdx,
        memoryIdx,
        waitableSetRep,
        resultPtr,
    });

    const taskMeta = getCurrentTask(context.taskLookup, componentIdx);
    if (!taskMeta) {
        throw Error('invalid/missing current task meta');
    }
    if (taskMeta.componentIdx !== componentIdx) {
        throw Error(
            'task component idx [' + taskMeta.componentIdx + '] != component instance ID [' + componentIdx + ']',
        );
    }

    const task = taskMeta.task;
    if (!task) {
        throw Error('invalid/missing async task in task meta');
    }

    if (task.componentIdx() !== componentIdx) {
        throw Error(`task component idx [${task.componentIdx()}] does not match generated [${componentIdx}]`);
    }

    const cstate = getOrCreateAsyncState(context.lookup, task.componentIdx());
    // (the index must name a waitable set, as for `waitable-set.wait`)
    const wset = waitableSetRep === 0 ? undefined : cstate.handles.get(waitableSetRep);
    if (!(wset instanceof WaitableSet)) {
        throw new RuntimeError(`unknown handle index ${waitableSetRep}`);
    }

    let event;
    if (!wset.hasPendingEvent()) {
        debugLog('[waitableSetPoll()] no pending event', {
            componentIdx,
            waitableSetRep,
        });
        event = { code: asyncEventCode.NONE, payload0: 0, payload1: 0 };
    } else {
        debugLog('[waitableSetPoll()] retrieving waiting pending event', {
            componentIdx,
            waitableSetRep,
        });
        event = wset.getPendingEvent();
    }

    const options = {
        event,
        ptr: resultPtr,
        memory: getMemoryFn(),
        componentIdx,
        task,
        memoryIdx,
    };

    return storeEventInComponentMemory(options);
}

export function waitableSetDrop(context, componentIdx, waitableSetRep) {
    debugLog('[waitableSetDrop()] args', { componentIdx, waitableSetRep });
    const task = getCurrentTask(context.taskLookup, componentIdx);

    if (!task) {
        throw new Error('invalid/missing async task');
    }
    if (task.componentIdx !== componentIdx) {
        throw Error('task component idx [' + task.componentIdx + '] != component instance ID [' + componentIdx + ']');
    }

    const state = getOrCreateAsyncState(context.lookup, componentIdx);
    if (!state.mayLeave) {
        throw new Error('component instance is not marked as may leave, cannot be cancelled');
    }

    removeWaitableSet(context, { state, waitableSetRep });
}

export function removeWaitableSet(context, args) {
    const { RuntimeError, WaitableSet } = context;
    debugLog('[removeWaitableSet()] args', args);
    const { state, waitableSetRep } = args;
    if (!state) {
        throw new TypeError('missing component state');
    }

    const ws = state.handles.get(waitableSetRep);
    if (!(ws instanceof WaitableSet)) {
        throw new RuntimeError('cannot remove waitable set: no set present with rep [' + waitableSetRep + ']');
    }
    if (ws.hasPendingEvent()) {
        throw new RuntimeError('waitable set cannot be removed with pending items remaining');
    }

    if (ws.numWaitables() > 0) {
        throw new RuntimeError('waitable set still contains waitables');
    }
    if (ws.numWaiting() > 0) {
        throw new RuntimeError('cannot drop waitable set with waiters');
    }

    state.handles.remove(waitableSetRep);
}

export function waitableJoin(context, componentIdx, waitableRep, waitableSetRep) {
    const { RuntimeError, Waitable, WaitableSet } = context;
    debugLog('[waitableJoin()] args', {
        componentIdx,
        waitableSetRep,
        isRemoval: waitableSetRep === 0,
        waitableRep,
    });

    const state = getOrCreateAsyncState(context.lookup, componentIdx);
    if (!state) {
        throw new Error(`invalid/missing async state for component instance [${componentIdx}]`);
    }

    if (!state.mayLeave) {
        throw new RuntimeError('component instance is not marked as may leave, cannot join waitable');
    }

    const waitableObj = state.handles.get(waitableRep);
    if (!waitableObj) {
        throw new RuntimeError(`missing waitable obj (rep [${waitableRep}]), component idx [${componentIdx}])`);
    }
    const waitable = waitableObj.getWaitable ? waitableObj.getWaitable() : waitableObj;
    if (!(waitable instanceof Waitable)) {
        throw new RuntimeError('handle does not name a waitable');
    }

    const waitableSet = waitableSetRep === 0 ? null : state.handles.get(waitableSetRep);
    if (waitableSetRep !== 0 && !(waitableSet instanceof WaitableSet)) {
        throw new RuntimeError(`missing waitable set [${waitableSetRep}] in component idx [${componentIdx}]`);
    }

    waitable.join(waitableSet ?? null);
}
