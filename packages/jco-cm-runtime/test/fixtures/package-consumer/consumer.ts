import { CM_RUNTIME_API_VERSION as rootVersion } from '@bytecodealliance/jco-cm-runtime';
import { CM_RUNTIME_API_VERSION } from '@bytecodealliance/jco-cm-runtime/runtime';
import * as resource from '@bytecodealliance/jco-cm-runtime/intrinsics/resource';
import * as conversion from '@bytecodealliance/jco-cm-runtime/intrinsics/conversion';
import * as custom from './provider.js';
import type {
    ResourceModule,
    ConversionModule,
    RuntimeModuleContracts,
} from '@bytecodealliance/jco-cm-runtime/runtime';
const defaultModule: ResourceModule = resource;
const defaultConversions: RuntimeModuleContracts['intrinsics/conversion'] = conversion;
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
