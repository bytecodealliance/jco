import { PollablePromise } from "./pollable-promise.js";

/** @type { PollablePromise[] } */
let polls = [];
let pollCnt = 1;

let timerInterval = 10, watching = new Set();

export function _createPollable (executor) {
  console.warn("TEST_23");
  const promise = new PollablePromise(executor);
  polls[pollCnt] = promise;
  console.warn("TEST_35");
  return pollCnt++;
}

export function _pollablePromise (pollable, maxInterval) {
  console.warn("TEST_28");
  const entry = polls[pollable];
  if (entry.settled) return Promise.resolve();
  watching.add(entry);
  entry.execute();
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
  return entry;
}

export function _getResult (pollable) {
  console.warn("TEST_54");
  const entry = polls[pollable];
  return entry.value ?? entry.error;
}

export function _dropPollable (pollable) {
  const entry = polls[pollable];
  watching.delete(entry);
  delete polls[pollable];
};

export function _pollOneoff (from) {
  const result = [];
  Promise.all(from.map(id => {
    const _ = _pollablePromise(id, 1000);
  }));
  for (const id of from) {
    const pollable = polls[id];
    // let counter = 0;
    // console.warn("TEST_73")
    // while (!pollable.settled && counter < 5) { //pollable.state === PollablePromiseStateEnum.PENDING) {
    //   Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200);
    //   counter++;
    // }
    result.push(pollable.settled);
  }
  return result;
};
