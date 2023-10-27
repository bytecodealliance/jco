export function assert(condition, code, message) {
  if (condition) {
    const ex = new Error(message);
    ex.name = "Error";
    ex.message = message;
    ex.code = code;
    throw ex;
  }
}
