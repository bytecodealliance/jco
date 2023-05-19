export function now() {
  const seconds = BigInt(Math.floor(Date.now() / 1e3));
  const nanoseconds = (Date.now() % 1e3) * 1e6;
  return { seconds, nanoseconds };
}

export function resolution() {
  console.log(`[wall-clock] Wall clock resolution`);
}
