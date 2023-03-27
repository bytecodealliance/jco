export function read(s, len) {
  console.log(`[io] Read ${s} ${len}`);
}

export function write(s, buf) {
  switch (s) {
    case 0:
      throw new Error(`TODO: write stdin`);
    case 1: {
      const decoder = new TextDecoder();
      console.log(decoder.decode(buf));
      return BigInt(buf.byteLength);
    }
    case 2: {
      const decoder = new TextDecoder();
      console.error(decoder.decode(buf));
      return BigInt(buf.byteLength);
    }
    default:
      throw new Error(`TODO: write ${s}`);
  }
}
