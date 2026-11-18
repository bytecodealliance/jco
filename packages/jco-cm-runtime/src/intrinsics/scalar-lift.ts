import type { TaskLiftContext, TaskLiftFn } from '../runtime.js';

type ScalarLift = (context: TaskLiftContext) => unknown;
let scalarLifts: WeakMap<TaskLiftFn, { direct: ScalarLift; memory: ScalarLift }> | undefined;

/**
 * Register the scalar leaves when the public lift is first used. On a cache
 * miss a composite calls that public lift, which also consumes the first field.
 */
export function registerScalarLift(lift: TaskLiftFn, direct: ScalarLift, memory: ScalarLift): true {
    scalarLifts ??= new WeakMap();
    scalarLifts.set(lift, { direct, memory });
    return true;
}

/** Custom lifts still use the public ABI, including replacement contexts. */
export function scalarLiftValue(lift: TaskLiftFn, direct?: boolean): ScalarLift | undefined {
    const scalar = scalarLifts?.get(lift);
    return direct ? scalar?.direct : scalar?.memory;
}
