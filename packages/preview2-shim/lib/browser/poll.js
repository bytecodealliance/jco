let polls = {};
let pollCnt = 1;

let timer = null, timerInterval = 10, watching = new Set();
function intervalCheck () {
  for (const entry of watching) {
    if (entry.settled) {
      entry.resolvePromise();
      entry.promise = entry.resolvePromise = null;
      watching.delete(entry);
    }
  }
  if (watching.size === 0) {
    clearInterval(timer);
    timer = null;
  }
}

export function _createPollable (promise) {
  const entry = { settled: false, promise: null, resolvePromise: null };
  promise.finally(() => entry.settled = true);
  polls[pollCnt] = entry;
  return pollCnt++;
}

export function _pollablePromise (pollable, maxInterval) {
  const entry = polls[pollable];
  if (entry.settled) return Promise.resolve();
  if (!entry.promise)
    entry.promise = new Promise(resolve => entry.resolvePromise = resolve);
  watching.add(entry);
  if (maxInterval) {
    if (timerInterval > maxInterval) {
      clearInterval(timer);
      timer = null;
      timerInterval = maxInterval;
    }
  }
  if (!timer)
    timer = setInterval(intervalCheck, timerInterval);
  return entry.promise;
}

export const poll = {
  dropPollable (pollable) {
    const entry = polls[pollable];
    watching.delete(entry);
    delete polls[pollable];
  },
  pollOneoff (from) {
    return from.map(pollable => polls[pollable].settled);
  }
};
