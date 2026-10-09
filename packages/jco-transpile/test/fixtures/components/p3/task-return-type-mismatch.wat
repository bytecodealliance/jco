;; `task.return` traps unless its result type is the task's function's result
;; type (Canonical ABI `canon_task_return`).
(component
  (core module $libc (memory (export "mem") 1))
  (core instance $libc (instantiate $libc))

  (core func $task-return-u32 (canon task.return (result u32)))
  (core func $task-return-none (canon task.return))

  (core module $m
    (import "" "task.return-u32" (func $task-return-u32 (param i32)))
    (import "" "task.return-none" (func $task-return-none))

    ;; Lifted with no result, but returns a u32.
    (func (export "wrong-type") (result i32)
      (call $task-return-u32 (i32.const 7))
      (i32.const 0))

    ;; Lifted with no result, and returns none.
    (func (export "right-type") (result i32)
      (call $task-return-none)
      (i32.const 0))

    (func (export "callback") (param i32 i32 i32) (result i32)
      (i32.const 0))
  )

  (core instance $i
    (instantiate $m
      (with "" (instance
        (export "task.return-u32" (func $task-return-u32))
        (export "task.return-none" (func $task-return-none))
      ))
    )
  )

  (func (export "wrong-type") async
    (canon lift (core func $i "wrong-type") async (callback (core func $i "callback"))
      (memory (core memory $libc "mem"))))
  (func (export "right-type") async
    (canon lift (core func $i "right-type") async (callback (core func $i "callback"))
      (memory (core memory $libc "mem"))))
)
