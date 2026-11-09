// Host invocation tracking owns no runtime-provider state and exposes no task objects.
const CALL_TRACKING = (() => {
    const exports = new WeakMap();
    const pending = new Set();
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
        if (pending.size === 0) {
            return;
        }
        const liveRoots = new Set();
        if ($STORE.error === null) {
            for (const [componentIdx, tasks] of $TASKS) {
                if (componentIdx === -1) {
                    continue;
                }
                for (const { task } of tasks) {
                    liveRoots.add(task.getRootTask());
                }
            }
        }
        for (const call of pending) {
            if ($STORE.stopped) {
                finish(call, { status: 'stopped' });
            } else if ($STORE.error !== null) {
                finish(call, { status: 'trapped', error: $STORE.error });
            } else if (call.task?.isErrored() instanceof $RUNTIME_ERROR) {
                finish(call, { status: 'trapped', error: call.task.isErrored() });
            } else if (call.task ? !liveRoots.has(call.task) : call.resultSettled) {
                finish(call, { status: 'completed' });
            }
        }
    }

    /** Observe lifecycle changes after the current unwind records any trap. */
    function check() {
        if (pending.size === 0 || checkQueued) {
            return;
        }
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
        if (!metadata) {
            throw new TypeError('call tracking requires an export from this instance');
        }
        let resolve;
        const finished = new Promise((done) => {
            resolve = done;
        });
        const call = { id: metadata.id, task: null, resolve, resultSettled: false };
        const previous = entering;
        pending.add(call);
        entering = call;
        try {
            const result = metadata.construct ? Reflect.construct(fn, args) : Reflect.apply(fn, receiver, args);
            if (metadata.asynchronous) {
                observe(call, result);
            } else if (!metadata.future) {
                call.resultSettled = true;
            }
            checkNow();
            return Object.freeze({ result, finished });
        } catch (error) {
            // No handle is returned on a synchronous throw. Guest error handling and
            // any background work continue through the ordinary runtime paths.
            pending.delete(call);
            call.task = null;
            throw error;
        } finally {
            entering = previous;
        }
    }

    const publicAPI = Object.freeze({
        /** Start an exported function or resource constructor with its arguments. */
        start(fn, ...args) {
            return invoke(undefined, fn, args);
        },
        /** Start an exported resource method with an explicit receiver. */
        startWithThis(receiver, fn, ...args) {
            return invoke(receiver, fn, args);
        },
    });

    return {
        publicAPI,
        check,
        observe,
        /** Register a generated export; identities never cross instance boundaries. */
        register(fn, id, construct, asynchronous, future) {
            exports.set(fn, { id, construct, asynchronous, future });
        },
        /** Claim the invocation before argument lowering or reentrant host execution. */
        capture(id) {
            if (entering?.id !== id) {
                return null;
            }
            const call = entering;
            entering = null;
            return call;
        },
        /** Retain only the selected root until its execution and descendants finish. */
        attach(call, task) {
            if (call && pending.has(call)) {
                call.task = task;
            }
        },
    };
})();
