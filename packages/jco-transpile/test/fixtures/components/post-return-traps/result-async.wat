;; Verify async result tags survive cleanup and completion, including raw error payloads.
;; tag=0 returns ok(42), tag=1 returns err(42); fail=1 traps in cleanup and takes precedence over either result.
(component
  (core module $m
    (memory (export "memory") 1)
    (global $fail (mut i32) (i32.const 0))
    (func (export "run") (param $tag i32) (param $fail i32) (result i32)
      (global.set $fail (local.get $fail))
      (i32.store (i32.const 0) (local.get $tag))
      (i32.store (i32.const 4) (i32.const 42))
      i32.const 0)
    (func (export "post") (param i32)
      (if (global.get $fail) (then unreachable)))
    (func (export "ok") (result i32) i32.const 42))
  (core instance $i (instantiate $m))
  (func (export "run") async (param "tag" u32) (param "fail" u32) (result (result u32 (error u32)))
    (canon lift (core func $i "run") (memory (core memory $i "memory"))
      (post-return (core func $i "post"))))
  (func (export "ok") (result u32) (canon lift (core func $i "ok"))))
