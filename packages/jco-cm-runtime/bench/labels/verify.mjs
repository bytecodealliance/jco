import assert from 'node:assert/strict';
import { rolldown } from 'rolldown';
import { fileURLToPath } from 'node:url';

const source = `
import { liftFlatOwn } from '../../src/intrinsics/lift.ts';
import { initializeRepTableClass } from '../../src/intrinsics/rep-table.ts';
import { validateGuestChar } from '../../src/intrinsics/string.ts';
export function exercise() {
    let names = 0;
    const lift = liftFlatOwn({ componentIdx: 0, tableIdx: 0,
        classNameFn: () => { names++; return 'Resource'; }, createResourceFn: (handle) => handle });
    const [value] = lift({ componentIdx: 0, useDirectParams: true, params: [1] });
    const Table = initializeRepTableClass({ RuntimeError: WebAssembly.RuntimeError });
    const table = new Table();
    const handle = table.insert(7);
    table.remove(handle);
    let traps = 0;
    for (const fn of [() => table.remove(handle), () => table.get(0), () => validateGuestChar(0xd800)]) {
        try { fn(); } catch { traps++; }
    }
    return { names, value, traps };
}
`;
const originalDebug = console.debug;
const originalSetting = process.env.JCO_DEBUG;
try {
    process.env.JCO_DEBUG = '1';
    for (const labels of [[], ['DEBUG'], ['DEBUG', 'SAFETY']]) {
        let logs = 0;
        console.debug = () => {
            logs++;
        };
        const bundle = await rolldown({
            input: 'label-verification',
            platform: 'node',
            transform: { dropLabels: labels },
            plugins: [
                {
                    name: 'label-verification',
                    resolveId(id) {
                        if (id === 'label-verification') {
                            return fileURLToPath(new URL('./verification.ts', import.meta.url));
                        }
                    },
                    load(id) {
                        if (id.endsWith('/verification.ts')) {
                            return source;
                        }
                    },
                },
            ],
        });
        const { output } = await bundle.generate({ format: 'esm', minify: true });
        await bundle.close();
        const { exercise } = await import(
            'data:text/javascript;base64,' + Buffer.from(output[0].code).toString('base64')
        );
        assert.deepEqual(exercise(), { names: labels.length ? 0 : 1, value: 1, traps: 3 });
        assert.equal(logs > 0, labels.length === 0);
        assert.equal(output[0].code.includes('corrupt rep table freelist'), !labels.includes('SAFETY'));
        console.log(
            `Verified ${labels.join(',') || 'retained'}: logging/argument removal, resource traps, Unicode traps`,
        );
    }
} finally {
    console.debug = originalDebug;
    if (originalSetting === undefined) {
        delete process.env.JCO_DEBUG;
    } else {
        process.env.JCO_DEBUG = originalSetting;
    }
}
