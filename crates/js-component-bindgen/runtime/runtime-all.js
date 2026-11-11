// @bytecodealliance/jco-cm-runtime@0.1.0
// generated from commit c1e4baf5c08eb609a9d01e9367df3eb5aa559e94
//#region runtime/runtime.js
/** Experimental JavaScript Component Model runtime contract, independent of package version. */
const CM_RUNTIME_API_VERSION = 1;

//#endregion
//#region runtime/intrinsics/core/promises.js
function promiseWithResolvers() {
	if (Promise.withResolvers) return Promise.withResolvers();
	let resolve;
	let reject;
	return {
		promise: new Promise((res, rej) => {
			resolve = res;
			reject = rej;
		}),
		resolve,
		reject
	};
}
/** Match Promise resolution's object/function check without coercing primitives. */
function isPromiseLike(value) {
	return value !== null && (typeof value === "object" || typeof value === "function") && typeof value.then === "function";
}

//#endregion
//#region runtime/intrinsics/core/debug.js
const debugLog = (...args) => {
	if (!globalThis?.process?.env?.JCO_DEBUG) return;
	console.debug(...args);
};

//#endregion
//#region runtime/intrinsics/task-context.js
const initializeTaskRegisters = () => ({});
function validate(args) {
	if (!args) throw new TypeError("args missing");
	if (args.taskID === void 0) throw new TypeError("missing task ID");
	if (args.threadID === void 0) throw new TypeError("missing thread ID");
	if (args.componentIdx === void 0) throw new TypeError("missing component idx");
}
const getCurrentTaskMeta = (registers, componentIdx) => {
	const value = componentIdx === void 0 || componentIdx === null ? registers.current : registers[componentIdx];
	return value === void 0 || value === null ? void 0 : { ...value };
};
const setCurrentTaskMeta = (registers, args) => {
	validate(args);
	const { taskID, threadID, componentIdx } = args;
	return registers.current = registers[componentIdx] = {
		taskID,
		threadID,
		componentIdx
	};
};
function withCurrentTaskMeta(registers, args) {
	debugLog("[_withGlobalCurrentThreadMeta()] args", args);
	validate(args);
	if (!args.fn) throw new TypeError("missing fn");
	const { taskID, threadID, componentIdx, fn } = args;
	const previous = registers[componentIdx] ?? null;
	const previousCurrent = registers.current ?? null;
	try {
		registers.current = registers[componentIdx] = {
			taskID,
			threadID,
			componentIdx
		};
		return fn();
	} catch (error) {
		debugLog("error while executing sync callee/callback", {
			...args,
			err: error
		});
		throw error;
	} finally {
		registers[componentIdx] = previous;
		registers.current = previousCurrent;
	}
}
function withCurrentTaskMetaAsync(registers, args) {
	debugLog("[_withGlobalCurrentThreadMetaAsync()] args", args);
	validate(args);
	if (!args.fn) throw new TypeError("missing fn");
	const { taskID, threadID, componentIdx, fn } = args;
	const previous = registers[componentIdx] ?? null;
	const previousCurrent = registers.current ?? null;
	let result;
	try {
		registers.current = registers[componentIdx] = {
			taskID,
			threadID,
			componentIdx
		};
		result = fn();
	} catch (error) {
		debugLog("error while executing sync callee/callback", {
			...args,
			err: error
		});
		registers[componentIdx] = previous;
		registers.current = previousCurrent;
		throw error;
	}
	if (!isPromiseLike(result)) {
		registers[componentIdx] = previous;
		registers.current = previousCurrent;
		return result;
	}
	return (async () => {
		try {
			return await result;
		} catch (error) {
			debugLog("error while executing async callee/callback", {
				...args,
				err: error
			});
			throw error;
		} finally {
			if (registers[componentIdx]?.threadID === threadID && registers[componentIdx]?.taskID === taskID) registers[componentIdx] = null;
			if (registers.current?.threadID === threadID && registers.current?.taskID === taskID) registers.current = null;
		}
	})();
}
const clearCurrentTaskMeta = async (registers, args) => {
	debugLog("[_clearCurrentTask()] args", args);
	validate(args);
	const { taskID, threadID, componentIdx } = args;
	const meta = registers[componentIdx];
	if (!meta) throw new Error(`missing current thread meta for component idx [${componentIdx}]`);
	if (meta.threadID !== threadID) throw new Error(`thread ID [${meta.threadID}] != requested ID [${threadID}]`);
	if (meta.taskID !== taskID) throw new Error(`task ID [${meta.taskID}] != requested ID [${taskID}]`);
	if (meta.componentIdx !== componentIdx) throw new Error(`component idx [${meta.componentIdx}] != requested idx [${componentIdx}]`);
	registers[componentIdx] = null;
	if (registers.current?.threadID === threadID && registers.current?.taskID === taskID) registers.current = null;
};

//#endregion
//#region runtime/intrinsics/component/call-tracking.js
/** Host invocation tracking owns no runtime-provider state and exposes no task objects. */
const initializeCallTracking = (context) => {
	const { storeTrap, tasks: tasksByComponent, RuntimeError } = context;
	const exports = /* @__PURE__ */ new WeakMap();
	const pending = /* @__PURE__ */ new Set();
	let entering = null;
	let checkQueued = false;
	/** Release private task references and publish one terminal execution outcome. */
	function finish(call, outcome) {
		pending.delete(call);
		call.task = null;
		call.resolve(Object.freeze(outcome));
	}
	/** Check selected guest execution, excluding unrelated calls and host-owned work. */
	function checkNow() {
		if (pending.size === 0) return;
		const liveRoots = /* @__PURE__ */ new Set();
		if (storeTrap.error === null) for (const [componentIdx, tasks] of tasksByComponent) {
			if (componentIdx === -1) continue;
			for (const { task } of tasks) liveRoots.add(task.getRootTask());
		}
		for (const call of pending) if (storeTrap.stopped) finish(call, { status: "stopped" });
		else if (storeTrap.error !== null) finish(call, {
			status: "trapped",
			error: storeTrap.error
		});
		else if (call.task?.isErrored() instanceof RuntimeError) finish(call, {
			status: "trapped",
			error: call.task.isErrored()
		});
		else if (call.task ? !liveRoots.has(call.task) : call.resultSettled) finish(call, { status: "completed" });
	}
	/** Observe lifecycle changes after the current unwind records any trap. */
	function check() {
		if (pending.size === 0 || checkQueued) return;
		checkQueued = true;
		queueMicrotask(() => {
			checkQueued = false;
			checkNow();
		});
	}
	/** Observe an invocation promise without assimilating its returned future payload. */
	function observe(call, result) {
		const settled = () => {
			call.resultSettled = true;
			check();
		};
		result.then(settled, settled);
		return result;
	}
	/** Invoke a registered export, preserving its receiver and result representation. */
	function invoke(receiver, fn, args) {
		const metadata = exports.get(fn);
		if (!metadata) throw new TypeError("call tracking requires an export from this instance");
		let resolve;
		const finished = new Promise((done) => {
			resolve = done;
		});
		const call = {
			id: metadata.id,
			task: null,
			resolve,
			resultSettled: false
		};
		const previous = entering;
		pending.add(call);
		entering = call;
		try {
			const result = metadata.construct ? Reflect.construct(fn, args) : Reflect.apply(fn, receiver, args);
			if (metadata.asynchronous) observe(call, result);
			else if (!metadata.future) call.resultSettled = true;
			checkNow();
			return Object.freeze({
				result,
				finished
			});
		} catch (error) {
			pending.delete(call);
			call.task = null;
			throw error;
		} finally {
			entering = previous;
		}
	}
	return {
		publicAPI: Object.freeze({
			/** Start an exported function or resource constructor with its arguments. */
			start(fn, ...args) {
				return invoke(void 0, fn, args);
			},
			/** Start an exported resource method with an explicit receiver. */
			startWithThis(receiver, fn, ...args) {
				return invoke(receiver, fn, args);
			}
		}),
		check,
		observe,
		/** Register a generated export; identities never cross instance boundaries. */
		register(fn, id, construct, asynchronous, future) {
			exports.set(fn, {
				id,
				construct,
				asynchronous,
				future
			});
		},
		/** Claim the invocation before argument lowering or reentrant host execution. */
		capture(id) {
			if (entering?.id !== id) return null;
			const call = entering;
			entering = null;
			return call;
		},
		/** Retain only the selected root until its execution and descendants finish. */
		attach(call, task) {
			if (call && pending.has(call)) call.task = task;
		}
	};
};

//#endregion
//#region runtime/intrinsics/component/lifecycle.js
/** Tells the embedder's `onTrap` about a trap, once per error. */
const reportTrap = (context, err) => {
	const { storeTrap, RuntimeError } = context;
	if (storeTrap.onTrap === null || storeTrap.stopped) return;
	if (!(err instanceof RuntimeError) || storeTrap.trapsReported.has(err)) return;
	storeTrap.trapsReported.add(err);
	const trap = normalizeCoreTrap(context.normalization, err);
	try {
		storeTrap.onTrap(trap);
	} catch (e) {
		queueMicrotask(() => {
			throw e;
		});
	}
};
/** Whether no guest task is live. Host tasks, under -1, stand for a host's own work, not a guest's. */
function isIdle(context) {
	if (context.storeTrap.error !== null) return true;
	for (const [componentIdx, metas] of context.tasks) if (componentIdx !== -1 && metas.length > 0) return false;
	return true;
}
/** Settles what `whenIdle` gave out, if that time has come. */
const checkIdle = (context) => {
	context.checkCalls?.();
	const { idleWaiters } = context.storeAsyncState;
	if (idleWaiters.size === 0 || !isIdle(context)) return;
	const waiters = [...idleWaiters];
	idleWaiters.clear();
	for (const resolve of waiters) resolve();
};
/** Resolves once no guest task is live. */
const whenIdle = (context) => {
	if (isIdle(context)) return Promise.resolve();
	return new Promise((resolve) => {
		context.storeAsyncState.idleWaiters.add(resolve);
	});
};
/** Stops every component of the store, releasing what the guest still holds. */
const stopInstance = (context) => {
	const { storeTrap, storeAsyncState, asyncState, symbolDispose } = context;
	if (storeTrap.stopped) return;
	storeTrap.stopped = true;
	const err = new context.RuntimeError("component instance has been stopped");
	storeTrap.error ??= err;
	clearTimeout(storeAsyncState.deadlockCheck);
	storeAsyncState.deadlockCheck = null;
	for (const state of asyncState.values()) state.markTrapped(err);
	for (const reject of storeTrap.stopWaiters) reject(err);
	storeTrap.stopWaiters.clear();
	const pending = [...context.tasks.values()].flat().map((meta) => meta.task);
	for (const task of pending) task.stop(err);
	for (const state of asyncState.values()) state.stop();
	const errors = [];
	for (const channels of context.channels) for (let i = 2, data = channels.data(); i < data.length; i += 2) {
		const channel = data[i];
		if (channel === void 0 || channel === context.RepTable.FREE) continue;
		try {
			channel.onInstanceStop?.();
		} catch (e) {
			errors.push(e);
		}
	}
	const resources = /* @__PURE__ */ new Set();
	for (const { handles, captures } of storeTrap.resourceTables) for (let i = 2; i < handles.length; i += 2) {
		if ((handles[i] & 1073741824) !== 0 || !(handles[i + 1] >= tableOwn)) continue;
		const resource = captures.get(handles[i + 1] - tableOwn);
		if (resource !== void 0) resources.add(resource);
	}
	for (const { captures } of storeTrap.resourceTables) captures.clear();
	storeTrap.resourceTables.length = 0;
	for (const resource of resources) {
		if (storeTrap.disposed.has(resource)) continue;
		try {
			resource[symbolDispose]?.();
		} catch (error) {
			errors.push(error);
		}
	}
	if (errors.length) throw new AggregateError(errors, "failed to dispose stopped instance resources");
};

//#endregion
//#region runtime/intrinsics/component.js
const initializeInstanceFlags = () => /* @__PURE__ */ new Map();
const initializeStoreTrap = (onTrap = null) => ({
	error: null,
	stopped: false,
	resourceTables: [],
	stopWaiters: /* @__PURE__ */ new Set(),
	disposed: /* @__PURE__ */ new WeakSet(),
	onTrap,
	trapsReported: /* @__PURE__ */ new WeakSet()
});
const initializeStoreAsyncState = () => ({
	deadlockCheck: null,
	pendingHostOperations: 0,
	idleWaiters: /* @__PURE__ */ new Set()
});
const initializeComponentAsyncStates = () => /* @__PURE__ */ new Map();
const initializeCoreTrapMessages = (messages) => new Map(Object.entries(messages));
function normalizeCoreTrap(context, err) {
	const { RuntimeError, messages: trapMessages } = context;
	if (!(err instanceof RuntimeError)) return err;
	const message = trapMessages.get(err.message);
	if (message !== void 0) err.message = message;
	return err;
}
function checkForDeadlock(context) {
	const { RuntimeError, storeAsyncState, storeTrap, asyncState } = context;
	if (storeAsyncState.deadlockCheck !== null || storeTrap.error !== null) return;
	storeAsyncState.deadlockCheck = setTimeout(() => {
		storeAsyncState.deadlockCheck = null;
		if (storeTrap.error !== null || storeAsyncState.pendingHostOperations > 0) return;
		const suspendedTasks = /* @__PURE__ */ new Set();
		for (const state of asyncState.values()) {
			if (state.hasPendingSchedulerWork()) {
				state.runTickLoop();
				return;
			}
			for (const meta of state.suspendedTaskMetas()) suspendedTasks.add(meta.task);
		}
		const unresolvedRoots = /* @__PURE__ */ new Set();
		for (const task of suspendedTasks) {
			const root = task.getRootTask();
			if (!root.isResolvedState()) unresolvedRoots.add(root);
		}
		if (unresolvedRoots.size === 0) return;
		const err = new RuntimeError("wasm trap: deadlock detected: event loop cannot make further progress");
		err.deadlockDetail = {
			pendingHostOperations: storeAsyncState.pendingHostOperations,
			suspendedTasks: [...suspendedTasks].map((task) => ({
				taskID: task.id(),
				componentIdx: task.componentIdx(),
				state: task.taskState(),
				rootTaskID: task.getRootTask().id()
			})),
			unresolvedRootTaskIDs: [...unresolvedRoots].map((root) => root.id())
		};
		storeTrap.error = err;
		for (const root of unresolvedRoots) {
			root.setErrored(err);
			root.reject(err);
		}
		for (const task of suspendedTasks) if (!task.isResolvedState() && unresolvedRoots.has(task.getRootTask())) {
			task.setErrored(err);
			task.reject(err);
		}
		for (const state of asyncState.values()) state.markTrapped(err);
		for (const state of asyncState.values()) state.abandonLockWaiters();
		for (const state of asyncState.values()) state.abandonAdmissionWaiters();
		for (const state of asyncState.values()) state.runTickLoop();
	}, 0);
}
function trackHostOperation(context, operation) {
	const { storeAsyncState, asyncState, symbolDispose, storeTrap } = context;
	if (storeTrap.stopped) throw storeTrap.error;
	const result = operation();
	if (!isPromiseLike(result)) {
		if (storeTrap.stopped) throw storeTrap.error;
		return result;
	}
	storeAsyncState.pendingHostOperations++;
	let rejectStopped;
	const stopped = new Promise((_, reject) => {
		rejectStopped = reject;
	});
	storeTrap.stopWaiters.add(rejectStopped);
	if (storeTrap.stopped) rejectStopped(storeTrap.error);
	const tracked = Promise.race([result, stopped]).finally(() => {
		storeTrap.stopWaiters.delete(rejectStopped);
		storeAsyncState.pendingHostOperations--;
		if (storeAsyncState.pendingHostOperations < 0) throw new Error("negative pending host operation count");
		for (const state of asyncState.values()) state.runTickLoop();
		checkForDeadlock(context);
	});
	for (const sym of [Symbol.asyncDispose, symbolDispose]) if (typeof sym === "symbol" && typeof result[sym] === "function") tracked[sym] = () => result[sym]();
	return tracked;
}
function checkMayLeave(context, componentIdx) {
	const { RuntimeError, instanceFlags } = context;
	if (instanceFlags.get(componentIdx)?.value !== 1) throw new RuntimeError("cannot leave component instance");
}
function guardMayLeave(context, componentIdx, fn) {
	return function(...args) {
		checkMayLeave(context, componentIdx);
		return fn.apply(this, args);
	};
}
function recordTrap(context, componentIdx, err, convertsRangeErrors = false) {
	const { RuntimeError, registers: currentTaskMeta } = context;
	if (convertsRangeErrors && err instanceof RangeError) err = new RuntimeError("out of bounds memory access");
	if (err instanceof RuntimeError) {
		const idx = componentIdx ?? currentTaskMeta.current?.componentIdx;
		if (idx !== void 0 && idx !== null) getOrCreateAsyncState(context.lookup, idx).markTrapped(err);
	}
	return err;
}
function guardTrap(context, componentIdx, fn, convertsRangeErrors = false) {
	return function(...args) {
		try {
			return fn.apply(this, args);
		} catch (err) {
			throw recordTrap(context, componentIdx, err, convertsRangeErrors);
		}
	};
}
/** Implements `canon backpressure.inc`. */
function backpressureInc(context, componentIdx) {
	debugLog("[backpressureInc()] args", { componentIdx });
	const state = getOrCreateAsyncState(context, componentIdx);
	if (!state) throw new Error(`missing component state for component [${componentIdx}]`);
	const newValue = state.incrementBackpressure();
	debugLog("[backpressureInc()] incremented", {
		componentIdx,
		newValue
	});
}
/** Implements `canon backpressure.dec`. */
function backpressureDec(context, componentIdx) {
	debugLog("[backpressureDec()] args", { componentIdx });
	const newValue = getOrCreateAsyncState(context, componentIdx).decrementBackpressure();
	debugLog("[backpressureDec()] decremented", {
		componentIdx,
		newValue
	});
}
function getOrCreateAsyncState(context, componentIdx) {
	const { asyncState, ComponentAsyncState } = context;
	if (!asyncState.has(componentIdx)) {
		const newState = new ComponentAsyncState({ componentIdx });
		asyncState.set(componentIdx, newState);
	}
	return asyncState.get(componentIdx);
}
function setAllError(states) {
	debugLog("[_ComponentStateSetAllError()]");
	for (const state of states.values()) state.setErrored();
}
const TICK_DONE = "done";
const TICK_RESUMED = "resumed";
const TICK_IDLE = "idle";
function initializeComponentAsyncStateClass(context) {
	const { RuntimeError, RepTable, indexSpaces, instanceFlags, storeTrap, normalization, cannotEnter, deadlock, Waitable } = context;
	class ComponentAsyncState {
		static EVENT_HANDLER_EVENTS = ["backpressure-change"];
		static TickResult = {
			DONE: TICK_DONE,
			RESUMED: TICK_RESUMED,
			IDLE: TICK_IDLE
		};
		#componentIdx;
		#callingAsyncImport = false;
		#syncImportWait = promiseWithResolvers();
		#lockHolderTaskID = null;
		#lockWaiters = [];
		#admissionQueue = [];
		#lockHandoffScheduled = false;
		#pendingTaskStarts = 0;
		#suspendedThreadsByRef = /* @__PURE__ */ new Map();
		#errored = null;
		#trapped = false;
		#trapError = null;
		#backpressure = 0;
		#backpressureWaiters = 0n;
		#handlers = [];
		#nextHandlerID = 0n;
		#tickLoop = null;
		#onExclusiveReleaseHandlers = [];
		#mayLeave = true;
		handles;
		subtasks;
		threads;
		constructor(args) {
			this.#componentIdx = args.componentIdx;
			this.handles = new RepTable({
				target: `component [${this.#componentIdx}] handles (waitable objects)`,
				space: getHandleIndexSpace(indexSpaces, this.#componentIdx)
			});
			this.subtasks = new RepTable({ target: `component [${this.#componentIdx}] subtasks` });
			this.threads = new RepTable({ target: `component [${this.#componentIdx}] threads` });
		}
		componentIdx() {
			return this.#componentIdx;
		}
		get mayLeave() {
			const flags = instanceFlags.get(this.#componentIdx);
			return flags === void 0 ? this.#mayLeave : flags.value === 1;
		}
		set mayLeave(value) {
			if (typeof value !== "boolean") throw new TypeError("mayLeave must be a boolean");
			this.#mayLeave = value;
			const flags = instanceFlags.get(this.#componentIdx);
			if (flags !== void 0) flags.value = value ? 1 : 0;
		}
		errored() {
			return this.#errored !== null;
		}
		setErrored(err) {
			debugLog("[ComponentAsyncState#setErrored()] component errored", {
				err,
				componentIdx: this.#componentIdx
			});
			if (this.#errored) return;
			if (!err) err = Object.assign(/* @__PURE__ */ new Error("error elswehere (see other component instance error)"), { componentIdx: this.#componentIdx });
			this.#errored = err;
		}
		markTrapped(err) {
			if (!(err instanceof RuntimeError)) return false;
			const trap = normalizeCoreTrap(normalization, err);
			this.#trapped = true;
			if (this.#trapError === null) this.#trapError = trap;
			debugLog("[ComponentAsyncState#markTrapped()] component trapped", {
				err,
				componentIdx: this.#componentIdx
			});
			if (storeTrap.error === null) storeTrap.error = trap;
			context.reportTrap?.(trap);
			context.checkIdle?.();
			return true;
		}
		isTrapped() {
			return this.#trapped;
		}
		throwIfInterrupted() {
			if (storeTrap.stopped) throw storeTrap.error;
			if (this.#trapped) throw this.#trapError ?? new RuntimeError(cannotEnter);
		}
		throwIfTrapped() {
			if (storeTrap.stopped) throw storeTrap.error;
			if (this.#trapped) throw new RuntimeError(cannotEnter);
		}
		callingSyncImport(val) {
			if (val === void 0) return this.#callingAsyncImport;
			if (typeof val !== "boolean") throw new TypeError("invalid setting for async import");
			const prev = this.#callingAsyncImport;
			this.#callingAsyncImport = val;
			if (prev === true && this.#callingAsyncImport === false) this.#notifySyncImportEnd();
		}
		#notifySyncImportEnd() {
			const existing = this.#syncImportWait;
			this.#syncImportWait = promiseWithResolvers();
			existing.resolve();
		}
		async waitForSyncImportCallEnd() {
			await this.#syncImportWait.promise;
		}
		setBackpressure(v) {
			this.#backpressure = v;
			for (const handler of this.#handlers.filter((handler) => handler.event === "backpressure-change")) handler.fn(v);
			return this.#backpressure;
		}
		getBackpressure() {
			return this.#backpressure;
		}
		incrementBackpressure() {
			const current = this.#backpressure;
			if (current < 0 || current > 2 ** 16) throw new Error(`invalid current backpressure value [${current}]`);
			const newValue = this.getBackpressure() + 1;
			if (newValue >= 2 ** 16) throw new Error(`invalid new backpressure value [${newValue}], overflow`);
			return this.setBackpressure(newValue);
		}
		decrementBackpressure() {
			const current = this.#backpressure;
			if (current < 0 || current > 2 ** 16) throw new Error(`invalid current backpressure value [${current}]`);
			const newValue = current - 1;
			if (newValue < 0) throw new RuntimeError("backpressure counter underflow");
			return this.setBackpressure(newValue);
		}
		hasBackpressure() {
			return this.#backpressure > 0;
		}
		waitForBackpressure() {
			if (!this.hasBackpressure()) return Promise.resolve(null);
			this.addBackpressureWaiter();
			return new Promise((resolve) => {
				let pending = true;
				const handlerID = this.registerHandler({
					event: "backpressure-change",
					fn: (bp) => {
						if (bp !== 0 || !pending) return;
						pending = false;
						this.removeHandler({
							event: "backpressure-change",
							handlerID
						});
						this.removeBackpressureWaiter();
						resolve(null);
					}
				});
			});
		}
		registerHandler(args) {
			const { event, fn } = args;
			if (!event) throw new Error("missing handler event");
			if (!fn) throw new Error("missing handler fn");
			if (!ComponentAsyncState.EVENT_HANDLER_EVENTS.includes(event)) throw new Error(`unrecognized event handler [${event}]`);
			const handlerID = this.#nextHandlerID++;
			this.#handlers.push({
				id: handlerID,
				fn,
				event
			});
			return handlerID;
		}
		removeHandler(args) {
			const { event, handlerID } = args;
			this.#handlers = this.#handlers.filter((handler) => handler.event !== event || handler.id !== handlerID);
		}
		getBackpressureWaiters() {
			return this.#backpressureWaiters;
		}
		addBackpressureWaiter() {
			this.#backpressureWaiters++;
		}
		removeBackpressureWaiter() {
			this.#backpressureWaiters--;
			if (this.#backpressureWaiters < 0) throw new Error("unexepctedly negative number of backpressure waiters");
		}
		isExclusivelyLocked() {
			return this.#lockHolderTaskID !== null;
		}
		exclusivelyLockedBy(taskID) {
			return this.#lockHolderTaskID === taskID;
		}
		exclusiveLock(taskID) {
			debugLog("[ComponentAsyncState#exclusiveLock()]", {
				holder: this.#lockHolderTaskID,
				requester: taskID,
				componentIdx: this.#componentIdx
			});
			if (taskID === void 0 || taskID === null) throw new Error("exclusive lock requires the acquiring task id");
			if (this.#lockHolderTaskID !== null) throw new Error(`component [${this.#componentIdx}] exclusive lock held by task [${this.#lockHolderTaskID}], requested by [${taskID}]`);
			this.#lockHolderTaskID = taskID;
		}
		acquireExclusiveLock(taskID) {
			if (taskID === void 0 || taskID === null) throw new Error("exclusive lock requires the acquiring task id");
			if (this.#lockHolderTaskID === null) {
				this.#lockHolderTaskID = taskID;
				debugLog("[ComponentAsyncState#acquireExclusiveLock()] acquired", {
					holder: taskID,
					componentIdx: this.#componentIdx
				});
				return;
			}
			if (this.#lockHolderTaskID === taskID) throw new Error(`task [${taskID}] already holds the lock for component [${this.#componentIdx}]`);
			debugLog("[ComponentAsyncState#acquireExclusiveLock()] waiting", {
				holder: this.#lockHolderTaskID,
				requester: taskID,
				componentIdx: this.#componentIdx,
				queued: this.#lockWaiters.length
			});
			return new Promise((resolve) => {
				this.#lockWaiters.push({
					taskID,
					resolve
				});
			});
		}
		takeAdmissionTicket(taskID) {
			const ticket = {
				taskID,
				...promiseWithResolvers()
			};
			this.#admissionQueue.push(ticket);
			return ticket;
		}
		hasPendingAdmissions() {
			return this.#admissionQueue.length > 0;
		}
		waitForAdmissionTurn(ticket) {
			if (this.#admissionQueue[0] === ticket) return;
			return ticket.promise;
		}
		releaseAdmissionTicket(ticket) {
			const idx = this.#admissionQueue.indexOf(ticket);
			if (idx === -1) return;
			this.#admissionQueue.splice(idx, 1);
			if (idx === 0 && this.#admissionQueue.length > 0) this.#admissionQueue[0].resolve();
		}
		abandonAdmissionWaiters() {
			const tickets = this.#admissionQueue.splice(0);
			for (const ticket of tickets) ticket.resolve();
		}
		abandonLockWaiters() {
			const waiters = this.#lockWaiters.splice(0);
			for (const waiter of waiters) waiter.resolve();
		}
		cancelExclusiveLockWaiter(taskID) {
			const idx = this.#lockWaiters.findIndex((waiter) => waiter.taskID === taskID);
			if (idx === -1) return false;
			const [waiter] = this.#lockWaiters.splice(idx, 1);
			waiter.resolve();
			return true;
		}
		exclusiveRelease(taskID) {
			debugLog("[ComponentAsyncState#exclusiveRelease()] args", {
				holder: this.#lockHolderTaskID,
				releaser: taskID,
				componentIdx: this.#componentIdx
			});
			if (this.#lockHolderTaskID !== taskID) {
				debugLog("[ComponentAsyncState#exclusiveRelease()] ignoring foreign release", {
					holder: this.#lockHolderTaskID,
					releaser: taskID,
					componentIdx: this.#componentIdx
				});
				return false;
			}
			this.#lockHolderTaskID = null;
			this.#onExclusiveReleaseHandlers = this.#onExclusiveReleaseHandlers.filter((v) => !!v);
			for (const [idx, f] of this.#onExclusiveReleaseHandlers.entries()) try {
				this.#onExclusiveReleaseHandlers[idx] = null;
				f();
			} catch (err) {
				debugLog("error while executing handler for next exclusive release", err);
				throw err;
			}
			this.#scheduleLockHandoff();
			return true;
		}
		#scheduleLockHandoff() {
			if (this.#lockHandoffScheduled || this.#lockWaiters.length === 0) return;
			this.#lockHandoffScheduled = true;
			queueMicrotask(() => {
				this.#lockHandoffScheduled = false;
				if (this.#lockHolderTaskID !== null) return;
				const next = this.#lockWaiters.shift();
				if (!next) return;
				this.#lockHolderTaskID = next.taskID;
				next.resolve();
			});
		}
		onNextExclusiveRelease(fn) {
			debugLog("[ComponentAsyncState#()onNextExclusiveRelease] registering");
			this.#onExclusiveReleaseHandlers.push(fn);
		}
		async waitForExclusiveRelease() {
			while (this.isExclusivelyLocked()) await new Promise((resolve) => this.onNextExclusiveRelease(resolve));
		}
		#getSuspendedTaskMeta(taskID) {
			const metas = [...this.#suspendedThreadsByRef.values()].filter((meta) => meta.thread.taskID() === taskID);
			return metas.find((meta) => meta.cancellable && this.suspendedThreadReady(meta.thread)) ?? metas[0];
		}
		suspendTask(args) {
			const { task, ...opts } = args;
			task.endFirstSlice();
			return this.suspendThread({
				thread: task.defaultThread(),
				...opts
			});
		}
		resumeTaskByID(taskID) {
			const meta = this.#getSuspendedTaskMeta(taskID);
			return meta ? this.resumeThread(meta.thread) : false;
		}
		suspendedTaskReady(taskID) {
			const meta = this.#getSuspendedTaskMeta(taskID);
			return meta ? this.suspendedThreadReady(meta.thread) : false;
		}
		suspendedTaskCancellable(taskID) {
			return !!this.#getSuspendedTaskMeta(taskID)?.cancellable;
		}
		isTaskSuspended(taskID) {
			return !!this.#getSuspendedTaskMeta(taskID);
		}
		*suspendedTaskMetas() {
			for (const meta of this.#suspendedThreadsByRef.values()) yield {
				...meta,
				task: meta.thread.task()
			};
		}
		#removeSuspendedThreadMeta(thread) {
			const meta = this.#suspendedThreadsByRef.get(thread);
			this.#suspendedThreadsByRef.delete(thread);
			return meta;
		}
		suspendThread(args) {
			const { thread, readyFn, cancellable, onResume, suspended = false } = args;
			debugLog("[ComponentAsyncState#suspendThread()]", {
				threadID: thread.id(),
				taskID: thread.taskID(),
				componentIdx: this.#componentIdx
			});
			if (thread.componentIdx() !== this.#componentIdx) throw new Error("assert: thread component idx should match async state");
			if (this.#suspendedThreadsByRef.has(thread)) throw new Error(`thread [${thread.id()}] already suspended`);
			let promise;
			let resume;
			if (onResume) resume = () => onResume(!thread.isCancelled() && !thread.isRejected() && !this.isTrapped());
			else {
				const resolvers = promiseWithResolvers();
				promise = resolvers.promise;
				resume = () => resolvers.resolve(!thread.isCancelled() && !thread.isRejected() && !this.isTrapped());
			}
			if (storeTrap.stopped) {
				this.markTrapped(storeTrap.error);
				resume();
				return promise;
			}
			this.#suspendedThreadsByRef.set(thread, {
				thread,
				cancellable,
				readyFn,
				resume,
				suspended
			});
			thread.notifyProgress();
			this.runTickLoop();
			checkForDeadlock(deadlock);
			return promise;
		}
		resumeThread(thread) {
			const meta = this.#removeSuspendedThreadMeta(thread);
			if (!meta) return false;
			meta.resume();
			return true;
		}
		markThreadReady(thread) {
			const meta = this.#suspendedThreadsByRef.get(thread);
			if (!meta || !meta.suspended) return false;
			meta.suspended = false;
			meta.readyFn = () => true;
			this.runTickLoop();
			return true;
		}
		isThreadSuspended(thread) {
			return this.#suspendedThreadsByRef.get(thread)?.suspended ?? false;
		}
		isThreadReady(thread) {
			const meta = this.#suspendedThreadsByRef.get(thread);
			return !!meta && !meta.suspended && (meta.thread.isRejected() || meta.readyFn());
		}
		suspendedThreadReady(thread) {
			const meta = this.#suspendedThreadsByRef.get(thread);
			if (!meta) return false;
			if (!meta.readyFn) throw new Error(`suspended thread [${thread.id()}] is missing a readiness function`);
			if (this.isTrapped() || meta.thread.isRejected()) return true;
			if (!meta.readyFn()) return false;
			const task = meta.thread.task();
			return !task.needsExclusiveLock() || !this.isExclusivelyLocked() || this.exclusivelyLockedBy(task.id());
		}
		addPendingTaskStart() {
			this.#pendingTaskStarts++;
		}
		removePendingTaskStart() {
			this.#pendingTaskStarts--;
		}
		hasPendingSchedulerWork() {
			if (this.#pendingTaskStarts > 0) return true;
			if (this.#lockHandoffScheduled) return true;
			for (const meta of this.#suspendedThreadsByRef.values()) if (this.suspendedThreadReady(meta.thread)) return true;
			return false;
		}
		stop() {
			if (this.#tickLoop !== null) clearTimeout(this.#tickLoop);
			this.#tickLoop = null;
			this.abandonLockWaiters();
			this.abandonAdmissionWaiters();
			for (const thread of [...this.#suspendedThreadsByRef.keys()]) this.resumeThread(thread);
		}
		runTickLoop() {
			if (storeTrap.stopped || this.#tickLoop !== null) return;
			const run = () => {
				if (storeTrap.stopped) {
					this.#tickLoop = null;
					return;
				}
				const result = this.tick();
				if (storeTrap.stopped || result === TICK_DONE) {
					this.#tickLoop = null;
					return;
				}
				if (result === TICK_IDLE) checkForDeadlock(deadlock);
				const delay = result === TICK_RESUMED ? 0 : 10;
				this.#tickLoop = setTimeout(run, delay);
			};
			this.#tickLoop = setTimeout(run, 10);
		}
		tick() {
			for (const [thread, meta] of this.#suspendedThreadsByRef) {
				if (!meta || !meta.readyFn) throw new Error(`missing/invalid thread meta despite thread [${thread.id()}] being present`);
				if (this.isTrapped() || meta.thread.isRejected()) {
					debugLog("[ComponentAsyncState#tick()] detected thread rejection, leaving early", { meta });
					this.resumeThread(thread);
					return TICK_RESUMED;
				}
				if (!this.suspendedThreadReady(thread)) continue;
				debugLog("[ComponentAsyncState#tick()] resuming thread via tick", {
					threadID: thread.id(),
					componentIdx: this.#componentIdx
				});
				this.resumeThread(thread);
				return TICK_RESUMED;
			}
			return this.#suspendedThreadsByRef.size > 0 ? TICK_IDLE : TICK_DONE;
		}
		createWaitable(args) {
			return new Waitable({ target: args?.target });
		}
	}
	return ComponentAsyncState;
}
const postReturnTrap = (context, componentIdx, error) => {
	let trap;
	if (error instanceof context.RuntimeError) trap = error;
	else {
		const message = /call stack|stack overflow|too much recursion/i.test(error?.message ?? "") ? context.stackOverflow : context.uncaughtException;
		trap = new context.RuntimeError(message, { cause: error });
	}
	getOrCreateAsyncState(context.lookup, componentIdx).markTrapped(trap);
	return trap;
};
const guardPostReturn = (context, componentIdx, fn) => (...args) => {
	try {
		return fn(...args);
	} catch (error) {
		throw postReturnTrap(context, componentIdx, error);
	}
};

//#endregion
//#region runtime/intrinsics/async-task/task-operations.js
function getCurrentTask(_context, componentIdx, taskID) {
	if (componentIdx === void 0 || componentIdx === null) throw new Error("missing component idx");
	const taskMetas = _context.tasks.get(componentIdx);
	if (taskMetas === void 0 || taskMetas.length === 0) return;
	if (taskID) return taskMetas.find((meta) => meta.task.id() === taskID);
	const current = _context.registers[componentIdx];
	if (current && current.taskID !== void 0) {
		const currentMeta = taskMetas.find((meta) => meta.task.id() === current.taskID);
		if (currentMeta) return currentMeta;
	}
	const taskMeta = taskMetas[taskMetas.length - 1];
	if (!taskMeta || !taskMeta.task) return;
	return taskMeta;
}
function createNewCurrentImplicitThread(_context, args) {
	debugLog("[createNewCurrentImplicitThread()] args", args);
	const { componentIdx, isAsync, isManualAsync, preserveFutureResult, entryFnName, callbackFnName, getCallbackFn, stringEncoding, errHandling, getCalleeParamsFn, resultPtr, callingWasmExport } = args;
	if (componentIdx === void 0 || componentIdx === null) throw new Error("missing/invalid component instance index while starting task");
	let taskMetas = _context.tasks.get(componentIdx);
	const callbackFn = getCallbackFn ? getCallbackFn() : null;
	const newTask = new _context.AsyncTask({
		componentIdx,
		isAsync,
		isManualAsync,
		preserveFutureResult,
		entryFnName,
		callbackFn,
		callbackFnName,
		stringEncoding,
		getCalleeParamsFn,
		resultPtr,
		errHandling,
		callingWasmExport
	});
	const thread = newTask.addThread(new _context.AsyncThread({
		componentIdx,
		task: newTask
	}));
	const newTaskID = newTask.id();
	const newTaskMeta = {
		id: newTaskID,
		componentIdx,
		task: newTask
	};
	_context.taskIds.push(newTaskID);
	_context.componentIdxs.push(componentIdx);
	if (!taskMetas) {
		taskMetas = [newTaskMeta];
		_context.tasks.set(componentIdx, [newTaskMeta]);
	} else taskMetas.push(newTaskMeta);
	return {
		task: newTask,
		taskID: newTaskID,
		thread,
		threadID: thread.id()
	};
}
function clearCurrentThread(_context, componentIdx, taskID, options = {}) {
	debugLog("[clearCurrentThread()] args", {
		componentIdx,
		taskID
	});
	if (componentIdx === void 0 || componentIdx === null) throw new Error("missing/invalid component instance index while ending current task");
	const tasks = _context.tasks.get(componentIdx);
	if (!tasks || !Array.isArray(tasks)) throw new Error("missing/invalid tasks for component instance while ending task");
	if (tasks.length == 0) throw new Error(`no current tasks for component instance [${componentIdx}] while ending task`);
	const taskIdx = taskID === void 0 ? tasks.length - 1 : tasks.findIndex((meta) => meta.id === taskID);
	if (taskIdx === -1) return;
	const taskMeta = tasks[taskIdx];
	if (!options.preserveTask) {
		tasks.splice(taskIdx, 1);
		_context.checkIdle?.();
	}
	const globalTaskIdx = _context.taskIds.lastIndexOf(taskMeta.id);
	if (globalTaskIdx !== -1) {
		_context.taskIds.splice(globalTaskIdx, 1);
		_context.componentIdxs.splice(globalTaskIdx, 1);
	}
	return taskMeta.task;
}
/** Compatibility helper for consumers that only need the task tuple. */
function createNewCurrentTask(context, args) {
	const { task, taskID } = createNewCurrentImplicitThread(context, args);
	return [task, taskID];
}
const clearCurrentTask = clearCurrentThread;
/** Implements `canon task.return`. */
function taskReturn(_context, ctx, ...params) {
	const { componentIdx, getMemoryFn, memoryIdx, callbackFnIdx, liftFns, lowerFns, stringEncoding } = ctx;
	const memory = getMemoryFn();
	let useDirectParams = ctx.useDirectParams;
	const { taskID } = getCurrentTaskMeta(_context.registers, componentIdx);
	const taskMeta = getCurrentTask(_context, componentIdx, taskID);
	if (!taskMeta) throw new Error("failed to retrieve current task metadata");
	const task = taskMeta.task;
	if (!task) throw new Error("invalid/missing current task in metadata");
	if (!task.calleeIsAsync()) throw new _context.RuntimeError("task.return requires an async canonical lift");
	task.validateResourceBorrowScope();
	const expectedResultType = task.returnResultTypeIdx();
	if (expectedResultType !== null && ctx.resultTypeIdx !== void 0 && ctx.resultTypeIdx !== expectedResultType) throw new _context.RuntimeError("task.return result type does not match the function type");
	debugLog("[taskReturn()] args", {
		componentIdx,
		taskID: task.id(),
		subtaskID: task.getParentSubtask()?.id(),
		callbackFnIdx,
		memoryIdx,
		liftFns,
		lowerFns,
		params
	});
	const subtaskCallMetadata = task.getParentSubtask()?.getCallMetadata();
	if (subtaskCallMetadata?.returnFn && !subtaskCallMetadata.returnFnCalled) {
		debugLog("[taskReturn()] calling return fn on subtask", {
			componentIdx,
			taskID: task.id(),
			subtaskID: task.getParentSubtask()?.id(),
			returnFnParams: [...params, subtaskCallMetadata.resultPtr]
		});
		const callerTask = task.getParentSubtask().getParentTask();
		subtaskCallMetadata.returnFnResult = withCurrentTaskMeta(_context.registers, {
			taskID: callerTask.id(),
			threadID: subtaskCallMetadata.callerThreadID,
			componentIdx: callerTask.componentIdx(),
			fn: () => subtaskCallMetadata.returnFn.apply(null, [...params, subtaskCallMetadata.resultPtr])
		});
		subtaskCallMetadata.returnFnCalled = true;
		task.resolve([]);
		return;
	}
	const expectedMemoryIdx = task.getReturnMemoryIdx();
	if (expectedMemoryIdx !== null && memoryIdx !== null && expectedMemoryIdx !== memoryIdx) {
		debugLog("[taskReturn()] mismatched memory indices", {
			expectedMemoryIdx,
			memoryIdx
		});
		throw new Error("task.return memory [" + memoryIdx + "] does not match task [" + expectedMemoryIdx + "]");
	}
	task.callbackFnIdx = callbackFnIdx;
	if (!memory && liftFns.length > 4) {
		debugLog("[taskReturn()] memory not present for max async flat lifts");
		throw new Error("memory must be present if more than max async flat lifts are performed");
	}
	let liftCtx = {
		memory,
		useDirectParams,
		params,
		componentIdx,
		stringEncoding
	};
	if (!useDirectParams) {
		if (!memory) {
			debugLog("missing memory despite indirect param usage", {
				useDirectParams,
				liftCtx,
				ctx
			});
			throw new Error("missing memory despite indirect param usage");
		}
		liftCtx.storagePtr = params[0] >>> 0;
		liftCtx.storageLen = params[1];
	}
	const liftedResults = [];
	debugLog("[taskReturn()] lifting results out of memory", { liftCtx });
	for (const liftFn of liftFns) {
		if (liftCtx.storageLen !== void 0 && liftCtx.storageLen <= 0) {
			debugLog(`[taskReturn()] ran out of range while writing storageLen = [${liftCtx.storageLen}]`);
			throw new Error("ran out of storage while writing");
		}
		const [val, newLiftCtx] = liftFn(liftCtx);
		liftCtx = newLiftCtx;
		liftedResults.push(val);
	}
	task.resolve(liftedResults);
}
/** Implements `canon task.cancel`. */
function taskCancel(_context, componentIdx) {
	debugLog("[taskCancel()] args", { componentIdx });
	if (!getOrCreateAsyncState(_context.lookup, componentIdx).mayLeave) throw new Error("component instance is not marked as may leave, cannot be cancelled");
	const { taskID } = getCurrentTaskMeta(_context.registers, componentIdx);
	const taskMeta = getCurrentTask(_context, componentIdx, taskID);
	if (!taskMeta) throw new Error("invalid/missing async task meta");
	const task = taskMeta.task;
	if (!task) throw new Error("invalid/missing async task");
	if (Reflect.get(task, "sync") && !task.alwaysTaskReturn) throw new Error("cannot cancel sync tasks without always task return set");
	task.cancel();
}

//#endregion
//#region runtime/intrinsics/resource.js
const RESOURCE_TABLE_FLAG = 1 << 30;
const RESOURCE_TABLE_OWN = 2 ** 32;
const tableGet = (context, table, handle) => {
	const scope = table[handle << 1];
	const value = table[(handle << 1) + 1];
	const own = value >= RESOURCE_TABLE_OWN;
	const rep = own ? value - RESOURCE_TABLE_OWN : value;
	if (value === void 0 || (scope & RESOURCE_TABLE_FLAG) !== 0) throw new context.RuntimeError(`unknown handle index ${handle}`);
	return {
		rep,
		scope,
		own
	};
};
const tableFlag = RESOURCE_TABLE_FLAG;
const tableOwn = RESOURCE_TABLE_OWN;
const initializeHandleIndexSpaces = () => /* @__PURE__ */ new Map();
const initializeHandleTables = () => [];
const initializeCallBorrows = () => ({ borrows: [] });
const initializeCurrentBorrows = () => ({ borrows: [] });
const initializeResourceScopeCounter = () => ({ value: 0 });
const initializeResourceScopeTasks = () => /* @__PURE__ */ new Map();
const initializeScopeId = () => ({ value: 0 });
const getHandleIndexSpace = (spaces, key) => {
	let space = spaces.get(key);
	if (space === void 0) {
		space = {
			next: 1,
			free: [],
			alloc() {
				return this.free.length > 0 ? this.free.pop() : this.next++;
			},
			release(index) {
				this.free.push(index);
			}
		};
		spaces.set(key, space);
	}
	return space;
};
const tableCreateBorrow = (spaces, table, rep, scopeId) => {
	if (scopeId === void 0) throw new Error("missing scopeId");
	const handle = getHandleIndexSpace(spaces, table._componentIdx ?? table).alloc();
	table[handle << 1] = scopeId;
	table[(handle << 1) + 1] = rep >>> 0;
	return handle;
};
const tableCreateOwn = (spaces, table, rep) => {
	rep >>>= 0;
	table._createdReps.add(rep);
	const handle = getHandleIndexSpace(spaces, table._componentIdx ?? table).alloc();
	table[handle << 1] = 0;
	table[(handle << 1) + 1] = rep + RESOURCE_TABLE_OWN;
	return handle;
};
const tableEnsureBorrowDrop = (table, handle, scope) => {
	if (table[handle << 1] === scope) throw new TypeError("Resource borrow was not dropped at end of call");
};
const tableRemove = (context, table, handle) => {
	const scope = table[handle << 1];
	const value = table[(handle << 1) + 1];
	const own = value >= RESOURCE_TABLE_OWN;
	const rep = own ? value - RESOURCE_TABLE_OWN : value;
	if (value === void 0 || (scope & RESOURCE_TABLE_FLAG) !== 0) throw new context.RuntimeError("unknown handle index " + handle);
	if (own && scope !== 0) throw new context.RuntimeError("cannot remove owned resource while borrowed");
	const borrowTask = own ? void 0 : context.scopeTasks.get(scope);
	table[handle << 1] = RESOURCE_TABLE_FLAG;
	table[(handle << 1) + 1] = 0;
	getHandleIndexSpace(context.indexSpaces, table._componentIdx ?? table).release(handle);
	borrowTask?.removeBorrowedHandle();
	return {
		rep,
		scope,
		own
	};
};
function getOrCreateTable(tables, tid) {
	let table = tables[tid];
	if (!table) {
		table = Object.assign([RESOURCE_TABLE_FLAG, 0], { _createdReps: /* @__PURE__ */ new Set() });
		tables[tid] = table;
	}
	return table;
}
const transferBorrow = (context, handle, fromTid, toTid) => {
	const fromTable = context.tables[fromTid];
	const { rep, own } = tableGet(context, fromTable, handle);
	const toTable = getOrCreateTable(context.tables, toTid);
	const componentIdx = toTable._componentIdx;
	const meta = componentIdx === void 0 ? void 0 : getCurrentTaskMeta(context.taskLookup.registers, componentIdx);
	const borrowTask = meta ? getCurrentTask(context.taskLookup, componentIdx, meta.taskID)?.task : void 0;
	if (borrowTask && own) {
		fromTable[handle << 1]++;
		borrowTask.addResourceLender(fromTable, handle);
	}
	if (toTable._createdReps.has(rep)) return rep;
	const newHandle = tableCreateBorrow(context.indexSpaces, toTable, rep, borrowTask?.resourceScopeId() ?? context.scope.value);
	if (borrowTask) borrowTask.addBorrowedHandle();
	else context.callBorrows.borrows.push({
		rid: toTid,
		handle: newHandle
	});
	return newHandle;
};
const transferBorrowValidLifting = transferBorrow;
const transferOwn = (context, handle, fromTid, toTid) => {
	const { rep } = tableRemove(context, context.tables[fromTid], handle);
	return tableCreateOwn(context.indexSpaces, getOrCreateTable(context.tables, toTid), rep);
};
const callDestructor = (context, { componentIdx, dtor, rep }) => {
	if (context.storeTrap.stopped) return;
	const { task, threadID } = createNewCurrentImplicitThread(context.creation, {
		componentIdx,
		isAsync: false,
		callingWasmExport: true,
		entryFnName: "<resource-drop>"
	});
	task.enterSync();
	return withCurrentTaskMeta(context.registers, {
		taskID: task.id(),
		threadID,
		componentIdx,
		fn: () => {
			try {
				const result = dtor(rep);
				task.resolve([]);
				task.exit();
				return result;
			} catch (error) {
				if (!task.isResolvedState()) {
					task.setErrored(error);
					task.reject(error);
				}
				if (!task.isExited()) task.exit({ skipExclusiveLockCheck: true });
				throw error;
			}
		}
	});
};

//#endregion
//#region runtime/intrinsics/conversion/numeric.js
const isInt8 = (value) => typeof value === "number" && value === value << 24 >> 24;
const isUint8 = (value) => typeof value === "number" && value === (value & 255);
const isInt16 = (value) => typeof value === "number" && value === value << 16 >> 16;
const isUint16 = (value) => typeof value === "number" && value === (value & 65535);
const isInt32 = (value) => typeof value === "number" && value === value >> 0;
const isUint32 = (value) => typeof value === "number" && value === value >>> 0;
const isInt64 = (value) => typeof value === "bigint" && value === BigInt.asIntN(64, value);
const isUint64 = (value) => typeof value === "bigint" && value === BigInt.asUintN(64, value);
/** Report the same conversion failure for direct and type-dispatched validation. */
function invalidNumericPrimitive(type, value) {
	throw new TypeError(`invalid ${type} value [${value}]`);
}

//#endregion
//#region runtime/intrinsics/conversion.js
/** Allocate only the selected scratch family, once per instantiation. */
const initializeBitcast32 = () => {
	const i32 = /* @__PURE__ */ new Int32Array(1);
	return {
		i32,
		f32: new Float32Array(i32.buffer)
	};
};
const initializeBitcast64 = () => {
	const i64 = /* @__PURE__ */ new BigInt64Array(1);
	return {
		i64,
		f64: new Float64Array(i64.buffer)
	};
};
const i32ToF32 = (context, value) => {
	context.i32[0] = value;
	return context.f32[0];
};
const f32ToI32 = (context, value) => {
	context.f32[0] = value;
	return context.i32[0];
};
const i64ToF64 = (context, value) => {
	context.i64[0] = value;
	return context.f64[0];
};
const f64ToI64 = (context, value) => {
	context.f64[0] = value;
	return context.i64[0];
};
const i32ToChar = (value) => {
	if (typeof value !== "number" || !Number.isInteger(value)) throw new Error("invalid i32");
	if (value < 0) throw new Error("i32 must be greater than zero");
	if (value >= 1114112) throw new Error("invalid i32, out of range");
	if (55296 <= value && value <= 57343) throw new Error("invalid i32 out of range");
	return String.fromCodePoint(value);
};
const toInt8 = (context, value) => {
	if (context.strict && !isInt8(value)) invalidNumericPrimitive("s8", value);
	return value << 24 >> 24;
};
const toUint8 = (context, value) => {
	if (context.strict && !isUint8(value)) invalidNumericPrimitive("u8", value);
	return value & 255;
};
const toInt16 = (context, value) => {
	if (context.strict && !isInt16(value)) invalidNumericPrimitive("s16", value);
	return value << 16 >> 16;
};
const toUint16 = (context, value) => {
	if (context.strict && !isUint16(value)) invalidNumericPrimitive("u16", value);
	return value & 65535;
};
const toInt32 = (context, value) => {
	if (context.strict && !isInt32(value)) invalidNumericPrimitive("s32", value);
	return value >> 0;
};
const toUint32 = (context, value) => {
	if (context.strict && !isUint32(value)) invalidNumericPrimitive("u32", value);
	return value >>> 0;
};
const toInt64 = (context, value) => {
	const converted = BigInt(value);
	if (context.strict && !isInt64(converted)) invalidNumericPrimitive("s64", converted);
	return BigInt.asIntN(64, converted);
};
const toUint64 = (context, value) => {
	const converted = BigInt(value);
	if (context.strict && !isUint64(converted)) invalidNumericPrimitive("u64", converted);
	return BigInt.asUintN(64, converted);
};
const toString = (value) => {
	if (typeof value === "symbol") throw new TypeError("symbols cannot be converted to strings");
	return String(value);
};
const toResultString = (value) => {
	return JSON.stringify(value, (_, v) => {
		if (v && Object.getPrototypeOf(v) === Uint8Array.prototype) return `[${v[Symbol.toStringTag]} (${v.byteLength})]`;
		else if (typeof v === "bigint") return v.toString();
		return v;
	});
};
const isValidNumericPrimitive = (type, value) => {
	switch (type) {
		case "bool": return value === 0 || value === 1;
		case "s8": return isInt8(value);
		case "u8": return isUint8(value);
		case "s16": return isInt16(value);
		case "u16": return isUint16(value);
		case "s32": return isInt32(value);
		case "u32": return isUint32(value);
		case "s64": return isInt64(value);
		case "u64": return isUint64(value);
		case "f32":
		case "f64": return typeof value === "number";
		default: return false;
	}
};
const requireValidNumericPrimitive = (type, value) => {
	if (!isValidNumericPrimitive(type, value)) invalidNumericPrimitive(type, value);
	return true;
};
const splitInt64 = (value) => {
	return [Number(value & 4294967295n) | 0, Number(value >> 32n & 4294967295n) | 0];
};
const mergeInt64 = (low, high) => {
	return BigInt(low | 0) | BigInt(high | 0) << 32n;
};

//#endregion
//#region runtime/intrinsics/async-task/thread-operations.js
function getCurrentThread(context, componentIdx, threadID, taskID) {
	if (componentIdx === -1 || threadID === void 0 || threadID === null || threadID === 0) return;
	const thread = getOrCreateAsyncState(context.lookup, componentIdx).threads.get(threadID);
	if (!thread || taskID !== void 0 && thread.taskID() !== taskID) return;
	return {
		id: threadID,
		componentIdx,
		taskID: thread.taskID(),
		task: thread.task(),
		thread
	};
}
function currentThreadOrThrow(context, componentIdx) {
	const meta = getCurrentTaskMeta(context.registers, componentIdx);
	if (!meta) throw new Error(`missing/incomplete global current thread meta for component idx [${componentIdx}]`);
	const thread = getCurrentThread(context, meta.componentIdx, meta.threadID, meta.taskID);
	if (!thread) throw new Error(`invalid/missing async thread [${meta.threadID}] for component idx [${componentIdx}]`);
	return thread;
}
/** Implements `canon thread.yield`. */
function asyncYield(_context, ctx) {
	debugLog("[asyncYield()] args", { ctx });
	const { componentIdx, isCancellable } = ctx;
	const { thread, task } = currentThreadOrThrow(_context, componentIdx);
	if (!task.mayBlock()) {
		getOrCreateAsyncState(_context.lookup, componentIdx).runTickLoop();
		return isCancellable && thread.isCancelled() ? 1 : 0;
	}
	return thread.suspend({
		cancellable: false,
		readyFn: () => true
	}).then((keepGoing) => keepGoing ? 0 : 1);
}
/** Implements `canon thread.index`. */
function threadIndex(_context, componentIdx) {
	const meta = getCurrentTaskMeta(_context.registers, componentIdx);
	if (!meta) throw new Error("missing/incomplete global current thread meta for component idx [" + componentIdx + "]");
	return meta.threadID;
}
/** Implements `canon thread.suspend`. */
async function threadSuspend(_context, ctx) {
	debugLog("[threadSuspend()] args", { ctx });
	const { componentIdx, isCancellable } = ctx;
	const { thread } = currentThreadOrThrow(_context, componentIdx);
	return await thread.suspend({
		cancellable: isCancellable,
		suspended: true,
		readyFn: () => false
	}) ? 0 : 1;
}
/** Implements `canon thread.new-indirect`. */
function threadNewIndirect(_context, ctx, startFuncIdx, context) {
	const { componentIdx, getStartFuncTableFn } = ctx;
	debugLog("[threadNewIndirect()] args", {
		componentIdx,
		startFuncIdx,
		context
	});
	const table = getStartFuncTableFn();
	if (!table) throw new Error("missing start function table for thread.new-indirect");
	const tableIdx = startFuncIdx >>> 0;
	if (tableIdx >= table.length) throw new _context.RuntimeError("thread.new-indirect: table index out of bounds");
	const startFuncRef = table.get(tableIdx);
	if (typeof startFuncRef !== "function") throw new _context.RuntimeError("thread.new-indirect: uninitialized table element");
	if (!_context.start.checked.has(startFuncRef)) {
		try {
			new _context.start.platform.Instance(_context.start.typeCheck, { "": { f: startFuncRef } });
		} catch (err) {
			if (!(err instanceof _context.start.platform.LinkError)) throw err;
			throw new _context.RuntimeError("thread.new-indirect: start function type mismatch");
		}
		_context.start.checked.add(startFuncRef);
	}
	const promisingStartFuncRef = _context.start.platform.promising(startFuncRef);
	const { task } = currentThreadOrThrow(_context, componentIdx);
	const newThread = task.addThread(new _context.AsyncThread({
		componentIdx,
		task,
		startFn: () => promisingStartFuncRef(context)
	}));
	getOrCreateAsyncState(_context.lookup, componentIdx).suspendThread({
		thread: newThread,
		cancellable: false,
		suspended: true,
		readyFn: () => false,
		onResume: () => newThread.start()
	});
	return newThread.id();
}
/** Implements `canon thread.resume-later`. */
function threadResumeLater(_context, ctx, threadHandle) {
	const { componentIdx } = ctx;
	debugLog("[threadResumeLater()] args", {
		componentIdx,
		threadHandle
	});
	const cstate = getOrCreateAsyncState(_context.lookup, componentIdx);
	if (!cstate) throw new Error(`missing async state for component idx [${componentIdx}]`);
	const thread = threadHandle === 0 ? void 0 : cstate.threads.get(threadHandle >>> 0);
	if (!thread) throw new _context.RuntimeError(`unknown handle index ${threadHandle}`);
	if (!cstate.markThreadReady(thread)) throw new _context.RuntimeError(`thread [${threadHandle}] is not suspended, cannot resume-later`);
}
/** Implements `canon thread.suspend-then-resume`. */
function threadSuspendThenResume(_context, ctx, threadIdx) {
	const { componentIdx, isCancellable } = ctx;
	debugLog("[threadSuspendThenResume()] args", {
		componentIdx,
		isCancellable,
		threadIdx
	});
	const { thread } = currentThreadOrThrow(_context, componentIdx);
	const cstate = getOrCreateAsyncState(_context.lookup, componentIdx);
	const other = threadIdx === 0 ? void 0 : cstate.threads.get(threadIdx >>> 0);
	if (!other || other === thread || !cstate.isThreadSuspended(other)) throw new _context.RuntimeError("cannot resume thread which is not suspended");
	const suspension = thread.suspend({
		cancellable: isCancellable,
		suspended: true,
		readyFn: () => false
	});
	cstate.resumeThread(other);
	return suspension.then((keepGoing) => keepGoing ? 0 : 1);
}
/** Implements `canon thread.yield-then-resume`. */
function threadYieldThenResume(_context, ctx, threadIdx) {
	const { componentIdx, isCancellable } = ctx;
	debugLog("[threadYieldThenResume()] args", {
		componentIdx,
		isCancellable,
		threadIdx
	});
	const { thread } = currentThreadOrThrow(_context, componentIdx);
	const cstate = getOrCreateAsyncState(_context.lookup, componentIdx);
	const other = threadIdx === 0 ? void 0 : cstate.threads.get(threadIdx >>> 0);
	if (!other || other === thread || !cstate.isThreadSuspended(other)) throw new _context.RuntimeError("cannot resume thread which is not suspended");
	const suspension = thread.suspend({
		cancellable: isCancellable,
		suspended: false,
		readyFn: () => true
	});
	cstate.resumeThread(other);
	return suspension.then((keepGoing) => keepGoing ? 0 : 1);
}
/** Implements `canon thread.suspend-then-promote`. */
function threadSuspendThenPromote(_context, ctx, threadIdx) {
	const { componentIdx, isCancellable } = ctx;
	debugLog("[threadSuspendThenPromote()] args", {
		componentIdx,
		isCancellable,
		threadIdx
	});
	const { thread } = currentThreadOrThrow(_context, componentIdx);
	const cstate = getOrCreateAsyncState(_context.lookup, componentIdx);
	const other = threadIdx === 0 ? void 0 : cstate.threads.get(threadIdx >>> 0);
	if (!other) throw new _context.RuntimeError("invalid thread handle");
	if (other === thread) throw new _context.RuntimeError("cannot resume thread which is not suspended");
	if (cstate.isThreadReady(other)) {
		const suspension = thread.suspend({
			cancellable: isCancellable,
			suspended: true,
			readyFn: () => false
		});
		cstate.resumeThread(other);
		return suspension.then((keepGoing) => keepGoing ? 0 : 1);
	}
	return threadSuspend(_context, ctx);
}
/** Implements `canon thread.yield-then-promote`. */
function threadYieldThenPromote(_context, ctx, threadIdx) {
	const { componentIdx, isCancellable } = ctx;
	debugLog("[threadYieldThenPromote()] args", {
		componentIdx,
		isCancellable,
		threadIdx
	});
	const { thread } = currentThreadOrThrow(_context, componentIdx);
	const cstate = getOrCreateAsyncState(_context.lookup, componentIdx);
	const other = threadIdx === 0 ? void 0 : cstate.threads.get(threadIdx >>> 0);
	if (!other) throw new _context.RuntimeError("invalid thread handle");
	if (other === thread) throw new _context.RuntimeError("cannot resume thread which is not suspended");
	if (cstate.isThreadReady(other)) {
		const suspension = thread.suspend({
			cancellable: isCancellable,
			suspended: false,
			readyFn: () => true
		});
		cstate.resumeThread(other);
		return suspension.then((keepGoing) => keepGoing ? 0 : 1);
	}
	return asyncYield(_context, ctx);
}

//#endregion
//#region runtime/intrinsics/js-helper.js
const emptyFunc = () => {};
/** Only selected DataView users allocate this owner; emptyFunc needs no cache. */
const initializeDataViewCache = () => ({ view: /* @__PURE__ */ new DataView(/* @__PURE__ */ new ArrayBuffer(0)) });
const dataView = (context, memory) => context.view.buffer === memory.buffer ? context.view : context.view = new DataView(memory.buffer);
/**
* Wraps a generator function, which yields where an async function would await,
* so that it runs synchronously until it yields a promise. A host import that
* answers synchronously then returns synchronously, which a task that cannot
* block (e.g. a resource destructor) requires.
*/
const maybeSyncGenerator = (genFn) => function(...args) {
	const gen = genFn.apply(this, args);
	const step = (method, value) => {
		while (true) {
			const { value: yielded, done } = gen[method](value);
			if (done) return yielded;
			if (yielded === null || typeof yielded !== "object" && typeof yielded !== "function" || typeof yielded.then !== "function") {
				method = "next";
				value = yielded;
				continue;
			}
			return Promise.resolve(yielded).then((res) => step("next", res), (err) => step("throw", err));
		}
	};
	return step("next", void 0);
};
/** Instantiates the module that calls a host import directly, or through JSPI when the current task may block. */
const conditionalSuspendingHostImport = (context, module, componentIdx, fn) => new context.WebAssembly.Instance(module, { "": {
	mayBlock: () => {
		const saved = context.threads.registers[componentIdx];
		return (saved ? getCurrentThread(context.threads, saved.componentIdx, saved.threadID) : null)?.task.mayBlock() ?? false;
	},
	fast: fn,
	slow: new context.WebAssembly.Suspending(fn)
} }).exports.run;

//#endregion
//#region runtime/intrinsics/string.js
function requireString(value) {
	if (typeof value !== "string") throw new TypeError("expected a string, received [" + typeof value + "]");
	return value;
}
function utf8Size(s) {
	let len = 0;
	let codepoints = 0;
	for (let i = 0; i < s.length; i++) {
		const ch = s.charCodeAt(i);
		codepoints++;
		if (ch < 128) len += 1;
		else if (ch < 2048) len += 2;
		else if (ch >= 55296 && ch <= 56319 && i + 1 < s.length && (s.charCodeAt(i + 1) & 64512) === 56320) {
			len += 4;
			i++;
		} else len += 3;
	}
	return {
		len,
		codepoints
	};
}
const initializeUtf8Decoder = () => new TextDecoder("utf-8", {
	fatal: true,
	ignoreBOM: true
});
const initializeUtf16Decoder = () => new TextDecoder("utf-16", {
	fatal: true,
	ignoreBOM: true
});
const initializeUtf8Encoder = () => new TextEncoder();
const initializeUtf16Encoding = () => ({ littleEndian: new Uint8Array(new Uint16Array([1]).buffer)[0] === 1 });
function writeUtf16(context, str, ptr, memory) {
	const len = str.length;
	const out = new Uint16Array(memory.buffer, ptr, len);
	const put = context.littleEndian ? (i, ch) => {
		out[i] = ch;
	} : (i, ch) => {
		out[i] = (ch & 255) << 8 | ch >>> 8;
	};
	for (let i = 0; i < len; i++) {
		let ch = str.charCodeAt(i);
		if ((ch & 63488) === 55296) {
			if (ch < 56320 && i + 1 < len && (str.charCodeAt(i + 1) & 64512) === 56320) {
				put(i++, ch);
				ch = str.charCodeAt(i);
			} else ch = 65533;
		}
		put(i, ch);
	}
	return {
		ptr,
		len,
		codepoints: [...str].length
	};
}
function writeUtf8(encoder, s, ptr, len, codepoints, memory) {
	const { read, written } = encoder.encodeInto(s, new Uint8Array(memory.buffer, ptr, len));
	if (read !== s.length || written !== len) throw new Error("failed to encode whole string");
	return {
		ptr,
		len,
		codepoints
	};
}
const utf16Encode = (context, value, realloc, memory) => {
	const str = requireString(value);
	return writeUtf16(context, str, realloc(0, 0, 2, str.length * 2), memory);
};
const utf16EncodeAsync = async (context, value, realloc, memory) => {
	const str = requireString(value);
	return writeUtf16(context, str, await realloc(0, 0, 2, str.length * 2), memory);
};
const utf16ValidatingCopy = (from, to) => {
	let allLatin1 = true;
	let highSurrogate = false;
	for (let i = 0; i < from.length; i++) {
		const unit = from[i];
		if (highSurrogate !== ((unit & 64512) === 56320)) throw new Error("invalid utf16 encoding");
		highSurrogate = (unit & 64512) === 55296;
		if (unit > 255) allLatin1 = false;
		to[i] = unit;
	}
	if (highSurrogate) throw new Error("invalid utf16 encoding");
	return allLatin1;
};
const utf8Encode = (encoder, value, realloc, memory) => {
	const s = requireString(value);
	if (s.length === 0) return {
		ptr: 1,
		len: 0
	};
	const { len, codepoints } = utf8Size(s);
	return writeUtf8(encoder, s, realloc(0, 0, 1, len), len, codepoints, memory);
};
const utf8EncodeAsync = async (encoder, value, realloc, memory) => {
	const s = requireString(value);
	if (s.length === 0) return {
		ptr: 1,
		len: 0
	};
	const { len, codepoints } = utf8Size(s);
	return writeUtf8(encoder, s, await realloc(0, 0, 1, len), len, codepoints, memory);
};
const validateGuestChar = (value) => {
	if (value > 1114111 || value >= 55296 && value <= 57343) throw new TypeError("not a valid char");
	return String.fromCodePoint(value);
};
/** Lower exactly one Unicode scalar value from a host string. */
const validateHostChar = (value) => {
	if (typeof value !== "string") throw new TypeError("must be a string");
	const codePoint = value.codePointAt(0);
	if (codePoint === void 0 || codePoint >= 55296 && codePoint <= 57343 || value.length !== (codePoint > 65535 ? 2 : 1)) throw new TypeError("not a valid char");
	return codePoint;
};
/** Decode canonical Latin-1 bytes directly; TextDecoder('latin1') uses Windows-1252. */
const compactUtf16Decode = (decoder, memory, ptr, taggedLength) => {
	ptr >>>= 0;
	taggedLength >>>= 0;
	if (ptr % 2 !== 0) throw new RangeError("unaligned compact UTF-16 string");
	if (taggedLength & 2147483648) return decoder.decode(new Uint8Array(memory.buffer, ptr, (taggedLength & 2147483647) * 2));
	const bytes = new Uint8Array(memory.buffer, ptr, taggedLength);
	let value = "";
	for (let i = 0; i < bytes.length; i += 32768) value += String.fromCharCode(...bytes.subarray(i, i + 32768));
	return value;
};
const compactUtf16Encode = (context, value, realloc, memory) => {
	if (typeof value !== "string") throw new TypeError("expected a string");
	if (value.length >= 2147483648) throw new RangeError("compact UTF-16 string is too long");
	for (let i = 0; i < value.length; i++) if (value.charCodeAt(i) > 255) {
		const encoded = utf16Encode(context, value, realloc, memory);
		return {
			...encoded,
			len: (encoded.len | 2147483648) >>> 0
		};
	}
	const ptr = realloc(0, 0, 2, value.length) >>> 0;
	if (ptr % 2 !== 0) throw new RangeError("unaligned compact UTF-16 allocation");
	const bytes = new Uint8Array(memory.buffer, ptr, value.length);
	for (let i = 0; i < value.length; i++) bytes[i] = value.charCodeAt(i);
	return {
		ptr,
		len: value.length
	};
};

//#endregion
//#region runtime/intrinsics/webidl.js
const initializeWebIdlProxyCache = () => ({ proxy: void 0 });
const globalThisIdlProxy = (context) => {
	if (context.proxy) return context.proxy;
	const innerSymbol = Symbol("inner");
	const isProxySymbol = Symbol("isProxy");
	const uppercaseRegex = /html|Html|dom|Dom/g;
	const globalNames = ["Window", "WorkerGlobalScope"];
	function proxy(target, fake = {}) {
		const origTarget = target;
		return new Proxy(fake, {
			get: (_, prop, receiver) => {
				if (prop === innerSymbol) return origTarget;
				if (prop === isProxySymbol) return true;
				if (typeof prop !== "string") return maybeProxy(Reflect.get(origTarget, prop));
				if (origTarget === globalThis && prop.startsWith("get") && globalNames.includes(prop.slice(3))) return () => receiver;
				prop = prop.replaceAll(uppercaseRegex, (x) => x.toUpperCase());
				if (prop.startsWith("set")) return (val) => Reflect.set(origTarget, `${prop[3].toLowerCase()}${prop.slice(4)}`, val);
				if (prop.startsWith("as")) return () => receiver;
				const res = Reflect.get(origTarget, prop);
				if (res === void 0 && prop[0].toUpperCase() === prop[0]) {
					const key = `${prop[0].toLowerCase()}${prop.slice(1)}`;
					const obj = Reflect.get(globalThis, key);
					if (obj) return Object.getPrototypeOf(obj).constructor;
				}
				return maybeProxy(res);
			},
			apply: (_, thisArg, args) => {
				if (args.length === 1 && Array.isArray(args[0]) && Reflect.get(origTarget, "length") === 0) args = args[0];
				const res = Reflect.apply(origTarget, proxyInner(thisArg), args.map((a) => a[isProxySymbol] ? proxyInner(a) : a));
				return typeof res === "object" ? proxy(res) : res;
			},
			getPrototypeOf: () => Reflect.getPrototypeOf(origTarget),
			construct: (_, args, newTarget) => maybeProxy(Reflect.construct(origTarget, args, newTarget)),
			defineProperty: (_, property, attributes) => Reflect.defineProperty(origTarget, property, attributes),
			deleteProperty: (_, property) => Reflect.deleteProperty(origTarget, property),
			getOwnPropertyDescriptor: (_, property) => Reflect.getOwnPropertyDescriptor(origTarget, property),
			has: (_, property) => Reflect.has(origTarget, property),
			isExtensible: () => Reflect.isExtensible(origTarget),
			ownKeys: () => maybeProxy(Reflect.ownKeys(origTarget)),
			preventExtensions: () => Reflect.preventExtensions(origTarget),
			set: (_, property, value, receiver) => Reflect.set(origTarget, property, value, receiver),
			setPrototypeOf: (_, value) => Reflect.setPrototypeOf(origTarget, value)
		});
	}
	function maybeProxy(res) {
		if (typeof res === "function" && res.prototype?.constructor === res) return res;
		if (typeof res === "function") return proxy(res, () => {});
		if (typeof res === "object" && res !== null) return () => proxy(res);
		return res;
	}
	function proxyInner(value) {
		return value ? value[innerSymbol] : value;
	}
	return context.proxy = proxy(globalThis);
};

//#endregion
//#region runtime/intrinsics/rep-table.js
function initializeRepTableClass(context) {
	const { RuntimeError } = context;
	const free = Symbol("RepTable.free");
	class RepTable {
		static FREE = free;
		#data = [0, null];
		#size = 0;
		target;
		#space = null;
		constructor(args) {
			this.target = args?.target;
			this.#space = args?.space ?? null;
		}
		data() {
			return this.#data;
		}
		insert(val) {
			if (this.#space !== null) {
				const rep = this.#space.alloc();
				this.#data[rep << 1] = val;
				this.#data[(rep << 1) + 1] = null;
				this.#size += 1;
				return rep;
			}
			debugLog("[RepTable#insert()] args", {
				val,
				target: this.target
			});
			const freeIdx = this.#data[0];
			if (freeIdx === 0) {
				this.#data.push(val);
				this.#data.push(null);
				const rep = (this.#data.length >> 1) - 1;
				debugLog("[RepTable#insert()] inserted", {
					val,
					target: this.target,
					rep
				});
				this.#size += 1;
				return rep;
			}
			const placementIdx = freeIdx << 1;
			if (this.#data[placementIdx] !== free) throw new Error("corrupt rep table freelist: head does not point at a freed slot");
			this.#data[0] = this.#data[placementIdx + 1];
			this.#data[placementIdx] = val;
			this.#data[placementIdx + 1] = null;
			debugLog("[RepTable#insert()] inserted", {
				val,
				target: this.target,
				rep: freeIdx
			});
			this.#size += 1;
			return freeIdx;
		}
		get(rep) {
			debugLog("[RepTable#get()] args", {
				rep,
				target: this.target
			});
			if (rep === 0) throw new RuntimeError("invalid resource rep during get, (cannot be 0)");
			const baseIdx = rep << 1;
			const val = this.#data[baseIdx];
			if (val === free) return;
			return val;
		}
		contains(rep) {
			debugLog("[RepTable#contains()] args", {
				rep,
				target: this.target
			});
			if (rep === 0) throw new Error("invalid resource rep during contains, (cannot be 0)");
			const baseIdx = rep << 1;
			const val = this.#data[baseIdx];
			return val !== free && !!val;
		}
		remove(rep) {
			debugLog("[RepTable#remove()] args", {
				rep,
				target: this.target
			});
			if (rep === 0) throw new Error("invalid resource rep during remove, (cannot be 0)");
			if (this.#space !== null) {
				const baseIdx = rep << 1;
				const val = this.#data[baseIdx];
				if (val === void 0 || val === free) throw new RuntimeError(`unknown handle index ${rep}`);
				this.#data[baseIdx] = free;
				this.#data[baseIdx + 1] = null;
				this.#size -= 1;
				this.#space.release(rep);
				return val;
			}
			if (this.#data.length === 2) throw new Error("invalid");
			const baseIdx = rep << 1;
			if (baseIdx >= this.#data.length) throw new Error(`invalid rep [${rep}] during remove, out of range`);
			const val = this.#data[baseIdx];
			if (val === free) throw new RuntimeError(`double removal of rep [${rep}] (already freed)`);
			this.#data[baseIdx] = free;
			this.#data[baseIdx + 1] = this.#data[0];
			this.#data[0] = rep;
			this.#size -= 1;
			return val;
		}
		size() {
			return this.#size;
		}
		clear() {
			debugLog("[RepTable#clear()] args", { target: this.target });
			if (this.#space) {
				for (let rep = 1; rep < this.#data.length / 2; rep++) if (this.#data[(rep << 1) + 1] === null && this.#data[rep << 1] !== free) this.#space.release(rep);
			}
			this.#size = 0;
			this.#data = [0, null];
		}
	}
	return RepTable;
}

//#endregion
//#region runtime/intrinsics/buffers.js
function initializeManagedBufferClass(context) {
	class ManagedBuffer {
		static MAX_LENGTH = 2 ** 28 - 1;
		#componentIdx;
		#memory;
		#elemMeta;
		#start;
		#ptr;
		capacity;
		processed = 0;
		#hostOnlyData;
		target;
		static validateGuestBuffer(memory, start, count, elemMeta) {
			if (!memory || elemMeta.isNone) return;
			if (start % elemMeta.align32 !== 0) throw new context.RuntimeError("buffer pointer not aligned");
			if (start + count * elemMeta.size32 > memory.buffer.byteLength) throw new context.RuntimeError("buffer pointer out of bounds of memory");
		}
		constructor(args) {
			if (args.capacity > ManagedBuffer.MAX_LENGTH) throw new Error(`buffer size [${args.capacity}] greater than max length`);
			if (args.componentIdx === void 0) throw new TypeError("missing/invalid component idx");
			if (args.capacity === void 0) throw new TypeError("missing/invalid capacity");
			if (!args.elemMeta || typeof args.elemMeta.align32 !== "number") throw new TypeError("missing/invalid element metadata");
			if (!args.memory && args.start === void 0 && args.data === void 0) throw new TypeError("either memory and start ptr or data must be provided for managed buffers");
			if (args.memory && args.start == void 0) throw new TypeError("missing/invalid start ptr, depsite memory being present");
			ManagedBuffer.validateGuestBuffer(args.memory, args.start, args.capacity, args.elemMeta);
			this.#componentIdx = args.componentIdx;
			this.#memory = args.memory;
			this.#start = args.start;
			this.#ptr = this.#start;
			this.capacity = args.capacity;
			this.#elemMeta = args.elemMeta;
			if (args.data !== void 0 && !Array.isArray(args.data)) throw new TypeError("host-only data must be an array");
			this.#hostOnlyData = args.data;
			this.target = args.target;
		}
		setTarget(tgt) {
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
		read(count, opts = {}) {
			debugLog("[ManagedBuffer#read()] args", { count });
			if (count === void 0 || count <= 0) throw new TypeError(`missing/invalid count [${count}]`);
			const cap = this.capacity;
			if (count > cap) throw new Error(`cannot read [${count}] elements from buffer with capacity [${cap}]`);
			let values = [];
			if (this.#elemMeta.isNone) values = [...new Array(count)].map(() => null);
			else if (this.isHostOwned()) {
				values = this.#hostOnlyData.slice(0, count);
				this.#hostOnlyData = this.#hostOnlyData.slice(count);
			} else if (this.#elemMeta.payloadTypeName === "U8") {
				values = Array.from(new Uint8Array(this.#memory.buffer, this.#ptr, count));
				this.#ptr += count;
			} else {
				let currentCount = count;
				let startPtr = this.#ptr;
				if (this.#elemMeta.stringEncoding === void 0) throw new Error("string encoding unknown during read");
				let liftCtx = {
					storagePtr: startPtr,
					memory: this.#memory,
					componentIdx: this.#componentIdx,
					stringEncoding: this.#elemMeta.stringEncoding,
					liftResource: opts.transferResources ? (handle, tableIdx) => {
						const { rep } = tableRemove(context, context.tables[tableIdx], handle);
						return { rep };
					} : void 0
				};
				if (currentCount < 0) throw new Error("unexpectedly invalid count");
				while (currentCount > 0) {
					const [value] = this.#elemMeta.liftFn(liftCtx);
					values.push(value);
					currentCount -= 1;
				}
				this.#ptr = liftCtx.storagePtr;
			}
			this.processed += count;
			return values;
		}
		write(values, opts = {}) {
			debugLog("[ManagedBuffer#write()] args", { values });
			if (!Array.isArray(values)) throw new TypeError("values input to write() must be an array");
			let rc = this.remaining();
			if (values.length > rc) throw new Error(`cannot write [${values.length}] elements to managed buffer with remaining capacity [${rc}]`);
			if (this.#elemMeta.isNone) {
				if (!values.every((v) => v === null)) throw new Error("non-null values in write() to unit managed buffer");
			} else if (this.isHostOwned()) this.#hostOnlyData = this.#hostOnlyData.concat(values);
			else if (this.#elemMeta.payloadTypeName === "U8") {
				new Uint8Array(this.#memory.buffer, this.#ptr, values.length).set(values);
				this.#ptr += values.length;
			} else {
				let startPtr = this.#ptr;
				if (this.#elemMeta.stringEncoding === void 0) throw new Error("string encoding unknown during write");
				const lowerCtx = {
					memory: this.#memory,
					storagePtr: startPtr,
					componentIdx: this.#componentIdx,
					stringEncoding: this.#elemMeta.stringEncoding,
					realloc: this.#elemMeta.getReallocFn?.(),
					getReallocFn: this.#elemMeta.getReallocFn,
					lowerResource: opts.transferResources ? (value, tableIdx) => {
						let table = context.tables[tableIdx];
						if (!table) {
							table = [tableFlag, 0];
							table._createdReps = /* @__PURE__ */ new Set();
							context.tables[tableIdx] = table;
						}
						return tableCreateOwn(context.indexSpaces, table, value.rep);
					} : void 0
				};
				for (const v of values) {
					lowerCtx.vals = [v];
					this.#elemMeta.lowerFn(lowerCtx);
				}
				this.#ptr = lowerCtx.storagePtr;
			}
			this.processed += values.length;
		}
	}
	return ManagedBuffer;
}
function initializeBufferManagerClass(ManagedBuffer) {
	class BufferManager {
		#buffers = /* @__PURE__ */ new Map();
		#bufferIDs = /* @__PURE__ */ new Map();
		getNextBufferID(componentIdx) {
			const current = this.#bufferIDs.get(componentIdx);
			if (current === void 0) {
				this.#bufferIDs.set(componentIdx, 1n);
				return 1n;
			}
			const next = current + 1n;
			this.#bufferIDs.set(componentIdx, next);
			return next;
		}
		getBuffer(componentIdx, bufferID) {
			debugLog("[BufferManager#getBuffer()] args", {
				componentIdx,
				bufferID
			});
			return this.#buffers.get(componentIdx)?.get(bufferID);
		}
		createBuffer(args) {
			debugLog("[BufferManager#createBuffer()] args", args);
			if (!args || typeof args !== "object") throw new TypeError("missing/invalid argument object");
			if (args.start === void 0 && args.data === void 0) throw new TypeError("either a starting pointer or initial values must be provided");
			if (args.start !== void 0 && args.componentIdx === void 0) throw new TypeError("missing/invalid component idx");
			if (args.count === void 0) throw new TypeError("missing/invalid obj count");
			if (!args.elemMeta) throw new TypeError("missing/invalid element metadata for use with managed buffer");
			const { componentIdx } = args;
			if (!this.#buffers.has(componentIdx)) this.#buffers.set(componentIdx, /* @__PURE__ */ new Map());
			const instanceBuffers = this.#buffers.get(componentIdx);
			const nextBufID = this.getNextBufferID(componentIdx);
			const buffer = new ManagedBuffer({
				componentIdx,
				memory: args.memory,
				start: args.start,
				capacity: args.count,
				elemMeta: args.elemMeta,
				data: args.data,
				target: args.target
			});
			if (instanceBuffers.has(nextBufID)) throw new Error(`managed buffer with ID [${nextBufID}] already exists`);
			instanceBuffers.set(nextBufID, buffer);
			return {
				id: nextBufID,
				buffer
			};
		}
		deleteBuffer(componentIdx, bufferID) {
			debugLog("[BufferManager#deleteBuffer()] args", {
				componentIdx,
				bufferID
			});
			return this.#buffers.get(componentIdx)?.delete(bufferID);
		}
	}
	return BufferManager;
}

//#endregion
//#region runtime/intrinsics/core.js
const i32Min = -2147483648;
const i32Max = 2147483647;
const initializeAsyncDeterminism = (mode) => mode;
const initializeAsyncFunctionConstructor = () => (async () => {}).constructor;
const initializeRuntimeErrorConstructor = (platform) => platform.RuntimeError;
const initializeReadableStream = (chosen) => {
	if (!chosen) throw new Error("builtin stream class [ReadableStream] is not available");
	return chosen;
};
const initializeComponentErrorClass = () => {
	class ComponentError extends Error {
		constructor(value) {
			const enumerable = typeof value !== "string";
			super(enumerable ? `${String(value)} (see error.payload)` : value);
			Object.defineProperty(this, "payload", {
				value,
				enumerable
			});
		}
	}
	return ComponentError;
};
const initializeBufferManager = (BufferManager) => new BufferManager();
const initializeFactTrapMessages = (messages) => messages;
const initializeSymbolCabiDispose = () => Symbol.for("cabiDispose");
const initializeSymbolCabiLower = () => Symbol.for("cabiLower");
const initializeSymbolResourceHandle = () => Symbol("handle");
const initializeSymbolResourceRep = () => Symbol.for("cabiRep");
const initializeSymbolDispose = () => Symbol.dispose || Symbol.for("dispose");
const initializeSymbolAsyncIterator = () => Symbol.asyncIterator;
const initializeSymbolIterator = () => Symbol.iterator;
const initializeEndianness = () => new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;
const initializeHasOwnProperty = () => Object.prototype.hasOwnProperty;
const initializeAsyncEventCodes = () => ({
	NONE: 0,
	SUBTASK: 1,
	STREAM_READ: 2,
	STREAM_WRITE: 3,
	FUTURE_READ: 4,
	FUTURE_WRITE: 5,
	TASK_CANCELLED: 6
});
const initializeComponentMemoryMap = () => /* @__PURE__ */ new Map();
const initializeConditionalSuspendingWasm = () => ({});
const initializeFileCompileCache = (nodejsCompat) => {
	return {
		node: !!(nodejsCompat && globalThis.process?.versions?.node),
		fs: void 0
	};
};
const coinFlip = () => Math.random() > .5;
const typeCheckValidI32 = (value) => typeof value === "number" && value >= -2147483648 && value <= 2147483647;
const typeCheckAsyncFn = (constructor, value) => value instanceof constructor;
const base64Compile = (context, encoded) => {
	const host = globalThis;
	return context.WebAssembly.compile(context.nodejsCompat && typeof host.Buffer !== "undefined" ? host.Buffer.from(encoded, "base64") : Uint8Array.from(atob(encoded), (byte) => byte.charCodeAt(0)));
};
async function fetchWithNode(context, url) {
	if (context.fileCache.node) {
		context.fileCache.fs = context.fileCache.fs || await import("node:fs/promises");
		return context.WebAssembly.compile(await context.fileCache.fs.readFile(url));
	}
	return fetch(url).then(context.WebAssembly.compileStreaming);
}
const fetchCompile = (context, url) => context.nodejsCompat ? fetchWithNode(context, url) : fetch(url).then(context.WebAssembly.compileStreaming);
const instantiateCore = (platform, module, imports) => platform.instantiate(module, imports);
const clampGuest = (value, min, max) => {
	if (value < min || value > max) throw new TypeError(`must be between ${min} and ${max}`);
	return value;
};
const getErrorPayload = (hasOwnProperty, error) => {
	if (error && hasOwnProperty.call(error, "payload")) return error.payload;
	if (error instanceof Error) throw error;
	return error;
};
const getErrorPayloadString = (hasOwnProperty, error) => {
	if (error && hasOwnProperty.call(error, "payload")) return error.payload;
	if (error instanceof Error) return error.message;
	return error;
};
const finalizationRegistryCreate = (cleanup) => {
	if (typeof FinalizationRegistry === "undefined") return { unregister() {} };
	return new FinalizationRegistry(cleanup);
};
const disposeHostValue = (disposeSymbol, value, disposeFn) => {
	if (!disposeFn) {
		if (value === null || typeof value !== "object" && typeof value !== "function") return;
		const disposable = value;
		if (typeof Symbol.asyncDispose === "symbol" && typeof disposable[Symbol.asyncDispose] === "function") disposeFn = disposable[Symbol.asyncDispose];
		else if (typeof disposable[disposeSymbol] === "function") disposeFn = disposable[disposeSymbol];
		else return;
	}
	const dispose = disposeFn;
	const report = (error) => console.error("[jco] error while disposing discarded host value", error);
	queueMicrotask(() => {
		try {
			const result = dispose.call(value);
			if (result && typeof result.then === "function") result.then(void 0, report);
		} catch (error) {
			report(error);
		}
	});
};
const throwInvalidBool = () => {
	throw new TypeError("invalid variant discriminant for bool");
};
const throwUninitialized = () => {
	throw new TypeError("Wasm uninitialized use `await $init` first");
};
const registerMemory = (map, args) => {
	const { componentIdx, memory, memoryIdx } = args ?? {};
	if (componentIdx === void 0) throw new TypeError("missing component idx");
	if (memory === void 0 && memoryIdx === void 0) throw new TypeError("missing both memory & memory idx");
	let inner = map.get(componentIdx);
	if (!inner) {
		inner = {};
		map.set(componentIdx, inner);
	}
	inner[String(memoryIdx)] = {
		memory,
		memoryIdx,
		componentIdx
	};
};
function lookupMemories(map, args) {
	const { componentIdx } = args ?? {};
	if (args.componentIdx === void 0) throw new TypeError("missing component idx");
	const metas = map.get(componentIdx);
	if (!metas) return [];
	return args.memoryIdx === void 0 ? Object.values(metas) : metas[args.memoryIdx]?.memory;
}
const suspendingImport = (context, componentIdx, fn, syncOnly = false, switchesTask = false, convertsRangeErrors = true, callsHost = false) => {
	const { registers: currentTaskMeta, RuntimeError } = context;
	return function(...args) {
		checkMayLeave(context.mayLeave, componentIdx);
		const saved = currentTaskMeta[componentIdx] ?? null;
		const savedThread = saved ? getCurrentThread(context.threadLookup, saved.componentIdx, saved.threadID, saved.taskID) : null;
		const mayBlock = savedThread ? savedThread.task.mayBlock() ?? (context.mayBlock === false ? void 0 : context.mayBlock.value) !== 0 : false;
		if (!saved && !mayBlock && !callsHost) throw new RuntimeError("cannot block a synchronous task before returning");
		if (syncOnly || !mayBlock) {
			let result;
			try {
				result = fn.apply(null, args);
			} catch (error) {
				currentTaskMeta[componentIdx] = saved;
				if (!switchesTask) currentTaskMeta.current = saved;
				throw recordTrap(context.traps, componentIdx, error, convertsRangeErrors);
			}
			currentTaskMeta[componentIdx] = saved;
			if (!switchesTask) currentTaskMeta.current = saved;
			if (isPromiseLike(result)) {
				Promise.resolve(result).catch(emptyFunc);
				throw new RuntimeError("cannot block a synchronous task before returning");
			}
			return result;
		}
		return (async () => {
			try {
				const result = await fn.apply(null, args);
				getOrCreateAsyncState(context.states, componentIdx).throwIfInterrupted();
				return result;
			} catch (error) {
				throw recordTrap(context.traps, componentIdx, error, convertsRangeErrors);
			} finally {
				currentTaskMeta[componentIdx] = saved;
				if (!switchesTask) currentTaskMeta.current = saved;
			}
		})();
	};
};
function instantiateTrampoline(platform, module, fast, slow) {
	return new platform.Instance(module, { "": {
		fast,
		slow: new platform.Suspending(slow)
	} }).exports.run;
}
const conditionalSuspending1I32ToI32 = (context, fast, slow) => instantiateTrampoline(context.WebAssembly, context.modules._conditionalSuspending1I32ToI32, fast, slow);
const conditionalSuspending2I32ToI32 = (context, fast, slow) => instantiateTrampoline(context.WebAssembly, context.modules._conditionalSuspending2I32ToI32, fast, slow);
const conditionalSuspending3I32ToI32 = (context, fast, slow) => instantiateTrampoline(context.WebAssembly, context.modules._conditionalSuspending3I32ToI32, fast, slow);
const conditionalSuspending3I32ToVoid = (context, fast, slow) => instantiateTrampoline(context.WebAssembly, context.modules._conditionalSuspending3I32ToVoid, fast, slow);

//#endregion
//#region runtime/intrinsics/async-task/helpers.js
const isThenable = (value) => !!value && typeof value.then === "function";

//#endregion
//#region runtime/intrinsics/async-task/callback.js
function unpackCallbackResult(_context, result) {
	if (!typeCheckValidI32(result)) throw new Error("invalid callback return value [" + result + "], not a valid i32");
	return unpackValidatedCallbackResult(_context, result);
}
/** Decode a callback whose scalar type and i32 range have already been checked. */
function unpackValidatedCallbackResult(context, result) {
	const eventCode = result & 15;
	if (eventCode > 3) throw new context.RuntimeError("invalid async return value [" + eventCode + "], outside callback code range");
	if (result < 0) throw new context.RuntimeError("invalid callback result");
	return [eventCode, result >> 4];
}

//#endregion
//#region runtime/intrinsics/async-task/driver.js
function driverLoop(_context, args) {
	debugLog("[_driverLoop()] args", args);
	const { componentState, task, fnName } = args;
	let callbackResult = args.callbackResult;
	const callbackFnName = task.getCallbackFnName();
	const componentIdx = task.componentIdx();
	if (callbackResult instanceof Promise) throw new Error("callbackResult should be a value, not a promise");
	if (callbackResult === void 0) throw new Error("callback result should never be undefined");
	let callbackCode;
	let waitableSetRep;
	const unpackCallback = (value) => {
		if (!typeCheckValidI32(value)) throw new _context.RuntimeError("invalid callback result [" + value + "], not a number");
		[callbackCode, waitableSetRep] = unpackValidatedCallbackResult(_context, value);
	};
	const cstate = getOrCreateAsyncState(_context.lookup, componentIdx);
	let eventCode;
	let index;
	let result;
	let asyncRes;
	let wset;
	const handleError = (err) => {
		debugLog("[_driverLoop()] error during async driver loop", {
			fnName,
			callbackFnName,
			componentIdx,
			taskID: task.id(),
			subtaskID: task.getParentSubtask()?.id(),
			parentTaskID: task.getParentSubtask()?.getParentTask()?.id(),
			event: {
				eventCode,
				index,
				result
			},
			err
		});
		if (err instanceof _context.RuntimeError) _context.reportTrap?.(err);
		task.setErrored(err);
		task.reject(err);
		if (!task.isExited()) task.exit({ skipExclusiveLockCheck: true });
	};
	const drive = () => {
		try {
			if (callbackCode !== 0) componentState.exclusiveRelease(task.id());
			switch (callbackCode) {
				case 0:
					debugLog("[_driverLoop()] async exit indicated", {
						fnName,
						componentIdx,
						callbackFnName,
						taskID: task.id()
					});
					task.exit({ skipExclusiveLockCheck: true });
					return;
				case 1:
					debugLog("[_driverLoop()] yield", {
						fnName,
						componentIdx,
						callbackFnName,
						taskID: task.id()
					});
					task.suspendUntilCallback({
						cancellable: true,
						readyFn: () => true
					}, (keepGoing) => {
						continueWithEvent({
							code: keepGoing ? _context.events.NONE : _context.events.TASK_CANCELLED,
							payload0: 0,
							payload1: 0
						});
					});
					task.settleCompletion();
					return;
				case 2:
					wset = waitableSetRep === 0 ? void 0 : cstate.handles.get(waitableSetRep);
					if (!(wset instanceof _context.WaitableSet)) throw new _context.RuntimeError(`unknown handle index ${waitableSetRep}`);
					debugLog("[_driverLoop()] waiting for event", {
						fnName,
						componentIdx,
						callbackFnName,
						taskID: task.id(),
						waitableSetRep,
						waitableSetTargets: wset.targets()
					});
					wset.waitUntilCallback({
						readyFn: () => true,
						task,
						cancellable: true
					}, continueWithEvent);
					task.settleCompletion();
					return;
				default: throw new Error(`Unrecognized async function result [${callbackCode}]`);
			}
		} catch (err) {
			handleError(err);
		}
	};
	const continueWithCallbackResult = (callbackRes) => {
		try {
			unpackCallback(callbackRes);
			debugLog("[_driverLoop()] callback result unpacked", {
				fnName,
				componentIdx,
				callbackFnName,
				callbackRes,
				callbackCode,
				waitableSetRep
			});
			return drive();
		} catch (err) {
			handleError(err);
		}
	};
	const runCallback = () => {
		try {
			if (!task.isRejected()) try {
				componentState.throwIfInterrupted();
			} catch (err) {
				task.setErrored(err);
				task.reject(err);
			}
			if (task.isRejected()) {
				debugLog("[_driverLoop()] detected task rejection, leaving early");
				componentState.exclusiveRelease(task.id());
				if (!task.isExited()) task.exit({ skipExclusiveLockCheck: true });
				return;
			}
			eventCode = asyncRes.code;
			if (eventCode === void 0) throw new Error("missing event code from event");
			index = asyncRes.payload0;
			if (index === void 0) throw new Error("missing payload0 from event");
			result = asyncRes.payload1;
			if (result === void 0) throw new Error("missing payload1 from event");
			asyncRes = null;
			debugLog("[_driverLoop()] performing callback", {
				fnName,
				componentIdx,
				taskID: task.id(),
				callbackFnName,
				eventCode,
				index,
				result
			});
			const callbackRes = task.runCallbackFn(toInt32(_context.strictNumeric, eventCode), toInt32(_context.strictNumeric, index), toInt32(_context.strictNumeric, result));
			if (isThenable(callbackRes)) return callbackRes.then(continueWithCallbackResult, handleError);
			return continueWithCallbackResult(callbackRes);
		} catch (err) {
			handleError(err);
		}
	};
	function continueWithEvent(event) {
		asyncRes = event;
		const lock = componentState.acquireExclusiveLock(task.id());
		if (lock && typeof lock.then === "function") return lock.then(runCallback, handleError);
		return runCallback();
	}
	try {
		unpackCallback(callbackResult);
		return drive();
	} catch (err) {
		handleError(err);
	}
}

//#endregion
//#region runtime/intrinsics/host.js
function prepareCall(_context, memoryIdx, getMemoryFn, startFn, returnFn, callerComponentIdx, calleeComponentIdx, taskReturnTypeIdx, calleeIsAsyncInt, stringEncoding, resultCountOrAsync, ...params) {
	debugLog("[_prepareCall()]", {
		memoryIdx,
		callerComponentIdx,
		calleeComponentIdx,
		taskReturnTypeIdx,
		calleeIsAsyncInt,
		stringEncoding,
		resultCountOrAsync
	});
	const argArray = params;
	resultCountOrAsync >>>= 0;
	let isAsync = false;
	let hasResultPointer = false;
	if (resultCountOrAsync === 2 ** 32 - 1) {
		isAsync = true;
		hasResultPointer = false;
	} else if (resultCountOrAsync === 2 ** 32 - 2) {
		isAsync = true;
		hasResultPointer = true;
	} else if (resultCountOrAsync > 1) hasResultPointer = true;
	const currentCallerThreadMeta = getCurrentTaskMeta(_context.registers, callerComponentIdx);
	const currentCallerTaskMeta = currentCallerThreadMeta && getCurrentTask(_context, callerComponentIdx, currentCallerThreadMeta.taskID);
	if (!currentCallerTaskMeta) {
		if (!isAsync && (_context.mayBlock === false ? void 0 : _context.mayBlock.value) === 0) throw new _context.RuntimeError("cannot block a synchronous task before returning");
		throw new Error("invalid/missing current task for caller during prepare call");
	}
	const currentCallerTask = currentCallerTaskMeta.task;
	const callerThreadID = currentCallerThreadMeta.threadID;
	if (!currentCallerTask) throw new Error("unexpectedly missing task in meta for caller during prepare call");
	if (currentCallerTask.componentIdx() !== callerComponentIdx) throw new Error(`task component idx [${currentCallerTask.componentIdx()}] !== [${callerComponentIdx}] (callee ${calleeComponentIdx})`);
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
			encoding = "utf8";
			break;
		case 1:
			encoding = "utf16";
			break;
		case 2:
			encoding = "compact-utf16";
			break;
		default: throw new Error(`unrecognized string encoding enum [${stringEncoding}]`);
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
			stringEncoding: encoding
		}
	});
	const { task: newTask, thread: newThread } = createNewCurrentImplicitThread(_context.creation, {
		componentIdx: calleeComponentIdx,
		isAsync,
		getCalleeParamsFn,
		entryFnName: [
			"task",
			subtask.getParentTask().id(),
			"subtask",
			subtask.id(),
			"new-prepared-async-task"
		].join("/"),
		stringEncoding: encoding
	});
	newTask.setParentSubtask(subtask);
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
		isAsync
	};
	setCurrentTaskMeta(_context.registers, {
		taskID: newTask.id(),
		threadID: newThread.id(),
		componentIdx: newTask.componentIdx()
	});
}
function asyncStartCall(_context, args, callee, paramCount, resultCount, flags) {
	const componentIdx = _context.componentIdxs.at(-1);
	const globalTaskMeta = getCurrentTaskMeta(_context.registers, componentIdx);
	if (!globalTaskMeta) throw new Error("missing global current task globalTaskMeta");
	const taskID = globalTaskMeta.taskID;
	const threadID = globalTaskMeta.threadID;
	debugLog("[_asyncStartCall()] args", {
		args,
		componentIdx
	});
	const { getCallbackFn, callbackIdx, getPostReturnFn } = args;
	const preparedTaskMeta = getCurrentTask(_context, componentIdx, taskID);
	if (!preparedTaskMeta) throw new Error("unexpectedly missing current task");
	const preparedTask = preparedTaskMeta.task;
	if (!preparedTask) throw new Error("unexpectedly missing current task");
	if (!preparedTask.subtaskMeta) throw new Error("missing subtask meta from prepare");
	preparedTask.setCalleeIsAsync((flags & 1) !== 0);
	const calleeIsAsync = (flags & 1) !== 0;
	const { subtask, callerComponentIdx, calleeComponentIdx } = preparedTask.subtaskMeta;
	if (!subtask) throw new Error("missing subtask from cstate during async start call");
	if (calleeComponentIdx !== preparedTask.componentIdx()) throw new Error(`meta callee idx [${calleeComponentIdx}] != current task idx [${preparedTask.componentIdx()}] during async start call`);
	if (calleeComponentIdx !== componentIdx) throw new Error("mismatched componentIdx for async start call (does not match prepare)");
	if (resultCount < 0 || resultCount > 1) throw new Error("invalid/unsupported result count");
	const callbackFnName = "callback_" + callbackIdx;
	const callbackFn = getCallbackFn();
	preparedTask.setCallbackFn(callbackFn, callbackFnName);
	preparedTask.setPostReturnFn(getPostReturnFn());
	if (resultCount < 0 || resultCount > 1) throw new Error(`unsupported result count [${resultCount}]`);
	const params = preparedTask.getCalleeParams();
	const callerComponentState = getOrCreateAsyncState(_context.lookup, subtask.componentIdx());
	const calleeComponentState = getOrCreateAsyncState(_context.lookup, preparedTask.componentIdx());
	calleeComponentState.hasBackpressure();
	subtask.registerOnResolveHandler((res) => {
		debugLog("[_asyncStartCall()] handling subtask result", {
			res,
			subtaskID: subtask.id()
		});
		if (!subtask.isReturned()) return;
		let subtaskCallMeta = subtask.getCallMetadata();
		if (subtaskCallMeta.memory || subtaskCallMeta.realloc) throw new Error("call metadata unexpectedly contains memory/realloc for guest->guest call");
		const callerTask = subtask.getParentTask();
		const calleeTask = preparedTask;
		const callerMemoryIdx = callerTask.getReturnMemoryIdx();
		const callerComponentIdx = callerTask.componentIdx();
		if (subtaskCallMeta && subtaskCallMeta.returnFn) {
			debugLog("[_asyncStartCall()] return function present while handling subtask result, returning early (skipping lower)", {
				calleeTaskID: calleeTask.id(),
				calleeComponentIdx
			});
			if (subtaskCallMeta.returnFnCalled) return;
			const res = withCurrentTaskMeta(_context.registers, {
				taskID: callerTask.id(),
				threadID: subtaskCallMeta.callerThreadID,
				componentIdx: callerTask.componentIdx(),
				fn: () => subtaskCallMeta.returnFn.apply(null, [subtaskCallMeta.resultPtr])
			});
			subtaskCallMeta.returnFnCalled = true;
			debugLog("[_asyncStartCall()] finished calling return fn", {
				calleeTaskID: calleeTask.id(),
				calleeComponentIdx,
				res
			});
			return;
		}
		if (!subtaskCallMeta.resultPtr) {
			debugLog("[_asyncStartCall()] no result ptr during subtask result handling, returning early (skipping lower)");
			return;
		}
		let callerMemory;
		if (callerMemoryIdx !== null && callerMemoryIdx !== void 0) {
			const memory = lookupMemories(_context.memories, {
				componentIdx: callerComponentIdx,
				memoryIdx: callerMemoryIdx
			});
			callerMemory = Array.isArray(memory) ? void 0 : memory;
		} else {
			const callerMemories = lookupMemories(_context.memories, { componentIdx: callerComponentIdx });
			if (callerMemories.length !== 1) throw new Error(`unsupported amount of caller memories`);
			callerMemory = callerMemories[0]?.memory;
		}
		if (!callerMemory) {
			debugLog("[_asyncStartCall()] missing memory", {
				subtaskID: subtask.id(),
				res
			});
			throw new Error(`missing memory for to guest->guest call result (subtask [${subtask.id()}])`);
		}
		const lowerFns = calleeTask.getReturnLowerFns();
		if (!lowerFns || lowerFns.length === 0) {
			debugLog("[_asyncStartCall()] missing result lower metadata for guest->guest call", { subtaskID: subtask.id() });
			throw new Error(`missing result lower metadata for guest->guest call (subtask [${subtask.id()}])`);
		}
		if (lowerFns.length !== 1) {
			debugLog("[_asyncStartCall()] only single result reportetd for guest->guest call", { subtaskID: subtask.id() });
			throw new Error(`only single result supported for guest->guest calls (subtask [${subtask.id()}])`);
		}
		debugLog("[_asyncStartCall()] lowering results", { subtaskID: subtask.id() });
		lowerFns[0]({
			realloc: void 0,
			memory: callerMemory,
			vals: [res],
			storagePtr: subtaskCallMeta.resultPtr,
			componentIdx: callerComponentIdx,
			stringEncoding: subtaskCallMeta.stringEncoding
		});
	});
	let startRes;
	const startSubtask = () => {
		const initialResult = subtask.onStart({ startFnParams: params });
		startRes = initialResult === void 0 ? [] : Array.isArray(initialResult) ? initialResult : [initialResult];
		if (startRes.length !== paramCount) throw new Error(`unexpected callee param count [${startRes.length}] after start fn, _asyncStartCall invocation expected [${paramCount}]`);
	};
	const registerSubtaskProgress = () => {
		subtask.setOnProgressFn(() => {
			subtask.setPendingEvent(() => {
				if (subtask.isResolved()) subtask.deliverResolve();
				return {
					code: _context.events.SUBTASK,
					payload0: subtask.waitableRep(),
					payload1: subtask.getStateNumber()
				};
			});
		});
	};
	const handleCalleeError = (err) => {
		preparedTask.endFirstSlice();
		debugLog("[_asyncStartCall()] initial subtask callee run failed", err);
		_context.driver.reportTrap?.(err);
		subtask.getParentTask().setErrored(err);
		if (preparedTask.needsExclusiveLock()) calleeComponentState.exclusiveRelease(preparedTask.id());
	};
	const driveCallback = (callbackResult) => {
		if (!callbackFn) {
			debugLog("[_asyncStartCall()] no callback, resolving w/ callee result", {
				taskID: preparedTask.id(),
				componentIdx: preparedTask.componentIdx(),
				preparedTask,
				stateNumber: preparedTask.taskState(),
				isResolved: preparedTask.isResolved(),
				callbackFn
			});
			if (preparedTask.needsExclusiveLock()) calleeComponentState.exclusiveRelease(preparedTask.id());
			if (!preparedTask.isResolved()) preparedTask.resolve([callbackResult]);
			preparedTask.exit({ skipExclusiveLockCheck: true });
			return;
		}
		let fnName = callbackFn.fnName;
		if (!fnName) fnName = [
			"<task ",
			subtask.parentTaskID(),
			"/subtask ",
			subtask.id(),
			"/task ",
			preparedTask.id(),
			">"
		].join("");
		debugLog("[_asyncStartCall()] starting driver loop", {
			fnName,
			componentIdx: preparedTask.componentIdx(),
			subtaskID: subtask.id(),
			childTaskID: subtask.childTaskID(),
			parentTaskID: subtask.parentTaskID()
		});
		return driverLoop(_context.driver, {
			componentState: calleeComponentState,
			task: preparedTask,
			fnName,
			isAsync: true,
			callbackResult
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
		if (!calleeIsAsync) _context.blockingDepth.value++;
		try {
			let jspiCallee;
			if (callee._cachedPromising) jspiCallee = callee._cachedPromising;
			else {
				callee._cachedPromising = _context.platform.promising(callee);
				jspiCallee = callee._cachedPromising;
			}
			callbackResult = await withCurrentTaskMetaAsync(_context.registers, {
				taskID: preparedTask.id(),
				threadID,
				componentIdx: preparedTask.componentIdx(),
				fn: () => jspiCallee.apply(null, startRes)
			});
			preparedTask.endFirstSlice();
		} catch (err) {
			handleCalleeError(err);
			return;
		} finally {
			if (!calleeIsAsync) _context.blockingDepth.value--;
		}
		try {
			await driveCallback(callbackResult);
		} catch (err) {
			debugLog("[AsyncStartCall] drive loop call failure", { err });
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
		if (!calleeIsAsync) _context.blockingDepth.value++;
		try {
			callbackResult = withCurrentTaskMeta(_context.registers, {
				taskID: preparedTask.id(),
				threadID,
				componentIdx: preparedTask.componentIdx(),
				fn: () => callee.apply(null, startRes)
			});
			preparedTask.endFirstSlice();
		} catch (err) {
			handleCalleeError(err);
			return;
		} finally {
			if (!calleeIsAsync) _context.blockingDepth.value--;
		}
		driveCallback(callbackResult)?.catch((err) => {
			debugLog("[AsyncStartCall] drive loop call failure", { err });
		});
	};
	const enteredSynchronously = preparedTask.tryEnter();
	if (enteredSynchronously === true) {
		startSubtask();
		registerSubtaskProgress();
		if (callee._jcoMaySuspend === false) driveDirectCallee();
		else driveJspiCallee();
	} else if (enteredSynchronously === null) {
		registerSubtaskProgress();
		const enterPromise = preparedTask.enter().then((started) => {
			if (started) calleeComponentState.addPendingTaskStart();
			return started;
		});
		const failDeferredStart = (err) => {
			handleCalleeError(err);
			if (!subtask.isResolved()) subtask.reject(err);
		};
		setTimeout(async () => {
			try {
				debugLog("[_asyncStartCall()] continuing started subtask (in JS task)", {
					taskID: preparedTask.id(),
					subtaskID: subtask.id(),
					callerComponentIdx,
					calleeComponentIdx
				});
				const started = await enterPromise;
				if (started) calleeComponentState.removePendingTaskStart();
				if (!started) {
					debugLog("[_asyncStartCall()] task failed early", {
						taskID: preparedTask.id(),
						subtaskID: subtask.id()
					});
					if (preparedTask.isCancelled()) return;
					throw preparedTask.isErrored() ?? /* @__PURE__ */ new Error("task failed to start");
				}
				withCurrentTaskMeta(_context.registers, {
					taskID: preparedTask.id(),
					threadID,
					componentIdx: preparedTask.componentIdx(),
					fn: startSubtask
				});
				if (callee._jcoMaySuspend === false) driveDirectCallee();
				else await driveJspiCallee();
			} catch (err) {
				failDeferredStart(err);
			}
		}, 0);
	}
	const calleeTrap = preparedTask.isErrored() ?? subtask.getParentTask().isErrored();
	if (calleeTrap) throw calleeTrap;
	const subtaskState = subtask.getStateNumber();
	if (subtaskState < 0 || subtaskState > 32) throw new Error("invalid subtask state, out of valid range");
	debugLog("[_asyncStartCall()] returning subtask rep & state", { subtask: {
		rep: subtask.waitableRep(),
		state: subtaskState
	} });
	if (subtask.isReturned()) {
		if (subtask.hasPendingEvent()) subtask.getPendingEvent();
		if (!subtask.resolveDelivered()) subtask.deliverResolve();
		if (subtask.waitableRep() !== null) {
			if (callerComponentState.handles.remove(subtask.waitableRep()) !== subtask) throw new Error("subtask handle cleanup removed unexpected entry");
		}
		subtask.drop();
		return subtaskState;
	}
	return Number(subtask.ensureHandle()) << 4 | subtaskState;
}
async function syncStartCall(_context, args, callee, paramCount) {
	const componentIdx = _context.componentIdxs.at(-1);
	const globalTaskMeta = getCurrentTaskMeta(_context.registers, componentIdx);
	if (!globalTaskMeta) throw new Error("missing global current task meta during sync start call");
	const taskID = globalTaskMeta.taskID;
	const threadID = globalTaskMeta.threadID;
	debugLog("[_syncStartCall()] args", {
		args,
		paramCount,
		componentIdx
	});
	const { getCallbackFn, callbackIdx } = args;
	const preparedTaskMeta = getCurrentTask(_context, componentIdx, taskID);
	if (!preparedTaskMeta) throw new Error("unexpectedly missing current (prepared) task");
	const preparedTask = preparedTaskMeta.task;
	if (!preparedTask) throw new Error("unexpectedly missing current (prepared) task");
	if (!preparedTask.subtaskMeta) throw new Error("missing subtask meta from prepare");
	preparedTask.setCalleeIsAsync(true);
	const { subtask, calleeComponentIdx, callerComponentIdx } = preparedTask.subtaskMeta;
	if (!subtask) throw new Error("missing subtask from prepare during sync start call");
	if (calleeComponentIdx !== preparedTask.componentIdx()) throw new Error(`meta callee idx [${calleeComponentIdx}] != current task idx [${preparedTask.componentIdx()}] during sync start call`);
	const savedCallerTaskMeta = getCurrentTaskMeta(_context.registers, callerComponentIdx);
	try {
		const callbackFn = getCallbackFn();
		preparedTask.setCallbackFn(callbackFn, "callback_" + callbackIdx);
		const params = preparedTask.getCalleeParams();
		const calleeComponentState = getOrCreateAsyncState(_context.lookup, preparedTask.componentIdx());
		const { promise: taskReturnPromise, resolve: resolveTaskReturn, reject: rejectTaskReturn } = promiseWithResolvers();
		preparedTask.registerOnResolveHandler(() => {
			const err = preparedTask.isErrored();
			if (err) rejectTaskReturn(err);
			else resolveTaskReturn();
		});
		subtask.registerOnResolveHandler((res) => {
			debugLog("[_syncStartCall()] handling subtask result", {
				res,
				subtaskID: subtask.id()
			});
			if (!subtask.isReturned()) return;
			const subtaskCallMeta = subtask.getCallMetadata();
			if (subtaskCallMeta?.returnFn && !subtaskCallMeta.returnFnCalled) {
				const callerTask = subtask.getParentTask();
				subtaskCallMeta.returnFnResult = withCurrentTaskMeta(_context.registers, {
					taskID: callerTask.id(),
					threadID: subtaskCallMeta.callerThreadID,
					componentIdx: callerTask.componentIdx(),
					fn: () => subtaskCallMeta.returnFn.apply(null, [subtaskCallMeta.resultPtr])
				});
				subtaskCallMeta.returnFnCalled = true;
			}
		});
		const initialResult = subtask.onStart({ startFnParams: params });
		const startRes = initialResult === void 0 ? [] : Array.isArray(initialResult) ? initialResult : [initialResult];
		if (startRes.length !== paramCount) throw new Error(`unexpected callee param count [${startRes.length}] after start fn, _syncStartCall invocation expected [${paramCount}]`);
		if (!await preparedTask.enter()) {
			if (preparedTask.isCancelled()) return;
			throw new Error("callee task failed to start during sync start call");
		}
		if (preparedTask.needsExclusiveLock()) await calleeComponentState.acquireExclusiveLock(preparedTask.id());
		let jspiCallee;
		if (callee._cachedPromising) jspiCallee = callee._cachedPromising;
		else {
			callee._cachedPromising = _context.platform.promising(callee);
			jspiCallee = callee._cachedPromising;
		}
		const failCalleeLifecycle = (err) => {
			debugLog("[_syncStartCall()] callee lifecycle failed", { err });
			if (preparedTask.needsExclusiveLock()) calleeComponentState.exclusiveRelease(preparedTask.id());
			preparedTask.setErrored(err);
			if (!preparedTask.isResolvedState()) preparedTask.reject(err);
			else {
				calleeComponentState.markTrapped(err);
				const rootTask = preparedTask.getRootTask();
				if (!rootTask.isResolvedState()) {
					rootTask.setErrored(err);
					rootTask.reject(err);
				}
			}
			throw err;
		};
		const calleeLifecyclePromise = (async () => {
			let callbackResult;
			try {
				callbackResult = await withCurrentTaskMetaAsync(_context.registers, {
					taskID: preparedTask.id(),
					threadID,
					componentIdx: preparedTask.componentIdx(),
					fn: () => {
						return jspiCallee.apply(null, startRes);
					}
				});
				preparedTask.endFirstSlice();
				if (!callbackFn) {
					debugLog("[_syncStartCall()] no callback, resolving w/ callee result", {
						taskID: preparedTask.id(),
						componentIdx: preparedTask.componentIdx()
					});
					if (!preparedTask.isResolved()) preparedTask.resolve([callbackResult]);
					preparedTask.exit({ skipExclusiveLockCheck: true });
					return;
				}
				const fnName = callbackFn.fnName ?? "<sync-start subtask " + subtask.id() + ">";
				debugLog("[_syncStartCall()] starting driver loop", {
					fnName,
					componentIdx: preparedTask.componentIdx(),
					subtaskID: subtask.id()
				});
				await driverLoop(_context.driver, {
					componentState: calleeComponentState,
					task: preparedTask,
					fnName,
					isAsync: true,
					callbackResult
				});
				const driverError = preparedTask.isErrored();
				if (driverError) throw driverError;
			} catch (err) {
				failCalleeLifecycle(err);
			}
		})();
		calleeLifecyclePromise.catch(emptyFunc);
		await Promise.race([taskReturnPromise, calleeLifecyclePromise.then(() => taskReturnPromise)]);
		const flatResult = subtask.getCallMetadata()?.returnFnResult;
		debugLog("[_syncStartCall()] returning flat result", {
			flatResult,
			subtaskID: subtask.id(),
			taskID: preparedTask.id()
		});
		return flatResult;
	} finally {
		if (savedCallerTaskMeta) setCurrentTaskMeta(_context.registers, {
			taskID: savedCallerTaskMeta.taskID,
			threadID: savedCallerTaskMeta.threadID,
			componentIdx: callerComponentIdx
		});
	}
}
function storeEventInComponentMemory(args) {
	debugLog("[_storeEventInComponentMemory()] args", args);
	const { memory, ptr, event } = args;
	if (!memory) throw new Error("unexpectedly missing memory");
	if (ptr === void 0 || ptr === null) throw new Error("unexpectedly missing pointer");
	if (!event) throw new Error("event object missing");
	if (event.code === void 0) throw new Error("invalid event object, missing code");
	if (event.payload0 === void 0) throw new Error("invalid event object, missing payload0");
	if (event.payload1 === void 0) throw new Error("invalid event object, missing payload1");
	const dv = new DataView(memory.buffer);
	dv.setUint32(ptr >>> 0, event.payload0, true);
	dv.setUint32((ptr >>> 0) + 4, event.payload1, true);
	return event.code;
}

//#endregion
//#region runtime/intrinsics/waitable.js
/** Fresh class identity per store, with no state or platform capability required. */
function initializeWaitableClass() {
	class Waitable {
		#componentIdx;
		#pendingEventFn = null;
		#promise;
		#resolve;
		#reject;
		#waitableSet = null;
		#hasSyncWaiter = false;
		#idx = null;
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
			if (idx === 0) throw new Error("waitable idx cannot be zero");
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
			return this.#pendingEventFn !== null;
		}
		setPendingEvent(fn) {
			debugLog("[Waitable#setPendingEvent()] args", {
				waitable: this,
				inSet: this.#waitableSet
			});
			this.#pendingEventFn = fn;
		}
		getPendingEvent() {
			debugLog("[Waitable#getPendingEvent()] args", {
				waitable: this,
				inSet: this.#waitableSet,
				hasPendingEvent: this.#pendingEventFn !== null
			});
			if (this.#pendingEventFn === null) return null;
			const eventFn = this.#pendingEventFn;
			this.#pendingEventFn = null;
			const e = eventFn();
			this.#resetPromise();
			return e;
		}
		join(waitableSet) {
			debugLog("[Waitable#join()] args", {
				waitable: this,
				waitableSet,
				isRemoval: waitableSet === null
			});
			if (waitableSet === void 0) throw new TypeError("waitable set must be not be undefined");
			if (this.#waitableSet) this.#waitableSet.removeWaitable(this);
			this.#waitableSet = waitableSet;
			if (waitableSet) waitableSet.addWaitable(this);
		}
		drop() {
			debugLog("[Waitable#drop()] args", {
				componentIdx: this.#componentIdx,
				waitable: this
			});
			this.join(null);
		}
		async waitForPendingEvent(args) {
			const { cstate } = args;
			if (!cstate) throw new TypeError("missing component state");
			if (this.#waitableSet !== null || this.#hasSyncWaiter) throw new Error("waitable is already in a set/has a sync waiter");
			this.#hasSyncWaiter = true;
			try {
				await cstate.waitUntil({
					cancellable: false,
					readyFn: () => this.hasPendingEvent()
				});
			} finally {
				this.#hasSyncWaiter = false;
			}
		}
	}
	return Waitable;
}
/** Only the selected, live cancellation code is captured by this constructor. */
function initializeWaitableSetClass(asyncEventCode) {
	class WaitableSet {
		#componentIdx;
		#waitables = [];
		#waiting = 0;
		target;
		constructor(componentIdx) {
			if (componentIdx === void 0) throw new TypeError("missing/invalid component idx");
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
			this.#waitables = this.#waitables.map((value) => ({
				value,
				sort: Math.random()
			})).sort((a, b) => a.sort - b.sort).map(({ value }) => value);
		}
		removeWaitable(waitable) {
			if (!this.#waitables.find((w) => w === waitable)) return;
			this.#waitables = this.#waitables.filter((w) => w !== waitable);
			return waitable;
		}
		addWaitable(waitable) {
			this.removeWaitable(waitable);
			this.#waitables.push(waitable);
		}
		hasPendingEvent() {
			debugLog("[WaitableSet#hasPendingEvent()] args", {
				componentIdx: this.#componentIdx,
				waitableSet: this,
				waitableSetTargets: this.targets()
			});
			return this.#waitables.some((waitable) => waitable.hasPendingEvent());
		}
		getPendingEvent() {
			debugLog("[WaitableSet#getPendingEvent()] args", {
				componentIdx: this.#componentIdx,
				waitableSet: this
			});
			for (const waitable of this.#waitables) {
				if (!waitable.hasPendingEvent()) continue;
				const event = waitable.getPendingEvent();
				debugLog("[WaitableSet#getPendingEvent()] found pending event", {
					waitable,
					event
				});
				return event;
			}
			throw new Error("no waitables had a pending event");
		}
		/** Read the pending event or construct a fresh cancellation event after a wait. */
		#eventAfterWait(keepGoing) {
			return keepGoing ? this.getPendingEvent() : {
				code: asyncEventCode.TASK_CANCELLED,
				payload0: 0,
				payload1: 0
			};
		}
		tryWait(opts) {
			debugLog("[WaitableSet#tryWait()] args", { opts });
			const { readyFn, task, cancellable } = opts;
			if (task.deliverPendingCancel({ cancellable })) return this.#eventAfterWait(false);
			const hasPendingEvent = this.hasPendingEvent();
			if (readyFn() && hasPendingEvent) return this.getPendingEvent();
			return null;
		}
		waitUntil(opts) {
			debugLog("[WaitableSet#waitUntil()] args", { opts });
			const event = this.tryWait(opts);
			if (event !== null) return event;
			const { readyFn, task, cancellable } = opts;
			const isReady = () => readyFn() && this.hasPendingEvent();
			this.incrementNumWaiting();
			return task.suspendUntil({
				readyFn: isReady,
				cancellable
			}).then((keepGoing) => {
				if (!keepGoing && task.isErrored()) {
					this.decrementNumWaiting();
					throw task.isErrored();
				}
				const readyEvent = this.#eventAfterWait(keepGoing);
				this.decrementNumWaiting();
				return readyEvent;
			}, (err) => {
				this.decrementNumWaiting();
				throw err;
			});
		}
		waitUntilCallback(opts, onEvent) {
			debugLog("[WaitableSet#waitUntilCallback()] args", { opts });
			const event = this.tryWait(opts);
			if (event !== null) {
				onEvent(event);
				return;
			}
			const { readyFn, task, cancellable } = opts;
			this.incrementNumWaiting();
			task.suspendUntilCallback({
				readyFn: () => readyFn() && this.hasPendingEvent(),
				cancellable
			}, (keepGoing) => {
				const resumedEvent = this.#eventAfterWait(keepGoing);
				this.decrementNumWaiting();
				onEvent(resumedEvent);
			});
		}
	}
	return WaitableSet;
}
/** Implements `canon waitable-set.new`. */
function waitableSetNew(context, componentIdx) {
	const { WaitableSet } = context;
	debugLog("[waitableSetNew()] args", { componentIdx });
	const state = getOrCreateAsyncState(context.lookup, componentIdx);
	if (!state) throw new Error(`missing async state for component idx [${componentIdx}]`);
	const wset = new WaitableSet(componentIdx);
	const rep = state.handles.insert(wset);
	if (typeof rep !== "number") throw new Error(`invalid/missing waitable set rep [${rep}]`);
	debugLog("[waitableSetNew()] created waitable set", {
		componentIdx,
		rep
	});
	return rep;
}
/** Implements `canon waitable-set.wait`. */
function waitableSetWait(context, ctx, waitableSetRep, resultPtr, syncOnly = false) {
	const { RuntimeError, WaitableSet } = context;
	debugLog("[waitableSetWait()] args", {
		ctx,
		waitableSetRep,
		resultPtr
	});
	const { componentIdx, memoryIdx, getMemoryFn } = ctx;
	const taskMeta = getCurrentTask(context.taskLookup, componentIdx);
	if (!taskMeta) throw Error("invalid/missing async task meta");
	const task = taskMeta.task;
	if (!task) throw Error("invalid/missing async task");
	if (task.componentIdx() !== componentIdx) throw Error(`task component [${task.componentIdx()}] !== executing component [${componentIdx}]`);
	const memory = getMemoryFn();
	const wset = getOrCreateAsyncState(context.lookup, componentIdx).handles.get(waitableSetRep);
	if (!(wset instanceof WaitableSet)) throw new RuntimeError(`non-waitable set returned from component state handles @ [${waitableSetRep}]`);
	const storeEvent = (event) => {
		return storeEventInComponentMemory({
			memory,
			ptr: resultPtr,
			event,
			componentIdx,
			task,
			memoryIdx
		});
	};
	const waitOpts = {
		readyFn: () => true,
		task,
		cancellable: false
	};
	const event = syncOnly ? wset.tryWait(waitOpts) : wset.waitUntil(waitOpts);
	if (event === null) return -1;
	if (isThenable(event)) return event.then(storeEvent);
	return storeEvent(event);
}
/** Implements `canon waitable-set.poll`. */
function waitableSetPoll(context, ctx, waitableSetRep, resultPtr) {
	const { RuntimeError, WaitableSet, events: asyncEventCode } = context;
	const { componentIdx, memoryIdx, getMemoryFn } = ctx;
	debugLog("[waitableSetPoll()] args", {
		componentIdx,
		memoryIdx,
		waitableSetRep,
		resultPtr
	});
	const taskMeta = getCurrentTask(context.taskLookup, componentIdx);
	if (!taskMeta) throw Error("invalid/missing current task meta");
	if (taskMeta.componentIdx !== componentIdx) throw Error("task component idx [" + taskMeta.componentIdx + "] != component instance ID [" + componentIdx + "]");
	const task = taskMeta.task;
	if (!task) throw Error("invalid/missing async task in task meta");
	if (task.componentIdx() !== componentIdx) throw Error(`task component idx [${task.componentIdx()}] does not match generated [${componentIdx}]`);
	const cstate = getOrCreateAsyncState(context.lookup, task.componentIdx());
	const wset = waitableSetRep === 0 ? void 0 : cstate.handles.get(waitableSetRep);
	if (!(wset instanceof WaitableSet)) throw new RuntimeError(`unknown handle index ${waitableSetRep}`);
	let event;
	if (!wset.hasPendingEvent()) {
		debugLog("[waitableSetPoll()] no pending event", {
			componentIdx,
			waitableSetRep
		});
		event = {
			code: asyncEventCode.NONE,
			payload0: 0,
			payload1: 0
		};
	} else {
		debugLog("[waitableSetPoll()] retrieving waiting pending event", {
			componentIdx,
			waitableSetRep
		});
		event = wset.getPendingEvent();
	}
	const options = {
		event,
		ptr: resultPtr,
		memory: getMemoryFn(),
		componentIdx,
		task,
		memoryIdx
	};
	return storeEventInComponentMemory(options);
}
/** Implements `canon waitable-set.drop`. */
function waitableSetDrop(context, componentIdx, waitableSetRep) {
	debugLog("[waitableSetDrop()] args", {
		componentIdx,
		waitableSetRep
	});
	const task = getCurrentTask(context.taskLookup, componentIdx);
	if (!task) throw new Error("invalid/missing async task");
	if (task.componentIdx !== componentIdx) throw Error("task component idx [" + task.componentIdx + "] != component instance ID [" + componentIdx + "]");
	const state = getOrCreateAsyncState(context.lookup, componentIdx);
	if (!state.mayLeave) throw new Error("component instance is not marked as may leave, cannot be cancelled");
	removeWaitableSet(context, {
		state,
		waitableSetRep
	});
}
function removeWaitableSet(context, args) {
	const { RuntimeError, WaitableSet } = context;
	debugLog("[_removeWaitableSet()] args", args);
	const { state, waitableSetRep } = args;
	if (!state) throw new TypeError("missing component state");
	const ws = state.handles.get(waitableSetRep);
	if (!(ws instanceof WaitableSet)) throw new RuntimeError("cannot remove waitable set: no set present with rep [" + waitableSetRep + "]");
	if (ws.hasPendingEvent()) throw new RuntimeError("waitable set cannot be removed with pending items remaining");
	if (ws.numWaitables() > 0) throw new RuntimeError("waitable set still contains waitables");
	if (ws.numWaiting() > 0) throw new RuntimeError("cannot drop waitable set with waiters");
	state.handles.remove(waitableSetRep);
}
/** Implements `canon waitable.join`. */
function waitableJoin(context, componentIdx, waitableRep, waitableSetRep) {
	const { RuntimeError, Waitable, WaitableSet } = context;
	debugLog("[waitableJoin()] args", {
		componentIdx,
		waitableSetRep,
		isRemoval: waitableSetRep === 0,
		waitableRep
	});
	const state = getOrCreateAsyncState(context.lookup, componentIdx);
	if (!state) throw new Error(`invalid/missing async state for component instance [${componentIdx}]`);
	if (!state.mayLeave) throw new RuntimeError("component instance is not marked as may leave, cannot join waitable");
	const waitableObj = state.handles.get(waitableRep);
	if (!waitableObj) throw new RuntimeError(`missing waitable obj (rep [${waitableRep}]), component idx [${componentIdx}])`);
	const waitable = waitableObj.getWaitable ? waitableObj.getWaitable() : waitableObj;
	if (!(waitable instanceof Waitable)) throw new RuntimeError("handle does not name a waitable");
	const waitableSet = waitableSetRep === 0 ? null : state.handles.get(waitableSetRep);
	if (waitableSetRep !== 0 && !(waitableSet instanceof WaitableSet)) throw new RuntimeError(`missing waitable set [${waitableSetRep}] in component idx [${componentIdx}]`);
	waitable.join(waitableSet ?? null);
}

//#endregion
//#region runtime/intrinsics/error-context.js
function initializeGlobalErrorContextTableClass(RepTable) {
	class GlobalErrorContextTable {
		static data = null;
		static get() {
			if (GlobalErrorContextTable.data === null) GlobalErrorContextTable.data = new RepTable({ target: "global error context table" });
			return GlobalErrorContextTable.data;
		}
	}
	return GlobalErrorContextTable;
}
const initializeErrorContextTableRegistrations = () => ({});
const initializeLocalErrorContextTables = () => /* @__PURE__ */ new Map();
/** Implements `canon error-context.new`. */
function errCtxNew(context, args, msgPtr, msgLen) {
	const { globalTable: GlobalErrorContextTable } = context;
	debugLog("[errCtxNew()] args", {
		args,
		msgPtr,
		msgLen
	});
	const { componentIdx, localTableIdx, readStrFn } = args;
	const localTable = errCtxGetLocalTable(context.local, componentIdx, localTableIdx);
	const { globalRep, errCtx: globalErrCtx } = errCtxReserveGlobalRep(GlobalErrorContextTable, readStrFn(msgPtr, msgLen), 0);
	const { waitableIdx, localIdx } = errCtxCreateLocalHandle(context, componentIdx, localTable, globalRep);
	globalErrCtx.localIdx = localIdx;
	globalErrCtx.waitableIdx = waitableIdx;
	globalErrCtx.componentIdx = componentIdx;
	globalErrCtx.localTableIdx = localTableIdx;
	return waitableIdx;
}
/** Implements `canon error-context.debug-message`. */
function errCtxDebugMessage(context, ctx, handle, outputStrPtr) {
	const { globalTable: GlobalErrorContextTable, RuntimeError } = context;
	debugLog("[errCtxDebugMessage()] ctx", {
		ctx,
		handle,
		outputStrPtr
	});
	const { componentIdx, writeStrFn } = ctx;
	const globalTable = GlobalErrorContextTable.get();
	const errCtx = getOrCreateAsyncState(context.lookup, componentIdx).handles.get(handle);
	if (!errCtx || errCtx.globalRep === void 0) throw new RuntimeError(`missing error context (handle [${handle}]) in component idx [${componentIdx}] during debug msg`);
	const msg = globalTable.get(errCtx.globalRep).debugMessage;
	writeStrFn(msg, outputStrPtr);
}
/** Implements `canon error-context.drop`. */
function errCtxDrop(context, ctx, handle) {
	const { globalTable: GlobalErrorContextTable, RuntimeError } = context;
	debugLog("[errCtxDrop()] ctx", {
		ctx,
		handle
	});
	const { componentIdx, localTableIdx } = ctx;
	const globalTable = GlobalErrorContextTable.get();
	const cstate = getOrCreateAsyncState(context.lookup, componentIdx);
	const errCtx = cstate.handles.get(handle);
	if (!errCtx || errCtx.globalRep === void 0) throw new RuntimeError(`missing error context (handle [${handle}]) in component idx [${componentIdx}] during drop`);
	const localErrCtxTable = errCtxGetLocalTable(context.local, componentIdx, localTableIdx);
	if (!localErrCtxTable.get(errCtx.localIdx)) throw new RuntimeError(`missing error-context with handle [${handle}] in component [${componentIdx}] during drop`);
	errCtx.refCount -= 1;
	if (errCtx.refCount <= 0) {
		localErrCtxTable.remove(errCtx.localIdx);
		cstate.handles.remove(handle);
	}
	if (errCtxGlobalRefCountAdd(GlobalErrorContextTable, errCtx.globalRep, -1) === 0) {
		if (errCtx.refCount !== 0) throw new Error("local refCount exceeds global during removal");
		globalTable.remove(errCtx.globalRep);
	}
}
function errCtxTransfer(context, waitableIdx, srcTableIdx, destTableIdx) {
	const { tables } = context;
	debugLog("[errCtxTransfer()] args", {
		waitableIdx,
		srcTableIdx,
		destTableIdx
	});
	const { componentIdx: srcComponentIdx } = tables[srcTableIdx];
	const { componentIdx: destComponentIdx } = tables[destTableIdx];
	errCtxGetLocalTable(context.local, srcComponentIdx, srcTableIdx);
	const toTbl = errCtxGetLocalTable(context.local, destComponentIdx, destTableIdx, { upsert: true });
	const errCtx = getOrCreateAsyncState(context.lookup, srcComponentIdx).handles.get(waitableIdx);
	if (!errCtx) throw new Error(`missing error context (waitable idx [${waitableIdx}])`);
	if (!errCtx.localIdx) throw new Error("unexpectedly missing local idx from error context object");
	if (!errCtx.globalRep) throw new Error("unexpectedly missing globalRep from error context object");
	errCtx.refCount -= 1;
	const { waitableIdx: newWaitableIdx, localIdx } = errCtxCreateLocalHandle(context, destComponentIdx, toTbl, errCtx.globalRep);
	debugLog("[errCtxTransfer()] successfully transferred", {
		dest: {
			errCtxHandle: localIdx,
			errCtxWaitableIdx: newWaitableIdx,
			tableIdx: destTableIdx,
			componentIdx: destComponentIdx
		},
		src: {
			errCtxWaitableIdx: waitableIdx,
			tableIdx: srcTableIdx,
			componentIdx: srcComponentIdx
		}
	});
	return newWaitableIdx;
}
function errCtxGlobalRefCountAdd(GlobalErrorContextTable, globalRep, amount) {
	const errCtx = GlobalErrorContextTable.get().get(globalRep);
	if (!errCtx) throw new Error(`missing global error-context [${globalRep}] while incrementing refcount`);
	return errCtx.refCount += amount ?? 1;
}
function errCtxGetLocalTable(context, componentIdx, tableIdx, opts) {
	const { localTables, RepTable } = context;
	let tables = localTables.get(componentIdx);
	if (!tables) {
		if (opts?.upsert) {
			tables = /* @__PURE__ */ new Map();
			localTables.set(componentIdx, tables);
		} else throw new Error(`missing local error context table for component [${componentIdx}] while getting local table`);
	}
	let errCtxTable = tables.get(tableIdx);
	if (!errCtxTable) {
		if (opts?.upsert) {
			errCtxTable = new RepTable({ target: `component [${componentIdx}] error contexts` });
			tables.set(tableIdx, errCtxTable);
		} else throw new Error(`missing table [${tableIdx}] in tables for component [${componentIdx}] while getting local table`);
	}
	return errCtxTable;
}
function errCtxCreateLocalHandle(context, componentIdx, componentLocalTable, globalRep) {
	const { globalTable: GlobalErrorContextTable } = context;
	const globalTable = GlobalErrorContextTable.get();
	if (!globalTable.contains(globalRep)) throw new Error(`missing global error-context [${globalRep}] during local handle create`);
	const cstate = getOrCreateAsyncState(context.lookup, componentIdx);
	const newErrCtx = {
		globalRep,
		refCount: 1
	};
	const waitableIdx = cstate.handles.insert(newErrCtx);
	const localIdx = componentLocalTable.insert(waitableIdx);
	newErrCtx.localIdx = localIdx;
	globalTable.get(globalRep).refCount += 1;
	return {
		waitableIdx,
		localIdx
	};
}
function errCtxReserveGlobalRep(GlobalErrorContextTable, debugMessage, refCount) {
	const globalTable = GlobalErrorContextTable.get();
	const errCtx = {
		refCount,
		debugMessage
	};
	return {
		globalRep: globalTable.insert(errCtx),
		errCtx
	};
}

//#endregion
//#region runtime/intrinsics/async-task/constants.js
const asyncBlockedCode = 4294967295;

//#endregion
//#region runtime/intrinsics/async-task/initializers.js
const initializeTasksByComponent = () => /* @__PURE__ */ new Map();
const initializeCurrentTaskIds = () => [];
const initializeCurrentComponentIdxs = () => [];
const initializeSymmetricSyncGuestCallStack = () => [];
const initializeCurrentTaskMayBlock = (platform) => {
	if (platform === false) return false;
	const Global = platform.Global;
	if (!Global) throw new TypeError("async task registers require WebAssembly.Global");
	return new Global({
		value: "i32",
		mutable: true
	}, 0);
};
const initializeAsyncBlockingCallDepth = (platform) => {
	if (platform === false) return { value: 0 };
	const Global = platform.Global;
	if (!Global) throw new TypeError("async task registers require WebAssembly.Global");
	return new Global({
		value: "i32",
		mutable: true
	}, 0);
};
function initializeThreadStartChecks(platform) {
	return {
		platform,
		checked: /* @__PURE__ */ new WeakSet(),
		typeCheck: new platform.Module(new Uint8Array([
			0,
			97,
			115,
			109,
			1,
			0,
			0,
			0,
			1,
			5,
			1,
			96,
			1,
			127,
			0,
			2,
			6,
			1,
			0,
			1,
			102,
			0,
			0
		]))
	};
}

//#endregion
//#region runtime/intrinsics/async-task/async-task.js
const TASK_INITIAL = "initial";
const TASK_CANCELLED = "cancelled";
const TASK_CANCEL_PENDING = "cancel-pending";
const TASK_CANCEL_DELIVERED = "cancel-delivered";
const TASK_RESOLVED = "resolved";
function initializeAsyncTaskClass(context) {
	const { lookup: _lookup, registers: _registers, clearing: _clearing, RuntimeError: _RuntimeError, AsyncSubtask: _Subtask, Waitable: _Waitable, events: _events, determinism: _determinism, FutureValue, scopeCounter: _scopeCounter, scopeTasks: _scopeTasks, storeTrap: _storeTrap } = context;
	class AsyncTask {
		static _ID = 0n;
		static #hostThreadID = 0;
		static State = {
			INITIAL: TASK_INITIAL,
			CANCELLED: TASK_CANCELLED,
			CANCEL_PENDING: TASK_CANCEL_PENDING,
			CANCEL_DELIVERED: TASK_CANCEL_DELIVERED,
			RESOLVED: TASK_RESOLVED
		};
		static BlockResult = {
			CANCELLED: "block.cancelled",
			NOT_CANCELLED: "block.not-cancelled"
		};
		#id;
		#componentIdx;
		#state;
		#isAsync;
		#isManualAsync;
		#callingWasmExport = true;
		#lockFreeEntry = false;
		#preserveFutureResult;
		#entryFnName;
		#onResolveHandlers = [];
		#progressWaiters = [];
		#completionPromise;
		#completionValue;
		#completionReady = false;
		#settleCompletionPromise;
		#rejected = false;
		#exitPromise;
		#resolveExitPromise;
		#memoryIdx = null;
		#memory = null;
		#callbackFn = null;
		#callbackFnName = null;
		#postReturnFn = null;
		#getCalleeParamsFn = null;
		#calleeIsAsync = null;
		#admissionTicket = null;
		#funcTypeIsAsync = false;
		#returnResultTypeIdx = null;
		#parentSubtask = null;
		#errHandling;
		#returnLowerFns = null;
		#resourceScopeId;
		#resourceBorrowCount = 0;
		#resourceLenders = [];
		#resourceScopeExited = false;
		#subtasks = [];
		#threads = [];
		#entered = false;
		#exited = false;
		#errored = null;
		get storage() {
			return this.defaultThread().storage;
		}
		cancelled = false;
		cancelRequested = false;
		alwaysTaskReturn = false;
		returnCalls = 0;
		tmpRetI64HighBits = 0;
		constructor(opts) {
			this.#id = ++AsyncTask._ID;
			this.#resourceScopeId = ++_scopeCounter.value;
			_scopeTasks.set(this.#resourceScopeId, this);
			if (opts?.componentIdx === void 0) throw new TypeError("missing component id during task creation");
			this.#componentIdx = opts.componentIdx;
			this.#state = TASK_INITIAL;
			this.#isAsync = opts.isAsync ?? false;
			this.#isManualAsync = opts.isManualAsync ?? false;
			this.#preserveFutureResult = opts.preserveFutureResult ?? false;
			this.#entryFnName = opts.entryFnName;
			this.#callingWasmExport = opts.callingWasmExport !== false;
			const { promise: completionPromise, resolve: resolveCompletionPromise, reject: rejectCompletionPromise } = promiseWithResolvers();
			this.#completionPromise = completionPromise;
			completionPromise.then(emptyFunc, emptyFunc);
			let completionSettled = false;
			const settleCompletionPromise = () => {
				if (completionSettled || !this.#completionReady) return;
				completionSettled = true;
				if (this.#errored !== null) rejectCompletionPromise(this.#errored);
				else if (this.#rejected) rejectCompletionPromise(this.#completionValue);
				else if (this.#preserveFutureResult && this.#completionValue instanceof FutureValue) this.#completionValue.resolveAsValue(resolveCompletionPromise);
				else resolveCompletionPromise(this.#completionValue);
			};
			this.#settleCompletionPromise = settleCompletionPromise;
			this.#onResolveHandlers.push((results) => {
				if (this.#parentSubtask !== null) return;
				if (!this.#isAsync && !this.#isManualAsync) return;
				this.#completionValue = results;
				this.#completionReady = true;
			});
			const { promise: exitPromise, resolve: resolveExitPromise } = promiseWithResolvers();
			this.#exitPromise = exitPromise;
			this.#resolveExitPromise = resolveExitPromise;
			if (opts.callbackFn) this.#callbackFn = opts.callbackFn;
			if (opts.callbackFnName) this.#callbackFnName = opts.callbackFnName;
			if (opts.getCalleeParamsFn) this.#getCalleeParamsFn = opts.getCalleeParamsFn;
			if (opts.parentSubtask) this.#parentSubtask = opts.parentSubtask;
			if (opts.errHandling) this.#errHandling = opts.errHandling;
		}
		taskState() {
			return this.#state;
		}
		id() {
			return this.#id;
		}
		componentIdx() {
			return this.#componentIdx;
		}
		entryFnName() {
			return this.#entryFnName;
		}
		resourceScopeId() {
			return this.#resourceScopeId;
		}
		addBorrowedHandle() {
			if (this.#resourceScopeExited) throw new Error("cannot add a borrow to an exited resource scope");
			this.#resourceBorrowCount++;
		}
		removeBorrowedHandle() {
			if (this.#resourceBorrowCount === 0) throw new Error("resource borrow count underflow");
			this.#resourceBorrowCount--;
		}
		addResourceLender(table, handle) {
			if (this.#resourceScopeExited) throw new Error("cannot add a lender to an exited resource scope");
			this.#resourceLenders.push({
				table,
				handle
			});
		}
		validateResourceBorrowScope() {
			if (this.#resourceScopeExited) return;
			if (_storeTrap.stopped) {
				this.#resourceLenders = [];
				this.#resourceScopeExited = true;
				_scopeTasks.delete(this.#resourceScopeId);
				return;
			}
			if (this.#resourceBorrowCount !== 0) throw new _RuntimeError("borrow handles still remain at the end of the call");
			for (const { table, handle } of this.#resourceLenders) {
				const idx = handle << 1;
				const lendCount = table[idx];
				if (!Number.isInteger(lendCount) || lendCount <= 0 || lendCount >= 2 ** 30) throw new Error("invalid resource lender state at scope exit");
				table[idx] = lendCount - 1;
			}
			this.#resourceLenders = [];
			this.#resourceScopeExited = true;
			_scopeTasks.delete(this.#resourceScopeId);
		}
		completionPromise() {
			return this.#completionPromise;
		}
		settleCompletion() {
			this.#settleCompletionPromise();
		}
		exitPromise() {
			return this.#exitPromise;
		}
		waitForProgress() {
			const { promise, resolve } = promiseWithResolvers();
			this.#progressWaiters.push(resolve);
			return promise;
		}
		notifyProgress() {
			const waiters = this.#progressWaiters;
			this.#progressWaiters = [];
			for (const resolve of waiters) resolve();
		}
		isAsync() {
			return this.#isAsync;
		}
		isManualAsync() {
			return this.#isManualAsync;
		}
		isSync() {
			return !this.isAsync();
		}
		getErrHandling() {
			return this.#errHandling;
		}
		hasCallback() {
			return this.#callbackFn !== null;
		}
		getReturnMemoryIdx() {
			return this.#memoryIdx;
		}
		setReturnMemoryIdx(idx) {
			if (idx === null) return;
			this.#memoryIdx = idx;
		}
		getReturnMemory() {
			return this.#memory;
		}
		setReturnMemory(m) {
			if (m === null) return;
			this.#memory = m;
		}
		setReturnLowerFns(fns) {
			this.#returnLowerFns = fns;
		}
		getReturnLowerFns() {
			return this.#returnLowerFns;
		}
		setCalleeIsAsync(value) {
			if (typeof value !== "boolean") throw new TypeError("callee async state must be a boolean");
			this.#calleeIsAsync = value;
		}
		setParentSubtask(subtask) {
			if (!subtask || !(subtask instanceof _Subtask)) return;
			if (this.#parentSubtask) throw new Error("parent subtask can only be set once");
			this.#parentSubtask = subtask;
		}
		getParentSubtask() {
			return this.#parentSubtask;
		}
		getRootTask() {
			let currentSubtask = this.getParentSubtask();
			let task = this;
			while (currentSubtask) {
				task = currentSubtask.getParentTask();
				currentSubtask = task.getParentSubtask();
			}
			return task;
		}
		setPostReturnFn(f) {
			if (!f) return;
			if (this.#postReturnFn) throw new Error("postReturn fn can only be set once");
			this.#postReturnFn = f;
		}
		setCallbackFn(f, name) {
			if (!f) return;
			if (this.#callbackFn) throw new Error("callback fn can only be set once");
			this.#callbackFn = f;
			this.#callbackFnName = name;
		}
		getCallbackFnName() {
			if (!this.#callbackFnName) return;
			return this.#callbackFnName;
		}
		runCallbackFn(...args) {
			if (!this.#callbackFn) throw new Error("no callback function has been set for task");
			if (this.#callbackFn._jcoMaySuspend === false) return withCurrentTaskMeta(_registers, {
				taskID: this.#id,
				threadID: this.defaultThread().id(),
				componentIdx: this.#componentIdx,
				fn: () => this.#callbackFn.apply(null, args)
			});
			return withCurrentTaskMetaAsync(_registers, {
				taskID: this.#id,
				threadID: this.defaultThread().id(),
				componentIdx: this.#componentIdx,
				fn: () => {
					return this.#callbackFn.apply(null, args);
				}
			});
		}
		getCalleeParams() {
			if (!this.#getCalleeParamsFn) throw new Error("missing/invalid getCalleeParamsFn");
			return this.#getCalleeParamsFn();
		}
		mayBlock() {
			return this.isAsync() || this.isManualAsync() || this.isResolvedState() || this.#funcTypeIsAsync;
		}
		setFuncTypeIsAsync(v) {
			this.#funcTypeIsAsync = v;
		}
		setReturnResultTypeIdx(v) {
			this.#returnResultTypeIdx = v;
		}
		returnResultTypeIdx() {
			return this.#returnResultTypeIdx;
		}
		mayEnter(task) {
			const cstate = getOrCreateAsyncState(_lookup, this.#componentIdx);
			if (cstate.hasBackpressure()) {
				debugLog("[AsyncTask#mayEnter()] disallowed due to backpressure", { taskID: this.#id });
				return false;
			}
			if (!cstate.callingSyncImport()) {
				debugLog("[AsyncTask#mayEnter()] disallowed due to sync import call", { taskID: this.#id });
				return false;
			}
			if (!(Reflect.get(cstate, "callingSyncExport") && !task.isAsync)) {
				debugLog("[AsyncTask#mayEnter()] disallowed due to sync export w/ sync pending", { taskID: this.#id });
				return false;
			}
			return true;
		}
		enterSync() {
			if (this.needsExclusiveLock()) {
				const cstate = getOrCreateAsyncState(_lookup, this.#componentIdx);
				if (!cstate.isExclusivelyLocked()) cstate.exclusiveLock(this.#id);
				else {
					this.#lockFreeEntry = true;
					debugLog("[AsyncTask#enterSync()] entering without exclusive lock", {
						taskID: this.#id,
						componentIdx: this.#componentIdx
					});
				}
			}
			return true;
		}
		tryEnter() {
			if (this.#entered) throw new Error(`task with ID [${this.#id}] should not be entered twice`);
			if (this.deliverPendingCancel({ cancellable: true })) {
				this.cancel();
				return false;
			}
			const cstate = getOrCreateAsyncState(_lookup, this.#componentIdx);
			if (this.isSync()) {
				this.#entered = true;
				return true;
			}
			if (cstate.hasBackpressure()) return null;
			if (cstate.hasPendingAdmissions()) return null;
			if (this.needsExclusiveLock()) {
				if (cstate.isExclusivelyLocked()) return null;
				cstate.exclusiveLock(this.#id);
			}
			if (this.deliverPendingCancel({ cancellable: true })) {
				cstate.exclusiveRelease(this.#id);
				this.cancel();
				return false;
			}
			this.#entered = true;
			return true;
		}
		async enter(opts) {
			debugLog("[AsyncTask#enter()] args", {
				taskID: this.#id,
				componentIdx: this.#componentIdx,
				subtaskID: this.getParentSubtask()?.id(),
				args: opts,
				entryFnName: this.#entryFnName
			});
			if (opts?.isHost) return this.enterHost();
			if (this.#entered) throw new Error(`task with ID [${this.#id}] should not be entered twice`);
			if (this.deliverPendingCancel({ cancellable: true })) {
				this.cancel();
				return false;
			}
			const cstate = getOrCreateAsyncState(_lookup, this.#componentIdx);
			if (this.isSync()) {
				this.#entered = true;
				if (this.#isManualAsync) {
					if (this.needsExclusiveLock()) await cstate.acquireExclusiveLock(this.#id);
				}
				return this.#entered;
			}
			const ticket = cstate.takeAdmissionTicket(this.#id);
			this.#admissionTicket = ticket;
			let entered = false;
			try {
				entered = await this.#enterQueued(cstate, ticket);
				return entered;
			} finally {
				if (!entered) this.endFirstSlice();
			}
		}
		endFirstSlice() {
			const ticket = this.#admissionTicket;
			if (ticket === null) return;
			this.#admissionTicket = null;
			getOrCreateAsyncState(_lookup, this.#componentIdx).releaseAdmissionTicket(ticket);
		}
		async #enterQueued(cstate, ticket) {
			await cstate.waitForAdmissionTurn(ticket);
			if (this.isResolvedState() || this.isCancelled()) return false;
			while (true) {
				if (cstate.hasBackpressure()) {
					cstate.addBackpressureWaiter();
					const result = await this.waitUntil({
						readyFn: () => {
							return !cstate.hasBackpressure();
						},
						cancellable: true
					});
					cstate.removeBackpressureWaiter();
					if (!result || this.isCancelled()) {
						if (!this.isResolvedState()) this.cancel();
						return false;
					}
				}
				if (this.needsExclusiveLock()) {
					await cstate.acquireExclusiveLock(this.#id);
					if (cstate.hasBackpressure()) {
						cstate.exclusiveRelease(this.#id);
						continue;
					}
				}
				break;
			}
			try {
				cstate.throwIfInterrupted();
			} catch (err) {
				cstate.exclusiveRelease(this.#id);
				this.setErrored(err);
				return false;
			}
			if (this.isResolvedState() || this.isCancelled()) {
				cstate.exclusiveRelease(this.#id);
				return false;
			}
			if (this.deliverPendingCancel({ cancellable: true })) {
				cstate.exclusiveRelease(this.#id);
				this.cancel();
				return false;
			}
			this.#entered = true;
			return this.#entered;
		}
		isRunningState() {
			return this.#state !== TASK_RESOLVED;
		}
		isResolvedState() {
			return this.#state === TASK_RESOLVED;
		}
		isResolved() {
			return this.#state === TASK_RESOLVED;
		}
		isExited() {
			return this.#exited;
		}
		async waitUntil(opts) {
			const { readyFn, cancellable } = opts;
			debugLog("[AsyncTask#waitUntil()] args", {
				taskID: this.#id,
				args: { cancellable }
			});
			return await this.suspendUntil({
				readyFn,
				cancellable
			});
		}
		async yieldUntil(opts) {
			const { readyFn, cancellable } = opts;
			debugLog("[AsyncTask#yieldUntil()]", {
				taskID: this.#id,
				args: { cancellable },
				componentIdx: this.#componentIdx
			});
			return {
				code: await this.immediateSuspend({
					readyFn,
					cancellable
				}) ? _events.NONE : _events.TASK_CANCELLED,
				payload0: 0,
				payload1: 0
			};
		}
		async suspendUntil(opts) {
			const { cancellable, readyFn } = opts;
			debugLog("[AsyncTask#suspendUntil()] args", {
				taskID: this.#id,
				args: { cancellable },
				componentIdx: this.#componentIdx
			});
			if (this.deliverPendingCancel({ cancellable })) return false;
			return await this.immediateSuspendUntil({
				readyFn,
				cancellable
			});
		}
		suspendUntilCallback(opts, onResume) {
			const { cancellable, readyFn } = opts;
			if (this.deliverPendingCancel({ cancellable })) {
				onResume(false);
				return;
			}
			getOrCreateAsyncState(_lookup, this.#componentIdx).suspendTask({
				task: this,
				cancellable: !!cancellable,
				readyFn: () => {
					if (cancellable && this.#state === TASK_CANCEL_PENDING) return true;
					return readyFn();
				},
				onResume: (keepGoing) => {
					if (keepGoing && this.deliverPendingCancel({ cancellable })) keepGoing = false;
					onResume(keepGoing);
				}
			});
		}
		async immediateSuspendUntil(opts) {
			const { cancellable, readyFn } = opts;
			debugLog("[AsyncTask#immediateSuspendUntil()] args", {
				args: {
					cancellable,
					readyFn
				},
				taskID: this.#id,
				componentIdx: this.#componentIdx
			});
			if (readyFn() && _determinism === "random") {
				if (coinFlip()) return true;
			}
			return await this.immediateSuspend({
				cancellable,
				readyFn
			});
		}
		async immediateSuspend(opts) {
			const cstate = getOrCreateAsyncState(_lookup, this.#componentIdx);
			const thread = this.#entered ? cstate.threads.get(getCurrentTaskMeta(_registers, this.#componentIdx).threadID) : this.defaultThread();
			if (!thread || thread.task() !== this) throw new Error("invalid current thread for wait");
			return thread.suspend({
				...opts,
				releaseLock: false
			});
		}
		deliverPendingCancel(opts) {
			const { cancellable } = opts;
			debugLog("[AsyncTask#deliverPendingCancel()]", {
				args: { cancellable },
				taskID: this.#id,
				componentIdx: this.#componentIdx
			});
			if (cancellable && this.#state === TASK_CANCEL_PENDING) {
				this.#state = TASK_CANCEL_DELIVERED;
				return true;
			}
			return false;
		}
		isCancelled() {
			return this.cancelled;
		}
		cancellationRequested() {
			return this.cancelRequested;
		}
		requestCancellation() {
			debugLog("[AsyncTask#requestCancellation()] args", {
				taskID: this.#id,
				componentIdx: this.#componentIdx,
				state: this.#state
			});
			if (this.isResolvedState() || this.cancelRequested) return;
			this.cancelRequested = true;
			if (this.#state === TASK_INITIAL) {
				this.#state = TASK_CANCEL_PENDING;
				if (!this.#entered) {
					this.deliverPendingCancel({ cancellable: true });
					this.cancel();
					const cstate = getOrCreateAsyncState(_lookup, this.#componentIdx);
					cstate.resumeTaskByID(this.#id);
					cstate.cancelExclusiveLockWaiter(this.#id);
					this.exit({ skipExclusiveLockCheck: true });
					return;
				}
			}
			getOrCreateAsyncState(_lookup, this.#componentIdx).runTickLoop();
		}
		cancel(args) {
			debugLog("[AsyncTask#cancel()] args", {});
			if (this.taskState() !== TASK_CANCEL_DELIVERED) throw new Error("`task.cancel` called by task which has not been cancelled");
			this.validateResourceBorrowScope();
			this.cancelled = true;
			this.onResolve(args?.error ?? null);
			this.#state = TASK_RESOLVED;
			if (!this.#entered) this.notifyProgress();
		}
		onResolve(taskValue) {
			const handlers = this.#onResolveHandlers;
			this.#onResolveHandlers = [];
			for (const f of handlers) try {
				f(taskValue);
			} catch (err) {
				debugLog("[AsyncTask#onResolve] error during task resolve handler", err);
				throw err;
			}
			if (this.#rejected) {
				this.#parentSubtask?.reject(taskValue);
				return;
			}
			const parentSubtaskPending = this.#parentSubtask && !this.#parentSubtask.isResolved();
			const taskReturned = !this.isCancelled();
			if (parentSubtaskPending && taskReturned) {
				const meta = this.#parentSubtask.getCallMetadata();
				if (meta.returnFn && !meta.returnFnCalled) {
					debugLog("[AsyncTask#onResolve()] running returnFn", {
						componentIdx: this.#componentIdx,
						taskID: this.#id,
						subtaskID: this.#parentSubtask.id()
					});
					const callerTask = this.#parentSubtask.getParentTask();
					withCurrentTaskMeta(_registers, {
						taskID: callerTask.id(),
						threadID: meta.callerThreadID,
						componentIdx: callerTask.componentIdx(),
						fn: () => meta.returnFn.apply(null, [taskValue, meta.resultPtr])
					});
					meta.returnFnCalled = true;
				}
			}
			if (this.#postReturnFn && taskReturned) {
				debugLog("[AsyncTask#onResolve()] running post return ", {
					componentIdx: this.#componentIdx,
					taskID: this.#id
				});
				try {
					withCurrentTaskMeta(_registers, {
						taskID: this.#id,
						threadID: this.defaultThread().id(),
						componentIdx: this.#componentIdx,
						fn: () => this.#postReturnFn(taskValue)
					});
				} catch (err) {
					err = postReturnTrap(context.postReturn, this.#componentIdx, err);
					this.reject(err);
					throw err;
				}
			}
			if (parentSubtaskPending) this.#parentSubtask.onResolve(taskValue);
		}
		registerOnResolveHandler(f) {
			this.#onResolveHandlers.push(f);
		}
		isRejected() {
			return this.#rejected;
		}
		isErrored() {
			return this.#errored;
		}
		setErrored(err) {
			if (this.#errored === null) this.#errored = err;
		}
		stop(err) {
			this.reject(err);
			this.#completionReady = true;
			this.#settleCompletionPromise();
		}
		reject(taskErr) {
			debugLog("[AsyncTask#reject()] args", {
				componentIdx: this.#componentIdx,
				taskID: this.#id,
				parentSubtask: this.#parentSubtask,
				parentSubtaskID: this.#parentSubtask?.id(),
				entryFnName: this.entryFnName(),
				callbackFnName: this.#callbackFnName,
				errMsg: taskErr.message
			});
			this.setErrored(taskErr);
			if (this.#rejected) return;
			if (this.isResolvedState()) {
				this.#rejected = true;
				this.#errored = taskErr;
				const parentTask = this.#parentSubtask?.getParentTask();
				if (parentTask) parentTask.reject(taskErr);
				return;
			}
			this.#rejected = true;
			this.cancelRequested = true;
			this.#state = TASK_CANCEL_PENDING;
			this.deliverPendingCancel({ cancellable: true });
			this.cancel({ error: taskErr });
		}
		resolve(results) {
			debugLog("[AsyncTask#resolve()] args", {
				componentIdx: this.#componentIdx,
				taskID: this.#id,
				entryFnName: this.entryFnName(),
				callbackFnName: this.#callbackFnName
			});
			if (this.#state === TASK_RESOLVED) {
				if (this.#errored !== null) throw this.#errored;
				throw new Error(`(component [${this.#componentIdx}]) task [${this.#id}]  is already resolved (did you forget to wait for an import?)`);
			}
			this.validateResourceBorrowScope();
			this.#state = TASK_RESOLVED;
			switch (results.length) {
				case 0:
					this.onResolve(void 0);
					break;
				case 1:
					this.onResolve(results[0]);
					break;
				default:
					debugLog("[AsyncTask#resolve()] unexpected number of results", {
						componentIdx: this.#componentIdx,
						results,
						taskID: this.#id,
						subtaskID: this.#parentSubtask?.id(),
						entryFnName: this.#entryFnName,
						callbackFnName: this.#callbackFnName
					});
					throw new Error("unexpected number of results");
			}
		}
		exit(args) {
			debugLog("[AsyncTask#exit()]", {
				componentIdx: this.#componentIdx,
				taskID: this.#id
			});
			this.endFirstSlice();
			if (this.#exited) throw new Error("task has already exited");
			this.#checkThreadExit();
			this.validateResourceBorrowScope();
			const state = this.#componentIdx === -1 ? null : getOrCreateAsyncState(_lookup, this.#componentIdx);
			if (!state && this.#componentIdx !== -1) throw new Error("missing async state for component [" + this.#componentIdx + "]");
			if (state && !args?.skipExclusiveLockCheck && !this.#lockFreeEntry) {
				if (this.needsExclusiveLock() && !state.exclusivelyLockedBy(this.#id)) throw new Error(`task [${this.#id}] exit: component [${this.#componentIdx}] should have been exclusively locked by it`);
			}
			if (state) state.exclusiveRelease(this.#id);
			this.notifyProgress();
			try {
				if (this.#parentSubtask === null && (this.#isAsync || this.#isManualAsync)) this.#settleCompletionPromise();
				this.#resolveExitPromise();
			} catch (err) {
				console.error("error during task exit handler", err);
				throw err;
			}
			this.#exited = true;
			this.removeThread(this.defaultThread());
			if (this.#threads.length > 0) clearCurrentThread(_clearing, this.#componentIdx, this.#id, { preserveTask: true });
		}
		needsExclusiveLock() {
			if (this.#componentIdx === -1) return false;
			if (!this.#callingWasmExport) return false;
			if (!this.#funcTypeIsAsync) return false;
			return !this.#isAsync || this.hasCallback() || this.#calleeIsAsync === false;
		}
		createSubtask(args) {
			debugLog("[AsyncTask#createSubtask()] args", args);
			const { componentIdx, childTask, callMetadata, fnName, isAsync, isManualAsync } = args;
			if (!getOrCreateAsyncState(_lookup, this.#componentIdx)) throw new Error(`invalid/missing async state for component idx [${componentIdx}]`);
			const waitable = new _Waitable({
				componentIdx: this.#componentIdx,
				target: `subtask (internal ID [${this.#id}])`
			});
			const newSubtask = new _Subtask({
				componentIdx,
				childTask,
				parentTask: this,
				callMetadata,
				isAsync,
				isManualAsync,
				fnName,
				waitable
			});
			this.#subtasks.push(newSubtask);
			newSubtask.setTarget(`subtask (internal ID [${newSubtask.id()}], waitable [${waitable.idx()}], component [${componentIdx}])`);
			return newSubtask;
		}
		getLatestSubtask() {
			return this.#subtasks.at(-1);
		}
		getSubtaskByWaitableRep(rep) {
			if (rep === void 0) throw new TypeError("missing rep");
			return this.#subtasks.find((s) => s.waitableRep() === rep);
		}
		currentSubtask() {
			debugLog("[AsyncTask#currentSubtask()]");
			if (this.#subtasks.length === 0) return;
			return this.#subtasks.at(-1);
		}
		removeSubtask(subtask) {
			if (this.#subtasks.length === 0) throw new Error("cannot end current subtask: no current subtask");
			this.#subtasks = this.#subtasks.filter((t) => t !== subtask);
			return subtask;
		}
		cancellationPending() {
			return this.#state === TASK_CANCEL_PENDING;
		}
		enterHost() {
			if (this.#entered) throw new Error(`task with ID [${this.#id}] should not be entered twice`);
			if (this.deliverPendingCancel({ cancellable: true })) {
				this.cancel();
				return false;
			}
			getOrCreateAsyncState(_lookup, this.#componentIdx);
			this.#entered = true;
			const parentTask = this.#parentSubtask?.getParentTask();
			if (parentTask?.taskState() === TASK_CANCEL_DELIVERED || parentTask && !parentTask.hasCallback()) parentTask.notifyProgress();
			return this.#entered;
		}
		defaultThread() {
			return this.#threads[0];
		}
		removeThread(thread) {
			this.#checkThreadExit();
			this.settleCompletion();
			if (this.#componentIdx !== -1) getOrCreateAsyncState(_lookup, this.#componentIdx).threads.remove(thread.id());
			this.#threads = this.#threads.filter((t) => t !== thread);
			if (this.#exited && this.#threads.length === 0) clearCurrentThread(_clearing, this.#componentIdx, this.#id);
		}
		#checkThreadExit() {
			if (this.#threads.length === 1 && !this.isResolvedState() && !this.isRejected()) {
				const err = new _RuntimeError(`(component [${this.#componentIdx}]) task [${this.#id}] exited without resolution`);
				throw this.#componentIdx === -1 ? err : recordTrap(context.traps, this.#componentIdx, err);
			}
		}
		addThread(thread) {
			if (this.#componentIdx === -1) {
				thread.setId(++AsyncTask.#hostThreadID);
				this.#threads.push(thread);
				return thread;
			}
			const cstate = getOrCreateAsyncState(_lookup, this.#componentIdx);
			thread.setId(cstate.threads.insert(thread));
			this.#threads.push(thread);
			return thread;
		}
		calleeIsAsync() {
			return this.#calleeIsAsync === true;
		}
	}
	return AsyncTask;
}

//#endregion
//#region runtime/intrinsics/async-task/async-subtask.js
const STARTING = 0;
const STARTED = 1;
const RETURNED = 2;
const CANCELLED_BEFORE_STARTED = 3;
const CANCELLED_BEFORE_RETURNED = 4;
function initializeAsyncSubtaskClass(context) {
	const { lookup: _lookup, memories: _memories, disposeSymbol: _disposeSymbol, RuntimeError } = context;
	class AsyncSubtask {
		static _ID = 0n;
		static State = {
			STARTING,
			STARTED,
			RETURNED,
			CANCELLED_BEFORE_STARTED,
			CANCELLED_BEFORE_RETURNED
		};
		#id;
		#state = STARTING;
		#componentIdx;
		#parentTask;
		#childTask = null;
		#cancelRequested = false;
		#lenders = null;
		#waitable;
		#callbackFn = null;
		#postReturnFn = null;
		#onProgressFn = null;
		#callMetadata = {};
		#resolved = false;
		#onResolveHandlers = [];
		#onStartHandlers = [];
		#result = null;
		#resultSet = false;
		#hostPendingResult = null;
		fnName;
		target;
		isAsync;
		isManualAsync;
		cancelProgress = null;
		constructor(args) {
			if (typeof args.componentIdx !== "number") throw new Error("invalid componentIdx for subtask creation");
			this.#componentIdx = args.componentIdx;
			this.#id = ++AsyncSubtask._ID;
			this.fnName = args.fnName;
			if (!args.parentTask) throw new Error("missing parent task during subtask creation");
			this.#parentTask = args.parentTask;
			if (args.childTask) this.#childTask = args.childTask;
			if (!args.waitable) throw new Error("missing/invalid waitable");
			this.#waitable = args.waitable;
			if (args.callMetadata) this.#callMetadata = args.callMetadata;
			this.#lenders = [];
			this.target = args.target;
			this.isAsync = args.isAsync;
			this.isManualAsync = args.isManualAsync;
		}
		id() {
			return this.#id;
		}
		parentTaskID() {
			return this.#parentTask?.id();
		}
		childTaskID() {
			return this.#childTask?.id();
		}
		state() {
			return this.#state;
		}
		getWaitable() {
			return this.#waitable;
		}
		waitable() {
			return this.#waitable;
		}
		waitableRep() {
			return this.#waitable.idx();
		}
		ensureHandle() {
			const existing = this.#waitable.idx();
			if (existing !== null && existing !== void 0) return existing;
			const idx = this.#getComponentState().handles.insert(this);
			this.#waitable.setIdx(idx);
			this.#waitable.setTarget(`waitable for subtask (waitable id [${idx}], subtask internal ID [${this.id()}])`);
			return idx;
		}
		join(set) {
			return this.#waitable.join(set);
		}
		getPendingEvent() {
			return this.#waitable.getPendingEvent();
		}
		hasPendingEvent() {
			return this.#waitable.hasPendingEvent();
		}
		setPendingEvent(fn) {
			return this.#waitable.setPendingEvent(fn);
		}
		setTarget(tgt) {
			this.target = tgt;
		}
		getResult() {
			if (!this.#resultSet) throw new Error("subtask result has not been set");
			return this.#result;
		}
		setResult(v) {
			if (this.#resultSet) throw new Error("subtask result has already been set");
			this.#result = v;
			this.#resultSet = true;
		}
		componentIdx() {
			return this.#componentIdx;
		}
		setChildTask(t) {
			if (!t) throw new Error("cannot set missing/invalid child task on subtask");
			if (this.#childTask) throw new Error("child task is already set on subtask");
			if (this.#parentTask === t) throw new Error("parent cannot be child");
			this.#childTask = t;
		}
		getChildTask() {
			return this.#childTask;
		}
		getParentTask() {
			return this.#parentTask;
		}
		setCallbackFn(f, _name) {
			if (!f) return;
			if (this.#callbackFn) throw new Error("callback fn can only be set once");
			this.#callbackFn = f;
		}
		getCallbackFnName() {
			return this.#callbackFn?.name;
		}
		setPostReturnFn(f) {
			if (!f) return;
			if (this.#postReturnFn) throw new Error("postReturn fn can only be set once");
			this.#postReturnFn = f;
		}
		setOnProgressFn(f) {
			if (this.#onProgressFn) throw new Error("on progress fn can only be set once");
			this.#onProgressFn = f;
		}
		isNotStarted() {
			return this.#state == STARTING;
		}
		cancellationRequested() {
			return this.#cancelRequested;
		}
		requestCancellation() {
			debugLog("[AsyncSubtask#requestCancellation()] args", {
				componentIdx: this.#componentIdx,
				subtaskID: this.#id,
				state: this.#state,
				childTaskID: this.childTaskID(),
				fnName: this.fnName
			});
			if (this.#cancelRequested) throw new Error("cancellation has already been requested for this subtask");
			this.#cancelRequested = true;
			if (this.#resolved) return;
			if (this.#childTask) {
				this.#childTask.requestCancellation();
				return;
			}
			this.onResolve(null);
			this.#disposeHostPendingResult();
		}
		setHostPendingResult(v) {
			if (!isPromiseLike(v)) return;
			this.#hostPendingResult = v;
			if (this.#resolved && this.#state !== RETURNED) this.#disposeHostPendingResult();
		}
		#disposeHostPendingResult() {
			const pending = this.#hostPendingResult;
			if (!pending) return;
			this.#hostPendingResult = null;
			disposeHostValue(_disposeSymbol, pending);
		}
		registerOnStartHandler(f) {
			this.#onStartHandlers.push(f);
		}
		onStart(args) {
			debugLog("[AsyncSubtask#onStart()] args", {
				componentIdx: this.#componentIdx,
				subtaskID: this.#id,
				parentTaskID: this.parentTaskID(),
				fnName: this.fnName,
				args
			});
			this.#onProgressFn?.();
			this.#parentTask.notifyProgress();
			this.#state = STARTED;
			let result;
			if (this.#callMetadata.startFn) result = this.#callMetadata.startFn.apply(null, args?.startFnParams ?? []);
			return result;
		}
		registerOnResolveHandler(f) {
			this.#onResolveHandlers.push(f);
		}
		reject(subtaskErr) {
			if (this.#resolved) return;
			this.#onProgressFn?.();
			if (this.#state >= RETURNED) throw new Error("cannot reject a completed subtask");
			this.#state = this.#state === STARTING ? CANCELLED_BEFORE_STARTED : CANCELLED_BEFORE_RETURNED;
			this.#resolved = true;
			this.#hostPendingResult = null;
			this.#parentTask.removeSubtask(this);
			this.#parentTask.reject(subtaskErr);
		}
		onResolve(subtaskValue) {
			debugLog("[AsyncSubtask#onResolve()] args", {
				componentIdx: this.#componentIdx,
				subtaskID: this.#id,
				isAsync: this.isAsync,
				childTaskID: this.childTaskID(),
				parentTaskID: this.parentTaskID(),
				parentTaskFnName: this.#parentTask?.entryFnName(),
				fnName: this.fnName
			});
			if (this.#resolved) throw new Error("subtask has already been resolved");
			this.#onProgressFn?.();
			if (subtaskValue === null && this.#cancelRequested) {
				if (this.#state >= RETURNED) throw new Error("resolved subtask must have been started before cancellation");
				this.#state = this.#state === STARTING ? CANCELLED_BEFORE_STARTED : CANCELLED_BEFORE_RETURNED;
			} else {
				if (this.#state !== STARTED) throw new Error("resolved subtask must have been started before completion");
				this.#state = RETURNED;
				this.#hostPendingResult = null;
			}
			this.setResult(subtaskValue);
			for (const f of this.#onResolveHandlers) try {
				f(subtaskValue);
			} catch (err) {
				console.error("error during subtask resolve handler", err);
				throw err;
			}
			const callMetadata = this.getCallMetadata();
			const memory = callMetadata.memory ?? this.#parentTask?.getReturnMemory() ?? lookupMemories(_memories, { componentIdx: this.#parentTask.componentIdx() })[0]?.memory;
			if (this.#state === RETURNED && callMetadata && !callMetadata.returnFn && (this.isAsync || callMetadata.funcTypeIsAsync) && callMetadata.resultPtr && memory) {
				const { resultPtr, realloc } = callMetadata;
				const lowers = callMetadata.lowers;
				if (lowers && lowers.length > 0) lowers[0]({
					componentIdx: this.#componentIdx,
					memory,
					realloc,
					vals: [subtaskValue],
					storagePtr: resultPtr,
					stringEncoding: callMetadata.stringEncoding
				});
			}
			this.#resolved = true;
			this.#parentTask.removeSubtask(this);
			if (!this.isAsync) {
				this.deliverResolve();
				const rep = this.waitableRep();
				if (rep) try {
					if (this.#getComponentState().handles.remove(rep) !== this) throw new Error("unexpectedly received non-self Subtask from handle removal");
					this.drop();
				} catch (err) {
					debugLog("[AsyncSubtask#onResolve()] failed to remove subtask after sync subtask completion", err);
				}
			}
		}
		getStateNumber() {
			return this.#state;
		}
		isReturned() {
			return this.#state === RETURNED;
		}
		getCallMetadata() {
			return this.#callMetadata;
		}
		isResolved() {
			return this.#state >= RETURNED;
		}
		addLender(handle) {
			debugLog("[AsyncSubtask#addLender()] args", { handle });
			if (!handle || typeof handle.lends !== "number") throw new Error("missing/invalid lender handle [" + handle + "]");
			if (this.#lenders === null || this.isResolved()) throw new Error("subtask has no lendors or has already been resolved");
			handle.lends++;
			this.#lenders.push(handle);
		}
		deliverResolve() {
			debugLog("[AsyncSubtask#deliverResolve()] args", {
				lenders: this.#lenders,
				parentTaskID: this.parentTaskID(),
				subtaskID: this.#id,
				childTaskID: this.childTaskID(),
				resolved: this.isResolved(),
				resolveDelivered: this.resolveDelivered()
			});
			if (this.resolveDelivered() || !this.isResolved()) throw new Error("subtask cannot deliver resolution twice, and the subtask must be resolved");
			for (const lender of this.#lenders) lender.lends--;
			this.#lenders = null;
		}
		resolveDelivered() {
			debugLog("[AsyncSubtask#resolveDelivered()] args", {});
			if (this.#lenders === null && !this.isResolved()) throw new Error("invalid subtask state, lenders missing and subtask has not been resolved");
			return this.#lenders === null;
		}
		drop() {
			debugLog("[AsyncSubtask#drop()] args", {
				componentIdx: this.#componentIdx,
				parentTaskID: this.#parentTask?.id(),
				parentTaskFnName: this.#parentTask?.entryFnName(),
				childTaskID: this.#childTask?.id(),
				childTaskFnName: this.#childTask?.entryFnName(),
				subtaskFnName: this.fnName
			});
			if (!this.#waitable) throw new Error("missing/invalid inner waitable");
			if (!this.resolveDelivered()) throw new RuntimeError("cannot drop a subtask which has not yet resolved");
			if (this.#waitable) this.#waitable.drop();
		}
		#getComponentState() {
			const state = getOrCreateAsyncState(_lookup, this.#componentIdx);
			if (!state) throw new Error("invalid/missing async state for component [" + this.#componentIdx + "]");
			return state;
		}
		getWaitableHandleIdx() {
			debugLog("[AsyncSubtask#getWaitableHandleIdx()] args", {});
			if (!this.#waitable) throw new Error("missing/invalid waitable");
			return this.waitableRep();
		}
	}
	return AsyncSubtask;
}

//#endregion
//#region runtime/intrinsics/async-task/context.js
/** Implements `canon context.set`. */
function contextSet(_context, ctx, value) {
	const { slot } = ctx;
	if (slot === void 0) throw new TypeError("missing slot");
	if (!typeCheckValidI32(value)) throw new Error("invalid value for context set (not valid i32)");
	let currentThreadMeta = getCurrentTaskMeta(_context.registers, ctx.componentIdx);
	let threadMeta = currentThreadMeta ? getCurrentThread(_context, currentThreadMeta.componentIdx, currentThreadMeta.threadID, currentThreadMeta.taskID) : void 0;
	if (!threadMeta) {
		currentThreadMeta = getCurrentTaskMeta(_context.registers);
		threadMeta = currentThreadMeta ? getCurrentThread(_context, currentThreadMeta.componentIdx, currentThreadMeta.threadID, currentThreadMeta.taskID) : void 0;
	}
	if (!threadMeta) throw new Error(`missing/incomplete global current thread meta for component idx [${ctx.componentIdx}] during context set`);
	const task = threadMeta.thread;
	if (!task) throw new Error("invalid/missing current thread in metadata while setting context");
	debugLog("[contextSet()] args", {
		slot,
		value,
		storage: task.storage,
		threadID: task.id(),
		taskID: threadMeta.task.id(),
		componentIdx: task.componentIdx()
	});
	if (slot < 0 || slot >= task.storage.length) throw new Error("invalid slot for current thread");
	task.storage[slot] = value;
}
/** Implements `canon context.get`. */
function contextGet(_context, ctx) {
	const { slot } = ctx;
	if (slot === void 0) throw new TypeError("missing slot");
	let currentThreadMeta = getCurrentTaskMeta(_context.registers, ctx.componentIdx);
	let threadMeta = currentThreadMeta ? getCurrentThread(_context, currentThreadMeta.componentIdx, currentThreadMeta.threadID, currentThreadMeta.taskID) : void 0;
	if (!threadMeta) {
		currentThreadMeta = getCurrentTaskMeta(_context.registers);
		threadMeta = currentThreadMeta ? getCurrentThread(_context, currentThreadMeta.componentIdx, currentThreadMeta.threadID, currentThreadMeta.taskID) : void 0;
	}
	if (!threadMeta) throw new Error(`missing/incomplete global current thread meta for component idx [${ctx.componentIdx}] during context get`);
	const task = threadMeta.thread;
	if (!task) throw new Error("invalid/missing current thread in metadata while getting context");
	debugLog("[contextGet()] args", {
		slot,
		storage: task.storage,
		threadID: task.id(),
		taskID: threadMeta.task.id(),
		componentIdx: task.componentIdx()
	});
	if (slot < 0 || slot >= task.storage.length) throw new Error("invalid slot for current thread");
	return task.storage[slot];
}

//#endregion
//#region runtime/intrinsics/async-task/subtask-operations.js
/** Implements `canon subtask.drop`. */
function subtaskDrop(_context, componentIdx, subtaskWaitableRep) {
	debugLog("[subtaskDrop()] args", {
		componentIdx,
		subtaskWaitableRep
	});
	const cstate = getOrCreateAsyncState(_context.lookup, componentIdx);
	if (!cstate.mayLeave) throw new _context.RuntimeError("component is not marked as may leave, cannot drop subtask");
	const subtask = cstate.handles.get(subtaskWaitableRep);
	if (!(subtask instanceof _context.AsyncSubtask)) throw new _context.RuntimeError("invalid subtask handle for drop");
	cstate.handles.remove(subtaskWaitableRep);
	subtask.drop();
}
/** Implements `canon subtask.cancel`. */
function subtaskCancel(_context, componentIdx, isAsync, subtaskRep, slowOnly = false) {
	debugLog("[subtaskCancel()] args", {
		componentIdx,
		isAsync,
		subtaskRep
	});
	const state = getOrCreateAsyncState(_context.lookup, componentIdx);
	if (!state.mayLeave) throw new _context.RuntimeError("component instance is not marked as may leave, cannot cancel subtask");
	const subtask = state.handles.get(subtaskRep);
	if (!(subtask instanceof _context.AsyncSubtask)) throw new _context.RuntimeError("missing/invalid subtask [" + subtaskRep + "] specified for cancel in component instance");
	if (subtask.resolveDelivered()) throw new _context.RuntimeError("`subtask.cancel` called after terminal status delivered");
	if (!isAsync && subtask.waitable().isInSet()) throw new _context.RuntimeError("cannot synchronously cancel a subtask that is in a waitable set");
	const finishCancel = () => {
		if (subtask.hasPendingEvent()) subtask.getPendingEvent();
		if (!subtask.resolveDelivered()) subtask.deliverResolve();
		return subtask.getStateNumber();
	};
	if (subtask.cancellationRequested()) {
		if (!slowOnly) throw new _context.RuntimeError("cancellation has already been requested for this subtask");
		if (subtask.isResolved()) return finishCancel();
		if (subtask.cancelProgress) {
			const progress = subtask.cancelProgress;
			subtask.cancelProgress = null;
			return progress.then(() => {
				if (subtask.isResolved()) return finishCancel();
				if (isAsync) return 4294967295;
				const { taskID } = getCurrentTaskMeta(_context.registers, componentIdx);
				const taskMeta = getCurrentTask(_context, componentIdx, taskID);
				if (!taskMeta || !taskMeta.task) throw new Error("invalid/missing async task");
				return taskMeta.task.waitUntil({
					cancellable: false,
					readyFn: () => subtask.isResolved()
				}).then(finishCancel);
			});
		}
		const { taskID } = getCurrentTaskMeta(_context.registers, componentIdx);
		const taskMeta = getCurrentTask(_context, componentIdx, taskID);
		if (!taskMeta || !taskMeta.task) throw new Error("invalid/missing async task");
		return taskMeta.task.waitUntil({
			cancellable: false,
			readyFn: () => subtask.isResolved()
		}).then(finishCancel);
	}
	let cancellationWillCompleteAsync = false;
	if (!subtask.isResolved()) {
		const childTask = subtask.getChildTask();
		subtask.requestCancellation();
		if (!subtask.isResolved()) {
			if (childTask?.hasCallback()) {
				const childState = getOrCreateAsyncState(_context.lookup, childTask.componentIdx());
				if (childState.suspendedTaskCancellable(childTask.id()) && childState.suspendedTaskReady(childTask.id())) {
					const progress = childTask.waitForProgress();
					if (!childState.resumeTaskByID(childTask.id())) throw new Error("failed to resume cancelled callback task");
					cancellationWillCompleteAsync = true;
					subtask.cancelProgress = progress;
				}
			}
		}
		if (!subtask.isResolved()) {
			if (isAsync) return cancellationWillCompleteAsync ? 4294967294 : 4294967295;
			if (!slowOnly) return 4294967294;
			const { taskID } = getCurrentTaskMeta(_context.registers, componentIdx);
			const taskMeta = getCurrentTask(_context, componentIdx, taskID);
			if (!taskMeta || !taskMeta.task) throw new Error("invalid/missing async task");
			return taskMeta.task.waitUntil({
				cancellable: false,
				readyFn: () => subtask.isResolved()
			}).then(finishCancel);
		}
	}
	return finishCancel();
}

//#endregion
//#region runtime/intrinsics/async-task/lower-import.js
function lowerImport(_context, args, ...params) {
	debugLog("[_lowerImport()] args", {
		args,
		params
	});
	const { componentIdx, isAsync, isManualAsync, resultLowerFns, hasResultPointer, funcTypeIsAsync, memoryIdx, getMemoryFn, getReallocFn, stringEncoding, importFn } = args;
	checkMayLeave(_context.mayLeave, componentIdx);
	const { taskID, threadID } = getCurrentTaskMeta(_context.registers, componentIdx);
	const taskMeta = getCurrentTask(_context, componentIdx, taskID);
	if (!taskMeta) throw new Error("invalid/missing async task meta");
	const task = taskMeta.task;
	if (!task) throw new Error("invalid/missing async task");
	const cstate = getOrCreateAsyncState(_context.lookup, componentIdx);
	if (!task.mayBlock() && funcTypeIsAsync && !isAsync) throw new Error("non async exports cannot synchronously call async functions");
	const memory = getMemoryFn();
	const resultPtr = hasResultPointer ? params[params.length - 1] >>> 0 : void 0;
	const subtask = task.createSubtask({
		componentIdx,
		parentTask: task,
		fnName: importFn.fnName,
		isAsync,
		isManualAsync,
		callMetadata: {
			memoryIdx,
			memory,
			realloc: getReallocFn?.(),
			getReallocFn,
			resultPtr,
			lowers: resultLowerFns,
			funcTypeIsAsync,
			stringEncoding
		}
	});
	task.setReturnMemoryIdx(memoryIdx);
	task.setReturnMemory(getMemoryFn());
	subtask.onStart();
	if (!isManualAsync && !isAsync && !funcTypeIsAsync) {
		importFn(...params);
		if (!funcTypeIsAsync && !subtask.isReturned()) throw new Error("post-execution subtasks must either be async or returned");
		return subtask.getResult();
	}
	if (!isManualAsync && !isAsync && funcTypeIsAsync) {
		const { promise, resolve, reject } = promiseWithResolvers();
		queueMicrotask(async () => {
			try {
				await withCurrentTaskMetaAsync(_context.registers, {
					taskID: task.id(),
					threadID,
					componentIdx: task.componentIdx(),
					fn: () => importFn(...params)
				});
				if (!subtask.isResolved()) await task.suspendUntil({ readyFn: () => subtask.isResolved() });
				resolve(subtask.getResult());
			} catch (err) {
				reject(err);
			}
		});
		return promise;
	}
	subtask.setOnProgressFn(() => {
		subtask.setPendingEvent(() => {
			if (subtask.isResolved()) subtask.deliverResolve();
			return {
				code: _context.events.SUBTASK,
				payload0: subtask.waitableRep(),
				payload1: subtask.getStateNumber()
			};
		});
	});
	const requiresManualAsyncResult = !isAsync && !funcTypeIsAsync && isManualAsync;
	let manualAsyncResult;
	if (requiresManualAsyncResult) manualAsyncResult = promiseWithResolvers();
	const finishAsyncLower = () => {
		const subtaskState = subtask.getStateNumber();
		if (subtaskState < 0 || subtaskState >= 16) throw new Error("invalid subtask state, out of valid range");
		let res;
		if (subtask.isReturned()) {
			if (subtask.hasPendingEvent()) subtask.getPendingEvent();
			if (!subtask.resolveDelivered()) subtask.deliverResolve();
			if (subtask.waitableRep() !== null) {
				if (cstate.handles.remove(subtask.waitableRep()) !== subtask) throw new Error("subtask handle cleanup removed unexpected entry");
			}
			subtask.drop();
			res = subtaskState;
		} else res = Number(subtask.ensureHandle()) << 4 | subtaskState;
		debugLog("[_lowerImport()] async-lowered import return", {
			fnName: importFn.fnName,
			componentIdx,
			subtaskID: subtask.id(),
			waitableRep: subtask.waitableRep(),
			subtaskState,
			eagerReturn: subtask.isReturned(),
			packedResult: res
		});
		return res;
	};
	if (isAsync) try {
		if (!subtask.cancellationRequested() && task.taskState() !== _context.AsyncTask.State.CANCEL_PENDING) {
			const pending = withCurrentTaskMeta(_context.registers, {
				taskID: task.id(),
				threadID,
				componentIdx: task.componentIdx(),
				fn: () => importFn(...params)
			});
			Promise.resolve(pending).catch((err) => {
				task.setErrored(err);
				task.reject(err);
			});
		}
		return finishAsyncLower();
	} catch (err) {
		task.setErrored(err);
		task.reject(err);
		throw err;
	}
	queueMicrotask(async () => {
		try {
			if (subtask.cancellationRequested() || task.taskState() === _context.AsyncTask.State.CANCEL_PENDING) return;
			debugLog("[_lowerImport()] calling lowered import", {
				importFn,
				params
			});
			await withCurrentTaskMetaAsync(_context.registers, {
				taskID: task.id(),
				threadID,
				componentIdx: task.componentIdx(),
				fn: () => importFn(...params)
			});
			if (requiresManualAsyncResult) manualAsyncResult.resolve(subtask.getResult());
		} catch (err) {
			debugLog("[_lowerImport()] import fn error:", err);
			if (requiresManualAsyncResult) {
				manualAsyncResult.reject(err);
				return;
			}
			task.setErrored(err);
			task.reject(err);
		}
	});
	if (requiresManualAsyncResult) return manualAsyncResult.promise;
	return new Promise((resolve, reject) => {
		setTimeout(() => {
			try {
				resolve(finishAsyncLower());
			} catch (err) {
				reject(err);
			}
		}, 0);
	});
}

//#endregion
//#region runtime/intrinsics/async-task/lower-import-backwards-compat.js
function lowerImportBackwardsCompat(_context, args, ...params) {
	debugLog("[_lowerImportBackwardsCompat()] args", {
		args,
		params
	});
	const { componentIdx, isAsync, isManualAsync, resultLowerFns, hasResultPointer, funcTypeIsAsync, memoryIdx, getMemoryFn, getReallocFn, importFn, stringEncoding } = args;
	checkMayLeave(_context.mayLeave, componentIdx);
	const meta = getCurrentTaskMeta(_context.registers, componentIdx);
	let taskMeta = meta && getCurrentTask(_context, componentIdx, meta.taskID);
	let createdTask;
	if (!taskMeta) {
		if (funcTypeIsAsync || isAsync && !isManualAsync) throw new Error("p3 async wasm exports cannot use backwards compat auto-task init");
		const { task: newTask, taskID: newTaskID, threadID: newThreadID } = createNewCurrentImplicitThread(_context.creation, {
			componentIdx,
			isAsync,
			isManualAsync,
			callingWasmExport: false
		});
		createdTask = newTask;
		createdTask.registerOnResolveHandler(() => {
			clearCurrentTaskMeta(_context.registers, {
				taskID: newTaskID,
				threadID: newThreadID,
				componentIdx: task.componentIdx()
			});
		});
		setCurrentTaskMeta(_context.registers, {
			componentIdx,
			taskID: newTaskID,
			threadID: newThreadID
		});
		taskMeta = getCurrentTask(_context, componentIdx, newTaskID);
	}
	if (!taskMeta) throw new Error("invalid/missing async task meta");
	const task = taskMeta.task;
	if (!task) throw new Error("invalid/missing async task");
	getOrCreateAsyncState(_context.lookup, componentIdx);
	if (!task.mayBlock() && funcTypeIsAsync && !isAsync) throw new Error("non async exports cannot synchronously call async functions");
	const memory = getMemoryFn();
	const resultPtr = hasResultPointer ? params[params.length - 1] >>> 0 : void 0;
	const subtask = task.createSubtask({
		componentIdx,
		parentTask: task,
		fnName: importFn.fnName,
		isAsync,
		isManualAsync,
		callMetadata: {
			memoryIdx,
			memory,
			realloc: getReallocFn?.(),
			getReallocFn,
			resultPtr,
			lowers: resultLowerFns,
			funcTypeIsAsync,
			stringEncoding
		}
	});
	task.setReturnMemoryIdx(memoryIdx);
	task.setReturnMemory(getMemoryFn());
	subtask.onStart();
	if (!isManualAsync && !isAsync && !funcTypeIsAsync) {
		if (createdTask) createdTask.enterSync();
		importFn(...params);
		if (!funcTypeIsAsync && !subtask.isReturned()) throw new Error("post-execution subtasks must either be async or returned");
		const syncRes = subtask.getResult();
		if (createdTask) {
			createdTask.resolve([syncRes]);
			createdTask.exit();
		}
		return syncRes;
	}
	if (!isManualAsync && !isAsync && funcTypeIsAsync) {
		const { promise, resolve, reject } = promiseWithResolvers();
		queueMicrotask(async () => {
			try {
				await importFn(...params);
				if (!subtask.isResolved()) await task.suspendUntil({ readyFn: () => subtask.isResolved() });
				resolve(subtask.getResult());
			} catch (err) {
				reject(err);
			}
		});
		return promise;
	}
	const subtaskState = subtask.getStateNumber();
	if (subtaskState < 0 || subtaskState >= 16) throw new Error("invalid subtask state, out of valid range");
	subtask.setOnProgressFn(() => {
		subtask.setPendingEvent(() => {
			if (subtask.isResolved()) subtask.deliverResolve();
			return {
				code: _context.events.SUBTASK,
				payload0: subtask.waitableRep(),
				payload1: subtask.getStateNumber()
			};
		});
	});
	if (!isAsync && !funcTypeIsAsync && isManualAsync) {
		debugLog("[_lowerImportBackwardsCompat()] calling lowered import", {
			importFn,
			params
		});
		if (createdTask) createdTask.enterSync();
		try {
			const result = importFn(...params);
			const isPromise = isPromiseLike(result);
			if (createdTask) createdTask.resolve([isPromise ? void 0 : result]);
			if (!isPromise) return subtask.getResult();
			return Promise.resolve(result).then(() => subtask.getResult());
		} catch (error) {
			if (createdTask) createdTask.reject(error);
			throw error;
		} finally {
			if (createdTask) createdTask.exit();
		}
	}
	queueMicrotask(async () => {
		try {
			debugLog("[_lowerImportBackwardsCompat()] calling lowered import", {
				importFn,
				params
			});
			if (createdTask) await createdTask.enter();
			const asyncRes = await importFn(...params);
			if (createdTask) createdTask.resolve([asyncRes]);
		} catch (err) {
			debugLog("[_lowerImportBackwardsCompat()] import fn error:", err);
			task.setErrored(err);
			task.reject(err);
		}
	});
	debugLog("[_lowerImportBackwardsCompat()] async-lowered import return", {
		fnName: importFn.fnName,
		componentIdx,
		subtaskID: subtask.id(),
		waitableRep: subtask.waitableRep(),
		subtaskState,
		packedResult: Number(subtask.waitableRep()) << 4 | subtaskState
	});
	return Number(subtask.ensureHandle()) << 4 | subtaskState;
}

//#endregion
//#region runtime/intrinsics/async-task/symmetric-calls.js
function symmetricSyncGuestCallEnter(_context, callerComponentIdx, calleeIsAsync, calleeComponentIdx, syncOnly = false) {
	debugLog("[_symmetricSyncGuestCallEnter()] args", {
		callerComponentIdx,
		calleeIsAsync,
		calleeComponentIdx
	});
	const cstate = getOrCreateAsyncState(_context.lookup, calleeComponentIdx);
	if (syncOnly && calleeIsAsync && cstate.isExclusivelyLocked()) return 0;
	const callerThreadMeta = getCurrentTaskMeta(_context.registers, callerComponentIdx);
	if (!callerThreadMeta) throw new Error("missing current caller thread metadata");
	const callerTaskMeta = getCurrentTask(_context, callerComponentIdx, callerThreadMeta.taskID);
	if (!callerTaskMeta) throw new Error("missing current caller task metadata");
	const callerTask = callerTaskMeta.task;
	if (!callerTask) throw new Error("missing current caller task");
	if (callerThreadMeta.taskID !== callerTask.id()) throw new Error("missing current caller thread metadata");
	const callerThreadID = callerThreadMeta.threadID;
	const subtask = callerTask.createSubtask({
		componentIdx: callerComponentIdx,
		parentTask: callerTask,
		isAsync: false
	});
	const { task: newTask, threadID: newThreadID } = createNewCurrentImplicitThread(_context.creation, {
		componentIdx: calleeComponentIdx,
		isAsync: !!calleeIsAsync,
		isManualAsync: callerTask.isManualAsync(),
		entryFnName: [
			"task",
			callerTask.id(),
			"subtask",
			subtask.id(),
			"task",
			"new-sync-guest-task"
		].join("/"),
		callingWasmExport: !!calleeIsAsync
	});
	newTask.setFuncTypeIsAsync(!!calleeIsAsync);
	newTask.setCalleeIsAsync(false);
	subtask.setChildTask(newTask);
	newTask.setParentSubtask(subtask);
	subtask.onStart();
	const finishEnter = () => {
		setCurrentTaskMeta(_context.registers, {
			taskID: newTask.id(),
			threadID: newThreadID,
			componentIdx: newTask.componentIdx()
		});
		_context.stack.push({
			componentIdx: newTask.componentIdx(),
			threadID: newThreadID,
			callerThreadID,
			previousTaskMayBlock: _context.mayBlock.value
		});
		_context.mayBlock.value = newTask.mayBlock() ? 1 : 0;
		debugLog("[_symmetricSyncGuestCallEnter()] finished preparing", {
			callerComponentIdx,
			calleeComponentIdx,
			subtaskID: subtask.id(),
			newTaskID: newTask.id()
		});
	};
	if (!newTask.needsExclusiveLock()) {
		finishEnter();
		return 1;
	}
	if (!cstate.isExclusivelyLocked()) {
		cstate.exclusiveLock(newTask.id());
		finishEnter();
		return 1;
	}
	return cstate.acquireExclusiveLock(newTask.id()).then(() => {
		finishEnter();
		return 1;
	});
}
function symmetricSyncGuestCallExit(_context) {
	const { componentIdx, callerThreadID, previousTaskMayBlock } = _context.stack.pop();
	getOrCreateAsyncState(_context.lookup, componentIdx);
	const taskMeta = getCurrentTask(_context, componentIdx);
	if (!taskMeta) throw new Error("missing current caller task metadata");
	const task = taskMeta.task;
	if (!task) throw new Error("missing current caller task");
	debugLog("[_symmetricSyncGuestCallExit()] exiting", {
		componentIdx,
		taskID: task.id(),
		subtask: task.getParentSubtask(),
		subtaskID: task.getParentSubtask()?.id(),
		parent: task.getParentSubtask()?.getParentTask()
	});
	const callerTask = task.getParentSubtask().getParentTask();
	task.resolve([]);
	task.exit();
	_context.mayBlock.value = previousTaskMayBlock;
	setCurrentTaskMeta(_context.registers, {
		taskID: callerTask.id(),
		threadID: callerThreadID,
		componentIdx: callerTask.componentIdx()
	});
}

//#endregion
//#region runtime/intrinsics/async-task/async-thread.js
const THREAD_NOT_STARTED = "not-started";
const THREAD_RUNNING = "running";
const THREAD_COMPLETED = "completed";
function initializeAsyncThreadClass(context) {
	const { lookup: _lookup, registers: _registers } = context;
	class AsyncThread {
		static State = {
			NOT_STARTED: THREAD_NOT_STARTED,
			RUNNING: THREAD_RUNNING,
			COMPLETED: THREAD_COMPLETED
		};
		#id = null;
		#componentIdx;
		#task;
		#state;
		#startFn = null;
		storage = [0, 0];
		constructor(opts) {
			if (opts?.componentIdx === void 0) throw new TypeError("missing component id during thread creation");
			this.#componentIdx = opts.componentIdx;
			if (!opts?.task) throw new TypeError("missing task during thread creation");
			this.#task = opts.task;
			if (opts.startFn) {
				this.#startFn = opts.startFn;
				this.#state = THREAD_NOT_STARTED;
			} else this.#state = THREAD_RUNNING;
		}
		id() {
			return this.#id;
		}
		setId(id) {
			if (this.#id !== null) throw new Error("thread id can only be assigned once");
			this.#id = id;
		}
		componentIdx() {
			return this.#componentIdx;
		}
		task() {
			return this.#task;
		}
		taskID() {
			return this.#task.id();
		}
		state() {
			return this.#state;
		}
		isCancelled() {
			return this.#task.isCancelled();
		}
		isRejected() {
			return this.#task.isRejected();
		}
		notifyProgress() {
			return this.#task.notifyProgress();
		}
		entryFnName() {
			return this.#task.entryFnName();
		}
		getParentSubtask() {
			return this.#task.getParentSubtask();
		}
		async suspend(opts) {
			const cstate = getOrCreateAsyncState(_lookup, this.#componentIdx);
			const task = this.#task;
			task.endFirstSlice();
			task.settleCompletion();
			const { cancellable, readyFn, releaseLock = false } = opts;
			if (task.deliverPendingCancel({ cancellable })) return false;
			const reacquireLock = releaseLock && task.needsExclusiveLock() && cstate.exclusivelyLockedBy(task.id());
			if (reacquireLock) cstate.exclusiveRelease(task.id());
			try {
				const keepGoing = await cstate.suspendThread({
					...opts,
					cancellable: !!cancellable,
					thread: this,
					readyFn: () => cancellable && task.cancellationPending() || readyFn()
				});
				cstate.throwIfInterrupted();
				if (keepGoing && task.deliverPendingCancel({ cancellable })) return false;
				return !!keepGoing;
			} finally {
				if (reacquireLock && !cstate.exclusivelyLockedBy(task.id())) await cstate.acquireExclusiveLock(task.id());
			}
		}
		start() {
			if (this.#state !== THREAD_NOT_STARTED) throw new Error(`cannot start thread [${this.#id}] in state [${this.#state}]`);
			this.#state = THREAD_RUNNING;
			const startFn = this.#startFn;
			this.#startFn = null;
			withCurrentTaskMetaAsync(_registers, {
				threadID: this.#id,
				taskID: this.#task.id(),
				componentIdx: this.#componentIdx,
				fn: async () => {
					getOrCreateAsyncState(_lookup, this.#componentIdx).throwIfInterrupted();
					return startFn();
				}
			}).then(() => {
				this.#state = THREAD_COMPLETED;
				this.#task.removeThread(this);
			}).catch((err) => {
				err = recordTrap(context.traps, this.#componentIdx, err);
				this.#state = THREAD_COMPLETED;
				debugLog("[AsyncThread#start()] spawned thread errored", {
					threadID: this.#id,
					taskID: this.#task.id(),
					componentIdx: this.#componentIdx,
					err
				});
				this.#task.setErrored(err);
				this.#task.reject(err);
				this.#task.removeThread(this);
			});
		}
	}
	return AsyncThread;
}

//#endregion
//#region runtime/intrinsics/stream/state.js
const initializeStreams = (RepTable) => new RepTable({ target: "global stream map" });
const initializeStreamTables = () => ({});
function createStream(_context, cstate, args) {
	debugLog("[createStream()] args", args);
	const { tableIdx, elemMeta } = args;
	if (tableIdx === void 0) throw new Error("missing table idx while adding stream");
	if (elemMeta === void 0) throw new Error("missing element metadata while adding stream");
	const { table: localStreamTable, componentIdx } = _context.tables[tableIdx];
	if (!localStreamTable) throw new Error(`missing global stream table lookup for table [${tableIdx}] while creating stream`);
	if (componentIdx !== cstate.componentIdx()) throw new Error("component idx mismatch while creating stream");
	const readWaitable = cstate.createWaitable();
	const writeWaitable = cstate.createWaitable();
	const stream = new _context.InternalStream({
		tableIdx,
		elemMeta,
		readWaitable,
		writeWaitable
	});
	stream.setGlobalStreamMapRep(_context.streams.insert(stream));
	const readEnd = stream.readEnd();
	readEnd.setWaitableIdx(cstate.handles.insert(readEnd));
	readEnd.setHandle(localStreamTable.insert(readEnd));
	if (readEnd.streamTableIdx() !== tableIdx) throw new Error("unexpectedly mismatched stream table");
	const readEndWaitableIdx = readEnd.waitableIdx();
	const readEndHandle = readEnd.handle();
	readWaitable.setTarget(`waitable for read end (waitable [${readEndWaitableIdx}])`);
	readEnd.setTarget(`stream read end (waitable [${readEndWaitableIdx}])`);
	const writeEnd = stream.writeEnd();
	writeEnd.setWaitableIdx(cstate.handles.insert(writeEnd));
	writeEnd.setHandle(localStreamTable.insert(writeEnd));
	if (writeEnd.streamTableIdx() !== tableIdx) throw new Error("unexpectedly mismatched stream table");
	const writeEndWaitableIdx = writeEnd.waitableIdx();
	const writeEndHandle = writeEnd.handle();
	writeWaitable.setTarget(`waitable for stream write end (waitable [${writeEndWaitableIdx}])`);
	writeEnd.setTarget(`stream write end (waitable [${writeEndWaitableIdx}])`);
	return {
		writeEnd,
		writeEndWaitableIdx,
		writeEndHandle,
		readEndWaitableIdx,
		readEndHandle,
		readEnd
	};
}
function getStreamEnd(_context, args) {
	debugLog("[getStreamEnd()] args", args);
	const { tableIdx, streamEndHandle, streamEndWaitableIdx } = args;
	if (tableIdx === void 0) throw new Error("missing table idx while getting stream end");
	const { table, componentIdx } = _context.tables[tableIdx];
	const cstate = getOrCreateAsyncState(_context.lookup, componentIdx);
	let streamEnd;
	if (streamEndWaitableIdx !== void 0) streamEnd = cstate.handles.get(streamEndWaitableIdx);
	else if (streamEndHandle !== void 0) {
		if (!table) throw new Error(`missing/invalid table [${tableIdx}] while getting stream end`);
		streamEnd = table.get(streamEndHandle);
	} else throw new TypeError("must specify either waitable idx or handle to retrieve stream");
	if (!(streamEnd instanceof _context.StreamEnd)) throw new _context.RuntimeError(`missing stream end (tableIdx [${tableIdx}], handle [${streamEndHandle}], waitableIdx [${streamEndWaitableIdx}])`);
	if (streamEnd.streamTableIdx() !== tableIdx) throw new _context.RuntimeError(`stream end table idx [${streamEnd.streamTableIdx()}] does not match [${tableIdx}]`);
	return streamEnd;
}
function addStreamEndToTable(_context, args) {
	debugLog("[addStreamEndToTable()] args", args);
	const { tableIdx, streamEnd } = args;
	if (typeof streamEnd === "number") throw new Error("INSERTING BAD STREAMEND");
	let { table, componentIdx } = _context.tables[tableIdx];
	if (componentIdx === void 0 || !table) throw new Error(`invalid global stream table state for table [${tableIdx}]`);
	const handle = table.insert(streamEnd);
	streamEnd.setHandle(handle);
	streamEnd.setStreamTableIdx(tableIdx);
	const waitableIdx = getOrCreateAsyncState(_context.lookup, componentIdx).handles.insert(streamEnd);
	streamEnd.setWaitableIdx(waitableIdx);
	debugLog("[addStreamEndToTable()] added stream end", {
		tableIdx,
		table,
		handle,
		streamEnd,
		destComponentIdx: componentIdx
	});
	return {
		handle,
		waitableIdx
	};
}
function removeStreamEndFromTable(_context, args) {
	debugLog("[removeStreamEndFromTable()] args", args);
	const { tableIdx, streamWaitableIdx } = args;
	if (tableIdx === void 0) throw new Error("missing table idx while removing stream end");
	if (streamWaitableIdx === void 0) throw new Error("missing stream end waitable idx while removing stream end");
	const { table, componentIdx } = _context.tables[tableIdx];
	if (!table) throw new Error(`missing/invalid table [${tableIdx}] while removing stream end`);
	const cstate = getOrCreateAsyncState(_context.lookup, componentIdx);
	const streamEnd = cstate.handles.get(streamWaitableIdx);
	if (!(streamEnd instanceof _context.StreamEnd) || streamEnd.streamTableIdx() !== tableIdx) throw new _context.RuntimeError(`invalid stream end for table [${tableIdx}]`);
	const handle = streamEnd.handle();
	let removed = cstate.handles.remove(streamWaitableIdx);
	if (!removed) throw new Error(`failed to remove streamEnd from handles (waitable idx [${streamWaitableIdx}]), component [${componentIdx}])`);
	removed = table.remove(handle);
	if (!removed) throw new Error(`failed to remove streamEnd from table (handle [${handle}]), table [${tableIdx}], component [${componentIdx}])`);
	return streamEnd;
}

//#endregion
//#region runtime/intrinsics/future/state.js
const initializeFutures = (RepTable) => new RepTable({ target: "global future map" });
const initializeFutureTables = () => ({});
const initializeNestedFutureSymbol = () => Symbol.for("nested-future");
/** Create connected endpoints in the selected component and future tables. */
function createFuture(_context, cstate, args) {
	debugLog("[createFuture()] args", args);
	const { tableIdx, elemMeta, hostInjectFn } = args;
	if (tableIdx === void 0) throw new Error("missing table idx while adding future");
	if (elemMeta === void 0) throw new Error("missing element metadata while adding future");
	const { table: futureTable, componentIdx } = _context.tables[tableIdx];
	if (!futureTable) throw new Error(`missing global future table lookup for table [${tableIdx}] while creating future`);
	if (componentIdx !== cstate.componentIdx()) throw new Error("component idx mismatch while creating future");
	const readWaitable = cstate.createWaitable();
	const writeWaitable = cstate.createWaitable();
	const future = new _context.InternalFuture({
		tableIdx,
		componentIdx: cstate.componentIdx(),
		elemMeta,
		readWaitable,
		writeWaitable,
		hostInjectFn
	});
	future.setGlobalFutureMapRep(_context.futures.insert(future));
	const readEnd = future.readEnd();
	readEnd.setWaitableIdx(cstate.handles.insert(readEnd));
	readEnd.setHandle(futureTable.insert(readEnd));
	if (readEnd.futureTableIdx() !== tableIdx) throw new Error("unexpectedly mismatched future table");
	const readEndWaitableIdx = readEnd.waitableIdx();
	const readEndHandle = readEnd.handle();
	readWaitable.setTarget(`waitable for read end (waitable [${readEndWaitableIdx}])`);
	readEnd.setTarget(`future read end (waitable [${readEndWaitableIdx}])`);
	const writeEnd = future.writeEnd();
	writeEnd.setWaitableIdx(cstate.handles.insert(writeEnd));
	writeEnd.setHandle(futureTable.insert(writeEnd));
	if (writeEnd.futureTableIdx() !== tableIdx) throw new Error("unexpectedly mismatched future table");
	const writeEndWaitableIdx = writeEnd.waitableIdx();
	const writeEndHandle = writeEnd.handle();
	writeWaitable.setTarget(`waitable for future write end (waitable [${writeEndWaitableIdx}])`);
	writeEnd.setTarget(`future write end (waitable [${writeEndWaitableIdx}])`);
	return {
		writeEnd,
		writeEndWaitableIdx,
		writeEndHandle,
		readEndWaitableIdx,
		readEndHandle,
		readEnd
	};
}
/** Look up an endpoint by handle or waitable index using the selected constructor. */
function getFutureEnd(_context, args) {
	debugLog("[getFutureEnd()] args", args);
	const { tableIdx, futureEndHandle, futureEndWaitableIdx } = args;
	if (tableIdx === void 0) throw new Error("missing table idx while getting future end");
	const { table, componentIdx } = _context.tables[tableIdx];
	const cstate = getOrCreateAsyncState(_context.lookup, componentIdx);
	let futureEnd;
	if (futureEndWaitableIdx !== void 0) futureEnd = cstate.handles.get(futureEndWaitableIdx);
	else if (futureEndHandle !== void 0) {
		if (!table) throw new Error(`missing/invalid table [${tableIdx}] while getting future end`);
		futureEnd = table.get(futureEndHandle);
	} else throw new TypeError("must specify either waitable idx or handle to retrieve future");
	if (!(futureEnd instanceof _context.FutureEnd)) throw new _context.RuntimeError(`missing future end (tableIdx [${tableIdx}], handle [${futureEndHandle}], waitableIdx [${futureEndWaitableIdx}])`);
	if (futureEnd.futureTableIdx() !== tableIdx) throw new _context.RuntimeError(`future end table idx [${futureEnd.futureTableIdx()}] does not match [${tableIdx}]`);
	return futureEnd;
}
/** Move an endpoint into the destination component and future tables. */
function addFutureEndToTable(_context, args) {
	debugLog("[addFutureEndToTable()] args", args);
	const { tableIdx, futureEnd } = args;
	if (typeof futureEnd === "number") throw new Error("INSERTING BAD FUTUREEND");
	let { table, componentIdx } = _context.tables[tableIdx];
	if (componentIdx === void 0 || !table) throw new Error(`invalid global future table state for table [${tableIdx}]`);
	const handle = table.insert(futureEnd);
	futureEnd.setHandle(handle);
	futureEnd.setFutureTableIdx(tableIdx);
	const waitableIdx = getOrCreateAsyncState(_context.lookup, componentIdx).handles.insert(futureEnd);
	futureEnd.setWaitableIdx(waitableIdx);
	debugLog("[addFutureEndToTable()] added future end", {
		tableIdx,
		table,
		handle,
		futureEnd,
		destComponentIdx: componentIdx
	});
	return {
		handle,
		waitableIdx
	};
}
/** Remove an endpoint from both its component and future tables. */
function removeFutureEndFromTable(_context, args) {
	debugLog("[removeFutureEndFromTable()] args", args);
	const { tableIdx, futureWaitableIdx } = args;
	if (tableIdx === void 0) throw new Error("missing table idx while removing future end");
	if (futureWaitableIdx === void 0) throw new Error("missing future end waitable idx while removing future end");
	const { table, componentIdx } = _context.tables[tableIdx];
	if (!table) throw new Error(`missing/invalid table [${tableIdx}] while removing future end`);
	const cstate = getOrCreateAsyncState(_context.lookup, componentIdx);
	const futureEnd = cstate.handles.get(futureWaitableIdx);
	if (!(futureEnd instanceof _context.FutureEnd) || futureEnd.futureTableIdx() !== tableIdx) throw new _context.RuntimeError(`invalid future end for table [${tableIdx}]`);
	const handle = futureEnd.handle();
	let removed = cstate.handles.remove(futureWaitableIdx);
	if (!removed) throw new Error(`failed to remove futureEnd from handles (waitable idx [${futureWaitableIdx}]), component [${componentIdx}])`);
	removed = table.remove(handle);
	if (!removed) throw new Error(`failed to remove futureEnd from table (handle [${handle}]), table [${tableIdx}], component [${componentIdx}])`);
	return futureEnd;
}

//#endregion
//#region runtime/intrinsics/lift.js
/** Decode UTF-8 while distinguishing malformed bytes from truncated sequences. */
const decodeUtf8 = (RuntimeError, decoder, input) => {
	try {
		return decoder.decode(input);
	} catch (error) {
		if (!(error instanceof TypeError)) throw error;
		let bytes;
		try {
			bytes = ArrayBuffer.isView(input) ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength) : new Uint8Array(input);
		} catch {
			throw error;
		}
		for (let i = 0; i < bytes.length; i++) {
			const lead = bytes[i];
			if (lead < 128) continue;
			const count = lead >= 194 && lead <= 223 ? 1 : lead >= 224 && lead <= 239 ? 2 : lead >= 240 && lead <= 244 ? 3 : -1;
			if (count < 0) throw new RuntimeError("invalid utf-8");
			for (let j = 1; j <= count; j++) {
				if (i + j >= bytes.length) throw new RuntimeError("incomplete utf-8 byte sequence");
				const byte = bytes[i + j];
				if (byte < 128 || byte > 191 || j === 1 && (lead === 224 && byte < 160 || lead === 237 && byte > 159 || lead === 240 && byte < 144 || lead === 244 && byte > 143)) throw new RuntimeError("invalid utf-8");
			}
			i += count;
		}
		throw error;
	}
};
const initializeLiftVariant = () => ({ scratch: /* @__PURE__ */ new DataView(/* @__PURE__ */ new ArrayBuffer(8)) });
function liftFlatBool(ctx) {
	debugLog("[_liftFlatBool()] args", { ctx });
	let val;
	if (ctx.useDirectParams) {
		if (ctx.params.length === 0) throw new Error("expected at least a single i32 argument");
		val = ctx.params[0] === 1;
		ctx.params = ctx.params.slice(1);
		return [val, ctx];
	}
	if (ctx.storageLen !== void 0 && ctx.storageLen < 1) throw new Error(`insufficient storage ([${ctx.storageLen}] bytes) for lift (bool requires 1 byte)`);
	val = new DataView(ctx.memory.buffer).getUint8(ctx.storagePtr) === 1;
	ctx.storagePtr += 1;
	if (ctx.storageLen !== void 0) ctx.storageLen -= 1;
	return [val, ctx];
}
function liftFlatS8(ctx) {
	debugLog("[_liftFlatS8()] args", { ctx });
	let val;
	if (ctx.useDirectParams) {
		if (ctx.params.length === 0) throw new Error("expected at least a single i32 argument");
		val = ctx.params[0];
		ctx.params = ctx.params.slice(1);
		return [val, ctx];
	}
	if (ctx.storageLen !== void 0 && ctx.storageLen < 1) throw new Error(`insufficient storage ([${ctx.storageLen}] bytes) for lift (s8 requires 1 byte)`);
	val = new DataView(ctx.memory.buffer).getInt8(ctx.storagePtr);
	ctx.storagePtr += 1;
	if (ctx.storageLen !== void 0) ctx.storageLen -= 1;
	return [val, ctx];
}
function liftFlatU8(ctx) {
	debugLog("[_liftFlatU8()] args", { ctx });
	let val;
	if (ctx.useDirectParams) {
		if (ctx.params.length === 0) throw new Error("expected at least a single i32 argument");
		val = ctx.params[0];
		ctx.params = ctx.params.slice(1);
		return [val, ctx];
	}
	if (ctx.storageLen !== void 0 && ctx.storageLen < 1) throw new Error(`insufficient storage ([${ctx.storageLen}] bytes) for lift (u8 requires 1 byte)`);
	val = new DataView(ctx.memory.buffer).getUint8(ctx.storagePtr);
	ctx.storagePtr += 1;
	if (ctx.storageLen !== void 0) ctx.storageLen -= 1;
	return [val, ctx];
}
function liftFlatS16(ctx) {
	debugLog("[_liftFlatS16()] args", { ctx });
	let val;
	if (ctx.useDirectParams) {
		if (ctx.params.length === 0) throw new Error("expected at least a single i32 argument");
		val = ctx.params[0];
		ctx.params = ctx.params.slice(1);
		return [val, ctx];
	}
	if (ctx.storageLen !== void 0 && ctx.storageLen < 2) throw new Error(`insufficient storage ([${ctx.storageLen}] bytes) for lift (s16 requires 2 bytes)`);
	val = new DataView(ctx.memory.buffer).getInt16(ctx.storagePtr, true);
	ctx.storagePtr += 2;
	if (ctx.storageLen !== void 0) ctx.storageLen -= 2;
	return [val, ctx];
}
function liftFlatU16(ctx) {
	debugLog("[_liftFlatU16()] args", { ctx });
	let val;
	if (ctx.useDirectParams) {
		if (ctx.params.length === 0) throw new Error("expected at least a single i32 argument");
		val = ctx.params[0];
		ctx.params = ctx.params.slice(1);
		return [val, ctx];
	}
	if (ctx.storageLen !== void 0 && ctx.storageLen < 2) throw new Error(`insufficient storage ([${ctx.storageLen}] bytes) for lift (u16 requires 2 bytes)`);
	val = new DataView(ctx.memory.buffer).getUint16(ctx.storagePtr, true);
	ctx.storagePtr += 2;
	if (ctx.storageLen !== void 0) ctx.storageLen -= 2;
	const rem = ctx.storagePtr % 2;
	if (rem !== 0) ctx.storagePtr += 2 - rem;
	return [val, ctx];
}
function liftFlatS32(ctx) {
	debugLog("[_liftFlatS32()] args", { ctx });
	let val;
	if (ctx.useDirectParams) {
		if (ctx.params.length === 0) throw new Error("expected at least a single i32 argument");
		val = ctx.params[0];
		ctx.params = ctx.params.slice(1);
		return [val, ctx];
	}
	if (ctx.storageLen !== void 0 && ctx.storageLen < 4) throw new Error(`insufficient storage ([${ctx.storageLen}] bytes) for lift (s32 requires 4 bytes)`);
	val = new DataView(ctx.memory.buffer).getInt32(ctx.storagePtr, true);
	ctx.storagePtr += 4;
	if (ctx.storageLen !== void 0) ctx.storageLen -= 4;
	return [val, ctx];
}
function liftFlatU32(ctx) {
	debugLog("[_liftFlatU32()] args", { ctx });
	let val;
	if (ctx.useDirectParams) {
		if (ctx.params.length === 0) throw new Error("expected at least a single i34 argument");
		val = ctx.params[0] >>> 0;
		ctx.params = ctx.params.slice(1);
		return [val, ctx];
	}
	if (ctx.storageLen !== void 0 && ctx.storageLen < 4) throw new Error(`insufficient storage ([${ctx.storageLen}] bytes) for lift (u32 requires 4 bytes)`);
	val = new DataView(ctx.memory.buffer).getUint32(ctx.storagePtr, true);
	ctx.storagePtr += 4;
	if (ctx.storageLen !== void 0) ctx.storageLen -= 4;
	return [val, ctx];
}
function liftFlatS64(ctx) {
	debugLog("[_liftFlatS64()] args", { ctx });
	let val;
	if (ctx.useDirectParams) {
		if (ctx.params.length === 0) throw new Error("expected at least one single i64 argument");
		if (typeof ctx.params[0] !== "bigint") throw new Error("expected bigint");
		val = ctx.params[0];
		ctx.params = ctx.params.slice(1);
		return [val, ctx];
	}
	if (ctx.storageLen !== void 0 && ctx.storageLen < 8) throw new Error(`insufficient storage ([${ctx.storageLen}] bytes) for lift (s64 requires 8 bytes)`);
	val = new DataView(ctx.memory.buffer).getBigInt64(ctx.storagePtr, true);
	ctx.storagePtr += 8;
	if (ctx.storageLen !== void 0) ctx.storageLen -= 8;
	return [val, ctx];
}
function liftFlatU64(ctx) {
	debugLog("[_liftFlatU64()] args", { ctx });
	let val;
	if (ctx.useDirectParams) {
		if (ctx.params.length === 0) throw new Error("expected at least one single i64 argument");
		if (typeof ctx.params[0] !== "bigint") throw new Error("expected bigint");
		val = BigInt.asUintN(64, ctx.params[0]);
		ctx.params = ctx.params.slice(1);
		return [val, ctx];
	}
	if (ctx.storageLen !== void 0 && ctx.storageLen < 8) throw new Error(`insufficient storage ([${ctx.storageLen}] bytes) for lift (u64 requires 8 bytes)`);
	val = new DataView(ctx.memory.buffer).getBigUint64(ctx.storagePtr, true);
	ctx.storagePtr += 8;
	if (ctx.storageLen !== void 0) ctx.storageLen -= 8;
	return [val, ctx];
}
function liftFlatFloat32(ctx) {
	debugLog("[_liftFlatFloat32()] args", { ctx });
	let val;
	if (ctx.useDirectParams) {
		if (ctx.params.length === 0) throw new Error("expected at least one single f32 argument");
		val = ctx.params[0];
		ctx.params = ctx.params.slice(1);
		return [val, ctx];
	}
	if (ctx.storageLen !== void 0 && ctx.storageLen < 4) throw new Error(`insufficient storage ([${ctx.storageLen}] bytes) for lift (f32 requires 4 bytes)`);
	val = new DataView(ctx.memory.buffer).getFloat32(ctx.storagePtr, true);
	ctx.storagePtr += 4;
	if (ctx.storageLen !== void 0) ctx.storageLen -= 4;
	return [val, ctx];
}
function liftFlatFloat64(ctx) {
	debugLog("[_liftFlatFloat64()] args", { ctx });
	let val;
	if (ctx.useDirectParams) {
		if (ctx.params.length === 0) throw new Error("expected at least one single f64 argument");
		val = ctx.params[0];
		ctx.params = ctx.params.slice(1);
		return [val, ctx];
	}
	if (ctx.storageLen !== void 0 && ctx.storageLen < 8) throw new Error(`insufficient storage ([${ctx.storageLen}] bytes) for lift (f64 requires 8 bytes)`);
	val = new DataView(ctx.memory.buffer).getFloat64(ctx.storagePtr, true);
	ctx.storagePtr += 8;
	if (ctx.storageLen !== void 0) ctx.storageLen -= 8;
	return [val, ctx];
}
function liftFlatChar(ctx) {
	debugLog("[_liftFlatChar()] args", { ctx });
	let val;
	if (ctx.useDirectParams) {
		if (ctx.params.length === 0) throw new Error("expected at least one single i32 argument");
		val = i32ToChar(ctx.params[0]);
		ctx.params = ctx.params.slice(1);
		return [val, ctx];
	}
	if (ctx.storageLen !== void 0 && ctx.storageLen < 4) throw new Error(`insufficient storage ([${ctx.storageLen}] bytes) for lift (char requires 4 bytes)`);
	val = i32ToChar(new DataView(ctx.memory.buffer).getUint32(ctx.storagePtr, true));
	ctx.storagePtr += 4;
	if (ctx.storageLen !== void 0) ctx.storageLen -= 4;
	return [val, ctx];
}
function liftFlatStringAny(_context, ctx) {
	switch (ctx.stringEncoding) {
		case "utf8": return liftFlatStringUTF8(_context, ctx);
		case "utf16": return liftFlatStringUTF16(_context, ctx);
		case "compact-utf16": {
			const [ptr, ptrCtx] = liftFlatU32(ctx);
			const [len, newCtx] = liftFlatU32(ptrCtx);
			return [compactUtf16Decode(_context.utf16, ctx.memory, ptr, len), newCtx];
		}
		default: throw new Error(`missing/unrecognized/unsupported string encoding [${ctx.stringEncoding}]`);
	}
}
/** Traps on a string whose code units are misaligned or not wholly inside the memory. */
function requireStringInMemory(RuntimeError, memory, offset, codeUnits, unitSize) {
	if (offset % unitSize !== 0) throw new RuntimeError("wasm trap: unaligned pointer");
	const byteLength = memory.buffer.byteLength;
	if (offset > byteLength || codeUnits < 0 || codeUnits > Math.floor((byteLength - offset) / unitSize)) throw new RuntimeError("string pointer/length out of bounds of memory");
}
function liftFlatStringUTF8(_context, ctx) {
	debugLog("[_liftFlatStringUTF8()] args", { ctx });
	let val;
	if (ctx.useDirectParams) {
		if (ctx.params.length < 2) throw new Error("expected at least two u32 arguments");
		let offset = ctx.params[0];
		if (typeof offset === "bigint") offset = Number(offset);
		else offset >>>= 0;
		if (!Number.isSafeInteger(offset)) throw new Error("invalid offset");
		const len = ctx.params[1];
		if (!Number.isSafeInteger(len)) throw new Error("invalid len");
		requireStringInMemory(_context.RuntimeError, ctx.memory, offset, len, 1);
		val = decodeUtf8(_context.RuntimeError, _context.utf8, new DataView(ctx.memory.buffer, offset, len));
		ctx.params = ctx.params.slice(2);
		return [val, ctx];
	}
	const rem = ctx.storagePtr % 4;
	if (rem !== 0) ctx.storagePtr += 4 - rem;
	const dv = new DataView(ctx.memory.buffer);
	const start = dv.getUint32(ctx.storagePtr, true);
	const codeUnits = dv.getUint32(ctx.storagePtr + 4, true);
	requireStringInMemory(_context.RuntimeError, ctx.memory, start, codeUnits, 1);
	val = decodeUtf8(_context.RuntimeError, _context.utf8, new Uint8Array(ctx.memory.buffer, start, codeUnits));
	ctx.storagePtr += 8;
	if (ctx.storageLen !== void 0) ctx.storageLen -= 8;
	return [val, ctx];
}
function liftFlatStringUTF16(_context, ctx) {
	debugLog("[_liftFlatStringUTF16()] args", { ctx });
	let val;
	if (ctx.useDirectParams) {
		if (ctx.params.length < 2) throw new Error("expected at least two u32 arguments");
		let offset = ctx.params[0];
		if (typeof offset === "bigint") offset = Number(offset);
		else offset >>>= 0;
		if (!Number.isSafeInteger(offset)) throw new Error("invalid offset");
		const len = ctx.params[1];
		if (!Number.isSafeInteger(len)) throw new Error("invalid len");
		requireStringInMemory(_context.RuntimeError, ctx.memory, offset, len, 2);
		val = _context.utf16.decode(new DataView(ctx.memory.buffer, offset, len * 2));
		ctx.params = ctx.params.slice(2);
		return [val, ctx];
	}
	const rem = ctx.storagePtr % 4;
	if (rem !== 0) ctx.storagePtr += 4 - rem;
	const dv = new DataView(ctx.memory.buffer);
	const start = dv.getUint32(ctx.storagePtr, true);
	const codeUnits = dv.getUint32(ctx.storagePtr + 4, true);
	requireStringInMemory(_context.RuntimeError, ctx.memory, start, codeUnits, 2);
	val = _context.utf16.decode(new DataView(ctx.memory.buffer, start, codeUnits * 2));
	ctx.storagePtr += 8;
	if (ctx.storageLen !== void 0) ctx.storageLen -= 8;
	return [val, ctx];
}
function liftFlatRecord(meta) {
	const { fieldMetas, size32: recordSize32, align32: recordAlign32 } = meta;
	return function liftFlatRecordInner(ctx) {
		debugLog("[_liftFlatRecord()] args", { ctx });
		const originalPtr = ctx.storagePtr;
		const res = {};
		for (const [key, liftFn, size32, align32] of fieldMetas) {
			let fieldPtr;
			if (ctx.storagePtr !== void 0) {
				const rem = ctx.storagePtr % align32;
				if (rem !== 0) ctx.storagePtr += align32 - rem;
				fieldPtr = ctx.storagePtr;
			}
			let fieldLen;
			if (ctx.storageLen !== void 0) fieldLen = ctx.storageLen;
			let [val, newCtx] = liftFn(ctx);
			res[key] = val;
			ctx = newCtx;
			if (fieldPtr !== void 0) ctx.storagePtr = Math.max(ctx.storagePtr, fieldPtr + size32);
			if (fieldLen !== void 0) ctx.storageLen = fieldLen - size32;
		}
		if (originalPtr !== void 0) ctx.storagePtr = Math.max(ctx.storagePtr, originalPtr + recordSize32);
		if (ctx.storagePtr !== void 0) {
			const rem = ctx.storagePtr % recordAlign32;
			if (rem !== 0) ctx.storagePtr += recordAlign32 - rem;
		}
		return [res, ctx];
	};
}
function liftFlatVariant(_context, meta) {
	const { caseMetas, variantSize32, variantAlign32, variantPayloadOffset32, variantFlatCount, variantPayloadFlatTypes, isEnum } = meta;
	return function liftFlatVariantInner(ctx) {
		debugLog("[_liftFlatVariant()] args", { ctx });
		const origUseParams = ctx.useDirectParams;
		let caseIdx;
		let liftRes;
		const originalPtr = ctx.storagePtr;
		const numCases = caseMetas.length;
		if (caseMetas.length < 256) liftRes = liftFlatU8(ctx);
		else if (numCases >= 256 && numCases < 65536) liftRes = liftFlatU16(ctx);
		else if (numCases >= 65536 && numCases < 4294967296) liftRes = liftFlatU32(ctx);
		else throw new Error(`unsupported number of variant cases [${numCases}]`);
		caseIdx = liftRes[0];
		ctx = liftRes[1];
		const [tag, liftFn, , , caseFlatCount, caseFlatTypes] = caseMetas[caseIdx];
		if (variantPayloadOffset32 === void 0) throw new Error("unexpectedly missing payload offset");
		if (originalPtr !== void 0) ctx.storagePtr = originalPtr + variantPayloadOffset32;
		let val;
		if (liftFn === null) {
			val = { tag };
			if (originalPtr !== void 0) ctx.storagePtr = originalPtr + variantSize32;
		} else {
			if (ctx.useDirectParams) {
				if (!variantPayloadFlatTypes || !caseFlatTypes) throw new Error("missing variant flat type metadata during direct-param lift");
				const scratch = _context.scratch;
				for (let i = 0; i < caseFlatTypes.length; i++) {
					const have = variantPayloadFlatTypes[i];
					const want = caseFlatTypes[i];
					if (have === want) continue;
					const val = ctx.params[i];
					if (have === "i64" && want === "i32") ctx.params[i] = Number(BigInt.asIntN(32, val));
					else if (have === "i64" && want === "f32") {
						scratch.setInt32(0, Number(BigInt.asIntN(32, val)), true);
						ctx.params[i] = scratch.getFloat32(0, true);
					} else if (have === "i64" && want === "f64") {
						scratch.setBigInt64(0, val, true);
						ctx.params[i] = scratch.getFloat64(0, true);
					} else if (have === "i32" && want === "f32") {
						scratch.setInt32(0, val, true);
						ctx.params[i] = scratch.getFloat32(0, true);
					} else throw new Error(`invalid variant payload coercion [${have}] -> [${want}]`);
				}
			}
			const [newVal, newCtx] = liftFn(ctx);
			val = {
				tag,
				val: newVal
			};
			ctx = newCtx;
		}
		if (origUseParams) {
			if (variantFlatCount === void 0 || variantFlatCount === null) {
				debugLog("[_liftFlatVariant()] variant with unknown flat count", {
					ctx,
					meta
				});
				throw new Error("cannot lift variant with unknown flat count");
			}
			if (caseFlatCount === void 0 || caseFlatCount === null) {
				debugLog("[_liftFlatVariant()] case with unknown flat count", {
					ctx,
					meta,
					case: meta.caseMetas[caseIdx]
				});
				throw new Error("cannot lift case with unknown flat count");
			}
			const remainingPayloadParams = variantFlatCount - caseFlatCount - (isEnum ? 0 : 1);
			if (remainingPayloadParams < 0) throw new Error(`invalid variant flat count metadata`);
			if (ctx.params.length < remainingPayloadParams) throw new Error(`expected at least [${remainingPayloadParams}] remaining variant payload params, but got [${ctx.params.length}]`);
			ctx.params = ctx.params.slice(remainingPayloadParams);
		}
		if (ctx.storagePtr !== void 0) {
			const rem = ctx.storagePtr % variantAlign32;
			if (rem !== 0) ctx.storagePtr += variantAlign32 - rem;
		}
		return [val, ctx];
	};
}
function liftFlatList(_context, meta) {
	const { elemLiftFn, elemSize32, elemAlign32, knownLen, typedArray } = meta;
	const listValue = typedArray === void 0 ? (values) => values : (values) => new typedArray(values);
	const readValuesAndReset = (ctx, originalPtr, originalLen, dataPtr, len) => {
		if (dataPtr < 0 || len < 0 || elemSize32 !== 0 && len > Math.floor(((1 << 28) - 1) / elemSize32) || dataPtr > ctx.memory.buffer.byteLength || elemSize32 !== 0 && len > Math.floor((ctx.memory.buffer.byteLength - dataPtr) / elemSize32)) throw new _context.RuntimeError("wasm trap: out of bounds memory access");
		if (dataPtr % elemAlign32 !== 0) throw new TypeError(`list pointer [${dataPtr}] is not aligned to ${elemAlign32}`);
		ctx.storagePtr = dataPtr;
		let val;
		if (typedArray !== void 0 && (_context.littleEndian || elemSize32 === 1)) {
			ctx.storagePtr = dataPtr + len * elemSize32;
			val = new typedArray(ctx.memory.buffer.slice(dataPtr, ctx.storagePtr));
		} else {
			const values = [];
			for (let i = 0; i < len; i++) {
				const elemPtr = dataPtr + i * elemSize32;
				ctx.storagePtr = elemPtr;
				const [res, nextCtx] = elemLiftFn(ctx);
				values.push(res);
				ctx = nextCtx;
				ctx.storagePtr = Math.max(ctx.storagePtr, elemPtr + elemSize32);
			}
			val = listValue(values);
		}
		if (originalPtr !== null) ctx.storagePtr = originalPtr;
		if (originalLen !== null) ctx.storageLen = originalLen;
		return [val, ctx];
	};
	return function liftFlatListInner(ctx) {
		debugLog("[_liftFlatList()] args", { ctx });
		let liftResults;
		if (knownLen !== void 0) {
			if (ctx.useDirectParams) {
				debugLog("memory unexpectedly missing while lifting unknown length list", { ctx });
				liftResults = [listValue(ctx.params.slice(0, knownLen)), ctx];
				ctx.params = ctx.params.slice(knownLen);
			} else {
				if (ctx.memory === null) {
					debugLog("memory unexpectedly missing while lifting known length list", {
						knownLen,
						ctx
					});
					throw new Error(`memory missing while lifting known length (${knownLen}) list`);
				}
				const originalLen = ctx.storageLen;
				ctx.storageLen = knownLen * elemSize32;
				liftResults = readValuesAndReset(ctx, null, originalLen, ctx.storagePtr, knownLen);
			}
		} else if (ctx.useDirectParams) {
			const dataPtr = ctx.params[0] >>> 0;
			const len = ctx.params[1];
			ctx.params = ctx.params.slice(2);
			ctx.useDirectParams = false;
			const originalPtr = ctx.storagePtr;
			const originalLen = ctx.storageLen;
			ctx.storageLen = len * elemSize32;
			liftResults = readValuesAndReset(ctx, originalPtr, originalLen, dataPtr, len);
			ctx.useDirectParams = true;
		} else {
			const originalLen = ctx.storageLen;
			ctx.storageLen = 8;
			const dataPtrLiftRes = liftFlatU32(ctx);
			const dataPtr = dataPtrLiftRes[0];
			ctx = dataPtrLiftRes[1];
			const lenLiftRes = liftFlatU32(ctx);
			const len = lenLiftRes[0];
			ctx = lenLiftRes[1];
			const originalPtr = ctx.storagePtr;
			ctx.storagePtr = dataPtr;
			ctx.storageLen = len * elemSize32;
			liftResults = readValuesAndReset(ctx, originalPtr, originalLen, dataPtr, len);
		}
		return liftResults;
	};
}
function liftFlatMap(meta) {
	const { keyLiftFn, valueLiftFn, entrySize32, valueOffset32 } = meta;
	const readEntriesAndReset = (ctx, originalPtr, originalLen, dataPtr, len) => {
		const val = /* @__PURE__ */ new Map();
		for (let i = 0; i < len; i++) {
			const entryPtr = dataPtr + i * entrySize32;
			ctx.storagePtr = entryPtr;
			const [key, keyCtx] = keyLiftFn(ctx);
			ctx = keyCtx;
			ctx.storagePtr = entryPtr + valueOffset32;
			const [value, valueCtx] = valueLiftFn(ctx);
			ctx = valueCtx;
			val.set(key, value);
		}
		if (originalPtr !== null) ctx.storagePtr = originalPtr;
		if (originalLen !== null) ctx.storageLen = originalLen;
		return [val, ctx];
	};
	return function liftFlatMapInner(ctx) {
		debugLog("[_liftFlatMap()] args", { ctx });
		let dataPtr;
		let len;
		let originalPtr = ctx.storagePtr;
		const originalLen = ctx.storageLen;
		if (ctx.useDirectParams) {
			dataPtr = ctx.params[0] >>> 0;
			len = ctx.params[1];
			ctx.params = ctx.params.slice(2);
		} else {
			ctx.storageLen = 8;
			let lifted = liftFlatU32(ctx);
			dataPtr = lifted[0];
			ctx = lifted[1];
			lifted = liftFlatU32(ctx);
			len = lifted[0];
			ctx = lifted[1];
			originalPtr = ctx.storagePtr;
		}
		const wasDirect = ctx.useDirectParams;
		ctx.useDirectParams = false;
		ctx.storageLen = len * entrySize32;
		const result = readEntriesAndReset(ctx, originalPtr, originalLen, dataPtr, len);
		result[1].useDirectParams = wasDirect;
		return result;
	};
}
function liftFlatTuple(meta) {
	const { elemLiftFns, size32: tupleSize32, align32: tupleAlign32 } = meta;
	return function liftFlatTupleInner(ctx) {
		debugLog("[_liftFlatTuple()] args", { ctx });
		const originalPtr = ctx.storagePtr;
		const val = [];
		for (const [liftFn, size32, align32] of elemLiftFns) {
			let elemPtr;
			if (ctx.storagePtr !== void 0) {
				const rem = ctx.storagePtr % align32;
				if (rem !== 0) ctx.storagePtr += align32 - rem;
				elemPtr = ctx.storagePtr;
			}
			let elemLen;
			if (ctx.storageLen !== void 0) elemLen = ctx.storageLen;
			const [newValue, newCtx] = liftFn(ctx);
			val.push(newValue);
			ctx = newCtx;
			if (elemPtr !== void 0) ctx.storagePtr = Math.max(ctx.storagePtr, elemPtr + size32);
			if (elemLen !== void 0) ctx.storageLen = elemLen - size32;
		}
		if (originalPtr !== void 0) ctx.storagePtr = Math.max(ctx.storagePtr, originalPtr + tupleSize32);
		if (ctx.storagePtr !== void 0) {
			const rem = ctx.storagePtr % tupleAlign32;
			if (rem !== 0) ctx.storagePtr += tupleAlign32 - rem;
		}
		return [val, ctx];
	};
}
function liftFlatEnum(_context, meta) {
	meta.isEnum = true;
	const f = liftFlatVariant(_context, meta);
	return function liftFlatEnumInner(ctx) {
		debugLog("[_liftFlatEnum()] args", { ctx });
		const res = f(ctx);
		res[0] = res[0].tag;
		return res;
	};
}
function liftFlatOption(_context, meta) {
	const { payloadMaybeNull } = meta;
	const f = liftFlatVariant(_context, meta);
	return function liftFlatOptionInner(ctx) {
		debugLog("[_liftFlatOption()] args", { ctx });
		const res = f(ctx);
		if (!payloadMaybeNull) {
			const value = res[0];
			res[0] = value.tag === "none" ? void 0 : value.val;
		}
		return res;
	};
}
function liftFlatResult(_context, meta) {
	const f = liftFlatVariant(_context, meta);
	return function liftFlatResultInner(ctx) {
		debugLog("[_liftFlatResult()] args", { ctx });
		const res = f(ctx);
		const value = res[0];
		if (!("val" in value)) value.val = void 0;
		return res;
	};
}
function liftFlatFlags(_context, meta) {
	const { names, align32, intSizeBytes } = meta;
	return function liftFlatFlagsInner(ctx) {
		debugLog("[_liftFlatFlags()] args", { ctx });
		let val = _context.asBigInt ? null : {};
		let liftRes;
		switch (intSizeBytes) {
			case 1:
				liftRes = liftFlatU8(ctx);
				break;
			case 2:
				liftRes = liftFlatU16(ctx);
				break;
			case 4:
				liftRes = liftFlatU32(ctx);
				break;
			default: throw new Error("invalid flags size");
		}
		let bits = liftRes[0];
		ctx = liftRes[1];
		if (_context.asBigInt) val = BigInt(bits >>> 0);
		else for (const name of names) {
			val[name] = (bits & 1) === 1;
			bits >>>= 1;
		}
		const rem = ctx.storagePtr % align32;
		if (rem !== 0) ctx.storagePtr += align32 - rem;
		return [val, ctx];
	};
}
function liftFlatOwn(meta) {
	const { classNameFn, createResourceFn, componentIdx, tableIdx } = meta;
	return function liftFlatOwnInner(ctx) {
		debugLog("[_liftFlatOwn()] args", {
			ctx,
			className: classNameFn()
		});
		if (ctx.componentIdx !== componentIdx) throw new Error("invalid component for resource lift");
		const [handle, newCtx] = liftFlatU32(ctx);
		return [ctx.liftResource ? ctx.liftResource(handle, tableIdx) : createResourceFn(handle), newCtx];
	};
}
function liftFlatBorrow(componentTableIdx, size, memory, vals, storagePtr, storageLen) {
	debugLog("[_liftFlatBorrow()] args", {
		size,
		memory,
		vals,
		storagePtr,
		storageLen
	});
	throw new Error("flat lift for borrowed resources is not supported!");
}
function liftFlatFuture(_context, meta) {
	const { futureTableIdx, componentIdx } = meta;
	return function liftFlatFutureInner(ctx) {
		debugLog("[_liftFlatFuture()] args", { ctx });
		const futureMeta = _context.tables[futureTableIdx];
		if (futureMeta.componentIdx !== componentIdx) throw new Error("unexpectedly mismatched component idx");
		const { table } = futureMeta;
		if (componentIdx === void 0 || !table) throw new Error(`invalid global future table state for table [${futureTableIdx}]`);
		let futureEndWaitableIdx;
		if (ctx.useDirectParams) {
			futureEndWaitableIdx = ctx.params[0];
			ctx.params = ctx.params.slice(1);
		} else {
			const [waitableIdx, newCtx] = liftFlatU32(ctx);
			ctx = newCtx;
			futureEndWaitableIdx = waitableIdx;
		}
		if (futureEndWaitableIdx === void 0) throw new Error("missing future idx");
		if (!getOrCreateAsyncState(_context.lookup, componentIdx)) throw new Error(`missing async state for component [${componentIdx}]`);
		const futureEnd = getFutureEnd(_context, {
			tableIdx: futureTableIdx,
			futureEndWaitableIdx
		});
		if (!futureEnd) throw new Error(`missing future end [${futureEndWaitableIdx}] (table [${futureTableIdx}]) in component [${componentIdx}] during lift`);
		if (ctx.isBorrowed) throw new Error("cannot lift flat future of borrowed type");
		if (futureEnd.isWritable()) throw new _context.RuntimeError("only readable futures can be lifted");
		if (futureEnd.isDoneState()) throw new _context.RuntimeError("cannot lift future after previous read succeeded");
		if (!futureEnd.isIdleState()) throw new _context.RuntimeError("futures must be in idle state");
		if (futureEnd.isInSet()) throw new _context.RuntimeError("cannot lift future while it's in a waitable set");
		return [futureEnd.promise(), ctx];
	};
}
function liftFlatStream(_context, meta) {
	const { streamTableIdx, componentIdx } = meta;
	return function liftFlatStreamInner(ctx) {
		debugLog("[_liftFlatStream()] args", { ctx });
		const streamMeta = _context.tables[streamTableIdx];
		if (streamMeta.componentIdx !== componentIdx) throw new Error("unexpectedly mismatched component idx");
		const { table } = streamMeta;
		if (componentIdx === void 0 || !table) throw new Error(`invalid global stream table state for table [${streamTableIdx}]`);
		let streamEndWaitableIdx;
		if (ctx.useDirectParams) {
			streamEndWaitableIdx = ctx.params[0];
			ctx.params = ctx.params.slice(1);
		} else {
			const [waitableIdx, newCtx] = liftFlatU32(ctx);
			ctx = newCtx;
			streamEndWaitableIdx = waitableIdx;
		}
		if (!streamEndWaitableIdx) throw new _context.RuntimeError("missing stream idx");
		if (!getOrCreateAsyncState(_context.lookup, componentIdx)) throw new Error(`missing async state for component [${componentIdx}]`);
		const streamEnd = getStreamEnd(_context, {
			tableIdx: streamTableIdx,
			streamEndWaitableIdx
		});
		if (!streamEnd) throw new Error(`missing stream end [${streamEndWaitableIdx}] (table [${streamTableIdx}]) in component [${componentIdx}] during lift`);
		if (ctx.isBorrowed) throw new Error("cannot lift flat stream of borrowed type");
		if (streamEnd.isWritable()) throw new _context.RuntimeError("only readable streams can be lifted");
		if (streamEnd.isDoneState()) throw new _context.RuntimeError("cannot lift stream after being notified that the writable end dropped");
		if (!streamEnd.isIdleState()) throw new _context.RuntimeError("streams must be in idle state");
		if (streamEnd.isInSet()) throw new _context.RuntimeError("cannot lift stream while it's in a waitable set");
		return [new _context.Stream({
			globalRep: streamEnd.globalStreamMapRep(),
			isReadable: streamEnd.isReadable(),
			isWritable: streamEnd.isWritable(),
			writeFn: (v) => {
				return streamEnd.write(v);
			},
			readFn: (opts) => {
				return streamEnd.read(opts);
			},
			dropFn: () => {
				return streamEnd.drop({ allowPendingEvent: true });
			}
		}), ctx];
	};
}
function liftFlatErrorContext(_context, errCtxTableIdx, ctx) {
	debugLog("[_liftFlatErrorContext()] ctx", ctx);
	let val;
	let table;
	if (ctx.useDirectParams) {
		if (ctx.params.length === 0) throw new Error("expected at least one single i32 argument");
		val = ctx.params[0];
		ctx.params = ctx.params.slice(1);
		table = errCtxGetLocalTable(_context.local, ctx.componentIdx, errCtxTableIdx);
	} else throw new Error("indirect flat lift for error-contexts not yet implemented!");
	let handle = table.get(val);
	if (handle === void 0) throw new Error(`missing  error ctx (handle [${val}], component [${ctx.componentIdx}], error context table [${errCtxTableIdx}])`);
	const errCtx = getOrCreateAsyncState(_context.lookup, ctx.componentIdx).handles.get(handle);
	if (!errCtx || errCtx.globalRep === void 0 || errCtx.refCount === void 0) throw new Error(`malformed error context (handle [${handle}], component [${ctx.componentIdx}])`);
	errCtx.refCount -= 1;
	errCtxGlobalRefCountAdd(_context.globalTable, errCtx.globalRep);
	const globalErrCtx = _context.globalTable.get().get(errCtx.globalRep);
	globalErrCtx.pendingLifts = (globalErrCtx.pendingLifts ?? 0) + 1;
	return [errCtx.globalRep, ctx];
}

//#endregion
//#region runtime/intrinsics/stream/source.js
function isStreamLowerableObject(context, obj) {
	if (obj === null || typeof obj !== "object") return false;
	return obj instanceof context.Stream || context.asyncIteratorSymbol in obj || context.iteratorSymbol in obj || obj instanceof context.ReadableStream;
}
function genReadFnFromLowerableStream(context, stream) {
	if (!isStreamLowerableObject(context.lowerable, stream)) throw new Error("cannot generate read fn: object is not a stream lowerable object");
	const { asyncIteratorSymbol, iteratorSymbol, ReadableStream } = context.lowerable;
	const source = stream;
	const dropIterator = (iterator) => (reason) => iterator.return ? disposeHostValue(context.disposeSymbol, iterator, () => iterator.return(reason)) : disposeHostValue(context.disposeSymbol, stream);
	let readFn;
	if (asyncIteratorSymbol in source) {
		const iterator = source[asyncIteratorSymbol]();
		readFn = () => iterator.next();
		readFn.drop = dropIterator(iterator);
	} else if (iteratorSymbol in source) {
		const iterator = source[iteratorSymbol]();
		readFn = async () => iterator.next();
		readFn.drop = dropIterator(iterator);
		readFn.sourceIsSync = true;
	} else if (stream instanceof ReadableStream) {
		const reader = stream.getReader();
		readFn = () => reader.read();
		readFn.drop = (reason) => disposeHostValue(context.disposeSymbol, reader, () => reader.cancel(reason).finally(() => reader.releaseLock()));
	} else throw new Error("invalid stream object, cannot generate read fn");
	const drop = readFn.drop;
	readFn.drop = (reason) => {
		readFn.dropped = true;
		return drop(reason);
	};
	return readFn;
}

//#endregion
//#region runtime/intrinsics/stream/injection.js
function genStreamHostInjectFn(_context, genArgs) {
	const { readFn, hostWriteEnd, readEnd } = genArgs;
	if (!readEnd) throw new TypeError("missing read end");
	const doNothingFn = () => {};
	const resetWriteEndToIdleFn = () => {
		if (hostWriteEnd.hasPendingEvent()) hostWriteEnd.getPendingEvent();
	};
	const elemMeta = hostWriteEnd.getElemMeta();
	const pendingValues = new _context.PendingValueQueue(readFn, elemMeta);
	hostWriteEnd.setSourceRebufferFn((items) => pendingValues.prepend(items));
	return async function generatedStreamHostInject(args) {
		let { count } = args;
		if (count < 0) throw new Error("invalid count");
		if (readEnd.hasPendingEvent()) return resetWriteEndToIdleFn;
		if (hostWriteEnd.isDoneState()) return doNothingFn;
		const values = [];
		const hasPendingReadBuffer = () => !!readEnd.getPendingBufferMeta?.().buffer;
		const drainPendingValues = () => {
			count -= pendingValues.drainInto(values, count);
		};
		const writeValues = async (writeValues, dropAfterCopy = false) => {
			resetWriteEndToIdleFn();
			const writePromise = hostWriteEnd.writeMany(writeValues, { dropAfterCopy });
			if (hostWriteEnd.hasPendingEvent()) writePromise.catch(() => {});
			else await writePromise;
			resetWriteEndToIdleFn();
		};
		const bail = () => {
			pendingValues.prepend(values);
			return doNothingFn;
		};
		readEnd.setHostCancelFn?.(() => {
			const buffer = readEnd.getPendingBufferMeta?.().buffer;
			if (!buffer || pendingValues.length === 0) return false;
			const cancelValues = [];
			pendingValues.drainInto(cancelValues, buffer.remaining());
			if (cancelValues.length === 0) return false;
			resetWriteEndToIdleFn();
			const writePromise = hostWriteEnd.writeMany(cancelValues);
			if (!hostWriteEnd.hasPendingEvent()) {
				pendingValues.prepend(cancelValues);
				return false;
			}
			writePromise.catch(() => {});
			resetWriteEndToIdleFn();
			return true;
		});
		if (!hasPendingReadBuffer()) return doNothingFn;
		if (count === 0) {
			if (pendingValues.length === 0 && !pendingValues.done) {
				await pendingValues.readSource();
				if (readEnd.hasPendingEvent() || !hasPendingReadBuffer()) return doNothingFn;
			}
			if (pendingValues.length > 0) readEnd.resetAndNotifyPending(readEnd.constructor.CopyResult.COMPLETED);
			else if (pendingValues.done) {
				hostWriteEnd.getPendingEvent();
				hostWriteEnd.drop();
			}
			return doNothingFn;
		}
		drainPendingValues();
		while (count > 0 && !pendingValues.done && (values.length === 0 || pendingValues.sourceIsSync)) {
			const appended = await pendingValues.readSource();
			if (readEnd.hasPendingEvent()) return bail();
			if (!hasPendingReadBuffer()) return bail();
			drainPendingValues();
			if (values.length > 0 && !pendingValues.sourceIsSync) break;
			if (appended === 0 && !pendingValues.done) count -= 1;
			if (pendingValues.done) break;
		}
		if (pendingValues.done && values.length === 0 && pendingValues.length > 0 && hasPendingReadBuffer()) drainPendingValues();
		if (pendingValues.done && values.length === 0) {
			hostWriteEnd.getPendingEvent();
			hostWriteEnd.drop();
			return doNothingFn;
		}
		if (!hasPendingReadBuffer()) return bail();
		await writeValues(values, pendingValues.done);
		return doNothingFn;
	};
}

//#endregion
//#region runtime/intrinsics/future/operations.js
/**
* Implements `canon future.new`.
* Create a future and pack its readable and writable indices into one i64.
*/
function futureNew(_context, ctx) {
	debugLog("[futureNew()] args", { ctx });
	const { componentIdx, futureTableIdx, elemMeta } = ctx;
	const taskMeta = getCurrentTask(_context.taskLookup, componentIdx);
	if (!taskMeta) throw new Error("invalid/missing async task meta");
	if (!taskMeta.task) throw new Error("invalid/missing async task");
	const cstate = getOrCreateAsyncState(_context.lookup, componentIdx);
	if (!cstate.mayLeave) throw new Error("component instance is not marked as may leave");
	const { readEnd, writeEnd } = createFuture(_context.creation, cstate, {
		tableIdx: futureTableIdx,
		elemMeta
	});
	let writeEndWaitableIdx = writeEnd.waitableIdx();
	let readEndWaitableIdx = readEnd.waitableIdx();
	return BigInt(writeEndWaitableIdx) << 32n | BigInt(readEndWaitableIdx);
}
/** Expose a guest future as a lazy host awaitable. */
function futureNewFromLift(_context, ctx) {
	debugLog("[futureNewFromLift()] args", { ctx });
	const { componentIdx, futureEndWaitableIdx, futureTableIdx, payloadLiftFn, payloadTypeSize32, payloadLowerFn } = ctx;
	const future = new _context.HostFuture({
		componentIdx,
		futureEndWaitableIdx,
		futureTableIdx,
		payloadLiftFn,
		payloadLowerFn
	});
	const rep = _context.futures.insert(future);
	future.setRep(rep);
	return future.createUserFuture();
}
/**
* Implements `canon future.write`.
* Write one value, returning a canonical result or waiting for a synchronous copy.
*/
function futureWrite(_context, ctx, futureEndWaitableIdx, ptr) {
	debugLog("[futureWrite()] args", {
		ctx,
		futureEndWaitableIdx,
		ptr
	});
	const { componentIdx, futureTableIdx, memoryIdx, getMemoryFn, reallocIdx, getReallocFn, stringEncoding, isAsync, elemMeta } = ctx;
	ptr >>>= 0;
	const taskMeta = getCurrentTask(_context.taskLookup, componentIdx);
	if (!taskMeta) throw new Error("missing task metadata during future operation");
	const task = taskMeta.task;
	if (!task) throw new Error("missing task in metadata during future operation");
	if (!getOrCreateAsyncState(_context.lookup, componentIdx).mayLeave) throw new Error("component instance is not marked as may leave");
	if (!task.mayBlock() && !isAsync) throw new Error("only tasks that may block may call future.futureWrite");
	const futureEnd = getFutureEnd(_context.ends, {
		tableIdx: futureTableIdx,
		futureEndWaitableIdx
	});
	if (!futureEnd) throw new Error(`missing future with waitable idx [${futureEndWaitableIdx}] (component [${componentIdx}])`);
	if (!(futureEnd instanceof _context.FutureEnd)) throw new _context.RuntimeError("invalid future end, expected [FutureWritableEnd]");
	if (futureEnd.isDoneState()) {
		const message = futureEnd.isWritable() ? "cannot write to future after previous write succeeded or readable end dropped" : "cannot read from future after previous read succeeded";
		throw new _context.RuntimeError(message);
	}
	if (!futureEnd.isIdleState()) throw new _context.RuntimeError("cannot have concurrent operations active on a future/stream");
	if (futureEnd.hasPendingEvent()) {
		const { code, payload0: index, payload1: payload } = futureEnd.getPendingEvent();
		if (code !== _context.events.FUTURE_WRITE) throw new Error(`mismatched event code [${code}] (expected ASYNC_EVENT_CODE.FUTURE_WRITE)`);
		if (index !== futureEnd.waitableIdx()) throw new Error("mismatched future end index");
		return payload;
	}
	futureEnd.guestWrite({
		componentIdx,
		stringEncoding,
		elemMeta,
		memory: getMemoryFn?.(),
		realloc: getReallocFn?.(),
		getReallocFn,
		ptr
	});
	if (!futureEnd.hasPendingEvent()) {
		if (isAsync) {
			futureEnd.setCopyState(_context.Base.CopyState.ASYNC_COPYING);
			return asyncBlockedCode;
		} else {
			futureEnd.setCopyState(_context.Base.CopyState.SYNC_COPYING);
			return task.suspendUntil({ readyFn: () => futureEnd.hasPendingEvent() }).then((completed) => {
				if (!completed || !futureEnd.hasPendingEvent()) throw task.isErrored() ?? new _context.RuntimeError("synchronous future operation interrupted before completion");
				const { code, payload0: index, payload1: payload } = futureEnd.getPendingEvent();
				if (code !== _context.events.FUTURE_WRITE) throw new Error(`mismatched event code [${code}] (expected ASYNC_EVENT_CODE.FUTURE_WRITE)`);
				if (index !== futureEnd.waitableIdx()) throw new Error("mismatched future end index");
				return payload;
			});
		}
	}
	const { code, payload0: index, payload1: payload } = futureEnd.getPendingEvent();
	if (code !== _context.events.FUTURE_WRITE) throw new Error(`mismatched event code [${code}] (expected ASYNC_EVENT_CODE.FUTURE_WRITE)`);
	if (index !== futureEnd.waitableIdx()) throw new Error("mismatched future end index");
	return payload;
}
/**
* Implements `canon future.read`.
* Read one value, returning a canonical result or waiting for a synchronous copy.
*/
function futureRead(_context, ctx, futureEndWaitableIdx, ptr) {
	debugLog("[futureRead()] args", {
		ctx,
		futureEndWaitableIdx,
		ptr
	});
	const { componentIdx, futureTableIdx, memoryIdx, getMemoryFn, reallocIdx, getReallocFn, stringEncoding, isAsync, elemMeta } = ctx;
	ptr >>>= 0;
	const taskMeta = getCurrentTask(_context.taskLookup, componentIdx);
	if (!taskMeta) throw new Error("missing task metadata during future operation");
	const task = taskMeta.task;
	if (!task) throw new Error("missing task in metadata during future operation");
	if (!getOrCreateAsyncState(_context.lookup, componentIdx).mayLeave) throw new Error("component instance is not marked as may leave");
	if (!task.mayBlock() && !isAsync) throw new Error("only tasks that may block may call future.futureRead");
	const futureEnd = getFutureEnd(_context.ends, {
		tableIdx: futureTableIdx,
		futureEndWaitableIdx
	});
	if (!futureEnd) throw new Error(`missing future with waitable idx [${futureEndWaitableIdx}] (component [${componentIdx}])`);
	if (!(futureEnd instanceof _context.FutureEnd)) throw new _context.RuntimeError("invalid future end, expected [FutureReadableEnd]");
	if (futureEnd.isDoneState()) {
		const message = futureEnd.isWritable() ? "cannot write to future after previous write succeeded or readable end dropped" : "cannot read from future after previous read succeeded";
		throw new _context.RuntimeError(message);
	}
	if (!futureEnd.isIdleState()) throw new _context.RuntimeError("cannot have concurrent operations active on a future/stream");
	if (futureEnd.hasPendingEvent()) {
		const { code, payload0: index, payload1: payload } = futureEnd.getPendingEvent();
		if (code !== _context.events.FUTURE_READ) throw new Error(`mismatched event code [${code}] (expected ASYNC_EVENT_CODE.FUTURE_READ)`);
		if (index !== futureEnd.waitableIdx()) throw new Error("mismatched future end index");
		return payload;
	}
	futureEnd.guestRead({
		componentIdx,
		stringEncoding,
		elemMeta,
		memory: getMemoryFn?.(),
		realloc: getReallocFn?.(),
		getReallocFn,
		ptr
	});
	if (!futureEnd.hasPendingEvent()) {
		if (isAsync) {
			futureEnd.setCopyState(_context.Base.CopyState.ASYNC_COPYING);
			return asyncBlockedCode;
		} else {
			futureEnd.setCopyState(_context.Base.CopyState.SYNC_COPYING);
			return task.suspendUntil({ readyFn: () => futureEnd.hasPendingEvent() }).then((completed) => {
				if (!completed || !futureEnd.hasPendingEvent()) throw task.isErrored() ?? new _context.RuntimeError("synchronous future operation interrupted before completion");
				const { code, payload0: index, payload1: payload } = futureEnd.getPendingEvent();
				if (code !== _context.events.FUTURE_READ) throw new Error(`mismatched event code [${code}] (expected ASYNC_EVENT_CODE.FUTURE_READ)`);
				if (index !== futureEnd.waitableIdx()) throw new Error("mismatched future end index");
				return payload;
			});
		}
	}
	const { code, payload0: index, payload1: payload } = futureEnd.getPendingEvent();
	if (code !== _context.events.FUTURE_READ) throw new Error(`mismatched event code [${code}] (expected ASYNC_EVENT_CODE.FUTURE_READ)`);
	if (index !== futureEnd.waitableIdx()) throw new Error("mismatched future end index");
	return payload;
}
/**
* Implements `canon future.cancel-read`.
* Cancel an active read and report its completion event.
*/
function futureCancelRead(_context, ctx, futureEndWaitableIdx) {
	debugLog("[futureCancelRead()] args", {
		ctx,
		futureEndWaitableIdx
	});
	const { componentIdx, futureTableIdx, isAsync } = ctx;
	if (!getOrCreateAsyncState(_context.lookup, componentIdx).mayLeave) throw new Error("component instance is not marked as may leave");
	const futureEnd = getFutureEnd(_context.ends, {
		tableIdx: futureTableIdx,
		futureEndWaitableIdx
	});
	if (!futureEnd) throw new _context.RuntimeError(`missing future end with idx [${futureEndWaitableIdx}]`);
	if (!(futureEnd instanceof _context.FutureEnd)) throw new _context.RuntimeError("invalid future end, expected value of type [FutureReadableEnd]");
	if (!futureEnd.isCopying()) throw new _context.RuntimeError("future end is not copying, cannot cancel");
	futureEnd.setCopyState(_context.FutureEnd.CopyState.CANCELLING_COPY);
	const finishCancel = () => {
		const { code, payload0: index, payload1: payload } = futureEnd.getPendingEvent();
		if (futureEnd.isCopying()) throw new Error("future end is still in copying state");
		if (code !== _context.events.FUTURE_READ) throw new Error("unexpected event code [" + code + "], expected [" + _context.events.FUTURE_READ + "]");
		if (index !== futureEndWaitableIdx) throw new Error("index does not match future end");
		return payload;
	};
	if (!futureEnd.hasPendingEvent()) {
		futureEnd.cancel();
		if (!futureEnd.hasPendingEvent()) {
			if (isAsync) return asyncBlockedCode;
			const taskMeta = getCurrentTask(_context.taskLookup, componentIdx);
			if (!taskMeta?.task) throw new Error("missing current task while cancelling future");
			return taskMeta.task.suspendUntil({ readyFn: () => futureEnd.hasPendingEvent() }).then(finishCancel);
		}
	}
	return finishCancel();
}
/**
* Implements `canon future.cancel-write`.
* Cancel an active write and report its completion event.
*/
function futureCancelWrite(_context, ctx, futureEndWaitableIdx) {
	debugLog("[futureCancelWrite()] args", {
		ctx,
		futureEndWaitableIdx
	});
	const { componentIdx, futureTableIdx, isAsync } = ctx;
	if (!getOrCreateAsyncState(_context.lookup, componentIdx).mayLeave) throw new Error("component instance is not marked as may leave");
	const futureEnd = getFutureEnd(_context.ends, {
		tableIdx: futureTableIdx,
		futureEndWaitableIdx
	});
	if (!futureEnd) throw new _context.RuntimeError(`missing future end with idx [${futureEndWaitableIdx}]`);
	if (!(futureEnd instanceof _context.FutureEnd)) throw new _context.RuntimeError("invalid future end, expected value of type [FutureWritableEnd]");
	if (!futureEnd.isCopying()) throw new _context.RuntimeError("future end is not copying, cannot cancel");
	futureEnd.setCopyState(_context.FutureEnd.CopyState.CANCELLING_COPY);
	const finishCancel = () => {
		const { code, payload0: index, payload1: payload } = futureEnd.getPendingEvent();
		if (futureEnd.isCopying()) throw new Error("future end is still in copying state");
		if (code !== _context.events.FUTURE_WRITE) throw new Error("unexpected event code [" + code + "], expected [" + _context.events.FUTURE_WRITE + "]");
		if (index !== futureEndWaitableIdx) throw new Error("index does not match future end");
		return payload;
	};
	if (!futureEnd.hasPendingEvent()) {
		futureEnd.cancel();
		if (!futureEnd.hasPendingEvent()) {
			if (isAsync) return asyncBlockedCode;
			const taskMeta = getCurrentTask(_context.taskLookup, componentIdx);
			if (!taskMeta?.task) throw new Error("missing current task while cancelling future");
			return taskMeta.task.suspendUntil({ readyFn: () => futureEnd.hasPendingEvent() }).then(finishCancel);
		}
	}
	return finishCancel();
}
/**
* Implements `canon future.drop-readable`.
* Remove and drop the readable endpoint from its owning tables.
*/
function futureDropReadable(_context, ctx, futureEndWaitableIdx) {
	debugLog("[futureDropReadable()] args", { ctx });
	const { componentIdx, futureTableIdx } = ctx;
	if (!getOrCreateAsyncState(_context.tables.lookup, componentIdx).mayLeave) throw new Error("component instance is not marked as may leave");
	const futureEnd = removeFutureEndFromTable(_context.tables, {
		tableIdx: futureTableIdx,
		futureWaitableIdx: futureEndWaitableIdx
	});
	if (!(futureEnd instanceof _context.FutureEnd)) throw new _context.RuntimeError("invalid future end, expected [FutureReadableEnd]");
	futureEnd.drop();
}
/**
* Implements `canon future.drop-writable`.
* Remove and drop a writable endpoint after its value was written.
*/
function futureDropWritable(_context, ctx, futureEndWaitableIdx) {
	debugLog("[futureDropWritable()] args", { ctx });
	const { componentIdx, futureTableIdx } = ctx;
	if (!getOrCreateAsyncState(_context.tables.lookup, componentIdx).mayLeave) throw new Error("component instance is not marked as may leave");
	const futureEnd = removeFutureEndFromTable(_context.tables, {
		tableIdx: futureTableIdx,
		futureWaitableIdx: futureEndWaitableIdx
	});
	if (!(futureEnd instanceof _context.FutureEnd)) throw new _context.RuntimeError("invalid future end, expected [FutureWritableEnd]");
	futureEnd.drop();
}
/** Transfer a readable endpoint between component tables. */
function futureTransfer(_context, srcFutureWaitableIdx, srcTableIdx, destTableIdx) {
	debugLog("[futureTransfer()] args", {
		srcFutureWaitableIdx,
		srcTableIdx,
		destTableIdx
	});
	const futureMeta = _context.tables[srcTableIdx];
	if (!futureMeta) throw new Error("missing future meta during transfer");
	const componentIdx = futureMeta.componentIdx;
	if (!getOrCreateAsyncState(_context.lookup, componentIdx)) throw new Error(`missing async state for component [${componentIdx}]`);
	const futureEnd = getFutureEnd(_context, {
		tableIdx: srcTableIdx,
		futureEndWaitableIdx: srcFutureWaitableIdx
	});
	if (!futureEnd.isReadable()) throw new Error("writable future ends cannot be moved");
	if (futureEnd.isDoneState()) throw new _context.RuntimeError("cannot lift future after previous read succeeded");
	if (futureEnd.isInSet()) throw new _context.RuntimeError("cannot lift future while it's in a waitable set");
	if (removeFutureEndFromTable(_context, {
		tableIdx: srcTableIdx,
		futureWaitableIdx: srcFutureWaitableIdx
	}) !== futureEnd) throw new Error("removed future end does not match validated future end");
	const { handle, waitableIdx } = addFutureEndToTable(_context, {
		tableIdx: destTableIdx,
		futureEnd
	});
	futureEnd.setTarget(`future read end (waitable [${waitableIdx}])`);
	debugLog("[futureTransfer()] successfully transferred", {
		dest: {
			futureEndHandle: handle,
			futureEndWaitableIdx: waitableIdx,
			tableIdx: destTableIdx
		},
		src: {
			futureEndWaitableIdx: srcFutureWaitableIdx,
			tableIdx: srcTableIdx
		},
		componentIdx
	});
	return waitableIdx;
}
/** Create a lazy host write with disposal and pending-operation tracking. */
function genFutureHostInjectFn(_context, genArgs) {
	const { promise, hostWriteEnd, stringEncoding, getReallocFn } = genArgs;
	if (promise instanceof Promise) promise.catch(() => {});
	let delivered = false;
	const inject = async function generateFutureHostInject(args) {
		let { count } = args;
		if (count !== 1) throw new Error("invalid count");
		if (hostWriteEnd.isDoneState()) return () => {
			throw new Error("cannot inject write: host must write to future before closing");
		};
		let value;
		try {
			value = await trackHostOperation(_context.tracking, () => promise);
		} catch (err) {
			if (hostWriteEnd.isPeerDropped()) return () => {};
			if (!hostWriteEnd.getElemMeta().payloadTypeName?.startsWith("Result(")) {
				debugLog("failed to inject host write", err);
				throw new Error("cannot inject write: promise failed");
			}
			value = {
				tag: "err",
				val: getErrorPayload(_context.hasOwnProperty, err)
			};
		}
		if (hostWriteEnd.isPeerDropped()) return () => {};
		try {
			if (value && typeof value === "object" && value[_context.nestedSymbol]) value = Promise.resolve(value);
			delivered = await hostWriteEnd.hostWrite({
				stringEncoding,
				value,
				getReallocFn
			});
		} catch (err) {
			debugLog("failed to inject host write", err);
			throw new Error("cannot inject write: promise failed");
		}
		hostWriteEnd.getPendingEvent();
		hostWriteEnd.drop();
		return () => {
			if (hostWriteEnd.hasPendingEvent()) hostWriteEnd.getPendingEvent();
		};
	};
	inject.drop = () => {
		if (!delivered) disposeHostValue(_context.disposeSymbol, promise);
	};
	return inject;
}
/** Check whether a value is an object with a callable then operation. */
function isFutureLowerableObject(obj) {
	if (obj === null || typeof obj !== "object") return false;
	return obj instanceof Promise || "then" in obj && typeof obj.then === "function";
}

//#endregion
//#region runtime/intrinsics/lower.js
function flagsValue(context, value, names) {
	if (context.asBigInt) {
		if (typeof value !== "bigint") throw new TypeError("flags must be a bigint");
		if (value < 0n || value >> BigInt(names.length) !== 0n) throw new TypeError("flags have extraneous bits set");
		return Number(value);
	}
	let bits = 0;
	if (typeof value === "object" && value !== null) {
		for (const [idx, name] of names.entries()) if (value[name] === true) bits |= 1 << idx;
	} else if (value !== void 0 && value !== null) throw new TypeError("only an object, undefined or null can be converted to flags");
	return bits;
}
function lowerFlatBool(_context, ctx) {
	debugLog("[_lowerFlatBool()] args", { ctx });
	if (!ctx.memory) throw new Error("missing memory for lower");
	if (ctx.vals.length !== 1) throw new Error(`unexpected number [${ctx.vals.length}] of vals (expected 1)`);
	if (_context.strict && typeof ctx.vals[0] !== "boolean") throw new TypeError(`invalid bool value [${ctx.vals[0]}]`);
	new DataView(ctx.memory.buffer).setUint8(ctx.storagePtr, ctx.vals[0] ? 1 : 0);
	ctx.storagePtr += 1;
}
function lowerFlatS8(_context, ctx) {
	debugLog("[_lowerFlatS8()] args", { ctx });
	if (ctx.vals.length !== 1) throw new Error(`unexpected number [${ctx.vals.length}] of vals (expected 1)`);
	if (!ctx.memory) throw new Error("missing memory for lower");
	if (_context.strict && !isInt8(ctx.vals[0])) invalidNumericPrimitive("s8", ctx.vals[0]);
	new DataView(ctx.memory.buffer).setInt8(ctx.storagePtr, ctx.vals[0]);
	ctx.storagePtr += 1;
}
function lowerFlatU8(_context, ctx) {
	debugLog("[_lowerFlatU8()] args", ctx);
	if (ctx.vals.length !== 1) throw new Error(`unexpected number [${ctx.vals.length}] of vals (expected 1)`);
	if (_context.strict && !isUint8(ctx.vals[0])) invalidNumericPrimitive("u8", ctx.vals[0]);
	if (!ctx.memory) throw new Error("missing memory for lower");
	new DataView(ctx.memory.buffer).setUint8(ctx.storagePtr, ctx.vals[0]);
	ctx.storagePtr += 1;
}
function lowerFlatS16(_context, ctx) {
	debugLog("[_lowerFlatS16()] args", { ctx });
	if (!ctx.memory) throw new Error("missing memory for lower");
	if (ctx.vals.length !== 1) throw new Error(`unexpected number [${ctx.vals.length}] of vals (expected 1)`);
	const rem = ctx.storagePtr % 2;
	if (rem !== 0) ctx.storagePtr += 2 - rem;
	if (_context.strict && !isInt16(ctx.vals[0])) invalidNumericPrimitive("s16", ctx.vals[0]);
	new DataView(ctx.memory.buffer).setInt16(ctx.storagePtr, ctx.vals[0], true);
	ctx.storagePtr += 2;
}
function lowerFlatU16(_context, ctx) {
	debugLog("[_lowerFlatU16()] args", { ctx });
	if (!ctx.memory) throw new Error("missing memory for lower");
	if (ctx.vals.length !== 1) throw new Error(`unexpected number [${ctx.vals.length}] of vals (expected 1)`);
	const rem = ctx.storagePtr % 2;
	if (rem !== 0) ctx.storagePtr += 2 - rem;
	if (_context.strict && !isUint16(ctx.vals[0])) invalidNumericPrimitive("u16", ctx.vals[0]);
	new DataView(ctx.memory.buffer).setUint16(ctx.storagePtr, ctx.vals[0], true);
	ctx.storagePtr += 2;
}
function lowerFlatS32(_context, ctx) {
	debugLog("[_lowerFlatS32()] args", { ctx });
	if (ctx.vals.length !== 1) throw new Error(`unexpected number [${ctx.vals.length}] of vals (expected 1)`);
	const rem = ctx.storagePtr % 4;
	if (rem !== 0) ctx.storagePtr += 4 - rem;
	if (_context.strict && !isInt32(ctx.vals[0])) invalidNumericPrimitive("s32", ctx.vals[0]);
	new DataView(ctx.memory.buffer).setInt32(ctx.storagePtr, ctx.vals[0], true);
	ctx.storagePtr += 4;
}
function lowerFlatU32(_context, ctx) {
	debugLog("[_lowerFlatU32()] args", { ctx });
	if (ctx.vals.length !== 1) throw new Error(`expected single value to lower, got [${ctx.vals.length}]`);
	const rem = ctx.storagePtr % 4;
	if (rem !== 0) ctx.storagePtr += 4 - rem;
	if (_context.strict && !isUint32(ctx.vals[0])) invalidNumericPrimitive("u32", ctx.vals[0]);
	new DataView(ctx.memory.buffer).setUint32(ctx.storagePtr, ctx.vals[0], true);
	ctx.storagePtr += 4;
}
function lowerFlatS64(_context, ctx) {
	debugLog("[_lowerFlatS64()] args", { ctx });
	if (ctx.vals.length !== 1) throw new Error("unexpected number of vals");
	const rem = ctx.storagePtr % 8;
	if (rem !== 0) ctx.storagePtr += 8 - rem;
	if (_context.strict && !isInt64(ctx.vals[0])) invalidNumericPrimitive("s64", ctx.vals[0]);
	new DataView(ctx.memory.buffer).setBigInt64(ctx.storagePtr, ctx.vals[0], true);
	ctx.storagePtr += 8;
}
function lowerFlatU64(_context, ctx) {
	debugLog("[_lowerFlatU64()] args", { ctx });
	if (ctx.vals.length !== 1) throw new Error("unexpected number of vals");
	const rem = ctx.storagePtr % 8;
	if (rem !== 0) ctx.storagePtr += 8 - rem;
	if (_context.strict && !isUint64(ctx.vals[0])) invalidNumericPrimitive("u64", ctx.vals[0]);
	new DataView(ctx.memory.buffer).setBigUint64(ctx.storagePtr, ctx.vals[0], true);
	ctx.storagePtr += 8;
}
function lowerFlatFloat32(_context, ctx) {
	debugLog("[_lowerFlatFloat32()] args", { ctx });
	if (ctx.vals.length !== 1) throw new Error("unexpected number of vals");
	const rem = ctx.storagePtr % 4;
	if (rem !== 0) ctx.storagePtr += 4 - rem;
	if (_context.strict && typeof ctx.vals[0] !== "number") invalidNumericPrimitive("f32", ctx.vals[0]);
	new DataView(ctx.memory.buffer).setFloat32(ctx.storagePtr, ctx.vals[0], true);
	ctx.storagePtr += 4;
}
function lowerFlatFloat64(_context, ctx) {
	debugLog("[_lowerFlatFloat64()] args", { ctx });
	if (ctx.vals.length !== 1) throw new Error("unexpected number of vals");
	const rem = ctx.storagePtr % 8;
	if (rem !== 0) ctx.storagePtr += 8 - rem;
	if (_context.strict && typeof ctx.vals[0] !== "number") invalidNumericPrimitive("f64", ctx.vals[0]);
	new DataView(ctx.memory.buffer).setFloat64(ctx.storagePtr, ctx.vals[0], true);
	ctx.storagePtr += 8;
}
function lowerFlatChar(ctx) {
	debugLog("[_lowerFlatChar()] args", { ctx });
	const rem = ctx.storagePtr % 4;
	if (rem !== 0) ctx.storagePtr += 4 - rem;
	if (ctx.vals.length !== 1) throw new Error("unexpected number of vals");
	const value = ctx.vals[0];
	if (typeof value !== "string") throw new TypeError("char must be a string");
	const codePoint = value.codePointAt(0);
	if (codePoint === void 0 || codePoint >= 55296 && codePoint <= 57343 || value.length !== (codePoint > 65535 ? 2 : 1)) throw new TypeError("char must contain one Unicode scalar value");
	new DataView(ctx.memory.buffer).setUint32(ctx.storagePtr, codePoint, true);
	ctx.storagePtr += 4;
}
function lowerFlatStringAny(_context, ctx) {
	switch (ctx.stringEncoding) {
		case "utf8": return lowerFlatStringUTF8(_context.utf8, ctx);
		case "utf16": return lowerFlatStringUTF16(_context.utf16, ctx);
		case "compact-utf16": {
			if (!ctx.realloc) throw new Error("missing realloc during flat string lower");
			const { ptr, len } = compactUtf16Encode(_context.utf16, ctx.vals[0], ctx.realloc, ctx.memory);
			const view = new DataView(ctx.memory.buffer);
			view.setUint32(ctx.storagePtr, ptr, true);
			view.setUint32(ctx.storagePtr + 4, len, true);
			ctx.storagePtr += 8;
			return;
		}
		default: throw new Error(`missing/unrecognized/unsupported string encoding [${ctx.stringEncoding}]`);
	}
}
function lowerFlatStringUTF16(_context, ctx) {
	debugLog("[_lowerFlatStringUTF16()] args", { ctx });
	if (!ctx.realloc) throw new Error("missing realloc during flat string lower");
	const { ptr, len } = utf16Encode(_context, ctx.vals[0], ctx.realloc, ctx.memory);
	const view = new DataView(ctx.memory.buffer);
	view.setUint32(ctx.storagePtr, ptr, true);
	view.setUint32(ctx.storagePtr + 4, len, true);
	ctx.storagePtr += 8;
}
function lowerFlatStringUTF8(_context, ctx) {
	debugLog("[_lowerFlatStringUTF8()] args", ctx);
	if (!ctx.realloc) throw new Error("missing realloc during flat string lower");
	const { ptr, len } = utf8Encode(_context, ctx.vals[0], ctx.realloc, ctx.memory);
	const view = new DataView(ctx.memory.buffer);
	view.setUint32(ctx.storagePtr, ptr, true);
	view.setUint32(ctx.storagePtr + 4, len, true);
	ctx.storagePtr += 8;
}
function lowerFlatRecord(meta) {
	const { fieldMetas, size32: recordSize32, align32: recordAlign32 } = meta;
	return function lowerFlatRecordInner(ctx) {
		debugLog("[_lowerFlatRecord()] args", { ctx });
		const originalPtr = ctx.storagePtr;
		const r = ctx.vals[0];
		for (const [tag, lowerFn, size32, align32] of fieldMetas) {
			const rem = ctx.storagePtr % align32;
			if (rem !== 0) ctx.storagePtr += align32 - rem;
			const fieldPtr = ctx.storagePtr;
			ctx.vals = [r[tag]];
			lowerFn(ctx);
			ctx.storagePtr = Math.max(ctx.storagePtr, fieldPtr + size32);
		}
		ctx.storagePtr = Math.max(ctx.storagePtr, originalPtr + recordSize32);
		const rem = ctx.storagePtr % recordAlign32;
		if (rem !== 0) ctx.storagePtr += recordAlign32 - rem;
	};
}
function lowerFlatVariant(_context, meta) {
	const { variantSize32, variantAlign32, variantPayloadOffset32, caseMetas } = meta;
	const caseLookup = Object.create(null);
	for (const [idx, meta] of caseMetas.entries()) {
		let tag = meta[0];
		caseLookup[tag] = {
			discriminant: idx,
			meta
		};
	}
	return function lowerFlatVariantInner(ctx) {
		debugLog("[_lowerFlatVariant()] args", { ctx });
		const { tag, val } = ctx.vals[0];
		const variantCase = caseLookup[tag];
		if (!variantCase) throw new Error(`missing tag [${tag}] (valid tags: ${Object.keys(caseLookup)})`);
		const [, lowerFn] = variantCase.meta;
		const originalPtr = ctx.storagePtr;
		ctx.vals = [variantCase.discriminant];
		if (caseMetas.length < 256) lowerFlatU8(_context, ctx);
		else if (caseMetas.length >= 256 && caseMetas.length < 65536) lowerFlatU16(_context, ctx);
		else if (caseMetas.length >= 65536 && caseMetas.length < 4294967296) lowerFlatU32(_context, ctx);
		else throw new Error(`unsupported number of cases [${caseMetas.length}]`);
		ctx.storagePtr = originalPtr + variantPayloadOffset32;
		ctx.vals = [val];
		if (lowerFn) lowerFn(ctx);
		ctx.storagePtr = Math.max(ctx.storagePtr, originalPtr + variantSize32);
		const rem = ctx.storagePtr % variantAlign32;
		if (rem !== 0) ctx.storagePtr += variantAlign32 - rem;
	};
}
function lowerFlatList(_context, meta) {
	const { elemLowerFn, knownLen, size32, elemSize32, elemAlign32, typedArray } = meta;
	if (!elemLowerFn) throw new TypeError("missing/invalid element lower fn for list");
	return function lowerFlatListInner(ctx) {
		debugLog("[_lowerFlatList()] args", { ctx });
		if (ctx.useDirectParams) {
			if (ctx.params.length < 2) throw new Error("insufficient params left to lower list");
			const storagePtr = ctx.params[0] >>> 0;
			const elemCount = ctx.params[1];
			ctx.params = ctx.params.slice(2);
			const list = ctx.vals[0];
			if (!list) throw new Error("missing direct param value");
			if (elemCount !== list.length) throw new Error("list length does not match allocated storage");
			const lowerCtx = {
				storagePtr,
				memory: ctx.memory,
				stringEncoding: ctx.stringEncoding,
				componentIdx: ctx.componentIdx,
				realloc: ctx.realloc,
				lowerResource: ctx.lowerResource,
				vals: []
			};
			for (let idx = 0; idx < list.length; idx++) {
				const elemPtr = storagePtr + idx * elemSize32;
				lowerCtx.storagePtr = elemPtr;
				lowerCtx.vals = list.slice(idx, idx + 1);
				elemLowerFn(lowerCtx);
				lowerCtx.storagePtr = Math.max(lowerCtx.storagePtr, elemPtr + elemSize32);
			}
			ctx.storagePtr = lowerCtx.storagePtr;
			return;
		}
		const elems = ctx.vals[0];
		const totalSizeBytes = knownLen === void 0 ? 8 : size32 ?? elems.length * elemSize32;
		if (ctx.storageLen !== void 0 && totalSizeBytes > ctx.storageLen) throw new Error("not enough storage remaining for list flat lower");
		if (knownLen === void 0) {
			if (!ctx.realloc) throw new Error("missing realloc during flat string lower");
			const dataPtr = ctx.realloc(0, 0, elemAlign32, elemSize32 * elems.length);
			ctx.vals[0] = dataPtr;
			lowerFlatU32(_context.numeric, ctx);
			ctx.vals[0] = elems.length;
			lowerFlatU32(_context.numeric, ctx);
			const origPtr = ctx.storagePtr;
			ctx.storagePtr = dataPtr;
			if (typedArray !== void 0 && elems instanceof typedArray && (_context.littleEndian || elemSize32 === 1)) new Uint8Array(ctx.memory.buffer, dataPtr, elems.byteLength).set(new Uint8Array(elems.buffer, elems.byteOffset, elems.byteLength));
			else for (const [idx, elem] of elems.entries()) {
				const elemPtr = dataPtr + idx * elemSize32;
				ctx.storagePtr = elemPtr;
				ctx.vals = [elem];
				elemLowerFn(ctx);
				ctx.storagePtr = Math.max(ctx.storagePtr, elemPtr + elemSize32);
			}
			ctx.storagePtr = origPtr;
		} else {
			if (elems.length !== knownLen) throw new TypeError(`invalid list input of length [${elems.length}], must be length [${knownLen}]`);
			const originalPtr = ctx.storagePtr;
			for (const [idx, elem] of elems.entries()) {
				const elemPtr = originalPtr + idx * elemSize32;
				ctx.storagePtr = elemPtr;
				ctx.vals = [elem];
				elemLowerFn(ctx);
				ctx.storagePtr = Math.max(ctx.storagePtr, elemPtr + elemSize32);
			}
		}
	};
}
function lowerFlatMap(_context, meta) {
	const { keyLowerFn, valueLowerFn, entrySize32, entryAlign32, valueOffset32 } = meta;
	return function lowerFlatMapInner(ctx) {
		debugLog("[_lowerFlatMap()] args", { ctx });
		const map = ctx.vals[0];
		if (!(map instanceof Map)) throw new TypeError("expected a Map");
		let dataPtr;
		let restorePtr;
		if (ctx.useDirectParams) {
			if (ctx.params.length < 2) throw new Error("insufficient params left to lower map");
			dataPtr = ctx.params[0] >>> 0;
			const expectedLen = ctx.params[1];
			ctx.params = ctx.params.slice(2);
			if (expectedLen !== map.size) throw new Error("map length does not match allocated storage");
			restorePtr = ctx.storagePtr;
		} else {
			if (!ctx.realloc) throw new Error("missing realloc during flat map lower");
			dataPtr = ctx.realloc(0, 0, entryAlign32, entrySize32 * map.size);
			ctx.vals[0] = dataPtr;
			lowerFlatU32(_context, ctx);
			ctx.vals[0] = map.size;
			lowerFlatU32(_context, ctx);
			restorePtr = ctx.storagePtr;
		}
		let idx = 0;
		for (const [key, value] of map) {
			const entryPtr = dataPtr + idx * entrySize32;
			ctx.storagePtr = entryPtr;
			ctx.vals = [key];
			keyLowerFn(ctx);
			ctx.storagePtr = entryPtr + valueOffset32;
			ctx.vals = [value];
			valueLowerFn(ctx);
			idx++;
		}
		ctx.storagePtr = restorePtr;
	};
}
function lowerFlatTuple(meta) {
	const { elemLowerMetas, size32: tupleSize32, align32: tupleAlign32 } = meta;
	return function lowerFlatTupleInner(ctx) {
		debugLog("[_lowerFlatTuple()] args", { ctx });
		const originalPtr = ctx.storagePtr;
		const tuple = ctx.vals[0];
		for (const [idx, [lowerFn, size32, align32]] of elemLowerMetas.entries()) {
			const rem = ctx.storagePtr % align32;
			if (rem !== 0) ctx.storagePtr += align32 - rem;
			const elemPtr = ctx.storagePtr;
			ctx.vals = [tuple[idx]];
			lowerFn(ctx);
			ctx.storagePtr = Math.max(ctx.storagePtr, elemPtr + size32);
		}
		ctx.storagePtr = Math.max(ctx.storagePtr, originalPtr + tupleSize32);
		const rem = ctx.storagePtr % tupleAlign32;
		if (rem !== 0) ctx.storagePtr += tupleAlign32 - rem;
	};
}
function lowerFlatFlags(_context, meta) {
	const { names, align32, intSizeBytes } = meta;
	return function lowerFlatFlagsInner(ctx) {
		debugLog("[_lowerFlatFlags()] args", { ctx });
		if (ctx.vals.length !== 1) throw new Error("unexpected number of vals");
		const flagValue = flagsValue(_context, ctx.vals[0], names);
		const rem = ctx.storagePtr % align32;
		if (rem !== 0) ctx.storagePtr += align32 - rem;
		const dv = new DataView(ctx.memory.buffer);
		if (intSizeBytes === 1) dv.setUint8(ctx.storagePtr, flagValue);
		else if (intSizeBytes === 2) dv.setUint16(ctx.storagePtr, flagValue, true);
		else if (intSizeBytes === 4) dv.setUint32(ctx.storagePtr, flagValue, true);
		else throw new Error(`unrecognized flag size [${intSizeBytes} bytes]`);
		ctx.storagePtr += intSizeBytes;
	};
}
function lowerFlatEnum(_context, meta) {
	const f = lowerFlatVariant(_context, meta);
	return function lowerFlatEnumInner(ctx) {
		debugLog("[_lowerFlatEnum()] args", { ctx });
		const v = ctx.vals[0];
		if (v === null || typeof v !== "object" || Object.keys(v).length !== 2 || !("tag" in v)) ctx.vals[0] = { tag: v };
		f(ctx);
	};
}
function lowerFlatOption(_context, meta) {
	const { payloadMaybeNull } = meta;
	const f = lowerFlatVariant(_context, meta);
	return function lowerFlatOptionInner(ctx) {
		debugLog("[_lowerFlatOption()] args", { ctx });
		const v = ctx.vals[0];
		if (v === null || v === void 0) ctx.vals[0] = { tag: "none" };
		else if (payloadMaybeNull) {
			if (typeof v !== "object" || Object.keys(v).length !== 2 || !("tag" in v) || !(v.tag === "some" || v.tag === "none") || !("val" in v)) ctx.vals[0] = {
				tag: "some",
				val: v
			};
		} else ctx.vals[0] = {
			tag: "some",
			val: v
		};
		f(ctx);
	};
}
function lowerFlatResult(_context, meta) {
	const f = lowerFlatVariant(_context, meta);
	return function lowerFlatResultInner(ctx) {
		debugLog("[_lowerFlatResult()] args", { ctx });
		const v = ctx.vals[0];
		if (v === null || typeof v !== "object" || Object.keys(v).length !== 2 || !("tag" in v) || !("ok" === v.tag || "err" === v.tag) || !("val" in v)) ctx.vals[0] = {
			tag: "ok",
			val: v
		};
		f(ctx);
	};
}
function lowerFlatOwn(_context, meta) {
	const { lowerFn, componentIdx, tableIdx } = meta;
	return function lowerFlatOwnInner(ctx) {
		debugLog("[_lowerFlatOwn()] args", { ctx });
		if (ctx.componentIdx !== componentIdx) throw new Error(`component index mismatch (expected [${componentIdx}], lift called from [${ctx.componentIdx}])`);
		const obj = ctx.vals[0];
		if (obj === void 0 || obj === null) throw new Error("missing resource");
		const handle = ctx.lowerResource ? ctx.lowerResource(obj, tableIdx) : lowerFn(obj);
		ctx.vals[0] = handle;
		lowerFlatU32(_context, ctx);
	};
}
function lowerFlatBorrow(ctx) {
	debugLog("[_lowerFlatBorrow()] args", { ctx });
	throw new Error("flat lower for borrowed resources is not supported!");
}
function lowerFlatFuture(_context, meta) {
	const { componentIdx, futureTableIdx, elemMeta } = meta;
	return function lowerFlatFutureInner(ctx) {
		debugLog("[_lowerFlatFuture()] args", { ctx });
		let future = ctx.vals[0];
		if (!future) throw new Error("missing external future value");
		if (!isFutureLowerableObject(future)) future = Promise.resolve(future);
		let globalRep = future[_context.resourceRep];
		let waitableIdx;
		if (globalRep) {
			const hostFuture = _context.futures.get(globalRep);
			if (!hostFuture) throw new Error(`missing host future with global rep [${globalRep}]`);
			waitableIdx = hostFuture.getFutureEndWaitableIdx();
		} else {
			const cstate = getOrCreateAsyncState(_context.lookup, componentIdx);
			if (!cstate) throw new Error(`missing async state for component [${componentIdx}]`);
			elemMeta.stringEncoding = "utf8";
			const { writeEnd, readEnd } = createFuture(_context.creation, cstate, {
				tableIdx: futureTableIdx,
				elemMeta
			});
			const hostInjectFn = genFutureHostInjectFn(_context.injection, {
				promise: future,
				stringEncoding: elemMeta.stringEncoding,
				hostWriteEnd: writeEnd
			});
			readEnd.setHostInjectFn(hostInjectFn);
			waitableIdx = readEnd.waitableIdx();
		}
		if (ctx.storagePtr !== void 0 && ctx.storagePtr !== null) {
			ctx.vals[0] = waitableIdx;
			lowerFlatU32(_context.numeric, ctx);
		}
		return waitableIdx;
	};
}
function lowerFlatStream(_context, meta) {
	const { componentIdx, streamTableIdx, elemMeta } = meta;
	return function lowerFlatStreamInner(ctx) {
		debugLog("[_lowerFlatStream()] args", { ctx });
		const stream = ctx.vals[0];
		if (!stream) throw new Error("missing external stream value");
		let globalRep;
		let waitableIdx;
		if (stream instanceof _context.lowerable.Stream) {
			globalRep = stream[_context.resourceRep];
			const internalStream = _context.streams.get(globalRep);
			if (!internalStream || !(internalStream instanceof _context.InternalStream)) throw new Error(`failed to find internal stream with rep [${globalRep}]`);
			waitableIdx = internalStream.readEnd().waitableIdx();
		} else if (isStreamLowerableObject(_context.lowerable, stream)) {
			globalRep = stream[_context.resourceRep];
			if (globalRep) {
				const hostStream = _context.streams.get(globalRep);
				if (!hostStream) throw new Error(`missing host stream with global rep [${globalRep}]`);
				waitableIdx = hostStream.getStreamEndWaitableIdx();
			} else {
				const cstate = getOrCreateAsyncState(_context.lookup, componentIdx);
				if (!cstate) throw new Error(`missing async state for component [${componentIdx}]`);
				const { writeEnd, readEnd } = createStream(_context.creation, cstate, {
					tableIdx: streamTableIdx,
					elemMeta
				});
				const readFn = genReadFnFromLowerableStream(_context.source, stream);
				const hostInjectFn = genStreamHostInjectFn(_context.injection, {
					readFn,
					hostWriteEnd: writeEnd,
					readEnd
				});
				readEnd.setHostInjectFn(hostInjectFn);
				readEnd.setHostDropFn(readFn.drop);
				waitableIdx = readEnd.waitableIdx();
			}
		} else throw new Error("object does not conform to supported stream interfaces");
		if (ctx.storagePtr !== void 0 && ctx.storagePtr !== null) {
			ctx.vals[0] = waitableIdx;
			lowerFlatU32(_context.numeric, ctx);
		}
		return waitableIdx;
	};
}
function lowerFlatErrorContext(_context, errCtxTableIdx, ctx) {
	debugLog("[_lowerFlatErrorContext()] args", {
		errCtxTableIdx,
		ctx
	});
	const { memory, realloc, vals, storagePtr, storageLen, componentIdx } = ctx;
	const errCtxGlobalRep = vals[0];
	const globalErrCtx = _context.globalTable.get().get(errCtxGlobalRep);
	if (!globalErrCtx) throw new Error("missing global error context during lower");
	if (globalErrCtx.componentIdx !== void 0 && globalErrCtx.waitableIdx !== void 0) {
		const prevComponentState = getOrCreateAsyncState(_context.lookup, globalErrCtx.componentIdx);
		const prevLocalErrCtx = prevComponentState.handles.get(globalErrCtx.waitableIdx);
		if (prevLocalErrCtx && prevLocalErrCtx.refCount === 0) {
			prevComponentState.handles.remove(globalErrCtx.waitableIdx);
			errCtxGetLocalTable(_context.local, globalErrCtx.componentIdx, globalErrCtx.localTableIdx).remove(globalErrCtx.localIdx);
			errCtxGlobalRefCountAdd(_context.globalTable, errCtxGlobalRep, -1);
		}
	}
	const localErrCtxTable = errCtxGetLocalTable(_context.local, componentIdx, errCtxTableIdx, { upsert: true });
	const { waitableIdx: handle, localIdx } = errCtxCreateLocalHandle(_context, componentIdx, localErrCtxTable, errCtxGlobalRep);
	globalErrCtx.componentIdx = componentIdx;
	globalErrCtx.waitableIdx = handle;
	globalErrCtx.localIdx = localIdx;
	globalErrCtx.localTableIdx = errCtxTableIdx;
	if (globalErrCtx.pendingLifts !== void 0 && globalErrCtx.pendingLifts > 0) {
		globalErrCtx.pendingLifts -= 1;
		errCtxGlobalRefCountAdd(_context.globalTable, errCtxGlobalRep, -1);
	}
	const lowerCtx = {
		memory,
		realloc,
		vals: [handle],
		storagePtr,
		storageLen,
		componentIdx
	};
	lowerFlatU32(_context.numeric, lowerCtx);
	ctx.storagePtr = lowerCtx.storagePtr;
}

//#endregion
//#region runtime/intrinsics/future/value.js
/** Keep each store's constructor and private brand together. */
function initializeFutureValueClass(disposeSymbol) {
	var _a;
	class FutureValue {
		#start;
		#dropFn;
		#dropped = false;
		#delivered = false;
		#settled;
		#hideThen = 0;
		#thenFn;
		constructor(start, dropFn) {
			if (typeof start !== "function") throw new TypeError("future start operation must be a function");
			this.#start = start;
			this.#dropFn = dropFn;
			this.#thenFn = this.#then.bind(this);
		}
		get then() {
			return this.#hideThen === 0 ? this.#thenFn : void 0;
		}
		#read() {
			if (!this.#settled) this.#settled = Promise.resolve().then(this.#start);
			return this.#settled;
		}
		resolveAsValue(resolve) {
			this.#hideThen++;
			try {
				resolve(this);
			} finally {
				this.#hideThen--;
			}
		}
		#deliver(resolve, value) {
			if (value instanceof _a) {
				value.resolveAsValue(resolve);
				return;
			}
			resolve(value);
		}
		#then(resolve, reject) {
			const droppedError = () => /* @__PURE__ */ new Error("future was dropped");
			return (this.#dropped ? Promise.reject(droppedError()) : this.#read()).then((box) => {
				if (this.#dropped) {
					if (typeof reject === "function") return reject(droppedError());
					throw droppedError();
				}
				this.#delivered = true;
				return this.#deliver(resolve, box.value);
			}, reject);
		}
		/** Drop the readable end and dispose copied values that never reached a recipient. */
		[disposeSymbol]() {
			if (this.#dropped) return;
			this.#dropped = true;
			this.#dropFn?.();
			this.#settled?.then((box) => {
				if (!this.#delivered) disposeHostValue(disposeSymbol, box.value);
			}, () => {});
		}
	}
	_a = FutureValue;
	return FutureValue;
}

//#endregion
//#region runtime/intrinsics/future/end.js
/** Create a base endpoint constructor using the selected event codes. */
function initializeFutureEndClass(events) {
	var _a;
	class FutureEnd {
		static CopyResult = {
			COMPLETED: 0,
			DROPPED: 1,
			CANCELLED: 2
		};
		static CopyState = {
			IDLE: 1,
			SYNC_COPYING: 2,
			ASYNC_COPYING: 3,
			CANCELLING_COPY: 4,
			DONE: 5
		};
		#pendingBufferMeta;
		#waitable;
		#copyState = _a.CopyState.IDLE;
		#dropped = false;
		#isPeerDroppedFn;
		#notifyPeerDroppedFn;
		constructor(args) {
			debugLog("[FutureEnd#constructor()] args", args);
			if (!args.pendingBufferMeta) throw new Error("missing pending buffer");
			this.#pendingBufferMeta = args.pendingBufferMeta;
			if (!args.waitable) throw new Error("missing pending buffer");
			this.#waitable = args.waitable;
			if (args.isPeerDroppedFn !== void 0 && typeof args.isPeerDroppedFn !== "function") throw new TypeError("isPeerDroppedFn must be a function");
			this.#isPeerDroppedFn = args.isPeerDroppedFn ?? (() => false);
			if (args.notifyPeerDroppedFn !== void 0 && typeof args.notifyPeerDroppedFn !== "function") throw new TypeError("notifyPeerDroppedFn must be a function");
			this.#notifyPeerDroppedFn = args.notifyPeerDroppedFn ?? (() => {});
		}
		getWaitable() {
			return this.#waitable;
		}
		setWaitable(w) {
			this.#waitable = w;
		}
		setCopyState(state) {
			this.#copyState = state;
		}
		getCopyState() {
			return this.#copyState;
		}
		isDoneState() {
			return this.getCopyState() === _a.CopyState.DONE;
		}
		isCancelledState() {
			return this.getCopyState() === _a.CopyState.CANCELLED;
		}
		isIdleState() {
			return this.getCopyState() === _a.CopyState.IDLE;
		}
		isCopying() {
			switch (this.#copyState) {
				case _a.CopyState.IDLE:
				case _a.CopyState.DONE: return false;
				case _a.CopyState.SYNC_COPYING:
				case _a.CopyState.ASYNC_COPYING:
				case _a.CopyState.CANCELLING_COPY: return true;
				default: throw new Error("invalid/unknown copying state");
			}
		}
		setPendingBufferMeta(args) {
			const { componentIdx, buffer, isWrite, onCopyDoneFn } = args;
			this.#pendingBufferMeta.componentIdx = componentIdx;
			this.#pendingBufferMeta.buffer = buffer;
			this.#pendingBufferMeta.isWrite = isWrite;
			this.#pendingBufferMeta.onCopyDoneFn = onCopyDoneFn;
		}
		resetPendingBufferMeta() {
			this.setPendingBufferMeta({
				componentIdx: null,
				buffer: null,
				isWrite: null,
				onCopyDoneFn: null
			});
		}
		getPendingBufferMeta() {
			return this.#pendingBufferMeta;
		}
		resetAndNotifyPending(result) {
			const f = this.#pendingBufferMeta.onCopyDoneFn;
			this.resetPendingBufferMeta();
			if (f) f(result);
		}
		setPendingEvent(fn) {
			if (!this.#waitable) throw new Error("missing/invalid waitable");
			debugLog("[FutureEnd#setPendingEvent()]", {
				waitable: this.#waitable,
				waitableinSet: this.#waitable.isInSet(),
				componentIdx: this.#waitable.componentIdx()
			});
			this.#waitable.setPendingEvent(fn);
		}
		hasPendingEvent() {
			if (!this.#waitable) throw new Error("missing/invalid waitable");
			return this.#waitable.hasPendingEvent();
		}
		isInSet() {
			if (!this.#waitable) throw new Error("missing/invalid waitable");
			return this.#waitable.isInSet();
		}
		getPendingEvent() {
			if (!this.#waitable) throw new Error("missing/invalid waitable");
			debugLog("[FutureEnd#getPendingEvent()]", {
				waitable: this.#waitable,
				waitableinSet: this.#waitable.isInSet(),
				componentIdx: this.#waitable.componentIdx()
			});
			return this.#waitable.getPendingEvent();
		}
		isDropped() {
			return this.#dropped;
		}
		isPeerDropped() {
			return this.#isPeerDroppedFn();
		}
		notifyDropped() {
			if (this.isDropped() || this.isDoneState() || this.hasPendingEvent()) return;
			const eventCode = this.isReadable() ? events.FUTURE_READ : events.FUTURE_WRITE;
			this.setPendingEvent(() => {
				this.setCopyState(_a.CopyState.DONE);
				return {
					code: eventCode,
					payload0: this.waitableIdx(),
					payload1: _a.CopyResult.DROPPED
				};
			});
		}
		/** Stop the endpoint without enforcing the running guest's drop protocol. */
		onInstanceStop() {
			if (this.#dropped) return;
			this.resetPendingBufferMeta();
			this.notifyDropped();
			this.#dropped = true;
			this.#notifyPeerDroppedFn();
			this.#waitable.drop();
		}
		drop() {
			if (this.isDropped()) throw new Error("future already dropped");
			if (this.#pendingBufferMeta.buffer) {
				if (!this.#pendingBufferMeta.isWrite) throw new Error("non-writable pending buffer during drop (reader blocked)");
				this.resetAndNotifyPending(_a.CopyResult.DROPPED);
			}
			this.#dropped = true;
			this.#notifyPeerDroppedFn();
			this.#waitable.drop();
		}
	}
	_a = FutureEnd;
	return FutureEnd;
}

//#endregion
//#region runtime/intrinsics/future/readable.js
/** Create readable endpoints sharing the selected buffers, state, and constructor identities. */
function initializeFutureReadableEndClass(_context) {
	const FutureEnd = _context.FutureEnd;
	const { FutureValue } = _context;
	class FutureReadableEnd extends FutureEnd {
		#globalFutureMapRep;
		#futureTableIdx;
		#isHostOwned;
		#hostInjectFn;
		#elemMeta;
		#handle;
		#promise;
		target;
		constructor(args) {
			debugLog("[FutureReadableEnd#constructor()] args", args);
			super(args);
			if (!args.elemMeta) throw new Error("missing/invalid element meta");
			this.#elemMeta = args.elemMeta;
			if (args.tableIdx === void 0) throw new Error("missing index for future table idx");
			this.#futureTableIdx = args.tableIdx;
			this.#hostInjectFn = args.hostInjectFn;
			this.#isHostOwned = args.hostOwned;
		}
		isReadable() {
			return true;
		}
		isWritable() {
			return false;
		}
		setTarget(tgt) {
			this.target = tgt;
		}
		getElemMeta() {
			return { ...this.#elemMeta };
		}
		futureTableIdx() {
			return this.#futureTableIdx;
		}
		setFutureTableIdx(idx) {
			this.#futureTableIdx = idx;
		}
		globalFutureMapRep() {
			return this.#globalFutureMapRep;
		}
		setGlobalFutureMapRep(rep) {
			this.#globalFutureMapRep = rep;
		}
		waitableIdx() {
			return this.getWaitable().idx();
		}
		setWaitableIdx(idx) {
			const w = this.getWaitable();
			w.setIdx(idx);
			w.setTarget(`waitable for FutureReadableEnd (waitable [${idx}])`);
		}
		handle() {
			return this.#handle;
		}
		setHandle(h) {
			this.#handle = h;
		}
		setHostInjectFn(f) {
			if (this.#hostInjectFn) throw new Error("host injection fn is already set");
			this.#hostInjectFn = f;
		}
		promise() {
			if (this.#promise) return this.#promise;
			this.#promise = new FutureValue(() => this.hostRead({ stringEncoding: "utf8" }), () => this.hostDrop());
			return this.#promise;
		}
		cancel() {
			debugLog("[FutureEnd#cancel()]");
			this.resetAndNotifyPending(FutureEnd.CopyResult.CANCELLED);
		}
		_read(args) {
			const { buffer, onCopyDoneFn, componentIdx } = args;
			if (!buffer) throw new Error("missing buffer for future read");
			if (this.isDropped()) throw new Error("cannot read from dropped future");
			if (buffer.remaining() !== 1) throw new Error(`invalid remaining values in buffer (expecetd one, received [${buffer.remaining()}]`);
			const meta = this.getPendingBufferMeta();
			if (!meta) throw new Error("missing pending buffer metadata");
			if (!meta.buffer) {
				this.setPendingBufferMeta({
					buffer,
					componentIdx,
					isWrite: false,
					onCopyDoneFn
				});
				return;
			}
			if (componentIdx === meta.componentIdx && componentIdx !== -1 && !(this.#elemMeta.isNone || this.#elemMeta.isNumeric)) throw new _context.RuntimeError("cannot read from and write to intra-component future");
			const transferResources = buffer.componentIdx() !== -1 && meta.buffer.componentIdx() !== -1;
			buffer.write(meta.buffer.read(1, { transferResources }), { transferResources });
			this.resetAndNotifyPending(FutureEnd.CopyResult.COMPLETED);
			onCopyDoneFn(FutureEnd.CopyResult.COMPLETED);
		}
		guestRead(args) {
			debugLog("[FutureReadableEnd#guestRead()] args", args);
			const { componentIdx, stringEncoding, memory, realloc, ptr, data } = args;
			const elemMeta = {
				...args.elemMeta ?? this.#elemMeta,
				stringEncoding: stringEncoding ?? this.#elemMeta.stringEncoding,
				getReallocFn: args.getReallocFn ?? this.#elemMeta.getReallocFn
			};
			if (elemMeta.isBorrowed) throw new Error("cannot call future.read on a borrow");
			let buffer = args.buffer;
			if (!buffer) buffer = _context.buffers.createBuffer({
				componentIdx,
				memory,
				realloc,
				start: ptr,
				data,
				count: 1,
				isReadable: this.isWritable(),
				isWritable: this.isReadable(),
				elemMeta
			}).buffer;
			const futureEvent = (res) => {
				if (buffer.remaining() === 0) {
					if (res !== FutureEnd.CopyResult.COMPLETED) throw new Error("invalid buffer state, expected zero remaining post-completion");
				} else if (res === FutureEnd.CopyResult.COMPLETED) throw new Error("invalid buffer state, expected 1 remaining post-completion");
				if (res === FutureEnd.CopyResult.DROPPED || res === FutureEnd.CopyResult.COMPLETED) this.setCopyState(FutureEnd.CopyState.DONE);
				else this.setCopyState(FutureEnd.CopyState.IDLE);
				return {
					code: _context.events.FUTURE_READ,
					payload0: this.waitableIdx(),
					payload1: res
				};
			};
			const isReadableEnd = this.isReadable();
			const onCopyDoneFn = (res) => {
				if (res === FutureEnd.CopyResult.DROPPED && isReadableEnd) throw new Error("cannot read from a dropped future");
				this.setPendingEvent(() => futureEvent(res));
			};
			let injectedWritePromise;
			if (this.#hostInjectFn) injectedWritePromise = this.#hostInjectFn({ count: 1 });
			this._read({
				buffer,
				onCopyDoneFn,
				componentIdx
			});
			if (injectedWritePromise) injectedWritePromise.then((cleanupFn) => cleanupFn(), (err) => this.setPendingEvent(() => {
				throw err;
			}));
			return { buffer };
		}
		async hostRead(args) {
			if (_context.storeTrap.stopped) throw _context.storeTrap.error;
			const { stringEncoding } = args;
			const { buffer } = await this.guestRead({
				stringEncoding,
				isAsync: true,
				data: [],
				componentIdx: -1
			});
			if (!this.hasPendingEvent()) {
				this.setCopyState(FutureEnd.CopyState.ASYNC_COPYING);
				await new Promise((resolve) => {
					let waitInterval = setInterval(() => {
						if (!this.hasPendingEvent() && !this.isDropped()) return;
						clearInterval(waitInterval);
						resolve();
					});
				});
				if (!this.hasPendingEvent()) throw new Error("future dropped while being read");
			}
			const { code, payload0: index, payload1: payload } = this.getPendingEvent();
			if (code !== _context.events.FUTURE_READ) throw new Error(`mismatched event code [${code}] for host future read`);
			if (index !== this.waitableIdx()) throw new Error("mismatched future end index");
			if (payload === FutureEnd.CopyResult.DROPPED && _context.storeTrap.stopped) throw _context.storeTrap.error;
			const vs = buffer.read(1);
			if (vs.length !== 1) throw new Error("multiple results from future");
			const componentIdx = this.getWaitable().componentIdx();
			if (componentIdx !== -1) await getOrCreateAsyncState(_context.lookup, componentIdx).waitForExclusiveRelease();
			return { value: vs[0] };
		}
		/** A host may discard its pending read without trapping the guest. */
		hostDrop() {
			if (this.isDropped()) return;
			const meta = this.getPendingBufferMeta();
			if (meta.buffer && !meta.isWrite) this.resetPendingBufferMeta();
			this.drop();
		}
		drop() {
			super.drop();
			this.#hostInjectFn?.drop?.();
		}
		/** Stop the endpoint and notify a host source that its value was discarded. */
		onInstanceStop() {
			if (this.isDropped()) return;
			super.onInstanceStop();
			this.#hostInjectFn?.drop?.();
		}
	}
	return FutureReadableEnd;
}

//#endregion
//#region runtime/intrinsics/future/writable.js
/** Create writable endpoints sharing the selected buffers and constructor identities. */
function initializeFutureWritableEndClass(_context) {
	const FutureEnd = _context.FutureEnd;
	const { FutureValue } = _context;
	class FutureWritableEnd extends FutureEnd {
		#globalFutureMapRep;
		#futureTableIdx;
		#isHostOwned;
		#hostInjectFn;
		#elemMeta;
		#handle;
		#promise;
		target;
		constructor(args) {
			debugLog("[FutureWritableEnd#constructor()] args", args);
			super(args);
			if (!args.elemMeta) throw new Error("missing/invalid element meta");
			this.#elemMeta = args.elemMeta;
			if (args.tableIdx === void 0) throw new Error("missing index for future table idx");
			this.#futureTableIdx = args.tableIdx;
			this.#hostInjectFn = args.hostInjectFn;
			this.#isHostOwned = args.hostOwned;
		}
		isReadable() {
			return false;
		}
		isWritable() {
			return true;
		}
		setTarget(tgt) {
			this.target = tgt;
		}
		getElemMeta() {
			return { ...this.#elemMeta };
		}
		futureTableIdx() {
			return this.#futureTableIdx;
		}
		setFutureTableIdx(idx) {
			this.#futureTableIdx = idx;
		}
		globalFutureMapRep() {
			return this.#globalFutureMapRep;
		}
		setGlobalFutureMapRep(rep) {
			this.#globalFutureMapRep = rep;
		}
		waitableIdx() {
			return this.getWaitable().idx();
		}
		setWaitableIdx(idx) {
			const w = this.getWaitable();
			w.setIdx(idx);
			w.setTarget(`waitable for FutureWritableEnd (waitable [${idx}])`);
		}
		handle() {
			return this.#handle;
		}
		setHandle(h) {
			this.#handle = h;
		}
		setHostInjectFn(f) {
			if (this.#hostInjectFn) throw new Error("host injection fn is already set");
			this.#hostInjectFn = f;
		}
		promise() {
			if (this.#promise) return this.#promise;
			this.#promise = new FutureValue(() => this.hostRead({ stringEncoding: "utf8" }));
			return this.#promise;
		}
		cancel() {
			debugLog("[FutureEnd#cancel()]");
			this.resetAndNotifyPending(FutureEnd.CopyResult.CANCELLED);
		}
		_write(args) {
			const { buffer, onCopyDoneFn, componentIdx } = args;
			if (!buffer) throw new Error("missing buffer for future write");
			if (buffer.remaining() !== 1) throw new Error("invalid remaining capacity for pending buffer");
			if (this.isDropped()) throw new Error("cannot write to dropped future");
			if (this.isPeerDropped()) {
				onCopyDoneFn(FutureEnd.CopyResult.DROPPED);
				return;
			}
			const meta = this.getPendingBufferMeta();
			if (!meta) throw new Error("missing pending buffer metadata");
			if (!meta.buffer) {
				this.setPendingBufferMeta({
					buffer,
					componentIdx,
					isWrite: true,
					onCopyDoneFn
				});
				return;
			}
			if (componentIdx === meta.componentIdx && componentIdx !== -1 && !(this.#elemMeta.isNone || this.#elemMeta.isNumeric)) throw new _context.RuntimeError("cannot read from and write to intra-component future");
			const transferResources = buffer.componentIdx() !== -1 && meta.buffer.componentIdx() !== -1;
			meta.buffer.write(buffer.read(1, { transferResources }), { transferResources });
			this.resetAndNotifyPending(FutureEnd.CopyResult.COMPLETED);
			onCopyDoneFn(FutureEnd.CopyResult.COMPLETED);
		}
		guestWrite(args) {
			debugLog("[FutureWritableEnd#guestWrite()] args", args);
			const { componentIdx, stringEncoding, memory, realloc, ptr, data } = args;
			const elemMeta = {
				...args.elemMeta ?? this.#elemMeta,
				stringEncoding: stringEncoding ?? this.#elemMeta.stringEncoding,
				getReallocFn: args.getReallocFn ?? this.#elemMeta.getReallocFn
			};
			if (elemMeta.isBorrowed) throw new Error("cannot call future.read on a borrow");
			let buffer = args.buffer;
			if (!buffer) buffer = _context.buffers.createBuffer({
				componentIdx,
				memory,
				realloc,
				start: ptr,
				data,
				count: 1,
				isReadable: this.isWritable(),
				isWritable: this.isReadable(),
				elemMeta
			}).buffer;
			const futureEvent = (res) => {
				if (buffer.remaining() === 0) {
					if (res !== FutureEnd.CopyResult.COMPLETED) throw new Error("invalid buffer state, expected zero remaining post-completion");
				} else if (res === FutureEnd.CopyResult.COMPLETED) throw new Error("invalid buffer state, expected 1 remaining post-completion");
				if (res === FutureEnd.CopyResult.DROPPED || res === FutureEnd.CopyResult.COMPLETED) this.setCopyState(FutureEnd.CopyState.DONE);
				else this.setCopyState(FutureEnd.CopyState.IDLE);
				return {
					code: _context.events.FUTURE_WRITE,
					payload0: this.waitableIdx(),
					payload1: res
				};
			};
			const onCopyDoneFn = (res) => {
				this.setPendingEvent(() => futureEvent(res));
			};
			this._write({
				buffer,
				onCopyDoneFn,
				componentIdx
			});
			return { buffer };
		}
		async hostWrite(args) {
			const { stringEncoding, value, getReallocFn } = args;
			const { buffer } = await this.guestWrite({
				stringEncoding,
				getReallocFn,
				isAsync: true,
				data: [value],
				componentIdx: -1
			});
			if (!this.hasPendingEvent()) {
				this.setCopyState(FutureEnd.CopyState.ASYNC_COPYING);
				await new Promise((resolve) => {
					let waitInterval = setInterval(() => {
						if (!this.hasPendingEvent()) return;
						clearInterval(waitInterval);
						resolve();
					});
				});
				if (!this.hasPendingEvent()) throw new Error("missing pending event after blocked future write");
			}
			const { code, payload0: index, payload1: payload } = this.getPendingEvent();
			if (code !== _context.events.FUTURE_WRITE) throw new Error(`mismatched event code [${code}] for host future write`);
			if (index !== this.waitableIdx()) throw new Error("mismatched future end index");
			return payload === FutureEnd.CopyResult.COMPLETED;
		}
		drop() {
			if (this.isWritable() && !this.isDoneState()) throw new _context.RuntimeError("cannot drop future write end without first writing a value");
			super.drop();
			this.#hostInjectFn?.drop?.();
		}
		/** Stop the endpoint and notify a host source that its value was discarded. */
		onInstanceStop() {
			if (this.isDropped()) return;
			super.onInstanceStop();
			this.#hostInjectFn?.drop?.();
		}
	}
	return FutureWritableEnd;
}

//#endregion
//#region runtime/intrinsics/future/internal.js
/** Create future pairs using the selected readable and writable constructors. */
function initializeInternalFutureClass(_context) {
	class InternalFuture {
		#globalFutureMapRep;
		#pendingBufferMeta = {};
		#elemMeta;
		#readEnd;
		#writeEnd;
		constructor(args) {
			debugLog("[InternalFuture#constructor()] args", args);
			if (!args.elemMeta) throw new Error("missing/invalid future element metadata");
			if (args.tableIdx === void 0) throw new Error("missing/invalid future table idx");
			if (!args.readWaitable) throw new Error("missing/invalid read waitable");
			if (!args.writeWaitable) throw new Error("missing/invalid write waitable");
			const { tableIdx, elemMeta, readWaitable, writeWaitable } = args;
			this.#elemMeta = args.elemMeta;
			this.#readEnd = new _context.FutureReadableEnd({
				tableIdx,
				elemMeta: this.#elemMeta,
				pendingBufferMeta: this.#pendingBufferMeta,
				target: "future read end (@ init)",
				waitable: readWaitable,
				hostInjectFn: args.hostInjectFn,
				isPeerDroppedFn: () => this.#writeEnd?.isDropped() ?? false,
				notifyPeerDroppedFn: () => this.#writeEnd?.notifyDropped()
			});
			this.#writeEnd = new _context.FutureWritableEnd({
				tableIdx,
				elemMeta: this.#elemMeta,
				pendingBufferMeta: this.#pendingBufferMeta,
				target: "future write end (@ init)",
				waitable: writeWaitable,
				hostOwned: true,
				isPeerDroppedFn: () => this.#readEnd.isDropped(),
				notifyPeerDroppedFn: () => this.#readEnd.notifyDropped()
			});
		}
		/** Stop both endpoints so pending host and guest operations are released. */
		onInstanceStop() {
			this.#readEnd.onInstanceStop();
			this.#writeEnd.onInstanceStop();
		}
		elemMeta() {
			return this.#elemMeta;
		}
		readEnd() {
			return this.#readEnd;
		}
		writeEnd() {
			return this.#writeEnd;
		}
		globalFutureMapRep() {
			return this.#globalFutureMapRep;
		}
		setGlobalFutureMapRep(rep) {
			this.#globalFutureMapRep = rep;
			this.#readEnd.setGlobalFutureMapRep(rep);
			this.#writeEnd.setGlobalFutureMapRep(rep);
		}
	}
	return InternalFuture;
}

//#endregion
//#region runtime/intrinsics/future/host.js
/** Create host wrappers that look up endpoints in the selected future tables. */
function initializeHostFutureClass(_context) {
	class HostFuture {
		#componentIdx;
		#futureEndWaitableIdx;
		#futureTableIdx;
		#payloadLiftFn;
		#payloadLowerFn;
		#userFuture;
		#rep = null;
		constructor(args) {
			debugLog("[HostFuture#constructor()] args", args);
			if (args.componentIdx === void 0) throw new TypeError("missing component idx");
			this.#componentIdx = args.componentIdx;
			if (!args.payloadLiftFn) throw new TypeError("missing payload lift fn");
			this.#payloadLiftFn = args.payloadLiftFn;
			if (!args.payloadLowerFn) throw new TypeError("missing payload lower fn");
			this.#payloadLowerFn = args.payloadLowerFn;
			if (args.futureEndWaitableIdx === void 0) throw new Error("missing future idx");
			if (args.futureTableIdx === void 0) throw new Error("missing future table idx");
			this.#futureEndWaitableIdx = args.futureEndWaitableIdx;
			this.#futureTableIdx = args.futureTableIdx;
		}
		setRep(rep) {
			this.#rep = rep;
		}
		getFutureEndWaitableIdx() {
			return this.#futureEndWaitableIdx;
		}
		createUserFuture() {
			if (this.#userFuture) return this.#userFuture;
			if (this.#rep === null) throw new Error("unexpectedly missing rep for host future");
			if (!getOrCreateAsyncState(_context.lookup, this.#componentIdx)) throw new Error(`missing async state for component [${this.#componentIdx}]`);
			const futureEnd = getFutureEnd(_context.ends, {
				tableIdx: this.#futureTableIdx,
				futureEndWaitableIdx: this.#futureEndWaitableIdx
			});
			if (!futureEnd) throw new Error(`missing future [${this.#futureEndWaitableIdx}] (table [${this.#futureTableIdx}], component [${this.#componentIdx}]`);
			if (futureEnd.isDoneState()) throw new _context.RuntimeError("cannot lift future after previous read succeeded");
			if (futureEnd.isInSet()) throw new _context.RuntimeError("cannot lift future while it's in a waitable set");
			return futureEnd.promise();
		}
	}
	return HostFuture;
}

//#endregion
//#region runtime/intrinsics/stream/end.js
/**
* Everything both ends of a stream share: table identity, copy state, the buffer
* pending for the peer, and the copy, cancel and drop protocol.
* The readable and writable end classes add the direction: `isReadable`, `isWritable`,
* and `_transfer`, which moves elements between an operation's buffer and the pending one.
*/
function initializeStreamEndClass(_context) {
	var _a;
	const { events } = _context;
	class StreamEnd {
		static CopyResult = {
			COMPLETED: 0,
			DROPPED: 1,
			CANCELLED: 2
		};
		static CopyState = {
			IDLE: 1,
			SYNC_COPYING: 2,
			ASYNC_COPYING: 3,
			CANCELLING_COPY: 4,
			DONE: 5
		};
		#waitable;
		#elemMeta;
		#pendingBufferMeta;
		#streamTableIdx;
		#handle;
		#globalStreamMapRep;
		#hostInjectFn;
		#hostDropFn;
		#hostCancelFn;
		#rejectedLength = null;
		#copyState = _a.CopyState.IDLE;
		#pendingEventWaiters = [];
		#dropped = false;
		#isPeerDroppedFn;
		#notifyPeerDroppedFn;
		target;
		constructor(args) {
			const { tableIdx } = args;
			if (tableIdx === void 0 || typeof tableIdx !== "number") throw new TypeError(`missing table idx [${tableIdx}]`);
			if (tableIdx < 0 || tableIdx > 2147483647) throw new TypeError(`invalid  tableIdx [${tableIdx}]`);
			if (!args.waitable) throw new Error("missing/invalid waitable");
			this.#streamTableIdx = args.tableIdx;
			this.#waitable = args.waitable;
			if (!args.elemMeta) throw new Error("missing/invalid element meta");
			this.#elemMeta = args.elemMeta;
			if (!args.pendingBufferMeta) throw new Error("missing/invalid shared pending buffer meta");
			this.#pendingBufferMeta = args.pendingBufferMeta;
			if (args.isPeerDroppedFn !== void 0 && typeof args.isPeerDroppedFn !== "function") throw new TypeError("isPeerDroppedFn must be a function");
			if (args.notifyPeerDroppedFn !== void 0 && typeof args.notifyPeerDroppedFn !== "function") throw new TypeError("notifyPeerDroppedFn must be a function");
			this.#isPeerDroppedFn = args.isPeerDroppedFn ?? (() => false);
			this.#notifyPeerDroppedFn = args.notifyPeerDroppedFn ?? (() => {});
			this.target = args.target;
		}
		streamTableIdx() {
			return this.#streamTableIdx;
		}
		setStreamTableIdx(idx) {
			this.#streamTableIdx = idx;
		}
		handle() {
			return this.#handle;
		}
		setHandle(h) {
			this.#handle = h;
		}
		globalStreamMapRep() {
			return this.#globalStreamMapRep;
		}
		setGlobalStreamMapRep(rep) {
			this.#globalStreamMapRep = rep;
		}
		waitableIdx() {
			return this.getWaitable().idx();
		}
		setWaitableIdx(idx) {
			const w = this.getWaitable();
			w.setIdx(idx);
			w.setTarget(`waitable for ${this.isReadable() ? "read" : "write"} end (waitable [${idx}])`);
		}
		setHostInjectFn(f) {
			if (this.#hostInjectFn) throw new Error("host injection fn is already set");
			this.#hostInjectFn = f;
		}
		setHostDropFn(f) {
			if (this.#hostDropFn) throw new Error("host drop fn is already set");
			this.#hostDropFn = f;
		}
		setHostCancelFn(f) {
			this.#hostCancelFn = f;
		}
		hasHostInject() {
			return !!this.#hostInjectFn;
		}
		getElemMeta() {
			return { ...this.#elemMeta };
		}
		/** The length rejected by the last copy, cleared by reading it. */
		takeRejectedLength() {
			const rejectedLength = this.#rejectedLength;
			this.#rejectedLength = null;
			return rejectedLength;
		}
		setRejectedLength(rejectedLength) {
			this.#rejectedLength = rejectedLength;
		}
		isDoneState() {
			return this.getCopyState() === _a.CopyState.DONE;
		}
		isIdleState() {
			return this.getCopyState() === _a.CopyState.IDLE;
		}
		setTarget(tgt) {
			this.target = tgt;
		}
		getWaitable() {
			return this.#waitable;
		}
		setCopyState(state) {
			this.#copyState = state;
		}
		getCopyState() {
			return this.#copyState;
		}
		isCopying() {
			switch (this.#copyState) {
				case _a.CopyState.IDLE:
				case _a.CopyState.DONE: return false;
				case _a.CopyState.SYNC_COPYING:
				case _a.CopyState.ASYNC_COPYING:
				case _a.CopyState.CANCELLING_COPY: return true;
				default: throw new Error("invalid/unknown copying state");
			}
		}
		setPendingEvent(fn) {
			debugLog("[StreamEnd#setPendingEvent()]", {
				waitable: this.#waitable,
				waitableinSet: this.#waitable.isInSet(),
				componentIdx: this.#waitable.componentIdx()
			});
			this.#waitable.setPendingEvent(fn);
			for (const wake of this.#pendingEventWaiters.splice(0)) wake();
		}
		/** Settles once an event is pending, in a later macrotask than the one that set it. */
		async waitForPendingEvent() {
			do {
				if (!this.hasPendingEvent()) await new Promise((resolve) => this.#pendingEventWaiters.push(resolve));
				await new Promise((resolve) => setTimeout(resolve));
			} while (!this.hasPendingEvent());
		}
		hasPendingEvent() {
			return this.#waitable.hasPendingEvent();
		}
		isInSet() {
			return this.#waitable.isInSet();
		}
		getPendingEvent() {
			debugLog("[StreamEnd#getPendingEvent()]", {
				waitable: this.#waitable,
				waitableinSet: this.#waitable.isInSet(),
				componentIdx: this.#waitable.componentIdx()
			});
			return this.#waitable.getPendingEvent();
		}
		isDropped() {
			return this.#dropped;
		}
		isPeerDropped() {
			return this.#isPeerDroppedFn();
		}
		notifyDropped() {
			if (this.isDropped() || this.isDoneState() || this.hasPendingEvent()) return;
			const eventCode = this.isReadable() ? events.STREAM_READ : events.STREAM_WRITE;
			this.setPendingEvent(() => {
				this.setCopyState(_a.CopyState.DONE);
				return {
					code: eventCode,
					payload0: this.waitableIdx(),
					payload1: _a.CopyResult.DROPPED
				};
			});
		}
		#setupCopy(args) {
			const { memory, ptr, count, eventCode, componentIdx } = args;
			if (eventCode === void 0) throw new Error("missing/invalid event code");
			let buffer = args.buffer;
			if (this.isCopying()) throw new _context.RuntimeError("cannot have concurrent operations active on a future/stream");
			if (this.getCopyState() !== _a.CopyState.IDLE) throw new Error(`stream copy state is not idle`);
			const elemMeta = args.elemMeta ?? this.getElemMeta();
			if (elemMeta.isBorrowed) throw new Error("borrowed types cannot be sent over streams");
			if (!buffer) {
				const newBufferMeta = _context.buffers.createBuffer({
					componentIdx,
					memory,
					start: ptr,
					count,
					isReadable: this.isWritable(),
					isWritable: this.isReadable(),
					elemMeta
				});
				buffer = newBufferMeta.buffer;
				buffer.setTarget(`component [${componentIdx}] ${this.isReadable() ? "StreamReadableEnd" : "StreamWritableEnd"} buffer (id [${newBufferMeta.id}], count [${count}], eventCode [${eventCode}])`);
			}
			const streamEnd = this;
			const processFn = (result, reclaimBufferFn, rejectedLength) => {
				if (reclaimBufferFn) reclaimBufferFn();
				if (result === _a.CopyResult.COMPLETED && streamEnd.getCopyState() === _a.CopyState.CANCELLING_COPY && !streamEnd.hasHostInject()) result = _a.CopyResult.CANCELLED;
				if (result === _a.CopyResult.DROPPED) streamEnd.setCopyState(_a.CopyState.DONE);
				else streamEnd.setCopyState(_a.CopyState.IDLE);
				if (result < 0 || result >= 16) throw new Error(`unsupported stream copy result [${result}]`);
				if (buffer.processed >= _context.ManagedBuffer.MAX_LENGTH) throw new Error(`processed count [${buffer.processed}] greater than max length`);
				if (buffer.capacity > 2 ** 28) throw new Error("buffer uses reserved space");
				const packedResult = Number(buffer.processed) << 4 | result;
				const event = {
					code: eventCode,
					payload0: streamEnd.waitableIdx(),
					payload1: packedResult
				};
				if (rejectedLength !== void 0) event.rejectedLength = rejectedLength;
				return event;
			};
			const onCopyFn = (reclaimBufferFn, result = _a.CopyResult.COMPLETED) => {
				streamEnd.setPendingEvent(() => {
					return processFn(result, reclaimBufferFn);
				});
			};
			const onCopyDoneFn = (result, rejectedLength) => {
				streamEnd.setPendingEvent(() => {
					return processFn(result, void 0, rejectedLength);
				});
			};
			return {
				buffer,
				onCopyFn,
				onCopyDoneFn
			};
		}
		copy(args) {
			const { isAsync, memory, componentIdx, ptr, count, eventCode, stringEncoding, rejectLength, elemMeta, dropAfterCopy, deferSyncFinish } = args;
			if (eventCode === void 0) throw new TypeError("missing/invalid event code");
			const copyElemMeta = elemMeta ? {
				...elemMeta,
				payloadTypeName: this.#elemMeta.payloadTypeName
			} : this.#elemMeta;
			if (copyElemMeta.stringEncoding === void 0 && stringEncoding) copyElemMeta.stringEncoding = stringEncoding;
			if (copyElemMeta.stringEncoding && stringEncoding && copyElemMeta.stringEncoding !== stringEncoding) throw new Error(`inconsistent string encoding (previously [${copyElemMeta.stringEncoding}], now [${stringEncoding}])`);
			if (args.getReallocFn && copyElemMeta.getReallocFn === void 0) copyElemMeta.getReallocFn = args.getReallocFn;
			if (this.hasPendingEvent()) {
				const event = this.getPendingEvent();
				if (event.code !== eventCode || event.payload0 !== this.waitableIdx()) throw new Error("invalid pending event during stream operation");
				if (this.isWritable() && this.isPeerDropped()) {
					this.setCopyState(_a.CopyState.DONE);
					return event.payload1 & -16 | _a.CopyResult.DROPPED;
				}
				return event.payload1;
			}
			if (this.isDropped() || this.isPeerDropped()) {
				if (this.#pendingBufferMeta.onCopyDoneFn) {
					const f = this.#pendingBufferMeta.onCopyDoneFn;
					this.#pendingBufferMeta.onCopyDoneFn = null;
					f(_a.CopyResult.DROPPED);
				}
				this.setCopyState(_a.CopyState.DONE);
				return _a.CopyResult.DROPPED;
			}
			const { buffer, onCopyFn, onCopyDoneFn } = this.#setupCopy({
				memory,
				eventCode,
				componentIdx,
				ptr,
				count,
				buffer: args.buffer,
				elemMeta: copyElemMeta
			});
			const injectHostWrite = this.isReadable() && !!this.#hostInjectFn;
			this._transfer({
				buffer,
				onCopyFn,
				onCopyDoneFn,
				componentIdx,
				rejectLength,
				dropAfterCopy
			});
			let injectedWritePromise;
			if (injectHostWrite) injectedWritePromise = this.#hostInjectFn({ count });
			const finishCopy = () => {
				const event = this.getPendingEvent();
				if (!event) throw new Error("unexpectedly missing pending event");
				if (event.code === void 0 || event.payload0 === void 0 || event.payload1 === void 0) throw new Error("unexpectedly malformed event");
				const { code, payload0: index, payload1: payload } = event;
				const waitableIdx = this.getWaitable().idx();
				if (code !== eventCode || index !== waitableIdx || payload === 4294967295) {
					const errMsg = "invalid event code/event during stream operation";
					debugLog(errMsg, {
						event,
						payload,
						payloadIsBlockedConst: payload === asyncBlockedCode,
						code,
						eventCode,
						codeDoesNotMatchEventCode: code !== eventCode,
						index,
						internalEndIdx: waitableIdx,
						indexDoesNotMatch: index !== waitableIdx
					});
					throw new Error(errMsg);
				}
				if (event.rejectedLength !== void 0) this.#rejectedLength = event.rejectedLength;
				if (this.isWritable() && this.isPeerDropped()) {
					this.setCopyState(_a.CopyState.DONE);
					return payload & -16 | _a.CopyResult.DROPPED;
				}
				return payload;
			};
			if (!this.hasPendingEvent()) {
				if (isAsync) {
					this.setCopyState(_a.CopyState.ASYNC_COPYING);
					debugLog("[StreamEnd#copy()] blocked", {
						componentIdx,
						eventCode,
						self: this
					});
					if (injectedWritePromise) injectedWritePromise.then((cleanupFn) => cleanupFn(), (err) => this.setPendingEvent(() => {
						throw err;
					}));
					return asyncBlockedCode;
				} else {
					this.setCopyState(_a.CopyState.SYNC_COPYING);
					const taskMeta = getCurrentTask(_context.taskLookup, componentIdx);
					if (!taskMeta) throw new Error(`missing task meta for component idx [${componentIdx}]`);
					const task = taskMeta.task;
					if (!task) throw new Error("missing task task from task meta");
					const streamEnd = this;
					return task.suspendUntil({ readyFn: () => streamEnd.hasPendingEvent() }).then(async () => {
						if (deferSyncFinish) await Promise.resolve();
						if (!injectedWritePromise) return finishCopy();
						return injectedWritePromise.then((cleanupFn) => {
							cleanupFn();
							return finishCopy();
						});
					});
				}
			}
			if (!injectedWritePromise) return finishCopy();
			if (isAsync) {
				injectedWritePromise.then((cleanupFn) => cleanupFn(), (err) => this.setPendingEvent(() => {
					throw err;
				}));
				return finishCopy();
			}
			return injectedWritePromise.then((cleanupFn) => {
				cleanupFn();
				return finishCopy();
			});
		}
		setPendingBufferMeta(args) {
			const { componentIdx, buffer, onCopyFn, onCopyDoneFn, rejectLength, dropAfterCopy } = args;
			this.#pendingBufferMeta.componentIdx = componentIdx;
			this.#pendingBufferMeta.buffer = buffer;
			this.#pendingBufferMeta.onCopyFn = onCopyFn;
			this.#pendingBufferMeta.onCopyDoneFn = onCopyDoneFn;
			this.#pendingBufferMeta.rejectLength = rejectLength;
			this.#pendingBufferMeta.dropAfterCopy = dropAfterCopy;
		}
		resetPendingBufferMeta() {
			this.setPendingBufferMeta({
				componentIdx: null,
				buffer: null,
				onCopyFn: null,
				onCopyDoneFn: null,
				rejectLength: void 0,
				dropAfterCopy: false
			});
		}
		getPendingBufferMeta() {
			return this.#pendingBufferMeta;
		}
		hasPendingBuffer() {
			return !!this.#pendingBufferMeta.buffer;
		}
		resetAndNotifyPending(result) {
			const f = this.#pendingBufferMeta.onCopyDoneFn;
			this.resetPendingBufferMeta();
			if (f) f(result);
		}
		cancel() {
			debugLog("[StreamEnd#cancel()]");
			const completeCancel = () => {
				if (this.isDropped()) return;
				if (this.hasPendingEvent()) return;
				if (this.#hostCancelFn?.()) return;
				this.resetAndNotifyPending(_a.CopyResult.CANCELLED);
			};
			if (this.#hostInjectFn) trackHostOperation(_context.tracking, () => new Promise((resolve) => {
				setTimeout(() => {
					try {
						completeCancel();
					} finally {
						resolve();
					}
				}, 0);
			}));
			else completeCancel();
		}
		drop(opts = {}) {
			debugLog("[StreamEnd#drop()]", {
				waitable: this.#waitable,
				waitableinSet: this.#waitable.isInSet(),
				componentIdx: this.#waitable.componentIdx()
			});
			if (this.isDropped()) return;
			const hostDropFn = this.#hostDropFn;
			this.#hostDropFn = null;
			this.#dropped = true;
			this.#notifyPeerDroppedFn();
			if (opts.allowPendingEvent) this.#waitable.join(null);
			else this.#waitable.drop();
			if (hostDropFn) hostDropFn();
			this.resetAndNotifyPending(_a.CopyResult.DROPPED);
		}
	}
	_a = StreamEnd;
	return StreamEnd;
}

//#endregion
//#region runtime/intrinsics/stream/external.js
function initializeExternalStreamClass(_context) {
	class Stream {
		#isReadable;
		#isWritable;
		#writeFn;
		#readFn;
		#dropFn;
		constructor(args) {
			debugLog("[Stream#constructor()] args", args);
			if (args.globalRep === void 0) throw new TypeError("missing host stream rep");
			this[_context.resourceRep] = args.globalRep;
			if (args.isReadable === void 0) throw new TypeError("missing readable setting");
			this.#isReadable = args.isReadable;
			if (args.isWritable === void 0) throw new TypeError("missing writable setting");
			this.#isWritable = args.isWritable;
			if (this.#isWritable && args.writeFn === void 0) throw new TypeError("missing write fn");
			this.#writeFn = args.writeFn;
			if (this.#isReadable && args.readFn === void 0) throw new TypeError("missing read fn");
			this.#readFn = args.readFn;
			this.#dropFn = args.dropFn;
		}
		[_context.asyncIteratorSymbol]() {
			return this;
		}
		async return() {
			this[_context.disposeSymbol]();
			return { done: true };
		}
		async next() {
			debugLog("[Stream#next()]");
			return this.read();
		}
		async read(opts) {
			debugLog("[Stream#read()]", { opts });
			if (!this.#isReadable) throw new Error("stream is not marked as readable and cannot be read from");
			return this.#readFn(opts);
		}
		async write(...objects) {
			debugLog("[Stream#write()]");
			if (!this.#isWritable) throw new Error("stream is not marked as writable and cannot be written to");
			if (objects.length !== 1) throw new Error("only single object writes are currently supported");
			const obj = objects[0];
			await this.#writeFn(obj);
		}
		[_context.disposeSymbol]() {
			this.#dropFn?.();
		}
	}
	return Stream;
}

//#endregion
//#region runtime/intrinsics/stream/host.js
function initializeHostStreamClass(_context) {
	class HostStream {
		#componentIdx;
		#streamEndWaitableIdx;
		#streamTableIdx;
		#payloadLiftFn;
		#payloadLowerFn;
		#rep = null;
		constructor(args) {
			debugLog("[HostStream#constructor()] args", args);
			if (args.componentIdx === void 0) throw new TypeError("missing component idx");
			this.#componentIdx = args.componentIdx;
			if (!args.payloadLiftFn) throw new TypeError("missing payload lift fn");
			this.#payloadLiftFn = args.payloadLiftFn;
			if (!args.payloadLowerFn) throw new TypeError("missing payload lower fn");
			this.#payloadLowerFn = args.payloadLowerFn;
			if (args.streamEndWaitableIdx === void 0) throw new Error("missing stream idx");
			if (args.streamTableIdx === void 0) throw new Error("missing stream table idx");
			this.#streamEndWaitableIdx = args.streamEndWaitableIdx;
			this.#streamTableIdx = args.streamTableIdx;
		}
		setRep(rep) {
			this.#rep = rep;
		}
		getStreamEndWaitableIdx() {
			return this.#streamEndWaitableIdx;
		}
		createUserStream() {
			if (this.#rep === null) throw new Error("unexpectedly missing rep for host stream");
			const streamEnd = getStreamEnd(_context.ends, {
				tableIdx: this.#streamTableIdx,
				streamEndWaitableIdx: this.#streamEndWaitableIdx
			});
			if (streamEnd.isDoneState()) throw new _context.RuntimeError("cannot lift stream after being notified that the writable end dropped");
			if (streamEnd.isInSet()) throw new _context.RuntimeError("cannot lift stream while it's in a waitable set");
			return new _context.Stream({
				isReadable: streamEnd.isReadable(),
				isWritable: streamEnd.isWritable(),
				globalRep: this.#rep,
				readFn: async (opts) => {
					return await streamEnd.read(opts);
				},
				writeFn: async (v) => {
					await streamEnd.write(v);
				},
				dropFn: () => streamEnd.drop({ allowPendingEvent: true })
			});
		}
	}
	return HostStream;
}

//#endregion
//#region runtime/intrinsics/stream/internal.js
function initializeInternalStreamClass(_context) {
	class InternalStream {
		#pendingBufferMeta = {};
		#elemMeta;
		#globalStreamMapRep;
		#readEnd;
		#writeEnd;
		constructor(args) {
			debugLog("[InternalStream#constructor()] args", args);
			if (!args.elemMeta) throw new Error("missing/invalid stream element metadata");
			if (args.tableIdx === void 0) throw new Error("missing/invalid stream table idx");
			if (!args.readWaitable) throw new Error("missing/invalid read waitable");
			if (!args.writeWaitable) throw new Error("missing/invalid write waitable");
			const { tableIdx, elemMeta, readWaitable, writeWaitable } = args;
			this.#elemMeta = elemMeta;
			this.#readEnd = new _context.StreamReadableEnd({
				tableIdx,
				elemMeta: this.#elemMeta,
				pendingBufferMeta: this.#pendingBufferMeta,
				target: "stream read end (@ init)",
				waitable: readWaitable,
				isPeerDroppedFn: () => this.#writeEnd?.isDropped() ?? false,
				notifyPeerDroppedFn: () => this.#writeEnd?.notifyDropped()
			});
			this.#writeEnd = new _context.StreamWritableEnd({
				tableIdx,
				elemMeta: this.#elemMeta,
				pendingBufferMeta: this.#pendingBufferMeta,
				target: "stream write end (@ init)",
				waitable: writeWaitable,
				isPeerDroppedFn: () => this.#readEnd.isDropped(),
				notifyPeerDroppedFn: () => this.#readEnd.notifyDropped()
			});
		}
		elemMeta() {
			return this.#elemMeta;
		}
		globalStreamMapRep() {
			return this.#globalStreamMapRep;
		}
		setGlobalStreamMapRep(rep) {
			this.#globalStreamMapRep = rep;
			this.#readEnd.setGlobalStreamMapRep(rep);
			this.#writeEnd.setGlobalStreamMapRep(rep);
		}
		readEnd() {
			return this.#readEnd;
		}
		writeEnd() {
			return this.#writeEnd;
		}
		onInstanceStop() {
			this.#readEnd.onInstanceStop();
			this.#writeEnd.drop({ allowPendingEvent: true });
		}
	}
	return InternalStream;
}

//#endregion
//#region runtime/intrinsics/stream/queue.js
function initializePendingValueQueueClass(tracking) {
	class PendingValueQueue {
		#readFn;
		#elemMeta;
		#done = false;
		#sourceReadPromise = null;
		#chunks = [];
		#offset = 0;
		#length = 0;
		constructor(readFn, elemMeta) {
			this.#readFn = readFn;
			this.#elemMeta = elemMeta;
		}
		get length() {
			return this.#length;
		}
		get done() {
			return this.#done;
		}
		get sourceIsSync() {
			return !!this.#readFn.sourceIsSync;
		}
		push(source) {
			if (source.length === 0) return 0;
			this.#chunks.push(source);
			this.#length += source.length;
			return source.length;
		}
		appendReadValue(value) {
			if (value === void 0) return 0;
			if (this.#elemMeta.isNumeric) {
				if (value instanceof ArrayBuffer) value = new Uint8Array(value);
				if (Array.isArray(value) || ArrayBuffer.isView(value) && "length" in value && typeof value.length === "number") return this.push(value);
			}
			return this.push([value]);
		}
		async readSource() {
			if (!this.#sourceReadPromise) this.#sourceReadPromise = (async () => {
				let hostRead;
				let res;
				try {
					res = await trackHostOperation(tracking, () => hostRead = this.#readFn());
				} catch (err) {
					if (!tracking.storeTrap.stopped) throw err;
					Promise.resolve(hostRead).then((late) => disposeHostValue(tracking.symbolDispose, late?.value), () => {});
					this.#done = true;
					return 0;
				}
				if (this.#readFn.dropped) {
					disposeHostValue(tracking.symbolDispose, res.value);
					this.#done = true;
					return 0;
				}
				const appended = this.appendReadValue(res.value);
				this.#done = !!res.done;
				return appended;
			})().finally(() => {
				this.#sourceReadPromise = null;
			});
			return this.#sourceReadPromise;
		}
		prepend(source) {
			if (source.length === 0) return;
			if (this.#offset !== 0 && this.#chunks.length > 0) {
				this.#chunks[0] = this.#chunks[0].slice(this.#offset);
				this.#offset = 0;
			}
			this.#chunks.unshift(source);
			this.#length += source.length;
		}
		drainInto(target, maxCount) {
			let transferred = 0;
			let remaining = Math.min(maxCount, this.#length);
			while (remaining > 0) {
				const chunk = this.#chunks[0];
				const transfer = Math.min(remaining, chunk.length - this.#offset);
				for (let i = 0; i < transfer; i++) target.push(chunk[this.#offset + i]);
				this.#offset += transfer;
				this.#length -= transfer;
				transferred += transfer;
				remaining -= transfer;
				if (this.#offset === chunk.length) {
					this.#chunks.shift();
					this.#offset = 0;
				}
			}
			return transferred;
		}
	}
	return PendingValueQueue;
}

//#endregion
//#region runtime/intrinsics/stream/readable.js
function initializeStreamReadableEndClass(_context) {
	const StreamEnd = _context.StreamEnd;
	class StreamReadableEnd extends StreamEnd {
		#elemMeta;
		#result = null;
		#endOfStream = false;
		#stopError = null;
		constructor(args) {
			debugLog("[StreamReadableEnd#constructor()] args", args);
			super(args);
			this.#elemMeta = args.elemMeta;
		}
		isReadable() {
			return true;
		}
		isWritable() {
			return false;
		}
		onInstanceStop() {
			if (!this.isDropped() && !this.isPeerDropped() && !this.isDoneState()) this.#stopError = Object.assign(/* @__PURE__ */ new Error("component instance has been stopped"), { code: "ERR_COMPONENT_STOPPED" });
			this.drop({ allowPendingEvent: true });
		}
		async read(opts = 1) {
			debugLog("[StreamReadableEnd#read()]");
			if (this.#endOfStream) return {
				value: void 0,
				done: true
			};
			if (this.#stopError) throw this.#stopError;
			let { count, rejectLength, dropAfterCopy } = this.#readOpts(opts);
			const newResult = promiseWithResolvers();
			if (this.#result) try {
				const p = this.#result.promise;
				this.#result = newResult;
				await p;
			} catch (err) {
				debugLog("[StreamReadableEnd#read()] error waiting for previous read", err);
			}
			else this.#result = newResult;
			const { promise, resolve, reject } = newResult;
			count = Math.min(count, _context.ManagedBuffer.MAX_LENGTH);
			try {
				const { id: bufferID, buffer } = _context.buffers.createBuffer({
					componentIdx: -1,
					count,
					isReadable: false,
					isWritable: true,
					elemMeta: this.#elemMeta,
					data: []
				});
				buffer.setTarget(`host stream read buffer (id [${bufferID}], count [${count}])`);
				let packedResult;
				packedResult = await this.copy({
					isAsync: true,
					count,
					buffer,
					eventCode: _context.events.STREAM_READ,
					componentIdx: -1,
					rejectLength,
					dropAfterCopy
				});
				if (packedResult === 4294967295) {
					await this.waitForPendingEvent();
					const event = this.getPendingEvent();
					if (!event) throw new Error("missing pending event after blocked stream read");
					const { code, payload0: index, payload1: payload } = event;
					if (code !== _context.events.STREAM_READ) throw new Error(`mismatched event code [${code}] for host stream read`);
					if (index !== this.waitableIdx()) throw new Error("invalid stream end index");
					if (event.rejectedLength !== void 0) this.setRejectedLength(event.rejectedLength);
					packedResult = payload;
					if (packedResult === 4294967295) throw new Error("unexpected double block during read");
				}
				const resultKind = packedResult & 15;
				const transferred = packedResult >> 4;
				const componentIdx = this.getWaitable().componentIdx();
				if (componentIdx !== -1) await getOrCreateAsyncState(_context.lookup, componentIdx).waitForExclusiveRelease();
				if (resultKind === StreamEnd.CopyResult.DROPPED) {
					if (this.#stopError) {
						if (transferred === 0) throw this.#stopError;
					} else this.#endOfStream = true;
				}
				if (this.#result === newResult) this.#result = null;
				if (transferred > 0) {
					const values = buffer.read(transferred);
					const { typedArray } = this.#elemMeta;
					resolve({
						value: typedArray === void 0 ? count === 1 ? values[0] : values : new typedArray(values),
						done: false
					});
				} else resolve({
					value: void 0,
					done: true
				});
			} catch (err) {
				debugLog("[StreamReadableEnd#read()] error", err);
				reject(err);
			}
			const result = await promise;
			const rejectedLength = this.takeRejectedLength();
			if (rejectedLength !== null) result.rejectedLength = rejectedLength;
			return result;
		}
		#readOpts(opts) {
			const count = opts === void 0 ? 1 : typeof opts === "number" ? opts : opts && typeof opts === "object" ? opts.count ?? 1 : void 0;
			const rejectLength = opts && typeof opts === "object" ? opts.rejectLength : void 0;
			if (count === void 0 || !Number.isInteger(count) || count < (rejectLength !== void 0 ? 0 : 1)) throw new TypeError(`invalid stream read count [${count}]`);
			if (rejectLength !== void 0 && (!Number.isInteger(rejectLength) || rejectLength < 0)) throw new TypeError(`invalid stream read reject length [${rejectLength}]`);
			return {
				count,
				rejectLength,
				dropAfterCopy: opts && typeof opts === "object" ? opts.dropAfterCopy === true : false
			};
		}
		/** Fills the reader's buffer from the buffer a writer left pending, or leaves the reader's pending. */
		_transfer(args) {
			const { buffer, onCopyDoneFn, onCopyFn, componentIdx, rejectLength, dropAfterCopy } = args;
			const pending = this.getPendingBufferMeta();
			if (this.isDropped()) {
				onCopyDoneFn(StreamEnd.CopyResult.DROPPED);
				return;
			}
			if (!pending.buffer) {
				this.setPendingBufferMeta({
					componentIdx,
					buffer,
					onCopyFn,
					onCopyDoneFn,
					rejectLength,
					dropAfterCopy
				});
				return;
			}
			const pendingElemMeta = pending.buffer.getElemMeta();
			const newBufferElemMeta = buffer.getElemMeta();
			if (pendingElemMeta.payloadTypeName !== newBufferElemMeta.payloadTypeName) throw new _context.RuntimeError("stream end type does not match internal buffer");
			if (newBufferElemMeta.stringEncoding === void 0 || pendingElemMeta.stringEncoding === void 0) {
				const encoding = pendingElemMeta.stringEncoding ?? newBufferElemMeta.stringEncoding;
				if (encoding === void 0) throw new Error("both writer & reader missing string encoding");
				newBufferElemMeta.stringEncoding = encoding;
				pendingElemMeta.stringEncoding = encoding;
			}
			const pendingElemIsNoneOrNumeric = pendingElemMeta.isNone || pendingElemMeta.isNumeric;
			if (pending.componentIdx === buffer.componentIdx() && buffer.componentIdx() !== -1 && !pendingElemIsNoneOrNumeric) throw new _context.RuntimeError("cannot read from and write to intra-component future/stream with non-numeric payload");
			const pendingRemaining = pending.buffer.remaining();
			const shouldDropAfterCopy = dropAfterCopy || pending.dropAfterCopy;
			if (pendingRemaining > 0) {
				const bufferRemaining = buffer.remaining();
				if (rejectLength !== void 0 && pendingRemaining > rejectLength) {
					this.resetAndNotifyPending(StreamEnd.CopyResult.DROPPED);
					onCopyDoneFn(StreamEnd.CopyResult.DROPPED, pendingRemaining);
					return;
				}
				if (bufferRemaining > 0) {
					const count = Math.min(pendingRemaining, bufferRemaining);
					const transferResources = buffer.componentIdx() !== -1 && pending.buffer.componentIdx() !== -1;
					buffer.write(pending.buffer.read(count, { transferResources }), { transferResources });
					pending.onCopyFn(() => this.resetPendingBufferMeta(), shouldDropAfterCopy ? StreamEnd.CopyResult.DROPPED : StreamEnd.CopyResult.COMPLETED);
				}
				onCopyDoneFn(shouldDropAfterCopy ? StreamEnd.CopyResult.DROPPED : StreamEnd.CopyResult.COMPLETED);
				return;
			}
			this.resetAndNotifyPending(StreamEnd.CopyResult.COMPLETED);
			this.setPendingBufferMeta({
				componentIdx,
				buffer,
				onCopyFn,
				onCopyDoneFn,
				rejectLength,
				dropAfterCopy
			});
		}
	}
	return StreamReadableEnd;
}

//#endregion
//#region runtime/intrinsics/stream/writable.js
function initializeStreamWritableEndClass(_context) {
	const StreamEnd = _context.StreamEnd;
	class StreamWritableEnd extends StreamEnd {
		#elemMeta;
		#sourceRebufferFn = null;
		constructor(args) {
			debugLog("[StreamWritableEnd#constructor()] args", args);
			super(args);
			this.#elemMeta = args.elemMeta;
		}
		isReadable() {
			return false;
		}
		isWritable() {
			return true;
		}
		setSourceRebufferFn(f) {
			this.#sourceRebufferFn = f;
		}
		async write(v) {
			debugLog("[StreamWritableEnd#write()] args", { v });
			let data;
			if (this.#elemMeta.isNumeric) {
				if (v instanceof ArrayBuffer) v = new Uint8Array(v);
				data = Array.isArray(v) || ArrayBuffer.isView(v) && "length" in v && typeof v.length === "number" ? Array.from(v) : [v];
			} else data = [v];
			return this.writeMany(data);
		}
		/**
		* Offers `values` to the reader. Every writable end is written by the host, just in time
		* for a guest read, so a write the reader has not taken yet stays pending and is not awaited.
		*/
		async writeMany(values, opts = {}) {
			debugLog("[StreamWritableEnd#writeMany()] args", { values });
			if (!Array.isArray(values)) throw new TypeError("writeMany values must be an array");
			const count = values.length;
			const { id: bufferID, buffer } = _context.buffers.createBuffer({
				componentIdx: -1,
				count,
				isReadable: true,
				isWritable: false,
				elemMeta: this.#elemMeta,
				data: values
			});
			buffer.setTarget(`host stream write buffer (id [${bufferID}], count [${count}])`);
			const copied = this.copy({
				isAsync: true,
				count,
				buffer,
				eventCode: _context.events.STREAM_WRITE,
				componentIdx: -1,
				dropAfterCopy: opts.dropAfterCopy === true
			});
			if (this.hasPendingEvent()) {
				Promise.resolve(copied).catch(() => {});
				return;
			}
			await copied;
		}
		/** Drains the writer's buffer into the buffer a reader left pending, or leaves the writer's pending. */
		_transfer(args) {
			const { buffer, onCopyFn, onCopyDoneFn, componentIdx, dropAfterCopy } = args;
			const pending = this.getPendingBufferMeta();
			if (!buffer) throw new TypeError("missing/invalid buffer");
			if (!onCopyFn) throw new TypeError("missing/invalid onCopy handler");
			if (!onCopyDoneFn) throw new TypeError("missing/invalid onCopyDone handler");
			if (this.isDropped()) {
				onCopyDoneFn(StreamEnd.CopyResult.DROPPED);
				return;
			}
			if (!pending.buffer) {
				if (this.#sourceRebufferFn && buffer.isHostOwned()) {
					const remaining = buffer.remaining();
					if (remaining > 0) this.#sourceRebufferFn(buffer.read(remaining));
					onCopyDoneFn(StreamEnd.CopyResult.COMPLETED);
					return;
				}
				this.setPendingBufferMeta({
					componentIdx,
					buffer,
					onCopyFn,
					onCopyDoneFn,
					dropAfterCopy
				});
				return;
			}
			const pendingElemMeta = pending.buffer.getElemMeta();
			const newBufferElemMeta = buffer.getElemMeta();
			if (pendingElemMeta.payloadTypeName !== newBufferElemMeta.payloadTypeName) throw new _context.RuntimeError("stream end type does not match internal buffer");
			const pendingElemIsNoneOrNumeric = pendingElemMeta.isNone || pendingElemMeta.isNumeric;
			if (pending.componentIdx === buffer.componentIdx() && buffer.componentIdx() !== -1 && !pendingElemIsNoneOrNumeric) throw new _context.RuntimeError("cannot read from and write to intra-component future/stream with non-numeric payload");
			if (buffer.capacity === 0 && pending.buffer.capacity === 0) {
				onCopyDoneFn(StreamEnd.CopyResult.COMPLETED);
				return;
			}
			if (pending.buffer.remaining() === 0) {
				this.resetAndNotifyPending(StreamEnd.CopyResult.COMPLETED);
				this.setPendingBufferMeta({
					componentIdx,
					buffer,
					onCopyFn,
					onCopyDoneFn,
					dropAfterCopy
				});
				return;
			}
			const shouldDropAfterCopy = dropAfterCopy || pending.dropAfterCopy;
			if (buffer.remaining() > 0) {
				const rejectLength = pending.rejectLength;
				if (rejectLength !== void 0 && buffer.remaining() > rejectLength) {
					const pendingOnCopyDoneFn = pending.onCopyDoneFn;
					this.resetPendingBufferMeta();
					pendingOnCopyDoneFn(StreamEnd.CopyResult.DROPPED, buffer.remaining());
					onCopyDoneFn(StreamEnd.CopyResult.DROPPED);
					return;
				}
				const numElements = Math.min(buffer.remaining(), pending.buffer.remaining());
				const transferResources = buffer.componentIdx() !== -1 && pending.buffer.componentIdx() !== -1;
				pending.buffer.write(buffer.read(numElements, { transferResources }), { transferResources });
				pending.onCopyFn(() => this.resetPendingBufferMeta(), shouldDropAfterCopy ? StreamEnd.CopyResult.DROPPED : StreamEnd.CopyResult.COMPLETED);
			}
			onCopyDoneFn(shouldDropAfterCopy ? StreamEnd.CopyResult.DROPPED : StreamEnd.CopyResult.COMPLETED);
		}
	}
	return StreamWritableEnd;
}

//#endregion
//#region runtime/intrinsics/stream/operations.js
/**
* Implements `canon stream.new`.
* Create a stream and pack its readable and writable indices into one i64.
*/
function streamNew(_context, ctx) {
	debugLog("[streamNew()] args", { ctx });
	const { streamTableIdx, callerComponentIdx, elemMeta } = ctx;
	if (callerComponentIdx === void 0) throw new Error("missing caller component idx during stream.new");
	const taskMeta = getCurrentTask(_context.taskLookup, callerComponentIdx);
	if (!taskMeta) throw new Error("missing async task metadata during stream.new");
	const task = taskMeta.task;
	if (!task) throw new Error("invalid/missing async task during stream.new");
	if (task.componentIdx() !== callerComponentIdx) throw new Error(`task component idx [${task.componentIdx()}] does not match stream new intrinsic component idx [${callerComponentIdx}]`);
	const cstate = getOrCreateAsyncState(_context.lookup, callerComponentIdx);
	if (!cstate.mayLeave) throw new Error("component instance is not marked as may leave during stream.new");
	const { writeEndWaitableIdx, readEndWaitableIdx, writeEndHandle, readEndHandle } = createStream(_context.creation, cstate, {
		tableIdx: streamTableIdx,
		elemMeta
	});
	debugLog("[streamNew()] created stream ends", {
		writeEnd: {
			waitableIdx: writeEndWaitableIdx,
			handle: writeEndHandle
		},
		readEnd: {
			waitableIdx: readEndWaitableIdx,
			handle: readEndHandle
		},
		streamTableIdx,
		callerComponentIdx
	});
	return BigInt(writeEndWaitableIdx) << 32n | BigInt(readEndWaitableIdx);
}
function streamNewFromLift(_context, ctx) {
	debugLog("[streamNewFromLift()] args", { ctx });
	const { componentIdx, streamEndWaitableIdx, streamTableIdx, payloadLiftFn, payloadTypeSize32, payloadLowerFn } = ctx;
	const stream = new _context.HostStream({
		componentIdx,
		streamEndWaitableIdx,
		streamTableIdx,
		payloadLiftFn,
		payloadLowerFn
	});
	const rep = _context.streams.insert(stream);
	stream.setRep(rep);
	return stream.createUserStream();
}
const READABLE = {
	end: "StreamReadableEnd",
	event: "STREAM_READ",
	copy: "streamRead",
	cancel: "streamCancelRead",
	drop: "streamDropReadable",
	busyDrop: "cannot remove busy stream"
};
const WRITABLE = {
	end: "StreamWritableEnd",
	event: "STREAM_WRITE",
	copy: "streamWrite",
	cancel: "streamCancelWrite",
	drop: "streamDropWritable",
	busyDrop: "cannot drop busy stream"
};
function streamCopy(_context, direction, ctx, streamEndWaitableIdx, ptr, count) {
	debugLog(`[${direction.copy}()] args`, {
		ctx,
		streamEndWaitableIdx,
		ptr,
		count
	});
	const { componentIdx, getMemoryFn, getReallocFn, stringEncoding, isAsync, streamTableIdx, elemMeta, syncFastOnly, deferSyncFinish } = ctx;
	if (componentIdx === void 0) throw new TypeError("missing/invalid component idx");
	if (streamTableIdx === void 0) throw new TypeError("missing/invalid stream table idx");
	if (streamEndWaitableIdx === void 0) throw new TypeError("missing/invalid stream end idx");
	ptr >>>= 0;
	count = Math.min(count >>> 0, _context.ManagedBuffer.MAX_LENGTH);
	if (!getOrCreateAsyncState(_context.lookup, componentIdx).mayLeave) throw new Error("component instance is not marked as may leave");
	const streamEnd = getStreamEnd(_context.ends, {
		tableIdx: streamTableIdx,
		streamEndWaitableIdx
	});
	if (!(streamEnd instanceof _context.StreamEnd)) throw new _context.RuntimeError(`invalid stream type, expected ${direction.end}`);
	if (streamEnd.isDoneState()) {
		const message = streamEnd.isWritable() ? "cannot write to stream after being notified that the readable end dropped" : "cannot read from stream after being notified that the writable end dropped";
		throw new _context.RuntimeError(message);
	}
	const memory = getMemoryFn?.();
	_context.ManagedBuffer.validateGuestBuffer(memory, ptr, count, elemMeta ?? streamEnd.getElemMeta());
	if (syncFastOnly && !streamEnd.hasPendingEvent() && !streamEnd.isPeerDropped() && !streamEnd.hasPendingBuffer()) return 4294967294;
	return streamEnd.copy({
		isAsync,
		memory,
		ptr,
		count,
		eventCode: _context.events[direction.event],
		componentIdx,
		stringEncoding,
		getReallocFn,
		elemMeta,
		deferSyncFinish
	});
}
/**
* Implements `canon stream.read`.
* Read up to `count` values, returning a canonical result or waiting for a synchronous copy.
*/
function streamRead(_context, ctx, streamEndWaitableIdx, ptr, count) {
	return streamCopy(_context, READABLE, ctx, streamEndWaitableIdx, ptr, count);
}
/**
* Implements `canon stream.write`.
* Write up to `count` values, returning a canonical result or waiting for a synchronous copy.
*/
function streamWrite(_context, ctx, streamEndWaitableIdx, ptr, count) {
	return streamCopy(_context, WRITABLE, ctx, streamEndWaitableIdx, ptr, count);
}
function streamCancel(_context, direction, ctx, streamEndWaitableIdx) {
	debugLog(`[${direction.cancel}()] args`, {
		ctx,
		streamEndWaitableIdx
	});
	const { streamTableIdx, isAsync, componentIdx } = ctx;
	if (!getOrCreateAsyncState(_context.lookup, componentIdx).mayLeave) throw new Error("component instance is not marked as may leave");
	const streamEnd = getStreamEnd(_context.ends, {
		streamEndWaitableIdx,
		tableIdx: streamTableIdx
	});
	if (!(streamEnd instanceof _context.StreamEnd)) throw new Error(`invalid stream end, expected value of type [${direction.end}]`);
	if (!streamEnd.isCopying()) throw new _context.RuntimeError("stream end is not copying, cannot cancel");
	streamEnd.setCopyState(_context.StreamEnd.CopyState.CANCELLING_COPY);
	const finishCancel = () => {
		const event = streamEnd.getPendingEvent();
		const { code, payload0: index, payload1: payload } = event;
		if (streamEnd.isCopying()) throw new Error(`stream end (idx [${streamEndWaitableIdx}]) is still in copying state`);
		if (code !== _context.events[direction.event]) throw new Error(`unexpected event code [${code}], expected [ASYNC_EVENT_CODE.${direction.event}]`);
		if (index !== streamEnd.waitableIdx()) throw new Error("event index does not match stream end");
		debugLog(`[${direction.cancel}()] successful cancel`, {
			ctx,
			streamEndWaitableIdx,
			streamEnd,
			event
		});
		return payload;
	};
	if (!streamEnd.hasPendingEvent()) {
		streamEnd.cancel();
		if (!streamEnd.hasPendingEvent()) {
			if (isAsync) return asyncBlockedCode;
			const taskMeta = getCurrentTask(_context.taskLookup, componentIdx);
			if (!taskMeta) throw new Error("missing current task metadata while cancelling a stream copy");
			const task = taskMeta.task;
			if (!task) throw new Error("missing task while cancelling a stream copy");
			return task.suspendUntil({ readyFn: () => streamEnd.hasPendingEvent() }).then(finishCancel);
		}
	}
	return finishCancel();
}
/**
* Implements `canon stream.cancel-read`.
* Cancel an active read and report its completion event.
*/
function streamCancelRead(_context, ctx, streamEndWaitableIdx) {
	return streamCancel(_context, READABLE, ctx, streamEndWaitableIdx);
}
/**
* Implements `canon stream.cancel-write`.
* Cancel an active write and report its completion event.
*/
function streamCancelWrite(_context, ctx, streamEndWaitableIdx) {
	return streamCancel(_context, WRITABLE, ctx, streamEndWaitableIdx);
}
function streamDrop(_context, direction, ctx, streamEndWaitableIdx) {
	debugLog(`[${direction.drop}()] args`, {
		ctx,
		streamEndWaitableIdx
	});
	const { streamTableIdx, componentIdx } = ctx;
	if (!getCurrentTask(_context.taskLookup, componentIdx)) throw new Error("invalid/missing async task");
	const streamEnd = getStreamEnd(_context.ends, {
		tableIdx: streamTableIdx,
		streamEndWaitableIdx
	});
	if (!(streamEnd instanceof _context.StreamEnd)) throw new _context.RuntimeError(`invalid stream end class, expected [${direction.end}]`);
	if (streamEnd.isCopying()) throw new _context.RuntimeError(direction.busyDrop);
	if (removeStreamEndFromTable(_context.ends, {
		tableIdx: streamTableIdx,
		streamWaitableIdx: streamEndWaitableIdx
	}) !== streamEnd) throw new Error("removed stream end does not match validated stream end");
	streamEnd.drop();
}
/**
* Implements `canon stream.drop-readable`.
* Remove and drop the readable endpoint from its owning tables.
*/
function streamDropReadable(_context, ctx, streamEndWaitableIdx) {
	streamDrop(_context, READABLE, ctx, streamEndWaitableIdx);
}
/**
* Implements `canon stream.drop-writable`.
* Remove and drop the writable endpoint from its owning tables.
*/
function streamDropWritable(_context, ctx, streamEndWaitableIdx) {
	streamDrop(_context, WRITABLE, ctx, streamEndWaitableIdx);
}
function streamTransfer(_context, srcStreamWaitableIdx, srcTableIdx, destTableIdx) {
	debugLog("[streamTransfer()] args", {
		srcStreamWaitableIdx,
		srcTableIdx,
		destTableIdx
	});
	const streamMeta = _context.tables[srcTableIdx];
	if (!streamMeta) throw new Error("missing stream meta during transfer");
	const componentIdx = streamMeta.componentIdx;
	if (!getOrCreateAsyncState(_context.lookup, componentIdx)) throw new Error(`missing async state for component [${componentIdx}]`);
	const streamEnd = getStreamEnd(_context, {
		tableIdx: srcTableIdx,
		streamEndWaitableIdx: srcStreamWaitableIdx
	});
	if (!streamEnd.isReadable()) throw new Error("writable stream ends cannot be moved");
	if (streamEnd.isDoneState()) throw new _context.RuntimeError("cannot lift stream after being notified that the writable end dropped");
	if (streamEnd.isInSet()) throw new _context.RuntimeError("cannot lift stream while it's in a waitable set");
	if (removeStreamEndFromTable(_context, {
		tableIdx: srcTableIdx,
		streamWaitableIdx: srcStreamWaitableIdx
	}) !== streamEnd) throw new Error("removed stream end does not match validated stream end");
	const { handle, waitableIdx } = addStreamEndToTable(_context, {
		tableIdx: destTableIdx,
		streamEnd
	});
	streamEnd.setTarget(`stream read end (waitable [${waitableIdx}])`);
	debugLog("[streamTransfer()] successfully transferred", {
		dest: {
			streamEndHandle: handle,
			streamEndWaitableIdx: waitableIdx,
			tableIdx: destTableIdx
		},
		src: {
			streamEndWaitableIdx: srcStreamWaitableIdx,
			tableIdx: srcTableIdx
		},
		componentIdx
	});
	return waitableIdx;
}

//#endregion
export { CM_RUNTIME_API_VERSION as runtimeExport0, callDestructor as runtimeExport1, tableCreateBorrow as runtimeExport10, initializeSymbolResourceRep as runtimeExport100, initializeTaskRegisters as runtimeExport101, instantiateCore as runtimeExport102, lookupMemories as runtimeExport103, promiseWithResolvers as runtimeExport104, registerMemory as runtimeExport105, setCurrentTaskMeta as runtimeExport106, suspendingImport as runtimeExport107, throwInvalidBool as runtimeExport108, throwUninitialized as runtimeExport109, tableCreateOwn as runtimeExport11, typeCheckAsyncFn as runtimeExport110, typeCheckValidI32 as runtimeExport111, withCurrentTaskMeta as runtimeExport112, withCurrentTaskMetaAsync as runtimeExport113, backpressureDec as runtimeExport114, backpressureInc as runtimeExport115, checkForDeadlock as runtimeExport116, checkIdle as runtimeExport117, checkMayLeave as runtimeExport118, getOrCreateAsyncState as runtimeExport119, tableEnsureBorrowDrop as runtimeExport12, guardMayLeave as runtimeExport120, guardPostReturn as runtimeExport121, guardTrap as runtimeExport122, initializeCallTracking as runtimeExport123, initializeComponentAsyncStateClass as runtimeExport124, initializeComponentAsyncStates as runtimeExport125, initializeCoreTrapMessages as runtimeExport126, initializeInstanceFlags as runtimeExport127, initializeStoreAsyncState as runtimeExport128, initializeStoreTrap as runtimeExport129, tableFlag as runtimeExport13, normalizeCoreTrap as runtimeExport130, postReturnTrap as runtimeExport131, recordTrap as runtimeExport132, reportTrap as runtimeExport133, setAllError as runtimeExport134, stopInstance as runtimeExport135, trackHostOperation as runtimeExport136, whenIdle as runtimeExport137, initializeWaitableClass as runtimeExport138, initializeWaitableSetClass as runtimeExport139, tableGet as runtimeExport14, removeWaitableSet as runtimeExport140, waitableJoin as runtimeExport141, waitableSetDrop as runtimeExport142, waitableSetNew as runtimeExport143, waitableSetPoll as runtimeExport144, waitableSetWait as runtimeExport145, errCtxCreateLocalHandle as runtimeExport146, errCtxDebugMessage as runtimeExport147, errCtxDrop as runtimeExport148, errCtxGetLocalTable as runtimeExport149, tableOwn as runtimeExport15, errCtxGlobalRefCountAdd as runtimeExport150, errCtxNew as runtimeExport151, errCtxReserveGlobalRep as runtimeExport152, errCtxTransfer as runtimeExport153, initializeErrorContextTableRegistrations as runtimeExport154, initializeGlobalErrorContextTableClass as runtimeExport155, initializeLocalErrorContextTables as runtimeExport156, asyncBlockedCode as runtimeExport157, asyncYield as runtimeExport158, clearCurrentTask as runtimeExport159, tableRemove as runtimeExport16, clearCurrentThread as runtimeExport160, contextGet as runtimeExport161, contextSet as runtimeExport162, createNewCurrentImplicitThread as runtimeExport163, createNewCurrentTask as runtimeExport164, currentThreadOrThrow as runtimeExport165, driverLoop as runtimeExport166, getCurrentTask as runtimeExport167, getCurrentThread as runtimeExport168, initializeAsyncBlockingCallDepth as runtimeExport169, transferBorrow as runtimeExport17, initializeAsyncSubtaskClass as runtimeExport170, initializeAsyncTaskClass as runtimeExport171, initializeAsyncThreadClass as runtimeExport172, initializeCurrentComponentIdxs as runtimeExport173, initializeCurrentTaskIds as runtimeExport174, initializeCurrentTaskMayBlock as runtimeExport175, initializeSymmetricSyncGuestCallStack as runtimeExport176, initializeTasksByComponent as runtimeExport177, initializeThreadStartChecks as runtimeExport178, lowerImport as runtimeExport179, transferBorrowValidLifting as runtimeExport18, lowerImportBackwardsCompat as runtimeExport180, subtaskCancel as runtimeExport181, subtaskDrop as runtimeExport182, symmetricSyncGuestCallEnter as runtimeExport183, symmetricSyncGuestCallExit as runtimeExport184, taskCancel as runtimeExport185, taskReturn as runtimeExport186, threadIndex as runtimeExport187, threadNewIndirect as runtimeExport188, threadResumeLater as runtimeExport189, transferOwn as runtimeExport19, threadSuspend as runtimeExport190, threadSuspendThenPromote as runtimeExport191, threadSuspendThenResume as runtimeExport192, threadYieldThenPromote as runtimeExport193, threadYieldThenResume as runtimeExport194, unpackCallbackResult as runtimeExport195, asyncStartCall as runtimeExport196, prepareCall as runtimeExport197, storeEventInComponentMemory as runtimeExport198, syncStartCall as runtimeExport199, getHandleIndexSpace as runtimeExport2, f32ToI32 as runtimeExport20, decodeUtf8 as runtimeExport200, initializeLiftVariant as runtimeExport201, liftFlatBool as runtimeExport202, liftFlatBorrow as runtimeExport203, liftFlatChar as runtimeExport204, liftFlatEnum as runtimeExport205, liftFlatErrorContext as runtimeExport206, liftFlatFlags as runtimeExport207, liftFlatFloat32 as runtimeExport208, liftFlatFloat64 as runtimeExport209, f64ToI64 as runtimeExport21, liftFlatFuture as runtimeExport210, liftFlatList as runtimeExport211, liftFlatMap as runtimeExport212, liftFlatOption as runtimeExport213, liftFlatOwn as runtimeExport214, liftFlatRecord as runtimeExport215, liftFlatResult as runtimeExport216, liftFlatS16 as runtimeExport217, liftFlatS32 as runtimeExport218, liftFlatS64 as runtimeExport219, i32ToChar as runtimeExport22, liftFlatS8 as runtimeExport220, liftFlatStream as runtimeExport221, liftFlatStringAny as runtimeExport222, liftFlatStringUTF16 as runtimeExport223, liftFlatStringUTF8 as runtimeExport224, liftFlatTuple as runtimeExport225, liftFlatU16 as runtimeExport226, liftFlatU32 as runtimeExport227, liftFlatU64 as runtimeExport228, liftFlatU8 as runtimeExport229, i32ToF32 as runtimeExport23, liftFlatVariant as runtimeExport230, lowerFlatBool as runtimeExport231, lowerFlatBorrow as runtimeExport232, lowerFlatChar as runtimeExport233, lowerFlatEnum as runtimeExport234, lowerFlatErrorContext as runtimeExport235, lowerFlatFlags as runtimeExport236, lowerFlatFloat32 as runtimeExport237, lowerFlatFloat64 as runtimeExport238, lowerFlatFuture as runtimeExport239, i64ToF64 as runtimeExport24, lowerFlatList as runtimeExport240, lowerFlatMap as runtimeExport241, lowerFlatOption as runtimeExport242, lowerFlatOwn as runtimeExport243, lowerFlatRecord as runtimeExport244, lowerFlatResult as runtimeExport245, lowerFlatS16 as runtimeExport246, lowerFlatS32 as runtimeExport247, lowerFlatS64 as runtimeExport248, lowerFlatS8 as runtimeExport249, initializeBitcast32 as runtimeExport25, lowerFlatStream as runtimeExport250, lowerFlatStringAny as runtimeExport251, lowerFlatStringUTF16 as runtimeExport252, lowerFlatStringUTF8 as runtimeExport253, lowerFlatTuple as runtimeExport254, lowerFlatU16 as runtimeExport255, lowerFlatU32 as runtimeExport256, lowerFlatU64 as runtimeExport257, lowerFlatU8 as runtimeExport258, lowerFlatVariant as runtimeExport259, initializeBitcast64 as runtimeExport26, addFutureEndToTable as runtimeExport260, createFuture as runtimeExport261, futureCancelRead as runtimeExport262, futureCancelWrite as runtimeExport263, futureDropReadable as runtimeExport264, futureDropWritable as runtimeExport265, futureNew as runtimeExport266, futureNewFromLift as runtimeExport267, futureRead as runtimeExport268, futureTransfer as runtimeExport269, isValidNumericPrimitive as runtimeExport27, futureWrite as runtimeExport270, genFutureHostInjectFn as runtimeExport271, getFutureEnd as runtimeExport272, initializeFutureEndClass as runtimeExport273, initializeFutureReadableEndClass as runtimeExport274, initializeFutureTables as runtimeExport275, initializeFutureValueClass as runtimeExport276, initializeFutureWritableEndClass as runtimeExport277, initializeFutures as runtimeExport278, initializeHostFutureClass as runtimeExport279, mergeInt64 as runtimeExport28, initializeInternalFutureClass as runtimeExport280, initializeNestedFutureSymbol as runtimeExport281, isFutureLowerableObject as runtimeExport282, removeFutureEndFromTable as runtimeExport283, addStreamEndToTable as runtimeExport284, createStream as runtimeExport285, genReadFnFromLowerableStream as runtimeExport286, genStreamHostInjectFn as runtimeExport287, getStreamEnd as runtimeExport288, initializeExternalStreamClass as runtimeExport289, requireValidNumericPrimitive as runtimeExport29, initializeHostStreamClass as runtimeExport290, initializeInternalStreamClass as runtimeExport291, initializePendingValueQueueClass as runtimeExport292, initializeStreamEndClass as runtimeExport293, initializeStreamReadableEndClass as runtimeExport294, initializeStreamTables as runtimeExport295, initializeStreamWritableEndClass as runtimeExport296, initializeStreams as runtimeExport297, isStreamLowerableObject as runtimeExport298, removeStreamEndFromTable as runtimeExport299, initializeCallBorrows as runtimeExport3, splitInt64 as runtimeExport30, streamCancelRead as runtimeExport300, streamCancelWrite as runtimeExport301, streamDropReadable as runtimeExport302, streamDropWritable as runtimeExport303, streamNew as runtimeExport304, streamNewFromLift as runtimeExport305, streamRead as runtimeExport306, streamTransfer as runtimeExport307, streamWrite as runtimeExport308, toInt16 as runtimeExport31, toInt32 as runtimeExport32, toInt64 as runtimeExport33, toInt8 as runtimeExport34, toResultString as runtimeExport35, toString as runtimeExport36, toUint16 as runtimeExport37, toUint32 as runtimeExport38, toUint64 as runtimeExport39, initializeCurrentBorrows as runtimeExport4, toUint8 as runtimeExport40, conditionalSuspendingHostImport as runtimeExport41, dataView as runtimeExport42, emptyFunc as runtimeExport43, initializeDataViewCache as runtimeExport44, maybeSyncGenerator as runtimeExport45, compactUtf16Decode as runtimeExport46, compactUtf16Encode as runtimeExport47, initializeUtf16Decoder as runtimeExport48, initializeUtf16Encoding as runtimeExport49, initializeHandleIndexSpaces as runtimeExport5, initializeUtf8Decoder as runtimeExport50, initializeUtf8Encoder as runtimeExport51, utf16Encode as runtimeExport52, utf16EncodeAsync as runtimeExport53, utf16ValidatingCopy as runtimeExport54, utf8Encode as runtimeExport55, utf8EncodeAsync as runtimeExport56, validateGuestChar as runtimeExport57, validateHostChar as runtimeExport58, globalThisIdlProxy as runtimeExport59, initializeHandleTables as runtimeExport6, initializeWebIdlProxyCache as runtimeExport60, base64Compile as runtimeExport61, clampGuest as runtimeExport62, clearCurrentTaskMeta as runtimeExport63, coinFlip as runtimeExport64, conditionalSuspending1I32ToI32 as runtimeExport65, conditionalSuspending2I32ToI32 as runtimeExport66, conditionalSuspending3I32ToI32 as runtimeExport67, conditionalSuspending3I32ToVoid as runtimeExport68, debugLog as runtimeExport69, initializeResourceScopeCounter as runtimeExport7, disposeHostValue as runtimeExport70, fetchCompile as runtimeExport71, finalizationRegistryCreate as runtimeExport72, getCurrentTaskMeta as runtimeExport73, getErrorPayload as runtimeExport74, getErrorPayloadString as runtimeExport75, i32Max as runtimeExport76, i32Min as runtimeExport77, initializeAsyncDeterminism as runtimeExport78, initializeAsyncEventCodes as runtimeExport79, initializeResourceScopeTasks as runtimeExport8, initializeAsyncFunctionConstructor as runtimeExport80, initializeBufferManager as runtimeExport81, initializeBufferManagerClass as runtimeExport82, initializeComponentErrorClass as runtimeExport83, initializeComponentMemoryMap as runtimeExport84, initializeConditionalSuspendingWasm as runtimeExport85, initializeEndianness as runtimeExport86, initializeFactTrapMessages as runtimeExport87, initializeFileCompileCache as runtimeExport88, initializeHasOwnProperty as runtimeExport89, initializeScopeId as runtimeExport9, initializeManagedBufferClass as runtimeExport90, initializeReadableStream as runtimeExport91, initializeRepTableClass as runtimeExport92, initializeRuntimeErrorConstructor as runtimeExport93, initializeSymbolAsyncIterator as runtimeExport94, initializeSymbolCabiDispose as runtimeExport95, initializeSymbolCabiLower as runtimeExport96, initializeSymbolDispose as runtimeExport97, initializeSymbolIterator as runtimeExport98, initializeSymbolResourceHandle as runtimeExport99 };