const MAX_BYTES = 65536;

export function getRandomBytes(len) {
  const bytes = new Uint8Array(Number(len));

  if (len > MAX_BYTES) {
    // this is the max bytes crypto.getRandomValues
    // can do at once see https://developer.mozilla.org/en-US/docs/Web/API/window.crypto.getRandomValues
    for (var generated = 0; generated < len; generated += MAX_BYTES) {
      // buffer.slice automatically checks if the end is past the end of
      // the buffer so we don't have to here
      crypto.getRandomValues(bytes.slice(generated, generated + MAX_BYTES));
    }
  } else {
    crypto.getRandomValues(bytes);
  }

  return bytes;
}

export function getRandomU64 () {
  return crypto.getRandomValues(new BigUint64Array(1))[0];
}

let insecureRandomValue1, insecureRandomValue2;
export function insecureRandom () {
  if (insecureRandomValue1 === undefined) {
    insecureRandomValue1 = getRandomU64();
    insecureRandomValue2 = getRandomU64();
  }
  return [insecureRandomValue1, insecureRandomValue2];
}
