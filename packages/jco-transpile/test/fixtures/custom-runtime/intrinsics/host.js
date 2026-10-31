import { debugLog } from './core-debug.js';
import { promiseWithResolvers } from './core-promises.js';
import {
    getCurrentTaskMeta,
    setCurrentTaskMeta,
    withCurrentTaskMeta,
    withCurrentTaskMetaAsync,
} from './task-context.js';
import { lookupMemories } from './core.js';
import { getOrCreateAsyncState } from './component.js';
import { getCurrentTask, createNewCurrentImplicitThread } from './task-operations.js';
import { driverLoop } from './task-driver.js';
export function prepareCall(
    _context,
    memoryIdx,
    getMemoryFn,
    startFn,
    returnFn,
    callerComponentIdx,
    calleeComponentIdx,
    taskReturnTypeIdx,
    calleeIsAsyncInt,
    stringEncoding,
    resultCountOrAsync,
    ...params
) {
    debugLog('[prepareCall()]', {
        memoryIdx,
        callerComponentIdx,
        calleeComponentIdx,
        taskReturnTypeIdx,
        calleeIsAsyncInt,
        stringEncoding,
        resultCountOrAsync,
    });
    const argArray = params;

    // value passed in *may* be as large as u32::MAX which may be mangled into -2
    resultCountOrAsync >>>= 0;

    let isAsync = false;
    let hasResultPointer = false;
    if (resultCountOrAsync === 2 ** 32 - 1) {
        // prepare async with no result (u32::MAX)
        isAsync = true;
        hasResultPointer = false;
    } else if (resultCountOrAsync === 2 ** 32 - 2) {
        // prepare async with result (u32::MAX - 1)
        isAsync = true;
        hasResultPointer = true;
    } else if (resultCountOrAsync > 1) {
        // Sync lowering whose flattened results exceed
        // MAX_FLAT_RESULTS (1): the results are spilled via a
        // return pointer, passed as the caller's trailing core
        // argument (the fused [return-call] helper writes
        // through it). An unflattenable result count arrives
        // as the i32::MAX sentinel and takes this path too.
        hasResultPointer = true;
    }

    const currentCallerThreadMeta = getCurrentTaskMeta(_context.registers, callerComponentIdx);
    const currentCallerTaskMeta =
        currentCallerThreadMeta && getCurrentTask(_context, callerComponentIdx, currentCallerThreadMeta.taskID);
    if (!currentCallerTaskMeta) {
        // Core start functions run without an ambient component task.
        // A fused synchronous lower would have to block that implicit
        // synchronous task, so report the canonical trap before trying
        // to construct its structured-concurrency child.
        if (!isAsync && (_context.mayBlock === false ? undefined : _context.mayBlock.value) === 0) {
            throw new _context.RuntimeError('cannot block a synchronous task before returning');
        }
        throw new Error('invalid/missing current task for caller during prepare call');
    }

    const currentCallerTask = currentCallerTaskMeta.task;
    const callerThreadID = currentCallerThreadMeta.threadID;
    if (!currentCallerTask) {
        throw new Error('unexpectedly missing task in meta for caller during prepare call');
    }

    if (currentCallerTask.componentIdx() !== callerComponentIdx) {
        throw new Error(
            `task component idx [${currentCallerTask.componentIdx()}] !== [${callerComponentIdx}] (callee ${calleeComponentIdx})`,
        );
    }

    let getCalleeParamsFn;
    let resultPtr = null;
    let directParamsArr;
    if (hasResultPointer) {
        directParamsArr = argArray.slice(0, argArray.length - 1);
        getCalleeParamsFn = () => directParamsArr;
        resultPtr = argArray[argArray.length - 1] >>> 0;
    } else {
        directParamsArr = argArray.slice(0);
        getCalleeParamsFn = () => directParamsArr;
    }

    let encoding;
    switch (stringEncoding) {
        case 0:
            encoding = 'utf8';
            break;
        case 1:
            encoding = 'utf16';
            break;
        case 2:
            encoding = 'compact-utf16';
            break;
        default:
            throw new Error(`unrecognized string encoding enum [${stringEncoding}]`);
    }

    const subtask = currentCallerTask.createSubtask({
        componentIdx: callerComponentIdx,
        parentTask: currentCallerTask,
        isAsync,
        callMetadata: {
            getMemoryFn,
            callerThreadID,
            memoryIdx,
            resultPtr,
            returnFn,
            startFn,
            stringEncoding: encoding,
        },
    });

    const { task: newTask, thread: newThread } = createNewCurrentImplicitThread(_context.creation, {
        componentIdx: calleeComponentIdx,
        isAsync,
        getCalleeParamsFn,
        entryFnName: ['task', subtask.getParentTask().id(), 'subtask', subtask.id(), 'new-prepared-async-task'].join(
            '/',
        ),
        stringEncoding: encoding,
    });
    newTask.setParentSubtask(subtask);
    // Whether the callee may block depends on the callee's function type
    // (FACT passes `types[lift_ty].async_` here), not on how the caller
    // lowered the call or how the callee was lifted.
    newTask.setFuncTypeIsAsync(calleeIsAsyncInt !== 0);
    newTask.setReturnResultTypeIdx(taskReturnTypeIdx >>> 0);
    newTask.setReturnMemoryIdx(memoryIdx);
    newTask.setReturnMemory(getMemoryFn());
    subtask.setChildTask(newTask);

    newTask.subtaskMeta = {
        subtask,
        calleeComponentIdx,
        callerComponentIdx,
        getCalleeParamsFn,
        stringEncoding: encoding,
        isAsync,
    };

    setCurrentTaskMeta(_context.registers, {
        taskID: newTask.id(),
        threadID: newThread.id(),
        componentIdx: newTask.componentIdx(),
    });
}

