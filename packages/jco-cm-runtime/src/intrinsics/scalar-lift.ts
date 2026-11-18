import type { TaskLiftContext, TaskLiftFn } from '../runtime.js';

type ScalarLift = (context: TaskLiftContext) => unknown;
const scalarLifts = /* @__PURE__ */ new WeakMap<TaskLiftFn, { direct: ScalarLift; memory: ScalarLift }>();

/** Keep the public pair-returning ABI while making internal scalar calls allocation-free. */
export function defineScalarLift(lift: TaskLiftFn, direct: ScalarLift, memory: ScalarLift): TaskLiftFn {
    scalarLifts.set(lift, { direct, memory });
    return lift;
}

/** Custom lifts still use the public ABI, including replacement contexts. */
export function scalarLiftValue(lift: TaskLiftFn, direct?: boolean): ScalarLift | undefined {
    const scalar = scalarLifts.get(lift);
    return direct ? scalar?.direct : scalar?.memory;
}
