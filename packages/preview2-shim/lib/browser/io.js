export const streams = {
  read(s, len) {
    console.log(`[streams] Read ${s} ${len}`);
  },
  blockingRead(s, len) {
    console.log(`[streams] Blocking read ${s} ${len}`);
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
    streams.blockingWrite(s, buf);
  },
  blockingWrite(s, buf) {
    switch (s) {
      case 0:
        throw new Error(`TODO: write stdin`);
      case 1: {
        process.stdout.write(buf);
        return [BigInt(buf.byteLength), 'ended'];
      }
      case 2: {
        process.stderr.write(buf);
        return [BigInt(buf.byteLength), 'ended'];
      }
      default:
        throw new Error(`TODO: write ${s}`);
    }
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
