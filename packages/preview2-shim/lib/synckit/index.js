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

function extractProperties(object) {
  if (object && typeof object === "object") {
    const properties = {};
    for (const key in object) {
      properties[key] = object[key];
    }
    return properties;
  }
}

const CALL_TIMEOUT = undefined;

export function createSyncFn(workerPath, debug, callbackHandler) {
  if (!path.isAbsolute(workerPath)) {
    throw new Error("`workerPath` must be absolute");
  }
  const { port1: mainPort, port2: workerPort } = new MessageChannel();
  const worker = new Worker(workerPath, {
    workerData: { workerPort, debug },
    transferList: [workerPort],
    execArgv: []
  });
  worker.on('message', ({ type, id, payload }) => {
    if (!type)
      throw new Error('Internal error: Expected a type of a worker callback');
    callbackHandler(type, id, payload);
  });
  let nextID = 0;
  const syncFn = (...args) => {
    const cid = nextID++;
    const sharedBuffer = new SharedArrayBuffer(DEFAULT_WORKER_BUFFER_SIZE);
    const sharedBufferView = new Int32Array(sharedBuffer);
    const msg = { sharedBuffer, cid, args };
    worker.postMessage(msg);
    const status = Atomics.wait(sharedBufferView, 0, 0, CALL_TIMEOUT);
    if (!["ok", "not-equal"].includes(status)) {
      throw new Error("Internal error: Atomics.wait() failed: " + status);
    }
    const {
      cid: cid2,
      result,
      error,
      properties,
    } = receiveMessageOnPort(mainPort).message;
    if (cid !== cid2) {
      throw new Error(`Internal error: Expected id ${cid} but got id ${cid2}`);
    }
    if (error) {
      if (error instanceof Error) throw Object.assign(error, properties);
      throw error;
    }
    return result;
  };
  if (worker.unref) worker.unref();
  return syncFn;
}

export function runAsWorker(fn) {
  if (!workerData) {
    return;
  }
  const { workerPort, debug } = workerData;
  try {
    parentPort.on("message", ({ sharedBuffer, cid, args }) => {
      (async () => {
        const sharedBufferView = new Int32Array(sharedBuffer);
        let msg;
        try {
          msg = { cid, result: await fn(...args) };
        } catch (error) {
          msg = { cid, error, properties: extractProperties(error) };
        }
        workerPort.postMessage(msg);
        Atomics.add(sharedBufferView, 0, 1);
        Atomics.notify(sharedBufferView, 0);
      })();
    });
  } catch (error) {
    parentPort.on("message", ({ sharedBuffer, cid }) => {
      const sharedBufferView = new Int32Array(sharedBuffer);
      workerPort.postMessage({
        cid,
        error,
        properties: extractProperties(error),
      });
      Atomics.add(sharedBufferView, 0, 1);
      Atomics.notify(sharedBufferView, 0);
    });
  }
  return debug;
}
