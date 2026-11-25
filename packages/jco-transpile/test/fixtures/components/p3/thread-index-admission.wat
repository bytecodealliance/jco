;; A task's implicit thread is added to the instance's thread table when the
;; task enters, after any wait for backpressure (Canonical ABI
;; `Task.enter_implicit_thread`), so a task held back by backpressure takes an
;; index that was freed while it waited.
(component
  (core module $libc (memory (export "mem") 1))
  (core instance $libc (instantiate $libc))

  (core func $inc (canon backpressure.inc))
  (core func $dec (canon backpressure.dec))
  (core func $index (canon thread.index))
  (core func $task-return (canon task.return (result u32)))

  (core module $m
    (import "" "backpressure.inc" (func $inc))
    (import "" "backpressure.dec" (func $dec))
    (import "" "thread.index" (func $index (result i32)))
    (import "" "task.return" (func $task-return (param i32)))

    (global $calls (mut i32) (i32.const 0))

    ;; Every call returns the index of its implicit thread. The first call
    ;; also sets backpressure and yields; its callback clears the
    ;; backpressure and exits, freeing that index.
    (func (export "run") (result i32)
      (global.set $calls (i32.add (global.get $calls) (i32.const 1)))
      (call $task-return (call $index))
      (if (result i32) (i32.eq (global.get $calls) (i32.const 1))
        (then
          (call $inc)
          (i32.const 1))
        (else
          (i32.const 0))))

    (func (export "callback") (param i32 i32 i32) (result i32)
      (call $dec)
      (i32.const 0))
  )

  (core instance $i
    (instantiate $m
      (with "" (instance
        (export "backpressure.inc" (func $inc))
        (export "backpressure.dec" (func $dec))
        (export "thread.index" (func $index))
        (export "task.return" (func $task-return))
      ))
    )
  )

  (func (export "run") async (result u32)
    (canon lift (core func $i "run") async (callback (core func $i "callback"))
      (memory (core memory $libc "mem"))))
)
