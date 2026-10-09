;; An async-lifted callee may block or yield even when it is reached through a
;; sync-lowered import: the Canonical ABI only forbids blocking in sync-typed
;; callees (`canon_lift`). The sync-lowered caller waits for it.
(component
  (component $callee
    (core module $libc (memory (export "mem") 1))
    (core instance $libc (instantiate $libc))

    (core func $yield (canon thread.yield))
    (core func $task-return (canon task.return))

    (core module $m
      (import "" "thread.yield" (func $yield (result i32)))
      (import "" "task.return" (func $task-return))

      (func (export "f") (result i32)
        (drop (call $yield))
        (call $task-return)
        (i32.const 0))

      (func (export "callback") (param i32 i32 i32) (result i32)
        (i32.const 0))
    )

    (core instance $i
      (instantiate $m
        (with "" (instance
          (export "thread.yield" (func $yield))
          (export "task.return" (func $task-return))
        ))
      )
    )

    (func (export "f") async
      (canon lift (core func $i "f") async (callback (core func $i "callback"))
        (memory (core memory $libc "mem"))))
  )
  (instance $callee (instantiate $callee))

  (component $caller
    (import "f" (func $f async))

    (core module $libc (memory (export "mem") 1))
    (core instance $libc (instantiate $libc))

    ;; sync-lowered
    (core func $f (canon lower (func $f) (memory (core memory $libc "mem"))))
    (core func $task-return (canon task.return (result u32)))

    (core module $m
      (import "" "f" (func $f))
      (import "" "task.return" (func $task-return (param i32)))

      (func (export "run") (result i32)
        (call $f)
        (call $task-return (i32.const 42))
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
