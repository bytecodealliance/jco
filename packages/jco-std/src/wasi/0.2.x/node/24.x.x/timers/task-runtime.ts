import type { RuntimeTimer } from "./runtime.js";
import { callHost } from "../internal/host-error.js";

interface TimerError {
  name: string;
  message: string;
  code?: string;
}
export interface TaskTimerHost {
  schedule(
    delayMs: number,
    repeat: boolean,
    callback: number,
  ): { tag: "ok"; val: number } | { tag: "err"; val: TimerError };
  cancel(id: number): void;
  setRef(id: number, referenced: boolean): void;
}
const callbacks = new Map<number, () => void>();
let nextCallback = 1;

export const timerCallbacks = {
  async dispatch(id: number): Promise<void> {
    callbacks.get(id)?.();
  },
};
export const timersCallbacks = timerCallbacks;

/** Host task timers for engines without a JavaScript task scheduler. */
export function createTaskTimerRuntime(host: TaskTimerHost) {
  return (
    callback: () => void,
    delay: number,
    kind: "timeout" | "interval" | "immediate",
  ): RuntimeTimer => {
    const key = nextCallback++;
    const repeat = kind === "interval";
    callbacks.set(key, () => {
      if (!repeat) {
        callbacks.delete(key);
      }
      callback();
    });
    let id: number;
    try {
      id = callHost(
        () => host.schedule(delay, repeat, key),
        (error) => Object.assign(new Error(error.message), error),
      );
    } catch (error) {
      callbacks.delete(key);
      throw error;
    }
    return {
      cancel() {
        callbacks.delete(key);
        host.cancel(id);
      },
      setRef(referenced) {
        host.setRef(id, referenced);
      },
    };
  };
}
