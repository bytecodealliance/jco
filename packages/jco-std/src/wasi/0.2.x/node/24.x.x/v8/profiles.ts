import { call } from "./errors.js";
import type {
  V8Host,
  Profile,
  GCProfilerResult,
  SyncCPUProfileHandle,
  ProfilesModule,
} from "./types.js";

export function createProfiles(host: V8Host): ProfilesModule {
  class GCProfiler {
    #profile: Profile | undefined;

    start(): void {
      this.#profile ??= call(() => host.startProfile(false));
    }

    stop(): GCProfilerResult | undefined {
      const profile = this.#profile;

      if (!profile) {
        return undefined;
      }

      this.#profile = undefined;

      try {
        const result = call(() => profile.stop());

        return result === undefined ? undefined : JSON.parse(result);
      } finally {
        host.releaseProfile(profile);
      }
    }

    [Symbol.dispose](): void {
      this.stop();
    }
  }

  function startCpuProfile(): SyncCPUProfileHandle {
    const profile = call(() => host.startProfile(true));
    let stopped = false;

    return {
      stop(): string | undefined {
        if (stopped) {
          return undefined;
        }

        stopped = true;

        try {
          return call(() => profile.stop());
        } finally {
          host.releaseProfile(profile);
        }
      },

      [Symbol.dispose](): void {
        this.stop();
      },
    };
  }

  return { GCProfiler, startCpuProfile };
}
