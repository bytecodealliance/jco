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
    const eventCode = result & 0xf;
    if (eventCode < 0 || eventCode > 3) {
        throw new _context.RuntimeError('invalid async return value [' + eventCode + '], outside callback code range');
    }
    if (result < 0 || result >= 2 ** 32) {
        throw new _context.RuntimeError('invalid callback result');
    }
    // TODO: table max length check?
    const waitableSetRep = result >> 4;
    return [eventCode, waitableSetRep];
}
