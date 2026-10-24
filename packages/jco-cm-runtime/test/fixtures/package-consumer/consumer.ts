import { CM_RUNTIME_API_VERSION as rootVersion } from '@bytecodealliance/jco-cm-runtime';
import { CM_RUNTIME_API_VERSION } from '@bytecodealliance/jco-cm-runtime/runtime';
import * as resource from '@bytecodealliance/jco-cm-runtime/intrinsics/resource';
import * as custom from './provider.js';
import type { ResourceModule, RuntimeModuleContracts } from '@bytecodealliance/jco-cm-runtime/runtime';
const defaultModule: ResourceModule = resource;
const customModule: RuntimeModuleContracts['intrinsics/resource'] = custom;
const version: 1 = rootVersion;
const entry = defaultModule.tableGet({ RuntimeError: WebAssembly.RuntimeError }, [1 << 30, 0, 7, 42], 1);
if (
    version !== CM_RUNTIME_API_VERSION ||
    entry.rep !== 42 ||
    customModule.tableGet({ RuntimeError: Error }, [1 << 30, 0, 7, 24], 1).rep !== 24
) {
    throw new Error('consumer failed');
}
