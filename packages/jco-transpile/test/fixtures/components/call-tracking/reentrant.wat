;; A synchronous export reenters a separate async export through its host import.
(component
  (import "notify" (func $notify))
  (import "wait" (func $wait async))
  (component $outer
    (import "notify" (func $notify))
    (core func $notify (canon lower (func $notify)))
    (core module $m
      (import "" "notify" (func $notify))
      (func (export "run") (result i32) (call $notify) (i32.const 7)))
    (core instance $i (instantiate $m (with "" (instance (export "notify" (func $notify))))))
    (func (export "run") (result u32) (canon lift (core func $i "run"))))
  (component $inner
    (import "wait" (func $wait async))
    (core func $wait (canon lower (func $wait)))
    (core module $m
      (import "" "wait" (func $wait))
      (func (export "run") (call $wait)))
    (core instance $i (instantiate $m (with "" (instance (export "wait" (func $wait))))))
    (func (export "run") async (canon lift (core func $i "run"))))
  (instance $outer (instantiate $outer (with "notify" (func $notify))))
  (instance $inner (instantiate $inner (with "wait" (func $wait))))
  (export "outer" (instance $outer))
  (export "inner" (instance $inner)))
