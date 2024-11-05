// wasi:io/error@0.2.0 interface

// A resource which represents some error information.
//
// The only method provided by this resource is to-debug-string,
// which provides some human-readable information about the error.
export class IoError extends Error {
  #msg;
  constructor(msg) {
    super(msg);
    this.#msg;
  }
  // Returns a string that is suitable to assist humans in debugging
  // this error.
  toDebugString() {
    return this.#msg;
  }
};
