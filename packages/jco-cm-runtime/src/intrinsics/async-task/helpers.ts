import { typeCheckValidI32 as checkI32 } from '../core.js';

export const typeCheckValidI32 = (value: unknown): value is number => checkI32(value);

export const isThenable = <T>(value: T | Promise<T>): value is Promise<T> =>
    !!value && typeof (value as { then?: unknown }).then === 'function';
