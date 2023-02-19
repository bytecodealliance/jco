export function dropInputStream(f) {
  console.log(`[io] Drop input stream ${f}`);
}

export function dropOutputStream(f) {
  console.log(`[io] Drop output stream ${f}`);
}

export function read(src, len) {
  console.log(`[io] Read ${src}`, len);
}

export function write(dst, buf) {
  switch (dst) {
    case 0:
      throw new Error(`TODO: write stdin`);
    case 1:
      process.stdout.write(buf);
      return BigInt(buf.byteLength);
    case 2:
      throw new Error(`TODO: write stdout`);
    default:
      throw new Error(`TODO: write ${dst}`);
  }
}

export function skip(src, len) {
  console.log(`[io] Skip ${src}`, len);
}

export function write_repeated(dst, byte, len) {
  console.log(`[io] Write repeated ${dst}`, byte, len);
}
