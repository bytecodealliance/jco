;; A callback that returns WAIT on an index that is not a waitable set traps
;; (Canonical ABI `unpack_callback_result` / `canon_waitable_set_wait`).
(component
  (core module $libc (memory (export "mem") 1))
  (core instance $libc (instantiate $libc))

  (core func $task-return (canon task.return))

  (core module $m
    (import "" "task.return" (func $task-return))

    ;; WAIT (2) on waitable set 0xffff, which does not exist.
    (func (export "wait-unknown") (result i32)
      (call $task-return)
      (i32.or (i32.shl (i32.const 0xffff) (i32.const 4)) (i32.const 2)))

    ;; WAIT (2) on index 0, which is never a valid handle.
    (func (export "wait-zero") (result i32)
      (call $task-return)
      (i32.const 2))

    (func (export "callback") (param i32 i32 i32) (result i32)
      (i32.const 0))
  )

  (core instance $i
    (instantiate $m
      (with "" (instance
        (export "task.return" (func $task-return))
      ))
    )
  )

  (func (export "wait-unknown") async
    (canon lift (core func $i "wait-unknown") async (callback (core func $i "callback"))
      (memory (core memory $libc "mem"))))
  (func (export "wait-zero") async
    (canon lift (core func $i "wait-zero") async (callback (core func $i "callback"))
      (memory (core memory $libc "mem"))))
)
