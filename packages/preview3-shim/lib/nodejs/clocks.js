export { wallClock } from '@bytecodealliance/preview2-shim/clocks';
import { monotonicClock as monotonicClockV2 } from '@bytecodealliance/preview2-shim/clocks';

// eslint-disable-next-line no-unused-vars
const { subscribeInstant, subscribeDuration, ...baseMonotonicClock } =
    monotonicClockV2;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const monotonicClock = {
    ...baseMonotonicClock,

    async waitUntil(when) {
        const now = this.now();
        if (when <= now) return;

        const ms = Math.max(0, Number(when - this.now()) / 1e6);
        await sleep(ms);
    },

    async waitFor(howLong) {
        await sleep(Number(howLong) / 1e6);
    },
};
