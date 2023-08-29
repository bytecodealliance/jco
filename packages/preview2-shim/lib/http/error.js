export class UnexpectedError extends Error {
  /** @type { import("../../types/imports/wasi-http-types").ErrorUnexpectedError } */
  payload;
  constructor(message = "unexpected-error") {
    super(message);
    this.payload = {
      tag: "unexpected-error",
      val: message,
    };
  }
}
