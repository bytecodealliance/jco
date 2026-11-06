import type {
    AsyncTaskModule,
    TrapContext,
    TaskDriverContext,
    ComponentAsyncState,
    AsyncTask as AsyncTaskType,
    WaitableEvent,
} from '../runtime.js';
import { debugLog } from './core-debug.js';
import { typeCheckValidI32 as checkI32 } from './core.js';
import { getOrCreateAsyncState } from './component.js';
import { toInt32 } from './conversion.js';
const typeCheckValidI32 = (value: unknown): value is number => checkI32(value);
const isThenable = <T>(value: T | Promise<T>): value is Promise<T> =>
    !!value && typeof (value as { then?: unknown }).then === 'function';
export function unpackCallbackResult(
    _context: TrapContext,
    result: number,
): ReturnType<AsyncTaskModule['unpackCallbackResult']> {
    if (!typeCheckValidI32(result)) {
        throw new Error('invalid callback return value [' + result + '], not a valid i32');
    }
    const eventCode = result & 0xf;
    if (eventCode < 0 || eventCode > 3) {
        throw new _context.RuntimeError('invalid async return value [' + eventCode + '], outside callback code range');
    }
    if (result < 0 || result >= 2 ** 32) {
        throw new _context.RuntimeError('invalid callback result');
    }
    // TODO: table max length check?
    const waitableSetRep = result >> 4;
    return [eventCode, waitableSetRep];
}

