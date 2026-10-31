import { CM_RUNTIME_API_VERSION as rootVersion } from '@bytecodealliance/jco-cm-runtime';
import { CM_RUNTIME_API_VERSION } from '@bytecodealliance/jco-cm-runtime/runtime';
import * as resource from '@bytecodealliance/jco-cm-runtime/intrinsics/resource';
import * as conversion from '@bytecodealliance/jco-cm-runtime/intrinsics/conversion';
import * as jsHelper from '@bytecodealliance/jco-cm-runtime/intrinsics/js-helper';
import * as string from '@bytecodealliance/jco-cm-runtime/intrinsics/string';
import * as custom from './provider.js';
import type {
    ResourceModule,
    ConversionModule,
    RuntimeModuleContracts,
} from '@bytecodealliance/jco-cm-runtime/runtime';
const defaultModule: ResourceModule = resource;
const defaultConversions: RuntimeModuleContracts['intrinsics/conversion'] = conversion;
const helpers: RuntimeModuleContracts['intrinsics/js-helper'] = jsHelper;
const strings: RuntimeModuleContracts['intrinsics/string'] = string;
const encoder = strings.initializeUtf8Encoder();
const stringMemory = { buffer: new ArrayBuffer(8) };
const allocation = strings.utf8Encode(encoder, 'é', () => 0, stringMemory);
if (
    allocation.len !== 2 ||
    strings.initializeUtf8Decoder().decode(new Uint8Array(stringMemory.buffer, 0, 2)) !== 'é' ||
    custom.validateHostChar('🚀') !== 0x1f680
)
    throw new Error('string consumer failed');
const cache = helpers.initializeDataViewCache();
const memory = { buffer: new ArrayBuffer(8) };
const view = helpers.dataView(cache, memory);
view.setUint32(0, 42, true);
if (helpers.dataView(cache, memory) !== view || view.getUint32(0, true) !== 42 || helpers.emptyFunc(1) !== undefined)
    throw new Error('cache consumer failed');
const customUint32: ConversionModule['toUint32'] = custom.toUint32;
if (customUint32({ strict: false }, -1) !== 0xffffffff || defaultConversions.toUint32({ strict: true }, 42) !== 42)
    throw new Error('numeric consumer failed');
const scratch32 = defaultConversions.initializeBitcast32();
const scratch64 = defaultConversions.initializeBitcast64();
if (
    defaultConversions.i32ToF32(scratch32, 0x3f800000) !== 1 ||
    defaultConversions.f64ToI64(scratch64, 1) !== 0x3ff0000000000000n
)
    throw new Error('bitcast consumer failed');
const customModule: RuntimeModuleContracts['intrinsics/resource'] = custom;
const version: 1 = rootVersion;
const entry = defaultModule.tableGet({ RuntimeError: WebAssembly.RuntimeError }, [1 << 30, 0, 7, 42], 1);
if (
    version !== CM_RUNTIME_API_VERSION ||
    entry.rep !== 42 ||
    customModule.tableGet({ RuntimeError: Error }, [1 << 30, 0, 7, 24], 1).rep !== 24
)
    throw new Error('consumer failed');
