;; Verify async exports reject failed cleanup and refuse subsequent entry.
;; run(0) succeeds; run(1) returns first, then throws a core Wasm exception in post-return.
;; ok() must remain callable only until cleanup fails.
(component
  (core module $m
    (tag $error (param i32))
    (func (export "run") (param i32) (result i32) local.get 0)
    (func (export "post") (param i32)
      (if (local.get 0) (then (throw $error (i32.const 42)))))
    (func (export "ok") (result i32) i32.const 42))
  (core instance $i (instantiate $m))
  (func (export "run") async (param "value" u32) (result u32)
    (canon lift (core func $i "run") (post-return (core func $i "post"))))
  (func (export "ok") (result u32) (canon lift (core func $i "ok"))))
