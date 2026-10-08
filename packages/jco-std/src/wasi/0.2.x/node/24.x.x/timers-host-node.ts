import { createCallbackQueue } from "./internal/callback-resource.js";
import type { TaskTimerHost } from "./timers/task-runtime.js";

/** Bind one Node timer provider to one component's exported callbacks. */
export function createTimersHost(
  callbacks: () => { dispatch(id: number): void | Promise<void> },
): TaskTimerHost & Disposable {
  const handles = new Map<number, ReturnType<typeof setTimeout>>();
  const enqueue = createCallbackQueue();
  let nextId = 1;
  return {
    schedule(delay, repeat, callback) {
      const id = nextId++;
      const run = () => {
        if (!repeat) {
          handles.delete(id);
        }
        void enqueue(() => callbacks().dispatch(callback)).catch((error) => {
          console.error(error);
        });
      };
      handles.set(id, repeat ? setInterval(run, delay) : setTimeout(run, delay));
      return { tag: "ok", val: id };
    },
    cancel(id) {
      const timer = handles.get(id);
      if (timer) {
        clearTimeout(timer);
        handles.delete(id);
      }
    },
    setRef(id, referenced) {
      const timer = handles.get(id);
      if (timer) {
        if (referenced) {
          timer.ref();
        } else {
          timer.unref();
        }
      }
    },
    [Symbol.dispose]() {
      for (const timer of handles.values()) {
        clearTimeout(timer);
      }
      handles.clear();
    },
  };
}
