;; A task blocked forever in a synchronous `waitable-set.wait` is reported as
;; a deadlock. The blocked guest code must not be resumed with a fabricated
;; TASK_CANCELLED event: after the trap nothing in the instance runs.
(component
  (import "progress" (func $progress (param "step" u32)))

  (core module $libc (memory (export "mem") 1))
  (core instance $libc (instantiate $libc))

  (core func $progress (canon lower (func $progress)))
  (core func $wset-new (canon waitable-set.new))
  (core func $wset-wait (canon waitable-set.wait (memory (core memory $libc "mem"))))
  (core func $task-return (canon task.return))

  (core module $m
    (import "" "progress" (func $progress (param i32)))
    (import "" "waitable-set.new" (func $wset-new (result i32)))
    (import "" "waitable-set.wait" (func $wset-wait (param i32 i32) (result i32)))
    (import "" "task.return" (func $task-return))

    ;; Yields; the callback then waits on an empty set.
    (func (export "run") (result i32)
      (i32.const 1))

    (func (export "callback") (param i32 i32 i32) (result i32)
      (local $set i32)
      (local.set $set (call $wset-new))
      (call $progress (i32.const 1))
      (drop (call $wset-wait (local.get $set) (i32.const 1024)))
      ;; Never reached: the wait never returns.
      (call $progress (i32.const 2))
      (call $task-return)
      (i32.const 0))
  )

  (core instance $i
    (instantiate $m
      (with "" (instance
        (export "progress" (func $progress))
        (export "waitable-set.new" (func $wset-new))
        (export "waitable-set.wait" (func $wset-wait))
        (export "task.return" (func $task-return))
      ))
    )
  )

  (func (export "run") async
    (canon lift (core func $i "run") async (callback (core func $i "callback"))
      (memory (core memory $libc "mem"))))
)
