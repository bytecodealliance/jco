export class UnexpectedError extends Error {
  /** @type { import("../types/http").HttpErrorUnexpectedError } */
  payload;
  constructor(message = "unexpected-error") {
    super(message);
    this.payload = {
      tag: "unexpected-error",
      val: message,
    };
  }
}
