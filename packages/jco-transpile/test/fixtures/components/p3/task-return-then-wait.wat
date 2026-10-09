;; A callback-lifted export's result is delivered to its caller at
;; `task.return` (Canonical ABI `on_resolve`), even when the task then blocks
;; forever in a synchronous `waitable-set.wait` on an empty set.
(component
  (core module $libc (memory (export "mem") 1))
  (core instance $libc (instantiate $libc))

  (core func $wset-new (canon waitable-set.new))
  (core func $wset-wait (canon waitable-set.wait (memory (core memory $libc "mem"))))
  (core func $task-return (canon task.return (result u32)))

  (core module $m
    (import "" "waitable-set.new" (func $wset-new (result i32)))
    (import "" "waitable-set.wait" (func $wset-wait (param i32 i32) (result i32)))
    (import "" "task.return" (func $task-return (param i32)))

    (func (export "run") (result i32)
      (local $set i32)
      (local.set $set (call $wset-new))
      (call $task-return (i32.const 2))
      (drop (call $wset-wait (local.get $set) (i32.const 1024)))
      (i32.const 0))

    (func (export "callback") (param i32 i32 i32) (result i32)
      (i32.const 0))
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

  (func (export "run") async (result u32)
    (canon lift (core func $i "run") async (callback (core func $i "callback"))
      (memory (core memory $libc "mem"))))
)
