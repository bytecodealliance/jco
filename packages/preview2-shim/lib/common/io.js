export class IgnoreStream {
  read (_len) {
    return [new Uint8Array([]), 'ended'];
  }
  write (_bytes) {
  }
}

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
      checkWrite(_s) {
        // TODO: implement
        return 1000000n;
      },
      write(s, buf) {
        io.getStream(s).write(buf);
      },
      blockingWriteAndFlush(s, buf) {
        // TODO: flush
        io.getStream(s).write(buf);
      },
      flush(_s) {
        // TODO: flush
      },
      blockingFlush(_s) {
        // TODO: implement
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

  createStream (stream) {
    this.streamEntries[this.streamCnt] = stream;
    return this.streamCnt++;
  }
  
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
