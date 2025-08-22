import typescript from '@rollup/plugin-typescript';
import nodeResolve from '@rollup/plugin-node-resolve';

export default {
    input: 'embedding.mts',
    output: {
        file: 'dist/transpiled/embedding.js',
        format: 'esm',
        inlineDynamicImports: true,
    },
    plugins: [
        typescript({
            include: ['embedding.mts'],
            compilerOptions: {
                lib: ['esnext', 'DOM'],
                module: 'nodenext',
                moduleResolution: 'nodenext',
            },
        }),
        nodeResolve(),
    ],
};
