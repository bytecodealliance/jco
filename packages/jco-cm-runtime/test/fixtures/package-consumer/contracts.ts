// Compile-only fixtures: function properties must reject narrower capabilities and operands.
import * as resource from '@bytecodealliance/jco-cm-runtime/intrinsics/resource';
import type {
    ResourceModule,
    ResourceTableGetContext,
    RuntimeModuleContracts,
} from '@bytecodealliance/jco-cm-runtime/runtime';

export const defaultModule: ResourceModule = resource;
export const contractMapEntry: RuntimeModuleContracts['intrinsics/resource'] = resource;
// @ts-expect-error required export is missing
export const missing: ResourceModule = {};
export const wrongContext: ResourceModule = {
    // @ts-expect-error incompatible context capability
    tableGet: (_context: { RuntimeError: string }) => ({ rep: 1, scope: 0, own: true }),
};
export const privateState: ResourceModule = {
    // @ts-expect-error narrower context requires private state unavailable in the public contract
    tableGet: (_context: ResourceTableGetContext & { privateState: number }) => ({ rep: 1, scope: 0, own: true }),
};
export const wrongTable: ResourceModule = {
    // @ts-expect-error incompatible table operand
    tableGet: (_context: ResourceTableGetContext, _table: string) => ({ rep: 1, scope: 0, own: true }),
};
export const wrongHandle: ResourceModule = {
    // @ts-expect-error incompatible handle operand
    tableGet: (_context: ResourceTableGetContext, _table: ArrayLike<number>, _handle: string) => ({
        rep: 1,
        scope: 0,
        own: true,
    }),
};
// @ts-expect-error incompatible result
export const wrongResult: ResourceModule = { tableGet: () => ({ rep: '1', scope: 0, own: true }) };

import * as conversion from '@bytecodealliance/jco-cm-runtime/intrinsics/conversion';
import type {
    ConversionModule,
    StrictNumericContext,
    Bitcast32Context,
} from '@bytecodealliance/jco-cm-runtime/runtime';
const conversionModule: ConversionModule = conversion;
conversionModule.toUint32({ strict: false }, '42');
conversionModule.toString(42);
// @ts-expect-error numeric conversions require their explicit policy context
conversionModule.toUint32(42);
// @ts-expect-error bitcasts need selected storage, not a numeric policy
conversionModule.i32ToF32({ strict: false }, 42);
// @ts-expect-error no universal runtime option bag
const broadNumericContext: StrictNumericContext = { strict: false, nodejsCompat: true };
const bitcastContext: Bitcast32Context = conversionModule.initializeBitcast32();
bitcastContext.i32[0] = 0x3f800000;
// @ts-expect-error storage identities remain stable for an instantiation
bitcastContext.i32 = [0];
void broadNumericContext;
