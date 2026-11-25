;; Exports named after intrinsics the component's own trampolines call. Each
;; export's local binding must not replace the intrinsic, or the trampoline
;; would call the export instead.
(component
  (core module $Core
    (import "" "backpressure.inc" (func $backpressure.inc))
    (import "" "backpressure.dec" (func $backpressure.dec))
    (func $inc-then-dec (result i32)
      (call $backpressure.inc)
      (call $backpressure.dec)
      (i32.const 42))
    (export "backpressure-inc" (func $inc-then-dec))
    (export "backpressure-dec" (func $inc-then-dec))
    (export "get-or-create-async-state" (func $inc-then-dec))
    (export "promise-with-resolvers" (func $inc-then-dec)))
  (canon backpressure.inc (core func $backpressure.inc))
  (canon backpressure.dec (core func $backpressure.dec))
  (core instance $core (instantiate $Core (with "" (instance
    (export "backpressure.inc" (func $backpressure.inc))
    (export "backpressure.dec" (func $backpressure.dec))))))
  (func (export "backpressure-inc") (result u32) (canon lift (core func $core "backpressure-inc")))
  (func (export "backpressure-dec") (result u32) (canon lift (core func $core "backpressure-dec")))
  (func (export "get-or-create-async-state") (result u32)
    (canon lift (core func $core "get-or-create-async-state")))
  (func (export "promise-with-resolvers") (result u32)
    (canon lift (core func $core "promise-with-resolvers"))))
