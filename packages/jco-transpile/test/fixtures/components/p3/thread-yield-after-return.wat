;; A stackful (JSPI) export's result is delivered to its caller at `task.return`
;; (Canonical ABI `on_resolve`), even when the task then keeps running by
;; looping on `thread.yield` until the host lets it finish. The host only
;; releases the loop after it has received the result, so a result that
;; waited for task exit would never arrive.
(component
  (import "check" (func $check (result bool)))
  (import "done" (func $done))

  (core module $libc (memory (export "mem") 1))
  (core instance $libc (instantiate $libc))

  (core func $check (canon lower (func $check)))
  (core func $done (canon lower (func $done)))
  (core func $task-return (canon task.return (result u32)))
  (core func $thread-yield (canon thread.yield))

  (core module $m
    (import "" "check" (func $check (result i32)))
    (import "" "done" (func $done))
    (import "" "task.return" (func $task-return (param i32)))
    (import "" "thread.yield" (func $thread-yield (result i32)))

    (func (export "run")
      (call $task-return (i32.const 42))
      (block $released
        (loop $again
          (br_if $released (call $check))
          (drop (call $thread-yield))
          (br $again)))
      (call $done))
  )

  (core instance $i
    (instantiate $m
      (with "" (instance
        (export "check" (func $check))
        (export "done" (func $done))
        (export "task.return" (func $task-return))
        (export "thread.yield" (func $thread-yield))
      ))
    )
  )

  (func (export "run") async (result u32)
    (canon lift (core func $i "run") async (memory (core memory $libc "mem"))))
)
