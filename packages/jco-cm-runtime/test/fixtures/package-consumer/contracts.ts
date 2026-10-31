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

import * as jsHelper from '@bytecodealliance/jco-cm-runtime/intrinsics/js-helper';
import type { JsHelperModule, DataViewCacheContext } from '@bytecodealliance/jco-cm-runtime/runtime';
const jsHelperModule: JsHelperModule = jsHelper;
jsHelperModule.emptyFunc(1, undefined);
const dataViewContext: DataViewCacheContext = jsHelperModule.initializeDataViewCache();
dataViewContext.view = new DataView(new ArrayBuffer(8));
jsHelperModule.dataView(dataViewContext, { buffer: dataViewContext.view.buffer });
// @ts-expect-error memory is a call operand, not the cache context
jsHelperModule.dataView({ buffer: new ArrayBuffer(8) });
// @ts-expect-error cache requires its real mutable view owner
jsHelperModule.dataView({ privateView: true }, { buffer: new ArrayBuffer(8) });
// @ts-expect-error memory must expose an ArrayBuffer-like buffer
jsHelperModule.dataView(dataViewContext, { buffer: 'not a buffer' });

import * as string from '@bytecodealliance/jco-cm-runtime/intrinsics/string';
import type { StringModule, StringEncodeInto } from '@bytecodealliance/jco-cm-runtime/runtime';
const strings: StringModule = string;
const encoder = strings.initializeUtf8Encoder();
strings.utf8Encode(encoder, 'é', () => 0, { buffer: new ArrayBuffer(8) });
strings.utf16Encode(strings.initializeUtf16Encoding(), 'x', () => 0, { buffer: new ArrayBuffer(8) });
// @ts-expect-error encoder is an explicit capability, not an implicit provider dependency
strings.utf8Encode('x', () => 0, { buffer: new ArrayBuffer(8) });
// @ts-expect-error UTF16 encoding receives only its endianness capability
strings.utf16Encode({ encoder }, 'x', () => 0, { buffer: new ArrayBuffer(8) });
// @ts-expect-error a codec must supply its method with the structural call signature
const invalidEncoder: StringEncodeInto = { encodeInto: (input: number) => input };
void invalidEncoder;

import * as webidl from '@bytecodealliance/jco-cm-runtime/intrinsics/webidl';
import type { WebIdlModule } from '@bytecodealliance/jco-cm-runtime/runtime';
const webIdlModule: WebIdlModule = webidl;
const webIdlCache = webIdlModule.initializeWebIdlProxyCache();
webIdlModule.globalThisIdlProxy(webIdlCache);
webIdlCache.proxy = undefined;
// @ts-expect-error proxy operations require the explicit mutable cache owner
webIdlModule.globalThisIdlProxy();
// @ts-expect-error the cache is structural and contains no runtime registry
webIdlModule.globalThisIdlProxy({ runtime: {} });

const indexSpaces = resource.initializeHandleIndexSpaces();
const tables = resource.initializeHandleTables();
const scopeTasks = resource.initializeResourceScopeTasks();
const scope = resource.initializeScopeId();
const callBorrows = resource.initializeCallBorrows();
const removal = { RuntimeError: WebAssembly.RuntimeError, indexSpaces, scopeTasks };
const table = Object.assign([resource.tableFlag, 0], { _createdReps: new Set<number>() });
resource.tableRemove(removal, table, resource.tableCreateOwn(indexSpaces, table, 42));
resource.transferBorrow({ RuntimeError: Error, indexSpaces, tables, scope, callBorrows }, 1, 0, 1);
// @ts-expect-error removal needs the shared allocator and scope-task lookup
resource.tableRemove({ RuntimeError: Error }, table, 1);
// @ts-expect-error transfer requires the live scope cell, not its numeric snapshot
resource.transferBorrow({ RuntimeError: Error, indexSpaces, tables, scope: 0, callBorrows }, 1, 0, 1);
// @ts-expect-error borrow-list replacement must go through its actual mutable owner
resource.transferBorrow({ RuntimeError: Error, indexSpaces, tables, scope, callBorrows: [] }, 1, 0, 1);
// @ts-expect-error task construction is a required explicit capability
resource.callDestructor({ withTask: ({ fn }) => fn() }, { componentIdx: 0, rep: 42, dtor: () => {} });
