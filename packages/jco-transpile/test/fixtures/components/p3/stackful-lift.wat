;; An async lift without a callback (stackful) delivers its result only through
;; `task.return`: the core function has no results, and returning without
;; having called `task.return` traps (Canonical ABI `Task.exit_implicit_thread`).
(component
  (core module $libc (memory (export "mem") 1))
  (core instance $libc (instantiate $libc))

  (core func $task-return (canon task.return (result u32)))

  (core module $m
    (import "" "task.return" (func $task-return (param i32)))

    (func (export "with-task-return")
      (call $task-return (i32.const 42)))

    (func (export "without-task-return"))
  )

  (core instance $i
    (instantiate $m
      (with "" (instance
        (export "task.return" (func $task-return))
      ))
    )
  )

  (func (export "with-task-return") async (result u32)
    (canon lift (core func $i "with-task-return") async (memory (core memory $libc "mem"))))
  (func (export "without-task-return") async (result u32)
    (canon lift (core func $i "without-task-return") async (memory (core memory $libc "mem"))))
)
