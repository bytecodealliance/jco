
export function resolution(clock) {
  console.log(`[monotonic-clock] Monotonic clock resolution ${clock}`);
}

function _hrtimeBigint () {
  return BigInt(Math.floor(performance.now() * 1e9));
}

let _hrStart = _hrtimeBigint();

export function now () {
  return _hrtimeBigint() - _hrStart;
}
