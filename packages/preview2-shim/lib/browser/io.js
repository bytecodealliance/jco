// buffer until the next newline
class NewlineBufferStream {
  constructor (handler) {
    this.bufferLen = 0;
    this.bufferCapacity = 1024;
    this.buffer = new Uint8Array(1024);
    this.handler = handler;
  }
  write (bytes) {
    const newlineIdx = bytes.lastIndexOf(10);
    if (newlineIdx === -1) {
      this.#addToBuffer(bytes);
    } else {
      this.#addToBuffer(bytes.slice(0, newlineIdx + 1));
      this.handler(new TextDecoder().decode(this.buffer.slice(0, this.bufferLen)));
      this.bufferLen = 0;
      this.#addToBuffer(bytes.slice(newlineIdx + 1));
    }
  }
  #addToBuffer (bytes) {
    if (bytes.byteLength + this.bufferLen > this.bufferCapacity) {
      this.bufferCapacity *= 2;
      const buffer = new Uint8Array(this.bufferCapacity);
      buffer.set(this.buffer);
      this.buffer = buffer;
    }
    this.buffer.set(bytes, this.bufferLen);
    this.bufferLen += bytes.byteLength;
  }
}

class IgnoreStream {
  read () {
    return [new Uint8Array([]), 'ended'];
  }
  write () {}
}

export function createStream (stream) {
  streamEntries[streamCnt] = stream;
  return streamCnt++;
}

export function getStream (sid) {
  const stream = streamEntries[sid];
  if (!stream) throw new Error();
  return stream;
}

export function dropStream (sid) {
  delete streamEntries[sid];
}

let streamCnt = 3;
const streamEntries = {
  0: new IgnoreStream(),
  1: new NewlineBufferStream(console.log.bind(console)),
  2: new NewlineBufferStream(console.error.bind(console)),
};

export function _setStdout (stdout) {
  streamEntries[1] = stdout;
}

export function _setStderr (stderr) {
  streamEntries[2] = stderr;
}

export function _setStdin (stdin) {
  streamEntries[0] = stdin;
}

export const streams = {
  read(s, len) {
    return getStream(s).read(len);
  },
  blockingRead(s, len) {
    return getStream(s).read(len);
  },
  skip(s, _len) {
    console.log(`[streams] Skip ${s}`);
  },
  blockingSkip(s, _len) {
    console.log(`[streams] Blocking skip ${s}`);
  },
  subscribeToInputStream(s) {
    console.log(`[streams] Subscribe to input stream ${s}`);
  },
  dropInputStream(s) {
    console.log(`[streams] Drop input stream ${s}`);
  },
  write(s, buf) {
    return [BigInt(getStream(s).write(buf)), 'ended'];
  },
  blockingWrite(s, buf) {
    return [BigInt(getStream(s).write(buf)), 'ended'];
  },
  writeZeroes(s, _len) {
    console.log(`[streams] Write zeroes ${s}`);
  },
  blockingWriteZeroes(s, _len) {
    console.log(`[streams] Blocking write zeroes ${s}`);
  },
  splice(s, _src, _len) {
    console.log(`[streams] Splice ${s}`);
  },
  blockingSplice(s, _src, _len) {
    console.log(`[streams] Blocking splice ${s}`);
  },
  forward(s, _src) {
    console.log(`[streams] Forward ${s}`);
  },
  subscribeToOutputStream(s) {
    console.log(`[streams] Subscribe to output stream ${s}`);
  },
  dropOutputStream(s) {
    console.log(`[streams] Drop output stream ${s}`);
  }
};
