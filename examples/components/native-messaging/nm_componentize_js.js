//! componentize-js Native Messaging host
//! guest271314, andreiltd (https://github.com/andreiltd), 6-13-2026
//! Based on nm_componentize_qjs.js
//! https://github.com/andreiltd/componentize-qjs/issues/1

import { getStdin } from "wasi:cli/stdin@0.2.10";
import { getStdout } from "wasi:cli/stdout@0.2.10";

const WRITE_CHUNK = 4096;
const FRAME = 1024 * 1024;
const COMMA = 0x2c,
  OPEN = 0x5b,
  CLOSE = 0x5d;

function readExact(input, n) {
  const out = new Uint8Array(n);
  let off = 0;
  while (off < n) {
    try {
      const chunk = input.blockingRead(BigInt(n - off));      
      if (!chunk || chunk.length === 0) {
        return null;
      }     
      out.set(chunk, off);
      off += chunk.length;
    } catch (error) {
      return null;
    }
  }
  return out;
}

function readMessage(input) {
  const header = readExact(input, 4);
  if (header === null) return null;
  
  const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
  const len = view.getUint32(0, true);
  
  return len === 0 ? new Uint8Array(0) : readExact(input, len);
}

function writeAll(output, data) {
  for (let off = 0; off < data.length; off += WRITE_CHUNK) {
    output.blockingWriteAndFlush(data.subarray(off, off + WRITE_CHUNK));
  }
}

function writeFrame(output, body) {
  const frame = new Uint8Array(4 + body.length);
  const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
  view.setUint32(0, body.length, true);
  frame.set(body, 4);
  writeAll(output, frame);
}

function sendMessage(output, msg) {
  if (msg.length <= FRAME) {
    writeFrame(output, msg);
    return;
  }
  // Handle 64 MiB JSON Array message input, 1 MiB JSON Array output
  for (let i = 1, end = msg.length - 1; i < end;) {
    let j = i + FRAME - 16;
    if (j >= end) j = end;
    else {
      const c = msg.indexOf(COMMA, j);
      j = c === -1 ? end : c;
    }
    const body = new Uint8Array(2 + (j - i));
    body[0] = OPEN;
    body.set(msg.subarray(i, j), 1);
    body[body.length - 1] = CLOSE;
    writeFrame(output, body);
    i = j + 1;
  }
}

export const run = {
  run() {
    const input = getStdin();
    const output = getStdout();
    
    for (let msg; (msg = readMessage(input)) !== null;) {
      sendMessage(output, msg);
    }  
    return;
  },
};
