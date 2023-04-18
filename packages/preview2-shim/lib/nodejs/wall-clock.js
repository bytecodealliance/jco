export function now(clock) {
  if (clock === 1) {
    const seconds = BigInt(Math.floor(Date.now() / 1000));
    const nanoseconds = (Date.now() % 1000) * 1000 * 1000;
    return { seconds, nanoseconds };
  }
  console.log(`[wall-clock] now() UNKNOWN CLOCK ${clock}`);
}

export function resolution(clock) {
  console.log(`[wall-clock] Wall clock resolution ${clock}`);
}
