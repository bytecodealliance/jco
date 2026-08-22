import type {
    monotonicClock as MonotonicClockNamespace,
    wallClock as WallClockNamespace,
} from "../../types/clocks.js";
import { pollableCreate } from "./io.js";

const MAX_TIMEOUT_MS = 0x7fffffff;
const MAX_U64 = (1n << 64n) - 1n;

function checkedInstant(value: bigint, name: string): bigint {
    if (typeof value !== "bigint" || value < 0n || value > MAX_U64) {
        throw new TypeError(`${name} must be a valid u64`);
    }
    return value;
}

function timeout(durationNs: bigint): Promise<void> {
    let remainingMs = Number((durationNs + 999_999n) / 1_000_000n);
    return new Promise((resolve) => {
        const next = () => {
            if (remainingMs <= 0) {
                resolve();
                return;
            }
            const delay = Math.min(remainingMs, MAX_TIMEOUT_MS);
            remainingMs -= delay;
            setTimeout(next, delay);
        };
        next();
    });
}

export const monotonicClock: typeof MonotonicClockNamespace = {
    resolution(): bigint {
        // usually we dont get sub-millisecond accuracy in the browser
        // Note: is there a better way to determine this?
        return BigInt(1e6);
    },
    now(): bigint {
        // performance.now() is in milliseconds, but we want nanoseconds
        return BigInt(Math.floor(performance.now() * 1e6));
    },
    subscribeInstant(instant: bigint) {
        instant = checkedInstant(instant, "instant");
        const now = monotonicClock.now();
        if (instant <= now) {
            return pollableCreate();
        }
        return monotonicClock.subscribeDuration(instant - now);
    },
    subscribeDuration(duration: bigint) {
        duration = checkedInstant(duration, "duration");
        if (duration === 0n) {
            return pollableCreate();
        }
        return pollableCreate(timeout(duration));
    },
};

export const wallClock: typeof WallClockNamespace = {
    now() {
        let now = Date.now(); // in milliseconds
        const seconds = BigInt(Math.floor(now / 1e3));
        const nanoseconds = (now % 1e3) * 1e6;
        return { seconds, nanoseconds };
    },
    resolution() {
        return { seconds: 0n, nanoseconds: 1e6 };
    },
};
