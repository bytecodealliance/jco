;; Several calls into one instance are suspended inside a host import at the
;; same time, each with live values in both context slots (as a guest which
;; keeps its stack pointer there would have). Every call must find its own
;; values again whenever it resumes, whichever call ran in between. Calls
;; suspend in a host import ("run") or by yielding to each other ("spin").
(component
  (import "pause" (func $pause (param "id" u32)))
  (import "mark" (func $mark (param "id" u32)))
  (core func $pause (canon lower (func $pause)))
  (core func $mark (canon lower (func $mark)))
  (core func $yield (canon thread.yield))
  (core func $get0 (canon context.get i32 0))
  (core func $get1 (canon context.get i32 1))
  (core func $set0 (canon context.set i32 0))
  (core func $set1 (canon context.set i32 1))
  (core module $m
    (import "" "pause" (func $pause (param i32)))
    (import "" "mark" (func $mark (param i32)))
    (import "" "yield" (func $yield (result i32)))
    (import "context" "get0" (func $get0 (result i32)))
    (import "context" "get1" (func $get1 (result i32)))
    (import "context" "set0" (func $set0 (param i32)))
    (import "context" "set1" (func $set1 (param i32)))
    (func $check (param $slot0 i32) (param $slot1 i32)
      (if (i32.ne (call $get0) (local.get $slot0)) (then unreachable))
      (if (i32.ne (call $get1) (local.get $slot1)) (then unreachable)))
    (func (export "run") (param $id i32) (result i32)
      ;; A call starts with empty context.
      (call $check (i32.const 0) (i32.const 0))
      (call $set0 (local.get $id))
      (call $set1 (i32.add (local.get $id) (i32.const 100)))
      (call $pause (local.get $id))
      (call $check (local.get $id) (i32.add (local.get $id) (i32.const 100)))

      ;; Values written after one suspension survive the next.
      (call $set0 (i32.add (local.get $id) (i32.const 1000)))
      (call $pause (local.get $id))
      (call $check
        (i32.add (local.get $id) (i32.const 1000))
        (i32.add (local.get $id) (i32.const 100)))
      (call $get0))
    (func (export "spin") (param $id i32) (param $rounds i32) (result i32)
      (call $check (i32.const 0) (i32.const 0))
      (call $set0 (local.get $id))
      (call $set1 (local.get $rounds))
      (loop $again
        ;; Let the other calls run, then tell the host which call resumed.
        (drop (call $yield))
        (call $mark (local.get $id))
        (call $check (local.get $id) (local.get $rounds))
        (local.set $rounds (i32.sub (local.get $rounds) (i32.const 1)))
        (call $set1 (local.get $rounds))
        (br_if $again (local.get $rounds)))
      (call $get0)))
  (core instance $context
    (export "get0" (func $get0))
    (export "get1" (func $get1))
    (export "set0" (func $set0))
    (export "set1" (func $set1)))
  (core instance $i (instantiate $m
    (with "context" (instance $context))
    (with "" (instance
      (export "pause" (func $pause))
      (export "mark" (func $mark))
      (export "yield" (func $yield))))))
  (func (export "run") (param "id" u32) (result u32)
    (canon lift (core func $i "run")))
  (func (export "spin") (param "id" u32) (param "rounds" u32) (result u32)
    (canon lift (core func $i "spin"))))
