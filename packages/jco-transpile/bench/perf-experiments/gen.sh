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
rm -rf "$OUT"
for component in numbers strings lists records; do
  args=(
    "--map=wasi:cli/*=@bytecodealliance/preview2-shim/cli#*"
    "--map=wasi:clocks/*=@bytecodealliance/preview2-shim/clocks#*"
    "--map=wasi:filesystem/*=@bytecodealliance/preview2-shim/filesystem#*"
    "--map=wasi:io/*=@bytecodealliance/preview2-shim/io#*"
    "--map=wasi:random/*=@bytecodealliance/preview2-shim/random#*"
    "--map=test:$component/*=$HERE/hosts.mjs#$component"
  )
  if [ "$RUNTIME" != embedded ]; then
    args+=("--runtime=file://$RUNTIME/")
  fi
  "$ROOT/target/debug/examples/transpile" "$FIXTURES/$component.component.wasm" "$OUT/$component" "${args[@]}" ${EXTRA[@]+"${EXTRA[@]}"}
done
