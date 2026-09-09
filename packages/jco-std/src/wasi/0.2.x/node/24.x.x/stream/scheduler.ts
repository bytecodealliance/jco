/** Guest-local scheduling for readable-stream's process.nextTick dependency. */
const queue: Array<() => void> = [];
let scheduled = false;

function flush(): void {
  try {
    while (queue.length) {
      queue.shift()!();
    }
  } finally {
    scheduled = false;
    if (queue.length) {
      schedule();
    }
  }
}

function schedule(): void {
  if (scheduled) {
    return;
  }
  scheduled = true;
  queueMicrotask(flush);
}

export function nextTick<T extends unknown[]>(callback: (...args: T) => void, ...args: T): void {
  queue.push((): void => callback(...args));
  schedule();
}

// The core compares destinations with these identities solely to avoid ending
// host stdio. Guest streams have no implicit process or stdio capability.
const scheduler = { nextTick, stdout: undefined, stderr: undefined };
export default scheduler;
