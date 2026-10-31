import { rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { assert, expect, test } from 'vitest';

import type { ComponentWaitable } from '../../../jco-cm-runtime/src/runtime.js';
import { getTmpDir } from '../helpers.js';
import { defaultRuntimeUrl, transpile, writeFiles } from '../transpilation.js';

const fixture = fileURLToPath(new URL('../fixtures/components/p3/context-resource-drop.wat', import.meta.url));

type TestWaitable = ComponentWaitable & {
    waitForPendingEvent: (args: {
        cstate: { waitUntil: (options: { cancellable: boolean; readyFn: () => boolean }) => unknown };
    }) => Promise<void>;
};
type TestWaitableConstructor = new (args: { componentIdx: number }) => TestWaitable;

for (const external of [false, true]) {
    async function withWaitable(check: (Waitable: TestWaitableConstructor) => Promise<void>) {
        const dir = await getTmpDir();
        try {
            const { files } = await transpile(fixture, {
                name: 'waitable',
                cmRuntimeEsModule: external ? defaultRuntimeUrl.href : undefined,
            });
            files['waitable.js'] = new TextEncoder().encode(
                new TextDecoder().decode(files['waitable.js']) + '\nexport { Waitable as TestWaitable };\n',
            );
            await writeFile(join(dir, 'package.json'), JSON.stringify({ type: 'module' }));
            await writeFiles(files, { baseDir: dir });
            const { TestWaitable } = await import(pathToFileURL(join(dir, 'waitable.js')).href);
            await check(TestWaitable);
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    }

    test.concurrent(`generated waitable rejects an undefined set (external=${external})`, async () => {
        await withWaitable(async (Waitable) => {
            const waitable = new Waitable({ componentIdx: 3 });
            assert.throws(() => waitable.join(undefined as never), TypeError, 'waitable set must be not be undefined');
            assert.isFalse(waitable.isInSet());
            waitable.join(null);
            assert.isFalse(waitable.isInSet());
        });
    });

    test.concurrent(`generated waitable clears its sync waiter after rejection (external=${external})`, async () => {
        await withWaitable(async (Waitable) => {
            const waitable = new Waitable({ componentIdx: 3 });
            const failure = new Error('scheduler rejected');
            await expect(
                waitable.waitForPendingEvent({
                    cstate: {
                        async waitUntil() {
                            throw failure;
                        },
                    },
                }),
            ).rejects.toBe(failure);
            const cstate = {
                async waitUntil({ cancellable, readyFn }: { cancellable: boolean; readyFn: () => boolean }) {
                    assert.isFalse(cancellable);
                    assert.isFalse(readyFn());
                    waitable.setPendingEvent(() => ({ code: 1, payload0: 2, payload1: 3 }));
                    assert.isTrue(readyFn());
                },
            };
            await waitable.waitForPendingEvent({ cstate });
            assert.deepEqual(waitable.getPendingEvent(), { code: 1, payload0: 2, payload1: 3 });
            // Successful completion must also release the waiter for the next wait.
            await waitable.waitForPendingEvent({ cstate });
            assert.deepEqual(waitable.getPendingEvent(), { code: 1, payload0: 2, payload1: 3 });
        });
    });
}
