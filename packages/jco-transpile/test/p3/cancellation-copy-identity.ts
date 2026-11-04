import { join } from 'node:path';
import { expect, test } from 'vitest';
import { P3_COMPONENT_FIXTURES_DIR } from '../common.js';
import { setupAsyncTest } from '../helpers.js';

test.concurrent.each([false, true])(
    'a deferred stream cancellation cannot cancel a later copy (later cancelled: %s)',
    async (cancelLater) => {
        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                name: `cancellation-copy-identity-${cancelLater}`,
                path: join(P3_COMPONENT_FIXTURES_DIR, 'cancellation/copy-identity.wat'),
            },
        });
        let finishSource: ((value: IteratorResult<Uint8Array>) => void) | undefined;
        let signalSecondRead: () => void;
        const secondRead = new Promise<void>((resolve) => {
            signalSecondRead = resolve;
        });
        let reads = 0;
        const source = {
            [Symbol.asyncIterator]() {
                return {
                    next() {
                        if (reads++ === 0) return Promise.resolve({ done: false, value: new Uint8Array([42]) });
                        signalSecondRead();
                        return new Promise<IteratorResult<Uint8Array>>((resolve) => {
                            finishSource = resolve;
                        });
                    },
                };
            },
        };
        try {
            expect(instance.start(source)).toBe(0xffff_ffff);
            // The original read completes in microtasks while its cancellation
            // timer remains queued. Poll and begin the next copy before any timer.
            let event = 0;
            for (let turn = 0; turn < 64 && event === 0; turn++) {
                await Promise.resolve();
                event = instance.pollAndRead();
            }
            expect(event).not.toBe(0);
            expect(instance.lastPayload()).toBe(16); // one byte, COMPLETED
            expect(instance.byte()).toBe(42);
            await secondRead;
            // The marker runs after the old cancellation timer but before the
            // second copy's own cancellation timer, if one is requested below.
            const marker = new Promise<void>((resolve) => setTimeout(resolve, 0));
            if (cancelLater) expect(instance.cancel()).toBe(0xffff_ffff);
            await marker;
            expect(instance.poll()).toBe(0); // the second read is still pending
            if (cancelLater) {
                await new Promise<void>((resolve) => setTimeout(resolve, 0));
                expect(instance.poll()).not.toBe(0);
                expect(instance.lastPayload()).toBe(2); // CANCELLED, zero bytes
            } else {
                finishSource?.({ done: false, value: new Uint8Array([43]) });
                finishSource = undefined;
                let completed = 0;
                for (let turn = 0; turn < 64 && completed === 0; turn++) {
                    await Promise.resolve();
                    completed = instance.poll();
                }
                expect(completed).not.toBe(0);
                expect(instance.lastPayload()).toBe(16);
                expect(instance.byte()).toBe(43);
            }
        } finally {
            finishSource?.({ done: true, value: undefined });
            await cleanup();
        }
    },
);
