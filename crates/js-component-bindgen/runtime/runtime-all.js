//#region runtime/runtime.js
/** Experimental JavaScript Component Model runtime contract, independent of package version. */
const CM_RUNTIME_API_VERSION = 1;

//#endregion
//#region runtime/intrinsics/core-debug.js
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
		registers[componentIdx] = previous;
		registers.current = previousCurrent;
		throw error;
	}
	if (result === null || typeof result !== "object" && typeof result !== "function" || typeof result.then !== "function") {
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
	const meta = componentIdx === void 0 ? void 0 : getCurrentTaskMeta(context.registers, componentIdx);
	const borrowTask = meta ? context.getTask?.(meta.componentIdx, meta.taskID) : void 0;
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
	if (!context.createTask || !context.registers) throw new TypeError("resource destructors require createTask and registers");
	const { task, threadID } = context.createTask({
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
	if (!value || typeof value !== "number") throw new Error("invalid i32");
	if (value < 0) throw new Error("i32 must be greater than zero");
	if (value >= 1114112) throw new Error("invalid i32, out of range");
	if (55296 <= value && value <= 57343) throw new Error("invalid i32 out of range");
	return String.fromCharCode(value);
};
const toInt8 = (context, value) => {
	if (context.strict) requireValidNumericPrimitive("s8", value);
	let converted = value >>> 0;
	converted %= 256;
	if (converted >= 128) converted -= 256;
	return converted;
};
const toUint8 = (context, value) => {
	if (context.strict) requireValidNumericPrimitive("u8", value);
	return (value >>> 0) % 256;
};
const toInt16 = (context, value) => {
	if (context.strict) requireValidNumericPrimitive("s16", value);
	let converted = value >>> 0;
	converted %= 2 ** 16;
	if (converted >= 2 ** 15) converted -= 2 ** 16;
	return converted;
};
const toUint16 = (context, value) => {
	if (context.strict) requireValidNumericPrimitive("u16", value);
	return (value >>> 0) % 2 ** 16;
};
const toInt32 = (context, value) => {
	if (context.strict) requireValidNumericPrimitive("s32", value);
	return value >> 0;
};
const toUint32 = (context, value) => {
	if (context.strict) requireValidNumericPrimitive("u32", value);
	return value >>> 0;
};
const toInt64 = (context, value) => {
	const converted = BigInt(value);
	if (context.strict) requireValidNumericPrimitive("s64", converted);
	return BigInt.asIntN(64, converted);
};
const toUint64 = (context, value) => {
	const converted = BigInt(value);
	if (context.strict) requireValidNumericPrimitive("u64", converted);
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
	if (value === void 0 || value === null) return false;
	switch (type) {
		case "bool": return value === 0 || value === 1;
		case "u8": return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 255;
		case "s8": return typeof value === "number" && Number.isInteger(value) && value >= -128 && value <= 127;
		case "u16": return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 65535;
		case "s16": return typeof value === "number" && Number.isInteger(value) && value >= -32768 && value <= 32767;
		case "u32": return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 4294967295;
		case "s32": return typeof value === "number" && Number.isInteger(value) && value >= -2147483648 && value <= 2147483647;
		case "u64": return typeof value === "bigint" && value >= 0 && value <= 18446744073709551615n;
		case "s64": return typeof value === "bigint" && value >= -9223372036854775808n && value <= 9223372036854775807n;
		case "f32":
		case "f64": return typeof value === "number";
		default: return false;
	}
};
const requireValidNumericPrimitive = (type, value) => {
	if (!isValidNumericPrimitive(type, value)) throw new TypeError(`invalid ${type} value [${value}]`);
	return true;
};
const splitInt64 = (value) => {
	return [Number(value & 4294967295n) | 0, Number(value >> 32n & 4294967295n) | 0];
};
const mergeInt64 = (low, high) => {
	return BigInt(low | 0) | BigInt(high | 0) << 32n;
};

//#endregion
//#region runtime/intrinsics/js-helper.js
const emptyFunc = () => {};
/** Only selected DataView users allocate this owner; emptyFunc needs no cache. */
const initializeDataViewCache = () => ({ view: /* @__PURE__ */ new DataView(/* @__PURE__ */ new ArrayBuffer(0)) });
const dataView = (context, memory) => context.view.buffer === memory.buffer ? context.view : context.view = new DataView(memory.buffer);

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
const validateHostChar = (value) => {
	if (typeof value !== "string") throw new TypeError("must be a string");
	return value.codePointAt(0);
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
//#region runtime/intrinsics/core-promises.js
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
	pendingHostOperations: 0
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
	if (result === null || typeof result !== "object" && typeof result !== "function" || typeof result.then !== "function") {
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
	debugLog("[setAllError()]");
	for (const state of states.values()) state.setErrored();
}
function initializeComponentAsyncStateClass(context) {
	const { RuntimeError, RepTable, indexSpaces, instanceFlags, storeTrap, normalization, cannotEnter, deadlock, Waitable } = context;
	class ComponentAsyncState {
		static EVENT_HANDLER_EVENTS = ["backpressure-change"];
		static TickResult = {
			DONE: "done",
			RESUMED: "resumed",
			IDLE: "idle"
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
		#handlerMap = /* @__PURE__ */ new Map();
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
			for (const handler of [...this.#handlerMap.get("backpressure-change") ?? []]) handler.fn(v);
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
			let handlers = this.#handlerMap.get(event);
			if (!handlers) {
				handlers = [];
				this.#handlerMap.set(event, handlers);
			}
			handlers.push({
				id: handlerID,
				fn,
				event
			});
			return handlerID;
		}
		removeHandler(args) {
			const { event, handlerID } = args;
			const registeredHandlers = this.#handlerMap.get(event);
			if (!registeredHandlers) return;
			if (!registeredHandlers.find((h) => h.id === handlerID)) return;
			this.#handlerMap.set(event, registeredHandlers.filter((h) => h.id !== handlerID));
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
				if (storeTrap.stopped || result === ComponentAsyncState.TickResult.DONE) {
					this.#tickLoop = null;
					return;
				}
				if (result === ComponentAsyncState.TickResult.IDLE) checkForDeadlock(deadlock);
				const delay = result === ComponentAsyncState.TickResult.RESUMED ? 0 : 10;
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
					return ComponentAsyncState.TickResult.RESUMED;
				}
				if (!this.suspendedThreadReady(thread)) continue;
				debugLog("[ComponentAsyncState#tick()] resuming thread via tick", {
					threadID: thread.id(),
					componentIdx: this.#componentIdx
				});
				this.resumeThread(thread);
				return ComponentAsyncState.TickResult.RESUMED;
			}
			return this.#suspendedThreadsByRef.size > 0 ? ComponentAsyncState.TickResult.IDLE : ComponentAsyncState.TickResult.DONE;
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
//#region runtime/intrinsics/rep-table.js
function initializeRepTableClass(context) {
	const { RuntimeError } = context;
	class RepTable {
		static FREE = Symbol("RepTable.free");
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
			if (this.#data[placementIdx] !== RepTable.FREE) throw new Error("corrupt rep table freelist: head does not point at a freed slot");
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
			if (val === RepTable.FREE) return;
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
			return val !== RepTable.FREE && !!val;
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
				if (val === void 0 || val === RepTable.FREE) throw new RuntimeError(`unknown handle index ${rep}`);
				this.#data[baseIdx] = RepTable.FREE;
				this.#data[baseIdx + 1] = null;
				this.#size -= 1;
				this.#space.release(rep);
				return val;
			}
			if (this.#data.length === 2) throw new Error("invalid");
			const baseIdx = rep << 1;
			if (baseIdx >= this.#data.length) throw new Error(`invalid rep [${rep}] during remove, out of range`);
			const val = this.#data[baseIdx];
			if (val === RepTable.FREE) throw new RuntimeError(`double removal of rep [${rep}] (already freed)`);
			this.#data[baseIdx] = RepTable.FREE;
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
				for (let rep = 1; rep < this.#data.length / 2; rep++) if (this.#data[(rep << 1) + 1] === null && this.#data[rep << 1] !== RepTable.FREE) this.#space.release(rep);
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
		const savedThread = saved ? context.getCurrentThread(saved.componentIdx, saved.threadID, saved.taskID) : null;
		const mayBlock = savedThread ? savedThread.task.mayBlock() ?? context.currentTaskMayBlock() !== 0 : false;
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
			if (result !== null && (typeof result === "object" || typeof result === "function") && typeof result.then === "function") {
				Promise.resolve(result).catch(() => {});
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
			return this.#waitables.find((w) => w.hasPendingEvent()) !== void 0;
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
		tryWait(opts) {
			debugLog("[WaitableSet#tryWait()] args", { opts });
			const { readyFn, task, cancellable } = opts;
			const isReady = () => {
				const hasPendingEvent = this.hasPendingEvent();
				return readyFn() && hasPendingEvent;
			};
			const finishWait = (keepGoing) => {
				return keepGoing ? this.getPendingEvent() : {
					code: asyncEventCode.TASK_CANCELLED,
					payload0: 0,
					payload1: 0
				};
			};
			if (task.deliverPendingCancel({ cancellable })) return finishWait(false);
			if (isReady()) return finishWait(true);
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
				const readyEvent = keepGoing ? this.getPendingEvent() : {
					code: asyncEventCode.TASK_CANCELLED,
					payload0: 0,
					payload1: 0
				};
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
				const resumedEvent = keepGoing ? this.getPendingEvent() : {
					code: asyncEventCode.TASK_CANCELLED,
					payload0: 0,
					payload1: 0
				};
				this.decrementNumWaiting();
				onEvent(resumedEvent);
			});
		}
	}
	return WaitableSet;
}
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
function waitableSetWait(context, ctx, waitableSetRep, resultPtr, syncOnly = false) {
	const { RuntimeError, WaitableSet, getCurrentTask, storeEventInComponentMemory } = context;
	debugLog("[waitableSetWait()] args", {
		ctx,
		waitableSetRep,
		resultPtr
	});
	const { componentIdx, memoryIdx, getMemoryFn } = ctx;
	const taskMeta = getCurrentTask(componentIdx);
	if (!taskMeta) throw Error("invalid/missing async task meta");
	const task = taskMeta.task;
	if (!task) throw Error("invalid/missing async task");
	if (task.componentIdx() !== componentIdx) throw Error(`task component [${task.componentIdx()}] !== executing component [${componentIdx}]`);
	const memory = getMemoryFn();
	const wset = getOrCreateAsyncState(context.lookup, componentIdx).handles.get(waitableSetRep);
	if (!(wset instanceof WaitableSet)) throw new RuntimeError(`non-waitable set returned from component state handles @ [${waitableSetRep}]`);
	const storeEvent = (event) => storeEventInComponentMemory({
		memory,
		ptr: resultPtr,
		event,
		componentIdx,
		task,
		memoryIdx
	});
	const waitOpts = {
		readyFn: () => true,
		task,
		cancellable: false
	};
	const event = syncOnly ? wset.tryWait(waitOpts) : wset.waitUntil(waitOpts);
	if (event === null) return -1;
	if (event && "then" in event) return event.then(storeEvent);
	return storeEvent(event);
}
function waitableSetPoll(context, ctx, waitableSetRep, resultPtr) {
	const { RuntimeError, WaitableSet, getCurrentTask, storeEventInComponentMemory, events: asyncEventCode } = context;
	const { componentIdx, memoryIdx, getMemoryFn } = ctx;
	debugLog("[waitableSetPoll()] args", {
		componentIdx,
		memoryIdx,
		waitableSetRep,
		resultPtr
	});
	const taskMeta = getCurrentTask(componentIdx);
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
	return storeEventInComponentMemory({
		event,
		ptr: resultPtr,
		memory: getMemoryFn(),
		componentIdx,
		task,
		memoryIdx
	});
}
function waitableSetDrop(context, componentIdx, waitableSetRep) {
	const { getCurrentTask } = context;
	debugLog("[waitableSetDrop()] args", {
		componentIdx,
		waitableSetRep
	});
	const task = getCurrentTask(componentIdx);
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
	debugLog("[removeWaitableSet()] args", args);
	const { state, waitableSetRep } = args;
	if (!state) throw new TypeError("missing component state");
	const ws = state.handles.get(waitableSetRep);
	if (!(ws instanceof WaitableSet)) throw new RuntimeError("cannot remove waitable set: no set present with rep [" + waitableSetRep + "]");
	if (ws.hasPendingEvent()) throw new RuntimeError("waitable set cannot be removed with pending items remaining");
	if (ws.numWaitables() > 0) throw new RuntimeError("waitable set still contains waitables");
	if (ws.numWaiting() > 0) throw new RuntimeError("cannot drop waitable set with waiters");
	state.handles.remove(waitableSetRep);
}
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
export { CM_RUNTIME_API_VERSION as runtimeExport0, callDestructor as runtimeExport1, tableCreateBorrow as runtimeExport10, instantiateCore as runtimeExport100, lookupMemories as runtimeExport101, promiseWithResolvers as runtimeExport102, registerMemory as runtimeExport103, setCurrentTaskMeta as runtimeExport104, suspendingImport as runtimeExport105, throwInvalidBool as runtimeExport106, throwUninitialized as runtimeExport107, typeCheckAsyncFn as runtimeExport108, typeCheckValidI32 as runtimeExport109, tableCreateOwn as runtimeExport11, withCurrentTaskMeta as runtimeExport110, withCurrentTaskMetaAsync as runtimeExport111, backpressureDec as runtimeExport112, backpressureInc as runtimeExport113, checkForDeadlock as runtimeExport114, checkMayLeave as runtimeExport115, getOrCreateAsyncState as runtimeExport116, guardMayLeave as runtimeExport117, guardPostReturn as runtimeExport118, guardTrap as runtimeExport119, tableEnsureBorrowDrop as runtimeExport12, initializeComponentAsyncStateClass as runtimeExport120, initializeComponentAsyncStates as runtimeExport121, initializeCoreTrapMessages as runtimeExport122, initializeInstanceFlags as runtimeExport123, initializeStoreAsyncState as runtimeExport124, initializeStoreTrap as runtimeExport125, normalizeCoreTrap as runtimeExport126, postReturnTrap as runtimeExport127, recordTrap as runtimeExport128, setAllError as runtimeExport129, tableFlag as runtimeExport13, trackHostOperation as runtimeExport130, initializeWaitableClass as runtimeExport131, initializeWaitableSetClass as runtimeExport132, removeWaitableSet as runtimeExport133, waitableJoin as runtimeExport134, waitableSetDrop as runtimeExport135, waitableSetNew as runtimeExport136, waitableSetPoll as runtimeExport137, waitableSetWait as runtimeExport138, errCtxCreateLocalHandle as runtimeExport139, tableGet as runtimeExport14, errCtxDebugMessage as runtimeExport140, errCtxDrop as runtimeExport141, errCtxGetLocalTable as runtimeExport142, errCtxGlobalRefCountAdd as runtimeExport143, errCtxNew as runtimeExport144, errCtxReserveGlobalRep as runtimeExport145, errCtxTransfer as runtimeExport146, initializeErrorContextTableRegistrations as runtimeExport147, initializeGlobalErrorContextTableClass as runtimeExport148, initializeLocalErrorContextTables as runtimeExport149, tableOwn as runtimeExport15, tableRemove as runtimeExport16, transferBorrow as runtimeExport17, transferBorrowValidLifting as runtimeExport18, transferOwn as runtimeExport19, getHandleIndexSpace as runtimeExport2, f32ToI32 as runtimeExport20, f64ToI64 as runtimeExport21, i32ToChar as runtimeExport22, i32ToF32 as runtimeExport23, i64ToF64 as runtimeExport24, initializeBitcast32 as runtimeExport25, initializeBitcast64 as runtimeExport26, isValidNumericPrimitive as runtimeExport27, mergeInt64 as runtimeExport28, requireValidNumericPrimitive as runtimeExport29, initializeCallBorrows as runtimeExport3, splitInt64 as runtimeExport30, toInt16 as runtimeExport31, toInt32 as runtimeExport32, toInt64 as runtimeExport33, toInt8 as runtimeExport34, toResultString as runtimeExport35, toString as runtimeExport36, toUint16 as runtimeExport37, toUint32 as runtimeExport38, toUint64 as runtimeExport39, initializeCurrentBorrows as runtimeExport4, toUint8 as runtimeExport40, dataView as runtimeExport41, emptyFunc as runtimeExport42, initializeDataViewCache as runtimeExport43, compactUtf16Decode as runtimeExport44, compactUtf16Encode as runtimeExport45, initializeUtf16Decoder as runtimeExport46, initializeUtf16Encoding as runtimeExport47, initializeUtf8Decoder as runtimeExport48, initializeUtf8Encoder as runtimeExport49, initializeHandleIndexSpaces as runtimeExport5, utf16Encode as runtimeExport50, utf16EncodeAsync as runtimeExport51, utf16ValidatingCopy as runtimeExport52, utf8Encode as runtimeExport53, utf8EncodeAsync as runtimeExport54, validateGuestChar as runtimeExport55, validateHostChar as runtimeExport56, globalThisIdlProxy as runtimeExport57, initializeWebIdlProxyCache as runtimeExport58, base64Compile as runtimeExport59, initializeHandleTables as runtimeExport6, clampGuest as runtimeExport60, clearCurrentTaskMeta as runtimeExport61, coinFlip as runtimeExport62, conditionalSuspending1I32ToI32 as runtimeExport63, conditionalSuspending2I32ToI32 as runtimeExport64, conditionalSuspending3I32ToI32 as runtimeExport65, conditionalSuspending3I32ToVoid as runtimeExport66, debugLog as runtimeExport67, disposeHostValue as runtimeExport68, fetchCompile as runtimeExport69, initializeResourceScopeCounter as runtimeExport7, finalizationRegistryCreate as runtimeExport70, getCurrentTaskMeta as runtimeExport71, getErrorPayload as runtimeExport72, getErrorPayloadString as runtimeExport73, i32Max as runtimeExport74, i32Min as runtimeExport75, initializeAsyncDeterminism as runtimeExport76, initializeAsyncEventCodes as runtimeExport77, initializeAsyncFunctionConstructor as runtimeExport78, initializeBufferManager as runtimeExport79, initializeResourceScopeTasks as runtimeExport8, initializeBufferManagerClass as runtimeExport80, initializeComponentErrorClass as runtimeExport81, initializeComponentMemoryMap as runtimeExport82, initializeConditionalSuspendingWasm as runtimeExport83, initializeEndianness as runtimeExport84, initializeFactTrapMessages as runtimeExport85, initializeFileCompileCache as runtimeExport86, initializeHasOwnProperty as runtimeExport87, initializeManagedBufferClass as runtimeExport88, initializeReadableStream as runtimeExport89, initializeScopeId as runtimeExport9, initializeRepTableClass as runtimeExport90, initializeRuntimeErrorConstructor as runtimeExport91, initializeSymbolAsyncIterator as runtimeExport92, initializeSymbolCabiDispose as runtimeExport93, initializeSymbolCabiLower as runtimeExport94, initializeSymbolDispose as runtimeExport95, initializeSymbolIterator as runtimeExport96, initializeSymbolResourceHandle as runtimeExport97, initializeSymbolResourceRep as runtimeExport98, initializeTaskRegisters as runtimeExport99 };