;; Synchronous `stream.read` and `future.read` that cannot complete at once
;; block the task (Canonical ABI `End.copy` + `wait_for_pending_event`): they
;; never return BLOCKED, and a task torn down while blocked fails cleanly.
(component
  (type $stream-u8 (stream u8))
  (type $future-u32 (future u32))

  (core module $libc (memory (export "mem") 1))
  (core instance $libc (instantiate $libc))

  (core func $stream-new (canon stream.new $stream-u8))
  (core func $stream-read (canon stream.read $stream-u8 (memory (core memory $libc "mem"))))
  (core func $future-new (canon future.new $future-u32))
  (core func $future-read (canon future.read $future-u32 (memory (core memory $libc "mem"))))
  (core func $task-return (canon task.return (result u32)))

  (core module $m
    (import "libc" "mem" (memory 1))
    (import "" "stream.new" (func $stream-new (result i64)))
    (import "" "stream.read" (func $stream-read (param i32 i32 i32) (result i32)))
    (import "" "future.new" (func $future-new (result i64)))
    (import "" "future.read" (func $future-read (param i32 i32) (result i32)))
    (import "" "task.return" (func $task-return (param i32)))

    ;; Reads 4 bytes synchronously from a stream nobody writes to.
    (func (export "stream-read") (result i32)
      (local $ends i64)
      (local.set $ends (call $stream-new))
      (call $stream-read (i32.wrap_i64 (local.get $ends)) (i32.const 1024) (i32.const 4)))

    ;; Reads synchronously from a future nobody writes to.
    (func (export "future-read") (result i32)
      (local $ends i64)
      (local.set $ends (call $future-new))
      (call $task-return
        (call $future-read (i32.wrap_i64 (local.get $ends)) (i32.const 1024)))
      (i32.const 0))

    (func (export "callback") (param i32 i32 i32) (result i32)
      (i32.const 0))
  )

  (core instance $i
    (instantiate $m
      (with "libc" (instance $libc))
      (with "" (instance
        (export "stream.new" (func $stream-new))
        (export "stream.read" (func $stream-read))
        (export "future.new" (func $future-new))
        (export "future.read" (func $future-read))
        (export "task.return" (func $task-return))
      ))
    )
  )

  ;; sync-lifted, async-typed
  (func (export "stream-read") async (result u32)
    (canon lift (core func $i "stream-read") (memory (core memory $libc "mem"))))
  ;; callback-lifted
  (func (export "future-read") async (result u32)
    (canon lift (core func $i "future-read") async (callback (core func $i "callback"))
      (memory (core memory $libc "mem"))))
)
