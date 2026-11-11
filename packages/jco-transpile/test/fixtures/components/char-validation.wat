;; Character-lowering regression fixture. Both echo-char and char-code pass
;; their raw i32 argument through a core function that increments a call counter.
;; calls exposes that counter so tests can prove invalid host values are rejected
;; before entering the guest, rather than only when lifting the return value.
;; The core function deliberately accepts any i32 without validating it itself.
(component
  (core module $m
    (global $calls (mut i32) (i32.const 0))
    (func (export "char-code") (param i32) (result i32)
      (global.set $calls (i32.add (global.get $calls) (i32.const 1)))
      local.get 0)
    (func (export "calls") (result i32) global.get $calls))
  (core instance $i (instantiate $m))
  (func (export "echo-char") (param "c" char) (result char)
    (canon lift (core func $i "char-code")))
  (func (export "char-code") (param "c" char) (result u32)
    (canon lift (core func $i "char-code")))
  (func (export "calls") (result u32)
    (canon lift (core func $i "calls"))))
