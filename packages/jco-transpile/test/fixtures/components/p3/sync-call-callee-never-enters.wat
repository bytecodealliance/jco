;; A synchronous call into an instance whose exclusive lock is held forever:
;; the callee's task waits to enter (Canonical ABI `Task.enter_implicit_thread`)
;; and never does, so the store is deadlocked.
(component
  (component $C
    (core module $libc (memory (export "mem") 1))
    (core instance $libc (instantiate $libc))

    (core func $wset-new (canon waitable-set.new))
    (core func $wset-wait (canon waitable-set.wait (memory (core memory $libc "mem"))))
    (core func $task-return (canon task.return (result u32)))

    (core module $m
      (import "" "waitable-set.new" (func $wset-new (result i32)))
      (import "" "waitable-set.wait" (func $wset-wait (param i32 i32) (result i32)))
      (import "" "task.return" (func $task-return (param i32)))

      ;; Returns 2, then blocks forever without returning to its event loop,
      ;; so it keeps the exclusive lock.
      (func (export "hold") (result i32)
        (call $task-return (i32.const 2))
        (drop (call $wset-wait (call $wset-new) (i32.const 0)))
        unreachable)

      (func (export "f") (result i32)
        (call $task-return (i32.const 7))
        (i32.const 0))

      (func (export "callback") (param i32 i32 i32) (result i32) unreachable)
    )

    (core instance $i
      (instantiate $m
        (with "" (instance
          (export "waitable-set.new" (func $wset-new))
          (export "waitable-set.wait" (func $wset-wait))
          (export "task.return" (func $task-return))
        ))
      )
    )

    (func (export "hold") async (result u32)
      (canon lift (core func $i "hold") async (callback (core func $i "callback"))
        (memory (core memory $libc "mem"))))
    (func (export "f") async (result u32)
      (canon lift (core func $i "f") async (callback (core func $i "callback"))
        (memory (core memory $libc "mem"))))
  )

  (component $D
    (import "f" (func $f async (result u32)))

    (core func $f (canon lower (func $f)))

    (core module $m
      (import "" "f" (func $f (result i32)))
      (func (export "run") (result i32)
        (call $f))
    )

    (core instance $i
      (instantiate $m
        (with "" (instance
          (export "f" (func $f))
        ))
      )
    )

    (func (export "run") async (result u32)
      (canon lift (core func $i "run")))
  )

  (instance $c (instantiate $C))
  (instance $d (instantiate $D (with "f" (func $c "f"))))

  (export "hold" (func $c "hold"))
  (export "run" (func $d "run"))
)