export function driverLoop(
    _context: TaskDriverContext,
    args: {
        componentState: ComponentAsyncState;
        task: AsyncTaskType;
        fnName?: string;
        isAsync?: boolean;
        callbackResult: unknown;
    },
): ReturnType<AsyncTaskModule['driverLoop']> {
    debugLog('[driverLoop()] args', args);
    const { componentState, task, fnName } = args;
    let callbackResult = args.callbackResult;
    const callbackFnName = task.getCallbackFnName();
    const componentIdx = task.componentIdx();
    if (callbackResult instanceof Promise) {
        throw new Error('callbackResult should be a value, not a promise');
    }
    if (callbackResult === undefined) {
        throw new Error('callback result should never be undefined');
    }
    let callbackCode: number;
    let waitableSetRep: number;
    let unpacked;
    const unpackCallback = (value: unknown) => {
        if (!typeCheckValidI32(value)) {
            throw new _context.RuntimeError('invalid callback result [' + value + '], not a number');
        }
        unpacked = unpackCallbackResult(_context, value);
        callbackCode = unpacked[0];
        waitableSetRep = unpacked[1];
        if (callbackCode < 0 || callbackCode > 3) {
            throw new _context.RuntimeError('invalid async return value, outside callback code range');
        }
    };
    const cstate = getOrCreateAsyncState(_context.lookup, componentIdx);
    let eventCode: number | undefined;
    let index: number | undefined;
    let result: number | undefined;
    let asyncRes: WaitableEvent | null;
    let wset;
    const handleError = (err: unknown) => {
        debugLog('[driverLoop()] error during async driver loop', {
            fnName,
            callbackFnName,
            componentIdx,
            taskID: task.id(),
            subtaskID: task.getParentSubtask()?.id(),
            parentTaskID: task.getParentSubtask()?.getParentTask()?.id(),
            event: {
                eventCode,
                index,
                result,
            },
            err,
        });
        task.setErrored(err);
        task.reject(err);
        if (!task.isExited()) {
            task.exit({ skipExclusiveLockCheck: true });
        }
    };
    const drive = (): void | Promise<void> => {
        try {
            if (callbackCode !== 0) {
                componentState.exclusiveRelease(task.id());
            }
            switch (callbackCode) {
                case 0: // EXIT
                    debugLog('[driverLoop()] async exit indicated', {
                        fnName,
                        componentIdx,
                        callbackFnName,
                        taskID: task.id(),
                    });
                    task.exit({ skipExclusiveLockCheck: true });
                    return;
                case 1: // YIELD
                    debugLog('[driverLoop()] yield', {
                        fnName,
                        componentIdx,
                        callbackFnName,
                        taskID: task.id(),
                    });
                    task.suspendUntilCallback(
                        {
                            cancellable: true,
                            readyFn: () => true,
                        },
                        (keepGoing) => {
                            continueWithEvent(
                                keepGoing
                                    ? {
                                          code: _context.events.NONE,
                                          payload0: 0,
                                          payload1: 0,
                                      }
                                    : {
                                          code: _context.events.TASK_CANCELLED,
                                          payload0: 0,
                                          payload1: 0,
                                      },
                            );
                        },
                    );
                    task.settleCompletion();
                    return;
                case 2: // WAIT for a given waitable set
                    // (an invalid index traps, like `waitable-set.wait`)
                    wset = waitableSetRep === 0 ? undefined : cstate.handles.get(waitableSetRep);
                    if (!(wset instanceof _context.WaitableSet)) {
                        throw new _context.RuntimeError(`unknown handle index ${waitableSetRep}`);
                    }
                    debugLog('[driverLoop()] waiting for event', {
                        fnName,
                        componentIdx,
                        callbackFnName,
                        taskID: task.id(),
                        waitableSetRep,
                        waitableSetTargets: wset.targets(),
                    });
                    wset.waitUntilCallback(
                        {
                            readyFn: () => true,
                            task,
                            cancellable: true,
                        },
                        continueWithEvent,
                    );
                    task.settleCompletion();
                    return;
                default:
                    throw new Error(`Unrecognized async function result [${callbackCode}]`);
            }
        } catch (err) {
            handleError(err);
        }
    };
    const continueWithCallbackResult = (callbackRes: number): void | Promise<void> => {
        try {
            unpackCallback(callbackRes);
            debugLog('[driverLoop()] callback result unpacked', {
                fnName,
                componentIdx,
                callbackFnName,
                callbackRes,
                callbackCode,
                waitableSetRep,
            });
            return drive();
        } catch (err) {
            handleError(err);
        }
    };
    const runCallback = (): void | Promise<void> => {
        try {
            // No callback runs once the component instance has trapped.
            if (!task.isRejected()) {
                try {
                    componentState.throwIfInterrupted();
                } catch (err) {
                    task.setErrored(err);
                    task.reject(err);
                }
            }
            if (task.isRejected()) {
                debugLog('[driverLoop()] detected task rejection, leaving early');
                componentState.exclusiveRelease(task.id());
                if (!task.isExited()) {
                    task.exit({ skipExclusiveLockCheck: true });
                }
                return;
            }
            if (asyncRes!.code === undefined) {
                throw new Error('missing event code from event');
            }
            if (asyncRes!.payload0 === undefined) {
                throw new Error('missing payload0 from event');
            }
            if (asyncRes!.payload1 === undefined) {
                throw new Error('missing payload1 from event');
            }
            eventCode = asyncRes!.code; // async event enum code
            index = asyncRes!.payload0; // varies (e.g. idx of related waitable set)
            result = asyncRes!.payload1; // varies (e.g. task state)
            asyncRes = null;
            debugLog('[driverLoop()] performing callback', {
                fnName,
                componentIdx,
                taskID: task.id(),
                callbackFnName,
                eventCode,
                index,
                result,
            });
            const callbackRes = task.runCallbackFn(
                toInt32(_context.strictNumeric, eventCode),
                toInt32(_context.strictNumeric, index),
                toInt32(_context.strictNumeric, result),
            );
            if (isThenable(callbackRes)) {
                return callbackRes.then(continueWithCallbackResult, handleError);
            }
            return continueWithCallbackResult(callbackRes);
        } catch (err) {
            handleError(err);
        }
    };
    function continueWithEvent(event: WaitableEvent | null): void | Promise<void> {
        asyncRes = event;
        const lock = componentState.acquireExclusiveLock(task.id());
        if (lock && typeof lock.then === 'function') {
            return lock.then(runCallback, handleError);
        }
        return runCallback();
    }
    try {
        unpackCallback(callbackResult);
        return drive();
    } catch (err) {
        handleError(err);
    }
}
