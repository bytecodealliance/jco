export function wallClockNow(clock) {
  if (clock === 1) {
    const seconds = BigInt(Math.floor(Date.now() / 1000));
    const nanoseconds = (Date.now() % 1000) * 1000 * 1000;
    return { seconds, nanoseconds };
  }
  console.log("[clocks] UNKNOWN CLOCK");
}

export function monotonicClockResolution(clock) {
  console.log(`[clocks] Monotonic clock resolution ${clock}`);
}

export function wallClockResolution(clock) {
  console.log(`[clocks] Wall clock resolution ${clock}`);
}

let hrStart = hrtimeBigint();

export function monotonicClockNow(clock) {
  if (clock === 0) {
    return hrtimeBigint() - hrStart;
  }
  console.log("UNKNOWN CLOCK");
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
