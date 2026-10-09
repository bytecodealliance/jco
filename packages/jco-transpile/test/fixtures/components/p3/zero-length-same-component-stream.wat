;; A zero-length copy on a stream of non-numeric elements within one component
;; completes without trapping: the Canonical ABI only applies the same-instance
;; restriction when both buffers have elements left (`End.copy`).
(component
  (type $thing (resource (rep i32)))
  (type $stream-own (stream (own $thing)))

  (core module $libc (memory (export "mem") 1))
  (core instance $libc (instantiate $libc))

  (core func $stream-new (canon stream.new $stream-own))
  (core func $stream-read (canon stream.read $stream-own async (memory (core memory $libc "mem"))))
  (core func $stream-write (canon stream.write $stream-own async (memory (core memory $libc "mem"))))
  (core func $task-return (canon task.return (result u32)))

  (core module $m
    (import "libc" "mem" (memory 1))
    (import "" "stream.new" (func $stream-new (result i64)))
    (import "" "stream.read" (func $stream-read (param i32 i32 i32) (result i32)))
    (import "" "stream.write" (func $stream-write (param i32 i32 i32) (result i32)))
    (import "" "task.return" (func $task-return (param i32)))

    ;; Starts a one-element read on the readable end, then writes zero
    ;; elements on the writable end. Returns the write's result packed as
    ;; (read-result << 16) | write-result.
    (func (export "zero-length-write") (result i32)
      (local $ends i64) (local $read i32) (local $write i32)
      (local.set $ends (call $stream-new))
      (local.set $read
        (call $stream-read (i32.wrap_i64 (local.get $ends)) (i32.const 1024) (i32.const 1)))
      (local.set $write
        (call $stream-write
          (i32.wrap_i64 (i64.shr_u (local.get $ends) (i64.const 32)))
          (i32.const 2048) (i32.const 0)))
      (call $task-return
        (i32.or (i32.shl (local.get $read) (i32.const 16)) (local.get $write)))
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
        (export "stream.write" (func $stream-write))
        (export "task.return" (func $task-return))
      ))
    )
  )

  (func (export "zero-length-write") async (result u32)
    (canon lift (core func $i "zero-length-write") async (callback (core func $i "callback"))
      (memory (core memory $libc "mem"))))
)
