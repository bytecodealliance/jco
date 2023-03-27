export function read(s, len) {
  switch (s) {
    case 0:
      return [process.stdin.read(len), true];
    default:
      throw new Error(`TODO: write ${s}`);
  }
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