export function asyncStartCall(_context, args, callee, paramCount, resultCount, flags) {
    const componentIdx = _context.componentIdxs.at(-1);

    const globalTaskMeta = getCurrentTaskMeta(_context.registers, componentIdx);
    if (!globalTaskMeta) {
        throw new Error('missing global current task globalTaskMeta');
    }
    const taskID = globalTaskMeta.taskID;
    const threadID = globalTaskMeta.threadID;

    debugLog('[asyncStartCall()] args', { args, componentIdx });
    const { getCallbackFn, callbackIdx, getPostReturnFn } = args;

    const preparedTaskMeta = getCurrentTask(_context, componentIdx, taskID);
    if (!preparedTaskMeta) {
        throw new Error('unexpectedly missing current task');
    }

    const preparedTask = preparedTaskMeta.task;
    if (!preparedTask) {
        throw new Error('unexpectedly missing current task');
    }
    if (!preparedTask.subtaskMeta) {
        throw new Error('missing subtask meta from prepare');
    }
    preparedTask.setCalleeIsAsync((flags & 1) !== 0);
    const calleeIsAsync = (flags & 1) !== 0;

    const { subtask, callerComponentIdx, calleeComponentIdx } = preparedTask.subtaskMeta;
    if (!subtask) {
        throw new Error('missing subtask from cstate during async start call');
    }
    if (calleeComponentIdx !== preparedTask.componentIdx()) {
        throw new Error(
            `meta callee idx [${calleeComponentIdx}] != current task idx [${preparedTask.componentIdx()}] during async start call`,
        );
    }
    if (calleeComponentIdx !== componentIdx) {
        throw new Error('mismatched componentIdx for async start call (does not match prepare)');
    }

    if (resultCount < 0 || resultCount > 1) {
        throw new Error('invalid/unsupported result count');
    }

    const callbackFnName = 'callback_' + callbackIdx;
    const callbackFn = getCallbackFn();
    preparedTask.setCallbackFn(callbackFn, callbackFnName);
    preparedTask.setPostReturnFn(getPostReturnFn());

    if (resultCount < 0 || resultCount > 1) {
        throw new Error(`unsupported result count [${resultCount}]`);
    }

    // NOTE: `params` are the *caller's* lowered core args captured during
    // PrepareCall, while `paramCount` describes the *callee's* lifted core
    // signature.
    //
    // The two intentionally differ whenever the caller spilled
    // its arguments to memory (async lowers pass a single pointer for
    // functions with more than MAX_FLAT_ASYNC_PARAMS flat params).
    //
    // The fused [async-start] adapter that is provided (`startFn`,
    // invoked via `subtask.onStart()` below) performs the conversion.
    //
    const params = preparedTask.getCalleeParams();

    const callerComponentState = getOrCreateAsyncState(_context.lookup, subtask.componentIdx());

    const calleeComponentState = getOrCreateAsyncState(_context.lookup, preparedTask.componentIdx());
    calleeComponentState.hasBackpressure();

    // Set up a handler on subtask completion to lower results from the call into the caller's memory region.
    //
    // NOTE: during fused guest->guest calls this handler is triggered, but does not actually perform
    // lowering manually, as fused modules provider helper functions that can
    subtask.registerOnResolveHandler((res) => {
        debugLog('[asyncStartCall()] handling subtask result', { res, subtaskID: subtask.id() });

        // Cancelled resolutions carry no value; there is nothing to lower
        if (!subtask.isReturned()) {
            return;
        }

        let subtaskCallMeta = subtask.getCallMetadata();

        // NOTE: in the case of guest -> guest async calls, there may be no memory/realloc present,
        // as the host will intermediate the value storage/movement between calls.
        //
        // We can simply take the value and lower it as a parameter
        if (subtaskCallMeta.memory || subtaskCallMeta.realloc) {
            throw new Error('call metadata unexpectedly contains memory/realloc for guest->guest call');
        }

        const callerTask = subtask.getParentTask();
        const calleeTask = preparedTask;
        const callerMemoryIdx = callerTask.getReturnMemoryIdx();
        const callerComponentIdx = callerTask.componentIdx();

        // If a helper function was provided we are likely in a fused guest->guest call,
        // and the result will be delivered (lift/lowered) via helper function
        if (subtaskCallMeta && subtaskCallMeta.returnFn) {
            debugLog(
                '[asyncStartCall()] return function present while handling subtask result, returning early (skipping lower)',
                {
                    calleeTaskID: calleeTask.id(),
                    calleeComponentIdx,
                },
            );

            // TODO: centralize calling of returnFn to *one place* (if possible)
            if (subtaskCallMeta.returnFnCalled) {
                return;
            }

            const res = withCurrentTaskMeta(_context.registers, {
                taskID: callerTask.id(),
                threadID: subtaskCallMeta.callerThreadID,
                componentIdx: callerTask.componentIdx(),
                fn: () => subtaskCallMeta.returnFn.apply(null, [subtaskCallMeta.resultPtr]),
            });
            subtaskCallMeta.returnFnCalled = true;

            debugLog('[asyncStartCall()] finished calling return fn', {
                calleeTaskID: calleeTask.id(),
                calleeComponentIdx,
                res,
            });

            return;
        }

        // If there is no where to lower the results, exit early
        if (!subtaskCallMeta.resultPtr) {
            debugLog(
                '[asyncStartCall()] no result ptr during subtask result handling, returning early (skipping lower)',
            );
            return;
        }

        let callerMemory;
        if (callerMemoryIdx !== null && callerMemoryIdx !== undefined) {
            const memory = lookupMemories(_context.memories, {
                componentIdx: callerComponentIdx,
                memoryIdx: callerMemoryIdx,
            });
            callerMemory = Array.isArray(memory) ? undefined : memory;
        } else {
            const callerMemories = lookupMemories(_context.memories, { componentIdx: callerComponentIdx });
            if (callerMemories.length !== 1) {
                throw new Error(`unsupported amount of caller memories`);
            }
            callerMemory = callerMemories[0]?.memory;
        }

        if (!callerMemory) {
            debugLog('[asyncStartCall()] missing memory', { subtaskID: subtask.id(), res });
            throw new Error(`missing memory for to guest->guest call result (subtask [${subtask.id()}])`);
        }

        const lowerFns = calleeTask.getReturnLowerFns();
        if (!lowerFns || lowerFns.length === 0) {
            debugLog('[asyncStartCall()] missing result lower metadata for guest->guest call', {
                subtaskID: subtask.id(),
            });
            throw new Error(`missing result lower metadata for guest->guest call (subtask [${subtask.id()}])`);
        }

        if (lowerFns.length !== 1) {
            debugLog('[asyncStartCall()] only single result reportetd for guest->guest call', {
                subtaskID: subtask.id(),
            });
            throw new Error(`only single result supported for guest->guest calls (subtask [${subtask.id()}])`);
        }

        debugLog('[asyncStartCall()] lowering results', { subtaskID: subtask.id() });
        lowerFns[0]({
            realloc: undefined,
            memory: callerMemory,
            vals: [res],
            storagePtr: subtaskCallMeta.resultPtr,
            componentIdx: callerComponentIdx,
            stringEncoding: subtaskCallMeta.stringEncoding,
        });
    });

    let startRes;
    const startSubtask = () => {
        const initialResult = subtask.onStart({ startFnParams: params });
        startRes = initialResult === undefined ? [] : Array.isArray(initialResult) ? initialResult : [initialResult];
        if (startRes.length !== paramCount) {
            throw new Error(
                `unexpected callee param count [${startRes.length}] after start fn, asyncStartCall invocation expected [${paramCount}]`,
            );
        }
    };

    const registerSubtaskProgress = () => {
        subtask.setOnProgressFn(() => {
            subtask.setPendingEvent(() => {
                if (subtask.isResolved()) {
                    subtask.deliverResolve();
                }
                const event = {
                    code: _context.events.SUBTASK,
                    payload0: subtask.waitableRep(),
                    payload1: subtask.getStateNumber(),
                };
                return event;
            });
        });
    };

    const handleCalleeError = (err) => {
        preparedTask.endFirstSlice();
        debugLog('[asyncStartCall()] initial subtask callee run failed', err);
        // NOTE: a good place to reject the parent task, if rejection API is enabled
        // subtask.reject(err);
        // subtask.getParentTask().reject(err);

        subtask.getParentTask().setErrored(err);

        // Release the enter()-acquired per-slice hold: the driver
        // loop that would normally pair it never starts.
        if (preparedTask.needsExclusiveLock()) {
            calleeComponentState.exclusiveRelease(preparedTask.id());
        }
    };

    const driveCallback = (callbackResult) => {
        // If there was no callback function, we're dealing with a sync function
        // that was lifted as async without one, there is only the callee.
        if (!callbackFn) {
            debugLog('[asyncStartCall()] no callback, resolving w/ callee result', {
                taskID: preparedTask.id(),
                componentIdx: preparedTask.componentIdx(),
                preparedTask,
                stateNumber: preparedTask.taskState(),
                isResolved: preparedTask.isResolved(),
                callbackFn,
            });
            // A sync-lifted callee applies automatic backpressure for
            // the complete call. Its entry hold ends when the core
            // function returns, not when one of its nested calls parks.
            if (preparedTask.needsExclusiveLock()) {
                calleeComponentState.exclusiveRelease(preparedTask.id());
            }
            // Cancellation can resolve the task while the
            // synchronous callee is still unwinding. Its
            // eventual return only ends the slice; it must
            // not publish a second resolution.
            if (!preparedTask.isResolved()) {
                preparedTask.resolve([callbackResult]);
            }
            preparedTask.exit({ skipExclusiveLockCheck: true });
            return;
        }

        let fnName = callbackFn.fnName;
        if (!fnName) {
            fnName = [
                '<task ',
                subtask.parentTaskID(),
                '/subtask ',
                subtask.id(),
                '/task ',
                preparedTask.id(),
                '>',
            ].join('');
        }

        debugLog('[asyncStartCall()] starting driver loop', {
            fnName,
            componentIdx: preparedTask.componentIdx(),
            subtaskID: subtask.id(),
            childTaskID: subtask.childTaskID(),
            parentTaskID: subtask.parentTaskID(),
        });

        return driverLoop(_context.driver, {
            componentState: calleeComponentState,
            task: preparedTask,
            fnName,
            isAsync: true,
            callbackResult,
        });
    };

    const driveJspiCallee = async () => {
        try {
            calleeComponentState.throwIfInterrupted();
        } catch (err) {
            handleCalleeError(err);
            return;
        }
        let callbackResult;
        // A synchronous callee blocks its caller until it fully returns (it may
        // suspend mid-way, e.g. on a nested blocking import). Hold the blocking
        // marker for the whole execution so any async subtask it starts -- even
        // one dispatched after a suspension -- is recognised as originating from
        // a blocking function and enters in-slice rather than being deferred.
        if (!calleeIsAsync) {
            _context.blockingDepth.value++;
        }
        try {
            let jspiCallee;
            if (callee._cachedPromising) {
                jspiCallee = callee._cachedPromising;
            } else {
                callee._cachedPromising = _context.platform.promising(callee);
                jspiCallee = callee._cachedPromising;
            }

            callbackResult = await withCurrentTaskMetaAsync(_context.registers, {
                taskID: preparedTask.id(),
                threadID,
                componentIdx: preparedTask.componentIdx(),
                fn: () => jspiCallee.apply(null, startRes),
            });
            preparedTask.endFirstSlice();
        } catch (err) {
            handleCalleeError(err);
            return;
        } finally {
            if (!calleeIsAsync) {
                _context.blockingDepth.value--;
            }
        }

        try {
            await driveCallback(callbackResult);
        } catch (err) {
            debugLog('[AsyncStartCall] drive loop call failure', { err });
        }
    };

    const driveDirectCallee = () => {
        try {
            calleeComponentState.throwIfInterrupted();
        } catch (err) {
            handleCalleeError(err);
            return;
        }
        let callbackResult;
        if (!calleeIsAsync) {
            _context.blockingDepth.value++;
        }
        try {
            callbackResult = withCurrentTaskMeta(_context.registers, {
                taskID: preparedTask.id(),
                threadID,
                componentIdx: preparedTask.componentIdx(),
                fn: () => callee.apply(null, startRes),
            });
            preparedTask.endFirstSlice();
        } catch (err) {
            handleCalleeError(err);
            return;
        } finally {
            if (!calleeIsAsync) {
                _context.blockingDepth.value--;
            }
        }

        driveCallback(callbackResult)?.catch((err) => {
            debugLog('[AsyncStartCall] drive loop call failure', { err });
        });
    };

    // Enter eagerly when backpressure and the per-component slice lock permit
    // it. `tryEnter()` returns null for real contention, preserving an
    // observable STARTING state only when the callee genuinely cannot start.
    // A successful async entry runs through its first suspension point before
    // returning STARTED, matching the canonical ABI scheduling contract.
    const enteredSynchronously = preparedTask.tryEnter();
    if (enteredSynchronously === true) {
        // Directly returned STARTED is not also delivered as an event, so
        // install the progress handler only after the state transition.
        startSubtask();
        registerSubtaskProgress();

        if (callee._jcoMaySuspend === false) {
            driveDirectCallee();
        } else {
            // Calling the async helper runs synchronously through invocation
            // of WebAssembly.promising, which executes the guest until its
            // first suspending import before returning a Promise.
            driveJspiCallee();
        }
    } else if (enteredSynchronously === null) {
        // A delayed transition to STARTED is guest-visible progress.
        registerSubtaskProgress();
        const enterPromise = preparedTask.enter().then((started) => {
            // Entry can finish before the timer below runs. Keep that
            // runnable guest work visible to the deadlock detector.
            if (started) {
                calleeComponentState.addPendingTaskStart();
            }
            return started;
        });

        // Entry is blocked by backpressure or an in-flight component slice,
        // so resume the call once the task is allowed to enter.
        // Nothing catches an exception thrown from a timer callback:
        // it would take down the whole process rather than the call.
        // Any failure here is reported through the subtask instead.
        const failDeferredStart = (err) => {
            handleCalleeError(err);
            if (!subtask.isResolved()) {
                subtask.reject(err);
            }
        };
        setTimeout(async () => {
            try {
                debugLog('[asyncStartCall()] continuing started subtask (in JS task)', {
                    taskID: preparedTask.id(),
                    subtaskID: subtask.id(),
                    callerComponentIdx,
                    calleeComponentIdx,
                });

                // Entry queues FIFO when another slice of the callee
                // component is already in flight.
                const started = await enterPromise;
                if (started) {
                    calleeComponentState.removePendingTaskStart();
                }
                if (!started) {
                    debugLog('[asyncStartCall()] task failed early', {
                        taskID: preparedTask.id(),
                        subtaskID: subtask.id(),
                    });
                    // A cancellation-before-start is a valid resolution, not a failure
                    if (preparedTask.isCancelled()) {
                        return;
                    }
                    throw preparedTask.isErrored() ?? new Error('task failed to start');
                }

                // PrepareCall installs the callee task before the eager
                // path runs, but that metadata is gone by the time a
                // contended entry resumes in this timer. Fused adapters
                // can execute context.get while lowering their inputs,
                // so restore the same task context around the delayed
                // start that the eager path observes.
                withCurrentTaskMeta(_context.registers, {
                    taskID: preparedTask.id(),
                    threadID,
                    componentIdx: preparedTask.componentIdx(),
                    fn: startSubtask,
                });

                if (callee._jcoMaySuspend === false) {
                    driveDirectCallee();
                } else {
                    await driveJspiCallee();
                }
            } catch (err) {
                failDeferredStart(err);
            }
        }, 0);
    }

    // A callee that trapped while it ran synchronously (for example
    // one that exited without `task.return`) traps its caller as well,
    // as in the Canonical ABI: the call does not return a subtask
    // state that implies a cancellation nobody requested.
    const calleeTrap = preparedTask.isErrored() ?? subtask.getParentTask().isErrored();
    if (calleeTrap) {
        throw calleeTrap;
    }

    const subtaskState = subtask.getStateNumber();
    if (subtaskState < 0 || subtaskState > 2 ** 5) {
        throw new Error('invalid subtask state, out of valid range');
    }

    debugLog('[asyncStartCall()] returning subtask rep & state', {
        subtask: {
            rep: subtask.waitableRep(),
            state: subtaskState,
        },
    });

    if (subtask.isReturned()) {
        // Eager completion exposes no waitable handle to the caller.
        // Consume the parked progress event and retire the internal
        // bookkeeping subtask just like an eager host import.
        if (subtask.hasPendingEvent()) {
            subtask.getPendingEvent();
        }
        if (!subtask.resolveDelivered()) {
            subtask.deliverResolve();
        }
        if (subtask.waitableRep() !== null) {
            const removed = callerComponentState.handles.remove(subtask.waitableRep());
            if (removed !== subtask) {
                throw new Error('subtask handle cleanup removed unexpected entry');
            }
        }
        subtask.drop();
        return subtaskState;
    }

    return (Number(subtask.ensureHandle()) << 4) | subtaskState;
}

