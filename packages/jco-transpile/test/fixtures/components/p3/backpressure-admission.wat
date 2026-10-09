;; Backpressure keeps new calls out of the instance until it is cleared
;; (Canonical ABI `Task.enter_implicit_thread`), even when the task that set
;; it is still running.
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

    (global $calls (mut i32) (i32.const 0))
    (global $released (mut i32) (i32.const 0))

    ;; The first call sets backpressure, returns 100 and yields; its callback
    ;; clears the backpressure and exits. Every later call returns whether
    ;; the backpressure had been cleared when it entered.
    (func (export "run") (result i32)
      (global.set $calls (i32.add (global.get $calls) (i32.const 1)))
      (if (result i32) (i32.eq (global.get $calls) (i32.const 1))
        (then
          (call $inc)
          (call $task-return (i32.const 100))
          (i32.const 1))
        (else
          (call $task-return (global.get $released))
          (i32.const 0))))

    (func (export "callback") (param i32 i32 i32) (result i32)
      (call $dec)
      (global.set $released (i32.const 1))
      (i32.const 0))

    ;; Sets backpressure and exits without clearing it.
    (func (export "block") (result i32)
      (call $inc)
      (call $task-return (i32.const 0))
      (i32.const 0))
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

  (func (export "run") async (result u32)
    (canon lift (core func $i "run") async (callback (core func $i "callback"))
      (memory (core memory $libc "mem"))))
  (func (export "block") async (result u32)
    (canon lift (core func $i "block") async (callback (core func $i "callback"))
      (memory (core memory $libc "mem"))))
)
