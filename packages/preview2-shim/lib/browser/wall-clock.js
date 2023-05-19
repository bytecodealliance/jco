export function now() {
  const seconds = BigInt(Math.floor(Date.now() / 1000));
  const nanoseconds = (Date.now() % 1000) * 1000 * 1000;
  return { seconds, nanoseconds };
}

export function resolution() {
  console.log(`[wall-clock] Wall clock resolution`);
}
