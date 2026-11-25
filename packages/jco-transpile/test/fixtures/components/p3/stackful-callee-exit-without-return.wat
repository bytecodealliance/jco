;; A stackful (async, no callback) callee that returns without `task.return`
;; only exits its implicit thread; the core return does not resolve the task
;; (Canonical ABI `canon_lift`). Its async-lowered caller sees STARTED (1), not
;; RETURNED (2).
(component
  (component $Callee
    (core module $C
      (func (export "f")))
    (core instance $c (instantiate $C))
    (func (export "f") async (canon lift (core func $c "f") async)))
  (instance $callee (instantiate $Callee))
  (core func $f (canon lower (func $callee "f") async))
  (core module $M
    (import "" "f" (func $f (result i32)))
    (func (export "run") (result i32)
      (i32.and (call $f) (i32.const 0xf))))
  (core instance $m (instantiate $M (with "" (instance (export "f" (func $f))))))
  (func (export "run") (result u32) (canon lift (core func $m "run"))))
