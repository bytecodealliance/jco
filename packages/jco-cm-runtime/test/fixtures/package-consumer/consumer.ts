import { CM_RUNTIME_API_VERSION as rootVersion } from '@bytecodealliance/jco-cm-runtime';
import { CM_RUNTIME_API_VERSION } from '@bytecodealliance/jco-cm-runtime/runtime';
import * as resource from '@bytecodealliance/jco-cm-runtime/intrinsics/resource';
import * as conversion from '@bytecodealliance/jco-cm-runtime/intrinsics/conversion';
import * as jsHelper from '@bytecodealliance/jco-cm-runtime/intrinsics/js-helper';
import * as string from '@bytecodealliance/jco-cm-runtime/intrinsics/string';
import * as webidl from '@bytecodealliance/jco-cm-runtime/intrinsics/webidl';
import * as custom from './provider.js';
import type {
    ResourceModule,
    ConversionModule,
    RuntimeModuleContracts,
} from '@bytecodealliance/jco-cm-runtime/runtime';
const defaultModule: ResourceModule = resource;
const indexSpaces = defaultModule.initializeHandleIndexSpaces();
const scopeTasks = defaultModule.initializeResourceScopeTasks();
const removal = { RuntimeError: Error, indexSpaces, scopeTasks };
const table = Object.assign([defaultModule.tableFlag, 0], { _componentIdx: 0, _createdReps: new Set<number>() });
const handle = defaultModule.tableCreateOwn(indexSpaces, table, 42);
if (
    handle !== 1 ||
    defaultModule.tableRemove(removal, table, handle).rep !== 42 ||
    defaultModule.getHandleIndexSpace(indexSpaces, 0).alloc() !== handle
) {
    throw new Error('allocator consumer failed');
}
const cells = [defaultModule.initializeScopeId(), defaultModule.initializeResourceScopeCounter()];
if (
    cells[0] === cells[1] ||
    cells.some((cell) => cell.value !== 0) ||
    defaultModule.initializeCallBorrows().borrows.length ||
    defaultModule.initializeCurrentBorrows().borrows.length ||
    Object.keys(defaultModule.initializeHandleTables()).length
) {
    throw new Error('resource storage consumer failed');
}
const transferOwn: ResourceModule['transferOwn'] = resource.transferOwn;
const transferBorrow: ResourceModule['transferBorrow'] = resource.transferBorrow;
const transferBorrowValidLifting: ResourceModule['transferBorrowValidLifting'] = resource.transferBorrowValidLifting;
const ensureBorrowDrop: ResourceModule['tableEnsureBorrowDrop'] = resource.tableEnsureBorrowDrop;
const createBorrow: ResourceModule['tableCreateBorrow'] = resource.tableCreateBorrow;
const destructor: ResourceModule['callDestructor'] = resource.callDestructor;
if (
    [transferOwn, transferBorrow, transferBorrowValidLifting, ensureBorrowDrop, createBorrow, destructor].some(
        (op) => typeof op !== 'function',
    )
) {
    throw new Error('resource exports missing');
}
const defaultConversions: RuntimeModuleContracts['intrinsics/conversion'] = conversion;
const helpers: RuntimeModuleContracts['intrinsics/js-helper'] = jsHelper;
const webIdlModule: RuntimeModuleContracts['intrinsics/webidl'] = webidl;
const webIdlCache = custom.initializeWebIdlProxyCache();
const globalProxy = webIdlModule.globalThisIdlProxy(webIdlCache);
if (globalProxy !== webIdlModule.globalThisIdlProxy(webIdlCache) || Reflect.get(globalProxy, 'URL') !== URL) {
    throw new Error('WebIDL consumer failed');
}
const strings: RuntimeModuleContracts['intrinsics/string'] = string;
const encoder = strings.initializeUtf8Encoder();
const stringMemory = { buffer: new ArrayBuffer(8) };
const allocation = strings.utf8Encode(encoder, 'é', () => 0, stringMemory);
if (
    allocation.len !== 2 ||
    strings.initializeUtf8Decoder().decode(new Uint8Array(stringMemory.buffer, 0, 2)) !== 'é' ||
    custom.validateHostChar('🚀') !== 0x1f680
) {
    throw new Error('string consumer failed');
}
const cache = helpers.initializeDataViewCache();
const memory = { buffer: new ArrayBuffer(8) };
const view = helpers.dataView(cache, memory);
view.setUint32(0, 42, true);
if (helpers.dataView(cache, memory) !== view || view.getUint32(0, true) !== 42 || helpers.emptyFunc(1) !== undefined) {
    throw new Error('cache consumer failed');
}
const customUint32: ConversionModule['toUint32'] = custom.toUint32;
if (customUint32({ strict: false }, -1) !== 0xffffffff || defaultConversions.toUint32({ strict: true }, 42) !== 42) {
    throw new Error('numeric consumer failed');
}
const scratch32 = defaultConversions.initializeBitcast32();
const scratch64 = defaultConversions.initializeBitcast64();
if (
    defaultConversions.i32ToF32(scratch32, 0x3f800000) !== 1 ||
    defaultConversions.f64ToI64(scratch64, 1) !== 0x3ff0000000000000n
) {
    throw new Error('bitcast consumer failed');
}
const customModule: Pick<ResourceModule, 'tableGet'> = custom;
const version: 1 = rootVersion;
const entry = defaultModule.tableGet({ RuntimeError: WebAssembly.RuntimeError }, [1 << 30, 0, 7, 42], 1);
if (
    version !== CM_RUNTIME_API_VERSION ||
    entry.rep !== 42 ||
    customModule.tableGet({ RuntimeError: Error }, [1 << 30, 0, 7, 24], 1).rep !== 24
) {
    throw new Error('consumer failed');
}
