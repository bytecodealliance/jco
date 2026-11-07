import type {
    AsyncThreadClassContext,
    AsyncThreadConstructor,
    AsyncTask as AsyncTaskType,
    AsyncThreadOptions,
    TaskSuspendOptions,
} from '../../runtime.js';
import { getOrCreateAsyncState, recordTrap } from '../component.js';
import { withCurrentTaskMetaAsync } from '../task-context.js';
import { debugLog } from '../core-debug.js';

export function initializeAsyncThreadClass(context: AsyncThreadClassContext): AsyncThreadConstructor {
    const { lookup: _lookup, registers: _registers } = context;
    class AsyncThread {
        static State = {
            // Explicitly spawned (`thread.new-indirect`) threads start
            // here; the implicit thread of a task skips straight to
            // RUNNING since it is the task's own entry.
            NOT_STARTED: 'not-started',
            RUNNING: 'running',
            COMPLETED: 'completed',
        } as const;

        // Component-instance-scoped id (the canonical ABI's
        // `Thread.index`) -- globally unique within the instance,
        // *not* per task, since a thread of one task may be
        // targeted (e.g. by `thread.resume-later`) by code
        // running in a different task of the same instance.
        // Assigned post-construction by `Task#addThread()`, which
        // is the only code allowed to insert into the instance's
        // thread table.
        #id: number | null = null;
        #componentIdx: number;
        #task: AsyncTaskType;
        #state: 'not-started' | 'running' | 'completed';
        #startFn: (() => unknown) | null = null;
        storage = [0, 0];

        constructor(opts: AsyncThreadOptions) {
            if (opts?.componentIdx === undefined) {
                throw new TypeError('missing component id during thread creation');
            }
            this.#componentIdx = opts.componentIdx;

            if (!opts?.task) {
                throw new TypeError('missing task during thread creation');
            }
            this.#task = opts.task;

            // Explicitly spawned threads provide a `startFn` and begin
            // NOT_STARTED; the task's own implicit thread has none and
            // is already running by the time it's constructed.
            if (opts.startFn) {
                this.#startFn = opts.startFn;
                this.#state = AsyncThread.State.NOT_STARTED;
            } else {
                this.#state = AsyncThread.State.RUNNING;
            }
        }

        id() {
            return this.#id!;
        }
        setId(id: number) {
            if (this.#id !== null) {
                throw new Error('thread id can only be assigned once');
            }
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

        // Delegate task-scoped bookkeeping that doesn't yet have a
        // thread-specific notion (cancellation, progress waiters,
        // the subtask this task is answering) to the owning task.
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

        async suspend(opts: TaskSuspendOptions & { releaseLock?: boolean }) {
            const cstate = getOrCreateAsyncState(_lookup, this.#componentIdx);
            const task = this.#task;
            task.endFirstSlice();
            task.settleCompletion();
            const { cancellable, readyFn, releaseLock = false } = opts;
            if (task.deliverPendingCancel({ cancellable })) {
                return false;
            }
            const reacquireLock = releaseLock && task.needsExclusiveLock() && cstate.exclusivelyLockedBy(task.id());
            if (reacquireLock) {
                cstate.exclusiveRelease(task.id());
            }
            try {
                const keepGoing = await cstate.suspendThread({
                    ...opts,
                    cancellable: !!cancellable,
                    thread: this,
                    readyFn: () => (cancellable && task.cancellationPending()) || readyFn(),
                });
                cstate.throwIfInterrupted();
                if (keepGoing && task.deliverPendingCancel({ cancellable })) {
                    return false;
                }
                return !!keepGoing;
            } finally {
                if (reacquireLock && !cstate.exclusivelyLockedBy(task.id())) {
                    await cstate.acquireExclusiveLock(task.id());
                }
            }
        }

        // Begins running a NOT_STARTED (explicitly spawned) thread's
        // start function. Runs detached -- the caller (`thread.resume-later`)
        // does not wait for the thread to finish or even reach its first
        // suspension point.
        start() {
            if (this.#state !== AsyncThread.State.NOT_STARTED) {
                throw new Error(`cannot start thread [${this.#id}] in state [${this.#state}]`);
            }
            this.#state = AsyncThread.State.RUNNING;
            const startFn = this.#startFn!;
            this.#startFn = null;

            withCurrentTaskMetaAsync(_registers, {
                threadID: this.#id!,
                taskID: this.#task.id(),
                componentIdx: this.#componentIdx,
                fn: async () => {
                    getOrCreateAsyncState(_lookup, this.#componentIdx).throwIfInterrupted();
                    return startFn();
                },
            })
                .then(() => {
                    this.#state = AsyncThread.State.COMPLETED;
                    this.#task.removeThread(this);
                })
                .catch((err) => {
                    err = recordTrap(context.traps, this.#componentIdx, err);
                    this.#state = AsyncThread.State.COMPLETED;
                    debugLog('[AsyncThread#start()] spawned thread errored', {
                        threadID: this.#id!,
                        taskID: this.#task.id(),
                        componentIdx: this.#componentIdx,
                        err,
                    });
                    this.#task.setErrored(err);
                    this.#task.reject(err);
                    this.#task.removeThread(this);
                });
        }
    }
    return AsyncThread;
}
