/** Randomness bridge for engines without WebCrypto globals. */
export function createRandomCrypto(getRandomBytes: (length: bigint) => Uint8Array) {
  return {
    getRandomValues<T extends ArrayBufferView>(view: T): T {
      if (
        !ArrayBuffer.isView(view) ||
        view instanceof DataView ||
        view instanceof Float32Array ||
        view instanceof Float64Array
      ) {
        throw new TypeError("The data argument must be an integer-type TypedArray");
      }
      if (view.byteLength > 65536) {
        throw Object.assign(new Error("The requested length exceeds 65,536 bytes"), {
          name: "QuotaExceededError",
        });
      }
      new Uint8Array(view.buffer, view.byteOffset, view.byteLength).set(
        getRandomBytes(BigInt(view.byteLength)),
      );
      return view;
    },
    randomUUID(): string {
      const bytes = getRandomBytes(16n);
      bytes[6] = (bytes[6] & 15) | 64;
      bytes[8] = (bytes[8] & 63) | 128;
      const text = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
      return `${text.slice(0, 8)}-${text.slice(8, 12)}-${text.slice(12, 16)}-${text.slice(16, 20)}-${text.slice(20)}`;
    },
  };
}
