;; Measure the cost of flushing native context around ordinary host calls.
(component
  (import "pause" (func $pause))
  (core func $pause (canon lower (func $pause)))
  (core func $get0 (canon context.get i32 0))
  (core func $set0 (canon context.set i32 0))
  (core module $m
    (import "" "pause" (func $pause))
    (import "" "get0" (func $get0 (result i32)))
    (import "" "set0" (func $set0 (param i32)))
    (func (export "run") (param $count i32) (result i32)
      (local $iteration i32)
      (if (call $get0) (then unreachable))
      (block $done
        (loop $loop
          (br_if $done (i32.ge_u (local.get $iteration) (local.get $count)))
          (call $set0 (i32.add (call $get0) (i32.const 1)))
          (call $pause)
          (local.set $iteration (i32.add (local.get $iteration) (i32.const 1)))
          (if (i32.ne (call $get0) (local.get $iteration)) (then unreachable))
          (br $loop)))
      (call $get0)))
  (core instance $m (instantiate $m (with "" (instance
    (export "pause" (func $pause))
    (export "get0" (func $get0))
    (export "set0" (func $set0))))))
  (func (export "run") (param "count" u32) (result u32) (canon lift (core func $m "run"))))
