
export function resolution(clock) {
  console.log(`[monotonic-clock] Monotonic clock resolution ${clock}`);
}

let hrStart = hrtimeBigint();

export function now(clock) {
  if (clock === 0) {
    return hrtimeBigint() - hrStart;
  }
  console.log(`[monotonic clock] Unknown clock ${clock}`);
}

function hrtime(previousTimestamp) {
  const baseNow = Math.floor((Date.now() - performance.now()) * 1e-3);
  const clocktime = performance.now() * 1e-3;
  let seconds = Math.floor(clocktime) + baseNow;
  let nanoseconds = Math.floor((clocktime % 1) * 1e9);

  if (previousTimestamp) {
    seconds = seconds - previousTimestamp[0];
    nanoseconds = nanoseconds - previousTimestamp[1];
    if (nanoseconds < 0) {
      seconds--;
      nanoseconds += 1e9;
    }
  }
  return [seconds, nanoseconds];
}

function hrtimeBigint(time) {
  const diff = hrtime(time);
  return BigInt(diff[0] * 1e9 + diff[1]);
}
