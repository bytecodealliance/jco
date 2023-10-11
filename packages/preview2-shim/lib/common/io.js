export class IgnoreStream {
  read (_len) {
    return [new Uint8Array([]), 'ended'];
  }
  write (_bytes) {
  }
}

/**
 * @typedef {{ read: (len: number) => [Uint8Array, 'open' | 'ended'], drop?: () => {} }} ReadableStream
 * @typedef {{ write: (buf: Uint8Array) {}, drop?: () => {}, flush?: () => {}, check?: () => BigInt }} WriteableStream
 */

// NOTE: pending asyncify work, all stream methods are synchronous and blocking
export class Io {
  constructor (
    stdout = new IgnoreStream(),
    stderr = new IgnoreStream(),
    stdin = new IgnoreStream()
  ) {
    this.streamCnt = 3;
    this.streamEntries = {
      0: stdin,
      1: stdout,
      2: stderr
    }

    const io = this;
    this.streams = {
      read(s, len) {
        return io.getStream(s).read(len);
      },
      blockingRead(s, len) {
        return io.getStream(s).read(len);
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
        io.dropStream(s);
      },
      checkWrite(s) {
        return io.getStream(s).check() || 1000_000n;
      },
      write(s, buf) {
        io.getStream(s).write(buf);
      },
      blockingWriteAndFlush(s, buf) {
        const stream = io.getStream(s);
        stream.write(buf);
        if (stream.flush)
          stream.flush();
      },
      flush(s) {
        const stream = io.getStream(s);
        if (stream.flush)
          stream.flush();
      },
      blockingFlush(s) {
        const stream = io.getStream(s);
        if (stream.flush)
          stream.flush();
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
        io.dropStream(s);
      }
    };
  }

  /**
   * 
   * @param {ReadableStream | WriteableStream} stream 
   * @returns {number}
   */
  createStream (stream) {
    this.streamEntries[this.streamCnt] = stream;
    return this.streamCnt++;
  }
  
  /**
   * @param {number} sid 
   * @returns {ReadableStream | WriteableStream}
   */
  getStream (sid) {
    const stream = this.streamEntries[sid];
    if (!stream) throw new Error();
    return stream;
  }

  dropStream (sid) {
    const stream = this.streamEntries[sid];
    if (stream.drop) stream.drop();
    delete this.streamEntries[sid];
  }
}
