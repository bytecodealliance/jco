// Based on: https://github.com/un-ts/synckit
/*
MIT License

Copyright (c) 2021 UnTS

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

import path from "node:path";
import {
  MessageChannel,
  Worker,
  receiveMessageOnPort,
  workerData,
  parentPort,
} from "node:worker_threads";

const DEFAULT_WORKER_BUFFER_SIZE = 1024;
const syncFnCache = new Map();

function extractProperties(object) {
  if (object && typeof object === "object") {
    const properties = {};
    for (const key in object) {
      properties[key] = object[key];
    }
    return properties;
  }
}

export function createSyncFn(workerPath, bufferSizeOrOptions, timeout) {
  if (!path.isAbsolute(workerPath)) {
    throw new Error("`workerPath` must be absolute");
  }
  const cachedSyncFn = syncFnCache.get(workerPath);
  if (cachedSyncFn) {
    return cachedSyncFn;
  }
  const syncFn = startWorkerThread(
    workerPath,
    typeof bufferSizeOrOptions === "number"
      ? { bufferSize: bufferSizeOrOptions, timeout }
      : bufferSizeOrOptions
  );
  syncFnCache.set(workerPath, syncFn);
  return syncFn;
}

function startWorkerThread(
  workerPath,
  {
    bufferSize = DEFAULT_WORKER_BUFFER_SIZE,
    timeout = undefined,
    execArgv = [],
  } = {}
) {
  const { port1: mainPort, port2: workerPort } = new MessageChannel();
  const worker = new Worker(workerPath, {
    workerData: { workerPort },
    transferList: [workerPort],
    execArgv: execArgv,
  });
  let nextID = 0;
  const syncFn = (...args) => {
    const id = nextID++;
    const sharedBuffer = new SharedArrayBuffer(bufferSize);
    const sharedBufferView = new Int32Array(sharedBuffer);
    const msg = { sharedBuffer, id, args };
    worker.postMessage(msg);
    const status = Atomics.wait(sharedBufferView, 0, 0, timeout);
    if (!["ok", "not-equal"].includes(status)) {
      throw new Error("Internal error: Atomics.wait() failed: " + status);
    }
    const {
      id: id2,
      result,
      error,
      properties,
    } = receiveMessageOnPort(mainPort).message;
    if (id !== id2) {
      throw new Error(`Internal error: Expected id ${id} but got id ${id2}`);
    }
    if (error) {
      throw Object.assign(error, properties);
    }
    return result;
  };
  worker.unref();
  return syncFn;
}

export function runAsWorker(fn) {
  if (!workerData) {
    return;
  }
  const { workerPort } = workerData;
  try {
    parentPort.on("message", ({ sharedBuffer, id, args }) => {
      (async () => {
        const sharedBufferView = new Int32Array(sharedBuffer);
        let msg;
        try {
          msg = { id, result: await fn(...args) };
        } catch (error) {
          msg = { id, error, properties: extractProperties(error) };
        }
        workerPort.postMessage(msg);
        Atomics.add(sharedBufferView, 0, 1);
        Atomics.notify(sharedBufferView, 0);
      })();
    });
  } catch (error) {
    parentPort.on("message", ({ sharedBuffer, id }) => {
      const sharedBufferView = new Int32Array(sharedBuffer);
      workerPort.postMessage({
        id,
        error,
        properties: extractProperties(error),
      });
      Atomics.add(sharedBufferView, 0, 1);
      Atomics.notify(sharedBufferView, 0);
    });
  }
}
