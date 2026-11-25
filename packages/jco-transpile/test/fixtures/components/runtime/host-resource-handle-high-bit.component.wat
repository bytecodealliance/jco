;; A handle index is a u32: setting bit 31 of a live index names an
;; out-of-range entry, so lifting it as a host resource must trap (Canonical ABI
;; `lift_borrow` and `lift_own` call `Table.get` / `Table.remove`) rather than
;; resolve the live entry the low 31 bits name.
(component
  (import "test:high-bit/api" (instance $api
    (export "thing" (type (sub resource)))))
  (alias export $api "thing" (type $thing))
  (import "observe" (func $observe (param "thing" (borrow $thing)) (result u32)))
  (core func $observe (canon lower (func $observe)))
  (core func $drop (canon resource.drop $thing))
  (core module $m
    (import "" "observe" (func $observe (param i32) (result i32)))
    (import "" "drop" (func $drop (param i32)))
    (func (export "inspect") (param i32) (result i32)
      (local $r i32)
      (local.set $r (call $observe (local.get 0)))
      (call $drop (local.get 0))
      (local.get $r))
    (func (export "inspect-alias") (param i32) (result i32)
      (call $observe (i32.or (local.get 0) (i32.const 0x80000000))))
    (func (export "roundtrip-alias") (param i32) (result i32)
      (i32.or (local.get 0) (i32.const 0x80000000))))
  (core instance $i (instantiate $m (with "" (instance
    (export "observe" (func $observe))
    (export "drop" (func $drop))))))
  (func (export "inspect") (param "thing" (own $thing)) (result u32)
    (canon lift (core func $i "inspect")))
  (func (export "inspect-alias") (param "thing" (own $thing)) (result u32)
    (canon lift (core func $i "inspect-alias")))
  (func (export "roundtrip-alias") (param "thing" (own $thing)) (result (own $thing))
    (canon lift (core func $i "roundtrip-alias"))))
