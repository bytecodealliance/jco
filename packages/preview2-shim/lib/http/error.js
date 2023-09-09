/**
 * @implements { import("../../types/imports/wasi-http-types").ErrorUnexpectedError }
 */
export class UnexpectedError extends Error {
  tag = "unexpected-error";
  /** @type string */ val;
  constructor(message = "unexpected-error") {
    super(message);
    this.val = message;
  }
}
