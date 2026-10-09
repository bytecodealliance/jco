;; Two host calls into a callback export whose task ends up blocked in a
;; synchronous `waitable-set.wait` while it holds the component, with the
;; second call queued behind it. The runtime must not spin the event loop
;; forever in that state: the scenario ends in a trap (the callee exits
;; without `task.return`) that is reported to both calls.
(component
  (component $callee
    (core module $libc (memory (export "mem") 1))
    (core instance $libc (instantiate $libc))

    (core module $m
      ;; Yields; the callback then exits without `task.return` (a trap).
      (func (export "f") (result i32)
        (i32.const 1))
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
    (type $future-u32 (future u32))

    (core module $libc (memory (export "mem") 1))
    (core instance $libc (instantiate $libc))

    ;; async-lowered
    (core func $f (canon lower (func $f) async (memory (core memory $libc "mem"))))
    (core func $future-new (canon future.new $future-u32))
    (core func $future-read (canon future.read $future-u32 async (memory (core memory $libc "mem"))))
    (core func $future-write (canon future.write $future-u32 async (memory (core memory $libc "mem"))))
    (core func $wset-new (canon waitable-set.new))
    (core func $wset-wait (canon waitable-set.wait (memory (core memory $libc "mem"))))
    (core func $join (canon waitable.join))
    (core func $task-return (canon task.return (result u32)))

    (core module $m
      (import "libc" "mem" (memory 1))
      (import "" "f" (func $f (result i32)))
      (import "" "future.new" (func $future-new (result i64)))
      (import "" "future.read" (func $future-read (param i32 i32) (result i32)))
      (import "" "future.write" (func $future-write (param i32 i32) (result i32)))
      (import "" "waitable-set.new" (func $wset-new (result i32)))
      (import "" "waitable-set.wait" (func $wset-wait (param i32 i32) (result i32)))
      (import "" "waitable.join" (func $join (param i32 i32)))
      (import "" "task.return" (func $task-return (param i32)))

      (global $set (mut i32) (i32.const 0))

      (func (export "run") (result i32)
        (local $ends i64)
        (drop (call $f))
        (local.set $ends (call $future-new))
        (global.set $set (call $wset-new))
        (drop (call $future-read (i32.wrap_i64 (local.get $ends)) (i32.const 1024)))
        (call $join (i32.wrap_i64 (local.get $ends)) (global.get $set))
        (drop (call $future-write
          (i32.wrap_i64 (i64.shr_u (local.get $ends) (i64.const 32))) (i32.const 2048)))
        ;; WAIT on the set
        (i32.or (i32.shl (global.get $set) (i32.const 4)) (i32.const 2)))

      ;; Waits synchronously on the same set.
      (func (export "callback") (param i32 i32 i32) (result i32)
        (drop (call $wset-wait (global.get $set) (i32.const 1024)))
        (call $task-return (i32.const 0))
        (i32.const 0))
    )

    (core instance $i
      (instantiate $m
        (with "libc" (instance $libc))
        (with "" (instance
          (export "f" (func $f))
          (export "future.new" (func $future-new))
          (export "future.read" (func $future-read))
          (export "future.write" (func $future-write))
          (export "waitable-set.new" (func $wset-new))
          (export "waitable-set.wait" (func $wset-wait))
          (export "waitable.join" (func $join))
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
