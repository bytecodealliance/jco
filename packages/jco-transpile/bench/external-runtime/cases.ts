import { fileURLToPath } from 'node:url';

export const components = [
    { id: 'empty', path: 'empty.wat' },
    { id: 'noise', path: 'noise.mjs' },
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
