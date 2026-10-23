;; Verify fused post-return traps disable both caller and callee, preserving a healthy sibling.
;; run(0) succeeds; cleanup for run(1) executes unreachable, and run(2) exhausts the stack.
(component
  (component $callee
    (core module $m
      (func $recurse (call $recurse))
      (func (export "run") (param i32) (result i32) local.get 0)
      (func (export "post") (param i32)
        (if (local.get 0) (then
          (if (i32.eq (local.get 0) (i32.const 1))
            (then unreachable)
            (else (call $recurse))))))
      (func (export "ok") (result i32) i32.const 42))
    (core instance $i (instantiate $m))
    (func (export "run") (param "value" u32) (result u32)
      (canon lift (core func $i "run") (post-return (core func $i "post"))))
    (func (export "ok") (result u32) (canon lift (core func $i "ok"))))
  (component $caller
    (import "callee" (func $callee (param "value" u32) (result u32)))
    (core func $lower (canon lower (func $callee)))
    (core module $m
      (import "" "callee" (func $callee (param i32) (result i32)))
      (func (export "run") (param i32) (result i32) (call $callee (local.get 0)))
      (func (export "ok") (result i32) i32.const 43))
    (core instance $i (instantiate $m (with "" (instance (export "callee" (func $lower))))))
    (func (export "run") (param "value" u32) (result u32)
      (canon lift (core func $i "run")))
    (func (export "ok") (result u32) (canon lift (core func $i "ok"))))
  (instance $callee (instantiate $callee))
  (instance $healthy (instantiate $callee))
  (instance $caller (instantiate $caller (with "callee" (func $callee "run"))))
  (export "run" (func $caller "run"))
  (export "callee-ok" (func $callee "ok"))
  (export "caller-ok" (func $caller "ok"))
  (export "healthy-ok" (func $healthy "ok")))
