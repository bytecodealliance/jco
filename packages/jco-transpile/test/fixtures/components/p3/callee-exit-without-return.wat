;; A callback-lifted callee that exits without `task.return` traps, and the
;; trap reaches its async-lowered caller during the call (Canonical ABI
;; `Task.exit_implicit_thread`). It is not reported as RETURN_CANCELLED.
(component
  (component $callee
    (core module $libc (memory (export "mem") 1))
    (core instance $libc (instantiate $libc))

    (core module $m
      (func (export "f") (result i32)
        (i32.const 0))
      (func (export "callback") (param i32 i32 i32) (result i32)
        (i32.const 0))
    )
    (core instance $i (instantiate $m))

    (func (export "f") async
      (canon lift (core func $i "f") async (callback (core func $i "callback"))
        (memory (core memory $libc "mem"))))
  )
  (instance $callee (instantiate $callee))

  (component $caller
    (import "f" (func $f async))

    (core module $libc (memory (export "mem") 1))
    (core instance $libc (instantiate $libc))

    ;; async-lowered
    (core func $f (canon lower (func $f) async (memory (core memory $libc "mem"))))

    (core module $m
      (import "" "f" (func $f (result i32)))
      ;; Returns the packed subtask state the call reported.
      (func (export "run") (result i32)
        (call $f))
    )

    (core instance $i
      (instantiate $m
        (with "" (instance
          (export "f" (func $f))
        ))
      )
    )

    (func (export "run") (result u32) (canon lift (core func $i "run")))
  )
  (instance $caller (instantiate $caller (with "f" (func $callee "f"))))

  (export "run" (func $caller "run"))
)
