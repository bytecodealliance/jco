import { readSync as fsReadSync } from 'node:fs';
import { _convertFsError } from './filesystem.js';

export let _streams = {};
let streamCnt = 0;
export function _createFileStream(fd, offset) {
  // note we only support offset 0
  if (Number(offset) === 0)
    _streams[streamCnt++] = {
      type: 'file',
      fd: fd
    };
}

export function read(s, len) {
  switch (s) {
    case 0:
      return [process.stdin.read(len), true];
    default:
      throw new Error(`TODO: write ${s}`);
  }
}
export function blockingRead(s, len) {
  len = Number(len);
  const stream = _streams[s];
  if (!stream) throw null;
  switch (stream.type) {
    case 'file':
      const buf = Buffer.alloc(Number(len));
      try {
        const readBytes = fsReadSync(stream.fd, buf, 0, Number(len));
        if (readBytes < Number(len))
          return [new Uint8Array(), true];
        return [new Uint8Array(buf.buffer, 0, readBytes), false];
      }
      catch (e) {
        // stream error still todo
        console.error(e);
        throw {};
      }
    default: throw null;
  }
  console.log(`[streams] Blocking read ${s} - ${_len}`);

}
export function skip(s, _len) {
  console.log(`[streams] Skip ${s}`);
}
export function blockingSkip(s, _len) {
  console.log(`[streams] Blocking skip ${s}`);
}
export function subscribeToInputStream(s) {
  console.log(`[streams] Subscribe to input stream ${s}`);
}
export function dropInputStream(s) {
  delete _streams[s];
}
export function write(s, buf) {
  switch (s) {
    case 0:
      throw new Error(`TODO: write stdin`);
    case 1: {
      process.stdout.write(buf);
      return BigInt(buf.byteLength);
    }
    case 2: {
      process.stderr.write(buf);
      return BigInt(buf.byteLength);
    }
    default:
      throw new Error(`TODO: write ${s}`);
  }
}
export function blockingWrite(s, _buf) {
  console.log(`[streams] Blocking write ${s}`);
}
export function writeZeroes(s, _len) {
  console.log(`[streams] Write zeroes ${s}`);
}
export function blockingWriteZeroes(s, _len) {
  console.log(`[streams] Blocking write zeroes ${s}`);
}
export function splice(s, _src, _len) {
  console.log(`[streams] Splice ${s}`);
}
export function blockingSplice(s, _src, _len) {
  console.log(`[streams] Blocking splice ${s}`);
}
export function forward(s, _src) {
  console.log(`[streams] Forward ${s}`);
}
export function subscribeToOutputStream(s) {
  console.log(`[streams] Subscribe to output stream ${s}`);
}
export function dropOutputStream(s) {
  console.log(`[streams] Drop output stream ${s}`);
}
