;; A call into a stackful export made right after a call whose first slice
;; sets backpressure must not enter until the backpressure is cleared: the
;; next call is admitted only once the previous one returned or blocked
;; (Canonical ABI `Store.invoke` / `Task.enter_implicit_thread`).
(component
  (core module $libc (memory (export "mem") 1))
  (core instance $libc (instantiate $libc))

  (core func $inc (canon backpressure.inc))
  (core func $dec (canon backpressure.dec))
  (core func $task-return (canon task.return (result u32)))

  (core module $m
    (import "" "backpressure.inc" (func $inc))
    (import "" "backpressure.dec" (func $dec))
    (import "" "task.return" (func $task-return (param i32)))

    (global $released (mut i32) (i32.const 0))

    ;; callback-lifted: sets backpressure, returns 100 and yields; its callback
    ;; clears the backpressure.
    (func (export "set-backpressure") (result i32)
      (call $inc)
      (call $task-return (i32.const 100))
      (i32.const 1))

    (func (export "callback") (param i32 i32 i32) (result i32)
      (call $dec)
      (global.set $released (i32.const 1))
      (i32.const 0))

    ;; stackful: reports whether the backpressure had been cleared on entry.
    (func (export "probe")
      (call $task-return (global.get $released)))
  )

  (core instance $i
    (instantiate $m
      (with "" (instance
        (export "backpressure.inc" (func $inc))
        (export "backpressure.dec" (func $dec))
        (export "task.return" (func $task-return))
      ))
    )
  )

  (func (export "set-backpressure") async (result u32)
    (canon lift (core func $i "set-backpressure") async (callback (core func $i "callback"))
      (memory (core memory $libc "mem"))))
  (func (export "probe") async (result u32)
    (canon lift (core func $i "probe") async (memory (core memory $libc "mem"))))
)
