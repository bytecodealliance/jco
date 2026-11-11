import type {
    ComponentCallHandle,
    ComponentCallOutcome,
    ComponentModule,
    ComponentTrackedCall,
    ComponentTrackedTask,
} from '../../runtime.js';

interface ExportMetadata {
    readonly id: number;
    readonly construct: boolean;
    readonly asynchronous: boolean;
    readonly future: boolean;
}

/** Host invocation tracking owns no runtime-provider state and exposes no task objects. */
export const initializeCallTracking: ComponentModule['initializeCallTracking'] = (context) => {
    const { storeTrap, tasks: tasksByComponent, RuntimeError } = context;
    const exports = new WeakMap<Function, ExportMetadata>();
    const pending = new Set<ComponentTrackedCall>();
    let entering: ComponentTrackedCall | null = null;
    let checkQueued = false;

    /** Release private task references and publish one terminal execution outcome. */
    function finish(call: ComponentTrackedCall, outcome: ComponentCallOutcome) {
        pending.delete(call);
        call.task = null;
        call.resolve(Object.freeze(outcome));
    }

    /** Check selected guest execution, excluding unrelated calls and host-owned work. */
    function checkNow() {
        if (pending.size === 0) {
            return;
        }
        const liveRoots = new Set<unknown>();
        if (storeTrap.error === null) {
            for (const [componentIdx, tasks] of tasksByComponent) {
                if (componentIdx === -1) {
                    continue;
                }
                for (const { task } of tasks) {
                    liveRoots.add(task.getRootTask());
                }
            }
        }
        for (const call of pending) {
            if (storeTrap.stopped) {
                finish(call, { status: 'stopped' });
            } else if (storeTrap.error !== null) {
                finish(call, { status: 'trapped', error: storeTrap.error });
            } else if (call.task?.isErrored() instanceof RuntimeError) {
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
    function observe<T extends PromiseLike<unknown>>(call: ComponentTrackedCall, result: T): T {
        const settled = () => {
            call.resultSettled = true;
            check();
        };
        result.then(settled, settled);
        return result;
    }

    /** Invoke a registered export, preserving its receiver and result representation. */
    function invoke(receiver: unknown, fn: Function, args: unknown[]): ComponentCallHandle {
        const metadata = exports.get(fn);
        if (!metadata) {
            throw new TypeError('call tracking requires an export from this instance');
        }
        let resolve!: (outcome: ComponentCallOutcome) => void;
        const finished = new Promise<ComponentCallOutcome>((done) => {
            resolve = done;
        });
        const call: ComponentTrackedCall = { id: metadata.id, task: null, resolve, resultSettled: false };
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
        start(fn: Function, ...args: unknown[]) {
            return invoke(undefined, fn, args);
        },
        /** Start an exported resource method with an explicit receiver. */
        startWithThis(receiver: unknown, fn: Function, ...args: unknown[]) {
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
        attach(call: ComponentTrackedCall | null, task: ComponentTrackedTask) {
            if (call && pending.has(call)) {
                call.task = task;
            }
        },
    };
};
