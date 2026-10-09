;; A trap stops the whole store at once (Canonical ABI `trap()`): a second
;; call that was made back to back with the trapping one, and so is already
;; queued to enter, must not run any guest code before the trap surfaces.
;; One export traps in a plain built-in, the other in a suspending one.
(component
  (import "progress" (func $progress (param "step" u32)))

  (core module $libc (memory (export "mem") 1))
  (core instance $libc (instantiate $libc))

  (core func $progress (canon lower (func $progress)))
  (core func $bp-dec (canon backpressure.dec))
  (core func $wset-wait (canon waitable-set.wait (memory (core memory $libc "mem"))))
  (core func $task-return (canon task.return))

  (core module $m
    (import "" "progress" (func $progress (param i32)))
    (import "" "backpressure.dec" (func $bp-dec))
    (import "" "waitable-set.wait" (func $wset-wait (param i32 i32) (result i32)))
    (import "" "task.return" (func $task-return))

    ;; Traps in a non-suspending built-in (backpressure counter underflow).
    (func (export "trap-dec") (result i32)
      (call $progress (i32.const 1))
      (call $bp-dec)
      (call $task-return)
      (i32.const 0))

    ;; Traps in a suspending built-in (wait on an index that is no waitable set).
    (func (export "trap-wait") (result i32)
      (call $progress (i32.const 1))
      (drop (call $wset-wait (i32.const 0xffffffff) (i32.const 1024)))
      (call $task-return)
      (i32.const 0))

    (func (export "callback") (param i32 i32 i32) (result i32)
      (i32.const 0))
  )

  (core instance $i
    (instantiate $m
      (with "" (instance
        (export "progress" (func $progress))
        (export "backpressure.dec" (func $bp-dec))
        (export "waitable-set.wait" (func $wset-wait))
        (export "task.return" (func $task-return))
      ))
    )
  )

  (func (export "trap-dec") async
    (canon lift (core func $i "trap-dec") async (callback (core func $i "callback"))
      (memory (core memory $libc "mem"))))
  (func (export "trap-wait") async
    (canon lift (core func $i "trap-wait") async (callback (core func $i "callback"))
      (memory (core memory $libc "mem"))))
)
