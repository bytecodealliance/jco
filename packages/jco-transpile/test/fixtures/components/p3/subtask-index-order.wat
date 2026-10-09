;; An async-lowered call's subtask gets its handle index after the lifted
;; arguments have freed theirs (Canonical ABI `canon_lower`): passing the
;; readable end (index 1) of a fresh stream to a callee that stays STARTED
;; yields subtask index 1 again, i.e. the packed result 0x11.
(component
  (type $stream-u8 (stream u8))

  (component $callee
    (core module $libc (memory (export "mem") 1))
    (core instance $libc (instantiate $libc))

    (core module $m
      ;; Keeps the readable end and yields: the call stays STARTED.
      (func (export "f") (param i32) (result i32)
        (i32.const 1))
      (func (export "callback") (param i32 i32 i32) (result i32)
        (i32.const 0))
    )
    (core instance $i (instantiate $m))

    (type $stream-u8 (stream u8))
    (func (export "f") async (param "s" $stream-u8)
      (canon lift (core func $i "f") async (callback (core func $i "callback"))
        (memory (core memory $libc "mem"))))
  )
  (instance $callee (instantiate $callee))

  (component $caller
    (type $stream-u8 (stream u8))
    (import "f" (func $f async (param "s" $stream-u8)))

    (core module $libc (memory (export "mem") 1))
    (core instance $libc (instantiate $libc))

    ;; async-lowered
    (core func $f (canon lower (func $f) async (memory (core memory $libc "mem"))))
    (core func $stream-new (canon stream.new $stream-u8))
    (core func $task-return (canon task.return (result u32)))

    (core module $m
      (import "" "f" (func $f (param i32) (result i32)))
      (import "" "stream.new" (func $stream-new (result i64)))
      (import "" "task.return" (func $task-return (param i32)))

      ;; Returns the packed subtask state of the call.
      (func (export "run") (result i32)
        (local $ends i64)
        (local.set $ends (call $stream-new))
        (call $task-return (call $f (i32.wrap_i64 (local.get $ends))))
        (i32.const 0))

      (func (export "callback") (param i32 i32 i32) (result i32)
        (i32.const 0))
    )

    (core instance $i
      (instantiate $m
        (with "" (instance
          (export "f" (func $f))
          (export "stream.new" (func $stream-new))
          (export "task.return" (func $task-return))
        ))
      )
    )

    (func (export "run") async (result u32)
      (canon lift (core func $i "run") async (callback (core func $i "callback"))
        (memory (core memory $libc "mem"))))
  )
  (instance $caller (instantiate $caller (with "f" (func $callee "f"))))

  (export "run" (func $caller "run"))
)
