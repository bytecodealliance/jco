;; Exercise task-managed cleanup through an async-lowered import of a sync core ABI callee.
;; run(0) completes eagerly; run(1) traps in cleanup and must reject the root call and disable the callee.
(component
  (component $callee
    (core module $m
        (func (export "run") (param i32) (result i32) local.get 0)
      (func (export "post") (param i32)
        (if (local.get 0) (then unreachable)))
      (func (export "ok") (result i32) i32.const 42))
    (core instance $i (instantiate $m))
    (func (export "run") async (param "value" u32) (result u32)
      (canon lift (core func $i "run") (post-return (core func $i "post"))))
    (func (export "ok") (result u32) (canon lift (core func $i "ok"))))
  (component $caller
    (import "callee" (func $callee async (param "value" u32) (result u32)))
    (core module $memory (memory (export "memory") 1))
    (core instance $memory (instantiate $memory))
    (core func $lower (canon lower (func $callee) async (memory (core memory $memory "memory"))))
    (core func $return (canon task.return (result u32)))
    (core module $m
      (import "" "memory" (memory 1))
      (import "" "callee" (func $callee (param i32 i32) (result i32)))
      (import "" "return" (func $return (param i32)))
      (func (export "run") (param i32) (result i32)
        (if (i32.ne (call $callee (local.get 0) (i32.const 0)) (i32.const 2)) (then unreachable))
        (call $return (i32.load (i32.const 0)))
        i32.const 0)
      (func (export "callback") (param i32 i32 i32) (result i32) unreachable))
    (core instance $i (instantiate $m
      (with "" (instance
        (export "memory" (memory $memory "memory"))
        (export "callee" (func $lower))
        (export "return" (func $return))))))
    (func (export "run") async (param "value" u32) (result u32)
      (canon lift (core func $i "run") async (callback (core func $i "callback")))))
  (instance $callee (instantiate $callee))
  (instance $caller (instantiate $caller (with "callee" (func $callee "run"))))
  (export "run" (func $caller "run"))
  (export "ok" (func $callee "ok")))
