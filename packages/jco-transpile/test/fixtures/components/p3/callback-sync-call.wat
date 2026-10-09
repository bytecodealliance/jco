;; A callback (run by the callback driver loop, after two yields) makes a
;; sync-lowered call into another component's async-lifted export. The call
;; runs like any other core import call (it must not fail with a JSPI
;; SuspendError), and the callee's result reaches the callback.
(component
  (component $callee
    (core module $libc (memory (export "mem") 1))
    (core instance $libc (instantiate $libc))

    (core func $task-return (canon task.return (result u32)))

    (core module $m
      (import "" "task.return" (func $task-return (param i32)))
      (func (export "add") (param i32 i32) (result i32)
        (call $task-return (i32.add (local.get 0) (local.get 1)))
        (i32.const 0))
      (func (export "callback") (param i32 i32 i32) (result i32)
        (i32.const 0))
    )
    (core instance $i
      (instantiate $m
        (with "" (instance (export "task.return" (func $task-return))))))

    (func (export "add") async (param "a" u32) (param "b" u32) (result u32)
      (canon lift (core func $i "add") async (callback (core func $i "callback"))
        (memory (core memory $libc "mem"))))
  )
  (instance $callee (instantiate $callee))

  (component $caller
    (import "add" (func $add async (param "a" u32) (param "b" u32) (result u32)))

    (core module $libc (memory (export "mem") 1))
    (core instance $libc (instantiate $libc))

    ;; sync-lowered
    (core func $add (canon lower (func $add) (memory (core memory $libc "mem"))))
    (core func $task-return (canon task.return (result u32)))

    (core module $m
      (import "" "add" (func $add (param i32 i32) (result i32)))
      (import "" "task.return" (func $task-return (param i32)))

      (global $callbacks (mut i32) (i32.const 0))

      ;; Yields; the second callback makes the call and returns its result.
      (func (export "run") (result i32)
        (i32.const 1))

      (func (export "callback") (param i32 i32 i32) (result i32)
        (global.set $callbacks (i32.add (global.get $callbacks) (i32.const 1)))
        (if (result i32) (i32.lt_u (global.get $callbacks) (i32.const 2))
          (then (i32.const 1))
          (else
            (call $task-return (call $add (i32.const 40) (i32.const 2)))
            (i32.const 0))))
    )
    (core instance $i
      (instantiate $m
        (with "" (instance
          (export "add" (func $add))
          (export "task.return" (func $task-return))))))

    (func (export "run") async (result u32)
      (canon lift (core func $i "run") async (callback (core func $i "callback"))
        (memory (core memory $libc "mem"))))
  )
  (instance $caller (instantiate $caller (with "add" (func $callee "add"))))

  (export "run" (func $caller "run"))
)
