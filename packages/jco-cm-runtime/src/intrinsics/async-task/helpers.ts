export { typeCheckValidI32 } from '../core.js';

export const isThenable = <T>(value: T | Promise<T>): value is Promise<T> =>
    !!value && typeof (value as { then?: unknown }).then === 'function';
