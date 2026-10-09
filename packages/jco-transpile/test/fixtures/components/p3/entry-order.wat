;; Calls into an instance enter in the order they were made (Canonical ABI
;; `Store.invoke` / `inst.pending`): a later call into a stackful export must
;; not overtake an earlier call into a callback-lifted or a sync-lifted,
;; async-typed export. Each export reports its entry through `progress`.
(component
  (import "progress" (func $progress (param "step" u32)))

  (core module $libc (memory (export "mem") 1))
  (core instance $libc (instantiate $libc))

  (core func $progress (canon lower (func $progress)))
  (core func $task-return (canon task.return))

  (core module $m
    (import "" "progress" (func $progress (param i32)))
    (import "" "task.return" (func $task-return))

    ;; callback-lifted
    (func (export "callback-first") (result i32)
      (call $progress (i32.const 1))
      (call $task-return)
      (i32.const 0))

    ;; sync-lifted, async-typed
    (func (export "sync-first")
      (call $progress (i32.const 1)))

    ;; stackful (async lift without a callback)
    (func (export "stackful-second")
      (call $progress (i32.const 2))
      (call $task-return))

    (func (export "callback") (param i32 i32 i32) (result i32)
      (i32.const 0))
  )

  (core instance $i
    (instantiate $m
      (with "" (instance
        (export "progress" (func $progress))
        (export "task.return" (func $task-return))
      ))
    )
  )

  (func (export "callback-first") async
    (canon lift (core func $i "callback-first") async (callback (core func $i "callback"))
      (memory (core memory $libc "mem"))))
  (func (export "sync-first") async
    (canon lift (core func $i "sync-first") (memory (core memory $libc "mem"))))
  (func (export "stackful-second") async
    (canon lift (core func $i "stackful-second") async (memory (core memory $libc "mem"))))
)