export async function syncStartCall(_context, args, callee, paramCount) {
    const componentIdx = _context.componentIdxs.at(-1);

    const globalTaskMeta = getCurrentTaskMeta(_context.registers, componentIdx);
    if (!globalTaskMeta) {
        throw new Error('missing global current task meta during sync start call');
    }
    const taskID = globalTaskMeta.taskID;
    const threadID = globalTaskMeta.threadID;

    debugLog('[syncStartCall()] args', { args, paramCount, componentIdx });
    const { getCallbackFn, callbackIdx } = args;

    const preparedTaskMeta = getCurrentTask(_context, componentIdx, taskID);
    if (!preparedTaskMeta) {
        throw new Error('unexpectedly missing current (prepared) task');
    }

    const preparedTask = preparedTaskMeta.task;
    if (!preparedTask) {
        throw new Error('unexpectedly missing current (prepared) task');
    }
    if (!preparedTask.subtaskMeta) {
        throw new Error('missing subtask meta from prepare');
    }

    preparedTask.setCalleeIsAsync(true);
    const { subtask, calleeComponentIdx, callerComponentIdx } = preparedTask.subtaskMeta;
    if (!subtask) {
        throw new Error('missing subtask from prepare during sync start call');
    }
    if (calleeComponentIdx !== preparedTask.componentIdx()) {
        throw new Error(
            `meta callee idx [${calleeComponentIdx}] != current task idx [${preparedTask.componentIdx()}] during sync start call`,
        );
    }

    // The caller's wasm stack stays suspended across the whole blocking
    // call; sibling slices of the caller's component may run meanwhile
    // and move its current-task register. Capture the entry at call
    // time and restore it before the caller resumes (the same
    // discipline as the suspending-import wrapper).
    const savedCallerTaskMeta = getCurrentTaskMeta(_context.registers, callerComponentIdx);
    try {
        const callbackFn = getCallbackFn();
        preparedTask.setCallbackFn(callbackFn, 'callback_' + callbackIdx);

        // NOTE: `params` are the caller's lowered core args captured during
        // PrepareCall; the fused [sync-start] helper (`startFn`, invoked via
        // `subtask.onStart()` below) converts them into the callee's lifted
        // core signature (`paramCount`).
        const params = preparedTask.getCalleeParams();

        const calleeComponentState = getOrCreateAsyncState(_context.lookup, preparedTask.componentIdx());

        const {
            promise: taskReturnPromise,
            resolve: resolveTaskReturn,
            reject: rejectTaskReturn,
        } = promiseWithResolvers();
        preparedTask.registerOnResolveHandler(() => {
            const err = preparedTask.isErrored();
            if (err) {
                rejectTaskReturn(err);
            } else {
                resolveTaskReturn();
            }
        });

        // For fused guest->guest calls the [return-call] helper performs the
        // result copy/lower; it is invoked by the taskReturn intrinsic when
        // the callee resolves (this handler is the fallback ordering guard,
        // mirroring _asyncStartCall).
        subtask.registerOnResolveHandler((res) => {
            debugLog('[syncStartCall()] handling subtask result', { res, subtaskID: subtask.id() });
            if (!subtask.isReturned()) {
                return;
            }
            const subtaskCallMeta = subtask.getCallMetadata();
            if (subtaskCallMeta?.returnFn && !subtaskCallMeta.returnFnCalled) {
                const callerTask = subtask.getParentTask();
                subtaskCallMeta.returnFnResult = withCurrentTaskMeta(_context.registers, {
                    taskID: callerTask.id(),
                    threadID: subtaskCallMeta.callerThreadID,
                    componentIdx: callerTask.componentIdx(),
                    fn: () => subtaskCallMeta.returnFn.apply(null, [subtaskCallMeta.resultPtr]),
                });
                subtaskCallMeta.returnFnCalled = true;
            }
        });

        const initialResult = subtask.onStart({ startFnParams: params });
        const startRes =
            initialResult === undefined ? [] : Array.isArray(initialResult) ? initialResult : [initialResult];
        if (startRes.length !== paramCount) {
            throw new Error(
                `unexpected callee param count [${startRes.length}] after start fn, syncStartCall invocation expected [${paramCount}]`,
            );
        }

        const started = await preparedTask.enter();
        if (!started) {
            if (preparedTask.isCancelled()) {
                return undefined;
            }
            throw new Error('callee task failed to start during sync start call');
        }

        // The prepared task was created with the *lowering's* async-ness
        // (sync), so enter() took the sync shortcut without acquiring the
        // per-slice exclusive lock the callback-driven slices below pair
        // with; acquire it here (FIFO-queued when another slice of the callee
        // is mid-flight.
        if (preparedTask.needsExclusiveLock()) {
            await calleeComponentState.acquireExclusiveLock(preparedTask.id());
        }

        let jspiCallee;
        if (callee._cachedPromising) {
            jspiCallee = callee._cachedPromising;
        } else {
            callee._cachedPromising = _context.platform.promising(callee);
            jspiCallee = callee._cachedPromising;
        }

        const failCalleeLifecycle = (err) => {
            debugLog('[syncStartCall()] callee lifecycle failed', { err });

            // The initial slice owns component entry until it either hands
            // control to the callback driver or fails. A failure has no driver
            // exit with which to pair this hold.
            if (preparedTask.needsExclusiveLock()) {
                calleeComponentState.exclusiveRelease(preparedTask.id());
            }

            preparedTask.setErrored(err);
            if (!preparedTask.isResolvedState()) {
                preparedTask.reject(err);
            } else {
                // task.return may already have released the synchronous caller.
                // Preserve a later trap on the store and reject the still-running
                // root task when there is one, rather than losing the detached
                // lifecycle failure.
                calleeComponentState.markTrapped(err);
                const rootTask = preparedTask.getRootTask();
                if (!rootTask.isResolvedState()) {
                    rootTask.setErrored(err);
                    rootTask.reject(err);
                }
            }
            throw err;
        };

        // Invocation begins immediately and runs through its first JSPI
        // suspension while the callee owns component entry. Keep driving that
        // invocation and its callback/exit protocol in the background after
        // task.return releases the synchronous caller.
        const calleeLifecyclePromise = (async () => {
            let callbackResult;
            try {
                callbackResult = await withCurrentTaskMetaAsync(_context.registers, {
                    taskID: preparedTask.id(),
                    threadID,
                    componentIdx: preparedTask.componentIdx(),
                    fn: () => {
                        return jspiCallee.apply(null, startRes);
                    },
                });
                preparedTask.endFirstSlice();

                if (!callbackFn) {
                    // Async-lifted without a callback (stackful lift): the callee
                    // ran to completion above; task.return already ran within it.
                    debugLog('[syncStartCall()] no callback, resolving w/ callee result', {
                        taskID: preparedTask.id(),
                        componentIdx: preparedTask.componentIdx(),
                    });
                    if (!preparedTask.isResolved()) {
                        preparedTask.resolve([callbackResult]);
                    }
                    preparedTask.exit({ skipExclusiveLockCheck: true });
                    return;
                }

                const fnName = callbackFn.fnName ?? '<sync-start subtask ' + subtask.id() + '>';
                debugLog('[syncStartCall()] starting driver loop', {
                    fnName,
                    componentIdx: preparedTask.componentIdx(),
                    subtaskID: subtask.id(),
                });
                await driverLoop(_context.driver, {
                    componentState: calleeComponentState,
                    task: preparedTask,
                    fnName,
                    isAsync: true,
                    callbackResult,
                });
                const driverError = preparedTask.isErrored();
                if (driverError) {
                    throw driverError;
                }
            } catch (err) {
                failCalleeLifecycle(err);
            }
        })();
        // If task.return wins the race below, retain a rejection handler on
        // the detached lifecycle while failCalleeLifecycle propagates it to
        // the task tree/store.
        calleeLifecyclePromise.catch(() => {});

        // A sync lower blocks only until task.return supplies its result, but
        // an earlier initial-invocation failure must still trap the caller.
        await Promise.race([taskReturnPromise, calleeLifecyclePromise.then(() => taskReturnPromise)]);

        const callMeta = subtask.getCallMetadata();
        const flatResult = callMeta?.returnFnResult;
        debugLog('[syncStartCall()] returning flat result', {
            flatResult,
            subtaskID: subtask.id(),
            taskID: preparedTask.id(),
        });
        return flatResult;
    } finally {
        if (savedCallerTaskMeta) {
            setCurrentTaskMeta(_context.registers, {
                taskID: savedCallerTaskMeta.taskID,
                threadID: savedCallerTaskMeta.threadID,
                componentIdx: callerComponentIdx,
            });
        }
    }
}

export function storeEventInComponentMemory(args) {
    debugLog('[storeEventInComponentMemory()] args', args);
    const { memory, ptr, event } = args;

    if (!memory) {
        throw new Error('unexpectedly missing memory');
    }
    if (ptr === undefined || ptr === null) {
        throw new Error('unexpectedly missing pointer');
    }
    if (!event) {
        throw new Error('event object missing');
    }
    if (event.code === undefined) {
        throw new Error('invalid event object, missing code');
    }
    if (event.payload0 === undefined) {
        throw new Error('invalid event object, missing payload0');
    }
    if (event.payload1 === undefined) {
        throw new Error('invalid event object, missing payload1');
    }

    const dv = new DataView(memory.buffer);
    dv.setUint32(ptr >>> 0, event.payload0, true);
    dv.setUint32((ptr >>> 0) + 4, event.payload1, true);

    return event.code;
}
