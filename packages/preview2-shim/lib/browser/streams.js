export function read(s, len) {
  console.log(`[streams] Read ${s}`);
}
export function blockingRead(s, len) {
  console.log(`[streams] Blocking read ${s}`);
}
export function skip(s, len) {
  console.log(`[streams] Skip ${s}`);
}
export function blockingSkip(s, len) {
  console.log(`[streams] Blocking skip ${s}`);
}
export function subscribeToInputStream(s) {
  console.log(`[streams] Subscribe to input stream ${s}`);
}
export function dropInputStream(s) {
  console.log(`[streams] Drop input stream ${s}`);
}
export function write(s, buf) {
  console.log(`[streams] Write ${s}`);
}
export function blockingWrite(s, buf) {
  console.log(`[streams] Blocking write ${s}`);
}
export function writeZeroes(s, len) {
  console.log(`[streams] Write zeroes ${s}`);
}
export function blockingWriteZeroes(s, len) {
  console.log(`[streams] Blocking write zeroes ${s}`);
}
export function splice(s, src, len) {
  console.log(`[streams] Splice ${s}`);
}
export function blockingSplice(s, src, len) {
  console.log(`[streams] Blocking splice ${s}`);
}
export function forward(s, src) {
  console.log(`[streams] Forward ${s}`);
}
export function subscribeToOutputStream(s) {
  console.log(`[streams] Subscribe to output stream ${s}`);
}
export function dropOutputStream(s) {
  console.log(`[streams] Drop output stream ${s}`);
}
