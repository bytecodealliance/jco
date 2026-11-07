import type { AsyncTaskModule, ThreadStartPlatform, ThreadStartChecks } from '../../runtime.js';

export const initializeTasksByComponent: AsyncTaskModule['initializeTasksByComponent'] = () => new Map();

export const initializeCurrentTaskIds: AsyncTaskModule['initializeCurrentTaskIds'] = () => [];

export const initializeCurrentComponentIdxs: AsyncTaskModule['initializeCurrentComponentIdxs'] = () => [];

export const initializeSymmetricSyncGuestCallStack: AsyncTaskModule['initializeSymmetricSyncGuestCallStack'] = () => [];

export const initializeCurrentTaskMayBlock: AsyncTaskModule['initializeCurrentTaskMayBlock'] = (platform) => {
    if (platform === false) {
        return false;
    }
    const Global = platform.Global;
    if (!Global) {
        throw new TypeError('async task registers require WebAssembly.Global');
    }
    return new Global({ value: 'i32', mutable: true }, 0);
};

export const initializeAsyncBlockingCallDepth: AsyncTaskModule['initializeAsyncBlockingCallDepth'] = (platform) => {
    if (platform === false) {
        return { value: 0 };
    }
    const Global = platform.Global;
    if (!Global) {
        throw new TypeError('async task registers require WebAssembly.Global');
    }
    return new Global({ value: 'i32', mutable: true }, 0);
};

export function initializeThreadStartChecks(platform: ThreadStartPlatform): ThreadStartChecks {
    return {
        platform,
        checked: new WeakSet(),
        typeCheck: new platform.Module(
            new Uint8Array([
                0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x05, 0x01, 0x60, 0x01, 0x7f, 0x00, 0x02, 0x06,
                0x01, 0x00, 0x01, 0x66, 0x00, 0x00,
            ]),
        ),
    };
}
