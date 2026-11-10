import type { ThreadLookupContext, AsyncTaskModule } from '../../runtime.js';
import { typeCheckValidI32 } from './helpers.js';
import { getCurrentTaskMeta } from '../task-context.js';
import { getCurrentThread } from './thread-operations.js';
import { debugLog } from '../core-debug.js';

// ContextSet
export function contextSet(
    _context: ThreadLookupContext,
    ctx: {
        componentIdx?: number;
        slot: number;
    },
    value: number,
): ReturnType<AsyncTaskModule['contextSet']> {
    const { slot } = ctx;
    if (slot === undefined) {
        throw new TypeError('missing slot');
    }
    if (!typeCheckValidI32(value)) {
        throw new Error('invalid value for context set (not valid i32)');
    }
    // Guest callbacks use their component's task register. FACT
    // adapters have no component index; post-return also runs
    // after the callee register is cleared. Both use the executing
    // task, whose context FACT temporarily saves and restores.
    let currentThreadMeta = getCurrentTaskMeta(_context.registers, ctx.componentIdx);
    let threadMeta = currentThreadMeta
        ? getCurrentThread(
              _context,
              currentThreadMeta.componentIdx,
              currentThreadMeta.threadID,
              currentThreadMeta.taskID,
          )
        : undefined;
    // A post-return may run after the callee has exited. Its
    // per-component register can therefore name a task which is
    // no longer live; fall back to FACT's executing task.
    if (!threadMeta) {
        currentThreadMeta = getCurrentTaskMeta(_context.registers);
        threadMeta = currentThreadMeta
            ? getCurrentThread(
                  _context,
                  currentThreadMeta.componentIdx,
                  currentThreadMeta.threadID,
                  currentThreadMeta.taskID,
              )
            : undefined;
    }
    if (!threadMeta) {
        throw new Error(
            `missing/incomplete global current thread meta for component idx [${ctx.componentIdx}] during context set`,
        );
    }
    const task = threadMeta.thread;
    if (!task) {
        throw new Error('invalid/missing current thread in metadata while setting context');
    }
    debugLog('[contextSet()] args', {
        slot,
        value,
        storage: task.storage,
        threadID: task.id(),
        taskID: threadMeta.task.id(),
        componentIdx: task.componentIdx(),
    });
    if (slot < 0 || slot >= task.storage.length) {
        throw new Error('invalid slot for current thread');
    }
    task.storage[slot] = value;
}

// ContextGet
export function contextGet(
    _context: ThreadLookupContext,
    ctx: {
        componentIdx?: number;
        slot: number;
    },
): ReturnType<AsyncTaskModule['contextGet']> {
    const { slot } = ctx;
    if (slot === undefined) {
        throw new TypeError('missing slot');
    }
    // Guest callbacks use their component's task register. FACT
    // adapters have no component index; post-return also runs
    // after the callee register is cleared. Both use the executing
    // task, whose context FACT temporarily saves and restores.
    let currentThreadMeta = getCurrentTaskMeta(_context.registers, ctx.componentIdx);
    let threadMeta = currentThreadMeta
        ? getCurrentThread(
              _context,
              currentThreadMeta.componentIdx,
              currentThreadMeta.threadID,
              currentThreadMeta.taskID,
          )
        : undefined;
    // A post-return may run after the callee has exited. Its
    // per-component register can therefore name a task which is
    // no longer live; fall back to FACT's executing task.
    if (!threadMeta) {
        currentThreadMeta = getCurrentTaskMeta(_context.registers);
        threadMeta = currentThreadMeta
            ? getCurrentThread(
                  _context,
                  currentThreadMeta.componentIdx,
                  currentThreadMeta.threadID,
                  currentThreadMeta.taskID,
              )
            : undefined;
    }
    if (!threadMeta) {
        throw new Error(
            `missing/incomplete global current thread meta for component idx [${ctx.componentIdx}] during context get`,
        );
    }
    const task = threadMeta.thread;
    if (!task) {
        throw new Error('invalid/missing current thread in metadata while getting context');
    }
    debugLog('[contextGet()] args', {
        slot,
        storage: task.storage,
        threadID: task.id(),
        taskID: threadMeta.task.id(),
        componentIdx: task.componentIdx(),
    });
    if (slot < 0 || slot >= task.storage.length) {
        throw new Error('invalid slot for current thread');
    }
    return task.storage[slot];
}
