export function assert(condition, tag, _val) {
  if (condition) {
    // TODO: throw meaningful errors
    // NOTE: wasmtime conformance tests are expecting a string here (a tag)
    throw tag;
  }
}
