;; `backpressure.dec` traps when the counter would go below zero
;; (Canonical ABI `canon_backpressure_dec`).
(component
  (core module $m
    (import "" "backpressure.inc" (func $inc))
    (import "" "backpressure.dec" (func $dec))
    (import "" "task.return" (func $task-return))
    (memory (export "mem") 1)

    (func (export "dec-without-inc") (result i32)
      (call $dec)
      (call $task-return)
      (i32.const 0))

    (func (export "inc-then-dec") (result i32)
      (call $inc)
      (call $dec)
      (call $task-return)
      (i32.const 0))

    (func (export "callback") (param i32 i32 i32) (result i32)
      (i32.const 0))
  )

  (core func $inc (canon backpressure.inc))
  (core func $dec (canon backpressure.dec))
  (core func $task-return (canon task.return))

  (core instance $i
    (instantiate $m
      (with "" (instance
        (export "backpressure.inc" (func $inc))
        (export "backpressure.dec" (func $dec))
        (export "task.return" (func $task-return))
      ))
    )
  )

  (func (export "dec-without-inc") async
    (canon lift (core func $i "dec-without-inc") async (callback (core func $i "callback"))
      (memory (core memory $i "mem"))))
  (func (export "inc-then-dec") async
    (canon lift (core func $i "inc-then-dec") async (callback (core func $i "callback"))
      (memory (core memory $i "mem"))))
)
