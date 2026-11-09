import type { TrapContext, AsyncTaskModule } from '../../runtime.js';
import { typeCheckValidI32 } from './helpers.js';

// UnpackCallbackResult
export function unpackCallbackResult(
    _context: TrapContext,
    result: number,
): ReturnType<AsyncTaskModule['unpackCallbackResult']> {
    if (!typeCheckValidI32(result)) {
        throw new Error('invalid callback return value [' + result + '], not a valid i32');
    }
    return unpackValidatedCallbackResult(_context, result);
}

/** Decode a callback whose scalar type and i32 range have already been checked. */
export function unpackValidatedCallbackResult(
    context: TrapContext,
    result: number,
): ReturnType<AsyncTaskModule['unpackCallbackResult']> {
    const eventCode = result & 0xf;
    if (eventCode > 3) {
        throw new context.RuntimeError('invalid async return value [' + eventCode + '], outside callback code range');
    }
    if (result < 0) {
        throw new context.RuntimeError('invalid callback result');
    }
    // TODO: table max length check?
    const waitableSetRep = result >> 4;
    return [eventCode, waitableSetRep];
}
