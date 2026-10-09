;; `waitable-set.poll` traps unless its index names a waitable set
;; (Canonical ABI `canon_waitable_set_poll`), like `waitable-set.wait`.
(component
  (type $future-u32 (future u32))

  (core module $libc (memory (export "mem") 1))
  (core instance $libc (instantiate $libc))

  (core func $future-new (canon future.new $future-u32))
  (core func $wset-new (canon waitable-set.new))
  (core func $wset-poll (canon waitable-set.poll (memory (core memory $libc "mem"))))
  (core func $wset-drop (canon waitable-set.drop))
  (core func $task-return (canon task.return (result u32)))

  (core module $m
    (import "libc" "mem" (memory 1))
    (import "" "future.new" (func $future-new (result i64)))
    (import "" "waitable-set.new" (func $wset-new (result i32)))
    (import "" "waitable-set.poll" (func $wset-poll (param i32 i32) (result i32)))
    (import "" "waitable-set.drop" (func $wset-drop (param i32)))
    (import "" "task.return" (func $task-return (param i32)))

    ;; Polls the readable end of a new future as if it were a waitable set.
    (func (export "poll-future-end") (result i32)
      (local $ends i64)
      (local.set $ends (call $future-new))
      (call $task-return
        (call $wset-poll (i32.wrap_i64 (local.get $ends)) (i32.const 1024)))
      (i32.const 0))

    ;; Polls an empty waitable set: EVENT_NONE.
    (func (export "poll-empty-set") (result i32)
      (local $set i32)
      (local.set $set (call $wset-new))
      (call $task-return (call $wset-poll (local.get $set) (i32.const 1024)))
      (call $wset-drop (local.get $set))
      (i32.const 0))

    (func (export "callback") (param i32 i32 i32) (result i32)
      (i32.const 0))
  )

  (core instance $i
    (instantiate $m
      (with "libc" (instance $libc))
      (with "" (instance
        (export "future.new" (func $future-new))
        (export "waitable-set.new" (func $wset-new))
        (export "waitable-set.poll" (func $wset-poll))
        (export "waitable-set.drop" (func $wset-drop))
        (export "task.return" (func $task-return))
      ))
    )
  )

  (func (export "poll-future-end") async (result u32)
    (canon lift (core func $i "poll-future-end") async (callback (core func $i "callback"))
      (memory (core memory $libc "mem"))))
  (func (export "poll-empty-set") async (result u32)
    (canon lift (core func $i "poll-empty-set") async (callback (core func $i "callback"))
      (memory (core memory $libc "mem"))))
)
