#!/usr/bin/env bash
# Transpile the benchmark fixtures against one runtime.
#
# usage: gen.sh <variant-name> <runtime-dist-dir | embedded> [transpile flags]
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../../.." && pwd)"
VARIANT="$1"
RUNTIME="$2"
EXTRA=("${@:3}")
OUT="$HERE/../output/perf/$VARIANT"
FIXTURES="$ROOT/packages/jco-transpile/test/fixtures/components/runtime"
P3_FIXTURES="$ROOT/packages/jco-transpile/test/fixtures/components/p3"
rm -rf "$OUT"
wasi=(
  "--map=wasi:cli/*=@bytecodealliance/preview2-shim/cli#*"
  "--map=wasi:clocks/*=@bytecodealliance/preview2-shim/clocks#*"
  "--map=wasi:filesystem/*=@bytecodealliance/preview2-shim/filesystem#*"
  "--map=wasi:io/*=@bytecodealliance/preview2-shim/io#*"
  "--map=wasi:random/*=@bytecodealliance/preview2-shim/random#*"
)
if [ "$RUNTIME" != embedded ]; then
  wasi+=("--runtime=file://$RUNTIME/")
fi

# Synchronous calls.
for component in numbers strings lists records; do
  args=("${wasi[@]}" "--map=test:$component/*=$HERE/hosts.mjs#$component")
  "$ROOT/target/debug/examples/transpile" "$FIXTURES/$component.component.wasm" "$OUT/$component" "${args[@]}" ${EXTRA[@]+"${EXTRA[@]}"}
done

# Asynchronous calls, streams and futures.
for fixture in round-trip/async-round-trip-stackless streams/async-closed-streams \
  general/async-readiness general/async-synchronous-transmit; do
  component="$(basename "$fixture")"
  args=("${wasi[@]}" --jspi "--map=local:local/*=$HERE/hosts.mjs#p3")
  "$ROOT/target/debug/examples/transpile" "$P3_FIXTURES/$fixture.wasm" "$OUT/$component" "${args[@]}" ${EXTRA[@]+"${EXTRA[@]}"}
done
