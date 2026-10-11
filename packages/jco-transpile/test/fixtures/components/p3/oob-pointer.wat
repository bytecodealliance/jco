;; A built-in given a pointer past the end of linear memory traps with the
;; out-of-bounds trap (Canonical ABI `store`), not an internal error.
(component
  (core module $libc (memory (export "mem") 1))
  (core instance $libc (instantiate $libc))

  (core func $wset-new (canon waitable-set.new))
  (core func $wset-poll (canon waitable-set.poll (memory (core memory $libc "mem"))))
  (core func $task-return (canon task.return))

  (core module $m
    (import "" "waitable-set.new" (func $wset-new (result i32)))
    (import "" "waitable-set.poll" (func $wset-poll (param i32 i32) (result i32)))
    (import "" "task.return" (func $task-return))

    ;; Polls with an event pointer far past the one memory page.
    (func (export "poll-out-of-bounds") (result i32)
      (drop (call $wset-poll (call $wset-new) (i32.const 0x7ffffff0)))
      (call $task-return)
      (i32.const 0))

    (func (export "callback") (param i32 i32 i32) (result i32)
      (i32.const 0))
  )

  (core instance $i
    (instantiate $m
      (with "" (instance
        (export "waitable-set.new" (func $wset-new))
        (export "waitable-set.poll" (func $wset-poll))
        (export "task.return" (func $task-return))
      ))
    )
  )

  (func (export "poll-out-of-bounds") async
    (canon lift (core func $i "poll-out-of-bounds") async (callback (core func $i "callback"))
      (memory (core memory $libc "mem"))))
)
