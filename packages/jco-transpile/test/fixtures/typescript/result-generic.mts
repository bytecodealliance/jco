import type { Result } from 'test:result-payloads/payloads';

/** Generic code narrows a result of any payload types by its tag. */
export function unwrap<T, E>(result: Result<T, E>): T {
    if (result.tag === 'ok') {
        return result.val;
    }
    throw result.val;
}

export function map<T, U, E>(result: Result<T, E>, f: (value: T) => U): Result<U, E> {
    return result.tag === 'ok' ? { tag: 'ok', val: f(result.val) } : result;
}
