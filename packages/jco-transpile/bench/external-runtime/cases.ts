import { fileURLToPath } from 'node:url';

export const components = [
    { id: 'empty', path: 'empty.wat' },
    { id: 'noise', path: 'noise.mjs' },
    { id: 'numbers', path: '../../test/fixtures/components/runtime/numbers.component.wasm' },
    { id: 'variants', path: '../../test/fixtures/components/runtime/variants.component.wasm' },
    { id: 'adder', path: '../../test/fixtures/components/adder.component.wasm' },
    { id: 'resource', path: '../../test/fixtures/components/runtime/external-runtime-resource.component.wat' },
] as const;
export type ComponentId = (typeof components)[number]['id'];
export const scenarios: { id: string; components: readonly ComponentId[] }[] = [
    ...components.map(({ id }) => ({ id, components: [id] })),
    { id: 'sharing', components: ['resource', 'resource'] },
];
export const bundlers = ['rolldown', 'rollup'] as const;
export type Bundler = (typeof bundlers)[number];
export const resolutions = ['file', 'package'] as const;
export type Resolution = (typeof resolutions)[number];
export function componentPath(id: ComponentId) {
    return fileURLToPath(new URL(components.find((component) => component.id === id)!.path, import.meta.url));
}

/** Keep selected scratch families separate from scalar-only runtime imports. */
export const importControls = [
    {
        id: 'empty-func',
        suffix: 'intrinsics/js-helper',
        names: ['emptyFunc'],
        setup: '',
        answer: '(emptyFunc(7), 42)',
        allocations: {},
    },
    {
        id: 'data-view',
        suffix: 'intrinsics/js-helper',
        names: ['initializeDataViewCache', 'dataView'],
        setup: 'const context = initializeDataViewCache(); const memory = { buffer: new ArrayBuffer(8) };',
        answer: '(dataView(context, memory).setUint32(0, 42, true), dataView(context, memory).getUint32(0, true))',
        allocations: { DataView: 2, ArrayBuffer: 2 },
    },
    {
        id: 'resource',
        suffix: 'intrinsics/resource',
        names: ['tableGet'],
        setup: '',
        answer: 'tableGet({ RuntimeError: WebAssembly.RuntimeError }, [1073741824, 0, 7, 4294967338], 1).rep',
        allocations: {},
    },
    {
        id: 'scalar',
        suffix: 'intrinsics/conversion',
        names: ['toUint32'],
        setup: '',
        answer: 'toUint32({ strict: false }, 42)',
        allocations: {},
    },
    {
        id: 'bitcast32',
        suffix: 'intrinsics/conversion',
        names: ['initializeBitcast32', 'i32ToF32'],
        setup: 'const context = initializeBitcast32();',
        answer: 'i32ToF32(context, 0x3f800000) + 41',
        allocations: { Int32Array: 1, Float32Array: 1 },
    },
    {
        id: 'bitcast64',
        suffix: 'intrinsics/conversion',
        names: ['initializeBitcast64', 'i64ToF64'],
        setup: 'const context = initializeBitcast64();',
        answer: 'i64ToF64(context, 0x3ff0000000000000n) + 41',
        allocations: { BigInt64Array: 1, Float64Array: 1 },
    },
] as const;
