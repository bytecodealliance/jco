import type { ComponentIdleContext, ComponentModule } from '../../runtime.js';
import { normalizeCoreTrap } from '../component.js';
import { tableFlag, tableOwn } from '../resource.js';

/** Tells the embedder's `onTrap` about a trap, once per error. */
export const reportTrap: ComponentModule['reportTrap'] = (context, err) => {
    const { storeTrap, RuntimeError } = context;
    // Stopping an instance goes through the same path as a trap
    if (storeTrap.onTrap === null || storeTrap.stopped) {
        return;
    }
    if (!(err instanceof RuntimeError) || storeTrap.trapsReported.has(err)) {
        return;
    }
    storeTrap.trapsReported.add(err);
    const trap = normalizeCoreTrap(context.normalization, err);
    // Not the runtime's to handle, whose own unwinding is under way
    try {
        storeTrap.onTrap(trap);
    } catch (e) {
        queueMicrotask(() => {
            throw e;
        });
    }
};

/** Whether no guest task is live. Host tasks, under -1, stand for a host's own work, not a guest's. */
function isIdle(context: ComponentIdleContext): boolean {
    if (context.storeTrap.error !== null) {
        return true;
    }
    for (const [componentIdx, metas] of context.tasks) {
        if (componentIdx !== -1 && metas.length > 0) {
            return false;
        }
    }
    return true;
}

/** Settles what `whenIdle` gave out, if that time has come. */
export const checkIdle: ComponentModule['checkIdle'] = (context) => {
    context.checkCalls?.();
    const { idleWaiters } = context.storeAsyncState;
    if (idleWaiters.size === 0 || !isIdle(context)) {
        return;
    }
    const waiters = [...idleWaiters];
    idleWaiters.clear();
    for (const resolve of waiters) {
        resolve();
    }
};

/** Resolves once no guest task is live. */
export const whenIdle: ComponentModule['whenIdle'] = (context) => {
    if (isIdle(context)) {
        return Promise.resolve();
    }
    return new Promise((resolve) => {
        context.storeAsyncState.idleWaiters.add(resolve);
    });
};

/** Stops every component of the store, releasing what the guest still holds. */
export const stopInstance: ComponentModule['stopInstance'] = (context) => {
    const { storeTrap, storeAsyncState, asyncState, symbolDispose } = context;
    if (storeTrap.stopped) {
        return;
    }
    storeTrap.stopped = true;
    const err = new context.RuntimeError('component instance has been stopped');
    storeTrap.error ??= err;
    clearTimeout(storeAsyncState.deadlockCheck as Parameters<typeof clearTimeout>[0]);
    storeAsyncState.deadlockCheck = null;

    // Poison every component before releasing any continuation or
    // calling host cleanup, which can reenter the instance.
    for (const state of asyncState.values()) {
        state.markTrapped(err);
    }
    for (const reject of storeTrap.stopWaiters) {
        reject(err);
    }
    storeTrap.stopWaiters.clear();
    const pending = [...context.tasks.values()].flat().map((meta) => meta.task);
    for (const task of pending) {
        task.stop(err);
    }
    for (const state of asyncState.values()) {
        state.stop();
    }

    // Both ends of every stream and future, whichever side either end is on.
    const errors: unknown[] = [];
    for (const channels of context.channels) {
        for (let i = 2, data = channels.data(); i < data.length; i += 2) {
            const channel = data[i] as { onInstanceStop?: () => void } | undefined;
            if (channel === undefined || channel === context.RepTable.FREE) {
                continue;
            }
            // (what a host has lifted is only a view of one of these)
            try {
                channel.onInstanceStop?.();
            } catch (e) {
                errors.push(e);
            }
        }
    }

    // A capture table also contains borrowed resources. Only live
    // owned handles belong to the guest; lifting an own back to the
    // host removes its capture. Shared tables/reps are deduplicated.
    const resources = new Set<object>();
    for (const { handles, captures } of storeTrap.resourceTables) {
        for (let i = 2; i < handles.length; i += 2) {
            if ((handles[i] & tableFlag) !== 0 || !(handles[i + 1] >= tableOwn)) {
                continue;
            }
            const resource = captures.get(handles[i + 1] - tableOwn);
            if (resource !== undefined) {
                resources.add(resource);
            }
        }
    }
    for (const { captures } of storeTrap.resourceTables) {
        captures.clear();
    }
    storeTrap.resourceTables.length = 0;
    for (const resource of resources) {
        // A guest holding it twice may have dropped the other handle.
        if (storeTrap.disposed.has(resource)) {
            continue;
        }
        try {
            (resource as Record<symbol, (() => void) | undefined>)[symbolDispose]?.();
        } catch (error) {
            errors.push(error);
        }
    }
    if (errors.length) {
        throw new AggregateError(errors, 'failed to dispose stopped instance resources');
    }
};
