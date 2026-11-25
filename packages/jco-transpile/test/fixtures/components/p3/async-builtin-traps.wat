;; Async built-ins that must trap with a RuntimeError. Each export reaches one trap.
(component
  (core module $libc (memory (export "mem") 1))
  (core instance $libc (instantiate $libc))
  (core module $other (memory (export "mem") 1))
  (core instance $other (instantiate $other))

  (core func $backpressure-inc (canon backpressure.inc))
  (core func $task-cancel (canon task.cancel))
  (core func $task-return (canon task.return))
  (core func $task-return-other-memory
    (canon task.return (memory (core memory $other "mem"))))
  (core func $task-return-utf16 (canon task.return string-encoding=utf16))
  (core func $waitable-set-new (canon waitable-set.new))
  (core func $waitable-set-drop (canon waitable-set.drop))

  (core module $m
    (import "" "backpressure.inc" (func $backpressure-inc))
    (import "" "task.cancel" (func $task-cancel))
    (import "" "task.return" (func $task-return))
    (import "" "task.return-other-memory" (func $task-return-other-memory))
    (import "" "task.return-utf16" (func $task-return-utf16))
    (import "" "waitable-set.new" (func $waitable-set-new (result i32)))
    (import "" "waitable-set.drop" (func $waitable-set-drop (param i32)))

    (global $set (mut i32) (i32.const 0))

    ;; `canon_backpressure_inc`: the counter may not reach 2^16.
    (func (export "backpressure-overflow") (result i32)
      (local $i i32)
      (loop $again
        (call $backpressure-inc)
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br_if $again (i32.lt_u (local.get $i) (i32.const 0x10000))))
      unreachable)

    ;; `Task.cancel`: only after the cancellation was delivered.
    (func (export "task-cancel-undelivered") (result i32)
      (call $task-cancel)
      unreachable)

    ;; `canon_task_cancel`: only an async-lifted task can be cancelled.
    (func (export "task-cancel-sync-lift")
      (call $task-cancel)
      unreachable)

    ;; `Task.return_`: a task resolves once.
    (func (export "task-return-twice") (result i32)
      (call $task-return)
      (call $task-return)
      unreachable)

    ;; `canon_task_return`: the options must equal the lift's.
    (func (export "task-return-other-memory") (result i32)
      (call $task-return-other-memory)
      unreachable)
    (func (export "task-return-utf16") (result i32)
      (call $task-return-utf16)
      unreachable)

    ;; `unpack_callback_result`: EXIT, YIELD and WAIT are the only codes.
    (func (export "callback-code-3") (result i32)
      (i32.const 3))

    ;; `canon_waitable_set_drop`: post-return may not leave the instance.
    (func (export "waitable-set-drop-in-post-return")
      (global.set $set (call $waitable-set-new)))
    (func (export "drop-set")
      (call $waitable-set-drop (global.get $set)))

    (func (export "ok") (result i32)
      (i32.const 7))

    (func (export "callback") (param i32 i32 i32) (result i32)
      unreachable)
  )

  (core instance $i
    (instantiate $m
      (with "" (instance
        (export "backpressure.inc" (func $backpressure-inc))
        (export "task.cancel" (func $task-cancel))
        (export "task.return" (func $task-return))
        (export "task.return-other-memory" (func $task-return-other-memory))
        (export "task.return-utf16" (func $task-return-utf16))
        (export "waitable-set.new" (func $waitable-set-new))
        (export "waitable-set.drop" (func $waitable-set-drop))
      ))
    )
  )

  (func (export "backpressure-overflow") async
    (canon lift (core func $i "backpressure-overflow") async (callback (core func $i "callback"))))
  (func (export "task-cancel-undelivered") async
    (canon lift (core func $i "task-cancel-undelivered") async (callback (core func $i "callback"))))
  (func (export "task-cancel-sync-lift")
    (canon lift (core func $i "task-cancel-sync-lift")))
  (func (export "task-return-twice") async
    (canon lift (core func $i "task-return-twice") async (callback (core func $i "callback"))))
  (func (export "task-return-other-memory") async
    (canon lift (core func $i "task-return-other-memory") async (callback (core func $i "callback"))
      (memory (core memory $libc "mem"))))
  (func (export "task-return-utf16") async
    (canon lift (core func $i "task-return-utf16") async (callback (core func $i "callback"))))
  (func (export "callback-code-3") async
    (canon lift (core func $i "callback-code-3") async (callback (core func $i "callback"))))
  (func (export "waitable-set-drop-in-post-return")
    (canon lift (core func $i "waitable-set-drop-in-post-return")
      (post-return (core func $i "drop-set"))))
  (func (export "ok") (result u32)
    (canon lift (core func $i "ok")))
)
