;; A callee whose function type is `async` may block even when it is lifted
;; synchronously (no `async` lift option) and reached through a sync-lowered
;; call: the Canonical ABI only forbids blocking in sync-typed callees. The
;; fused adapter passes the callee's function-type async flag to
;; `prepare_call`, which the callee task uses to decide that it may block.
(component
  (component $callee
    (core module $libc (memory (export "mem") 1))
    (core instance $libc (instantiate $libc))

    (core func $yield (canon thread.yield))

    (core module $m
      (import "" "thread.yield" (func $yield (result i32)))

      ;; sync-lifted: returns its result directly, after yielding.
      (func (export "f") (result i32)
        (drop (call $yield))
        (i32.const 42))
    )

    (core instance $i
      (instantiate $m
        (with "" (instance
          (export "thread.yield" (func $yield))
        ))
      )
    )

    ;; async-typed, sync-lifted
    (func (export "f") async (result u32)
      (canon lift (core func $i "f") (memory (core memory $libc "mem"))))
  )
  (instance $callee (instantiate $callee))

  (component $caller
    (import "f" (func $f async (result u32)))

    (core module $libc (memory (export "mem") 1))
    (core instance $libc (instantiate $libc))

    ;; sync-lowered
    (core func $f (canon lower (func $f) (memory (core memory $libc "mem"))))
    (core func $task-return (canon task.return (result u32)))

    (core module $m
      (import "" "f" (func $f (result i32)))
      (import "" "task.return" (func $task-return (param i32)))

      (func (export "run") (result i32)
        (call $task-return (call $f))
        (i32.const 0))

      (func (export "callback") (param i32 i32 i32) (result i32)
        (i32.const 0))
    )

    (core instance $i
      (instantiate $m
        (with "" (instance
          (export "f" (func $f))
          (export "task.return" (func $task-return))
        ))
      )
    )

    (func (export "run") async (result u32)
      (canon lift (core func $i "run") async (callback (core func $i "callback"))
        (memory (core memory $libc "mem"))))
  )
  (instance $caller (instantiate $caller (with "f" (func $callee "f"))))

  (export "run" (func $caller "run"))
)
