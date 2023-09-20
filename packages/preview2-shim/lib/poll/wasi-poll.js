import { PollablePromise } from "./pollable-promise.js";

/** @type { PollablePromise[] } */
let polls = [];
let pollCnt = 1;

let timer = null, timerInterval = 10, watching = new Set();
function intervalCheck () {
  for (const entry of watching) {
    if (entry.settled) {
      watching.delete(entry);
    }
  }
  if (watching.size === 0) {
    clearInterval(timer);
    timer = null;
  }
}

export function _createPollable (executor) {
  const promise = new PollablePromise(executor);
  polls[pollCnt] = promise;
  return pollCnt++;
}

export function _pollablePromise (pollable, maxInterval) {
  const entry = polls[pollable];
  if (entry.settled) return Promise.resolve();
  watching.add(entry);
  entry.execute();
  if (maxInterval) {
    if (timerInterval > maxInterval) {
      clearInterval(timer);
      timer = null;
      timerInterval = maxInterval;
    }
  }
  if (!timer)
    timer = setInterval(intervalCheck, timerInterval);
  return entry;
}

export function _getResult (pollable) {
  const entry = polls[pollable];
  return entry.value ?? entry.error;
}

export function _dropPollable (pollable) {
  const entry = polls[pollable];
  watching.delete(entry);
  delete polls[pollable];
}

export function _pollOneoff (from) {
  const result = [];
  Promise.all(from.map(id => {
    _pollablePromise(id, 1000);
  }));
  for (const id of from) {
    const pollable = polls[id];
    result.push(pollable.settled);
  }
  return result;
}
