;; Built-ins given an index that names no handle of the right kind trap with a
;; `WebAssembly.RuntimeError` (Canonical ABI `Table.get`), as does a callback
;; that returns a code outside the callback code range.
(component
  (type $stream-u8 (stream u8))
  (type $future-u32 (future u32))

  (core module $libc (memory (export "mem") 1))
  (core instance $libc (instantiate $libc))

  (core func $wset-wait (canon waitable-set.wait (memory (core memory $libc "mem"))))
  (core func $wset-drop (canon waitable-set.drop))
  (core func $stream-read (canon stream.read $stream-u8 async (memory (core memory $libc "mem"))))
  (core func $future-read (canon future.read $future-u32 async (memory (core memory $libc "mem"))))
  (core func $task-return (canon task.return))

  (core module $m
    (import "" "waitable-set.wait" (func $wset-wait (param i32 i32) (result i32)))
    (import "" "waitable-set.drop" (func $wset-drop (param i32)))
    (import "" "stream.read" (func $stream-read (param i32 i32 i32) (result i32)))
    (import "" "future.read" (func $future-read (param i32 i32) (result i32)))
    (import "" "task.return" (func $task-return))

    (func (export "wait-unknown") (result i32)
      (drop (call $wset-wait (i32.const 0xffff) (i32.const 1024)))
      (call $task-return)
      (i32.const 0))

    (func (export "drop-set-unknown") (result i32)
      (call $wset-drop (i32.const 0xffff))
      (call $task-return)
      (i32.const 0))

    (func (export "stream-read-unknown") (result i32)
      (drop (call $stream-read (i32.const 0xffff) (i32.const 1024) (i32.const 1)))
      (call $task-return)
      (i32.const 0))

    (func (export "future-read-unknown") (result i32)
      (drop (call $future-read (i32.const 0xffff) (i32.const 1024)))
      (call $task-return)
      (i32.const 0))

    ;; Returns 7, which is no callback code.
    (func (export "bad-callback-code") (result i32)
      (call $task-return)
      (i32.const 7))

    (func (export "callback") (param i32 i32 i32) (result i32)
      (i32.const 0))
  )

  (core instance $i
    (instantiate $m
      (with "" (instance
        (export "waitable-set.wait" (func $wset-wait))
        (export "waitable-set.drop" (func $wset-drop))
        (export "stream.read" (func $stream-read))
        (export "future.read" (func $future-read))
        (export "task.return" (func $task-return))
      ))
    )
  )

  (func (export "wait-unknown") async
    (canon lift (core func $i "wait-unknown") async (callback (core func $i "callback"))
      (memory (core memory $libc "mem"))))
  (func (export "drop-set-unknown") async
    (canon lift (core func $i "drop-set-unknown") async (callback (core func $i "callback"))
      (memory (core memory $libc "mem"))))
  (func (export "stream-read-unknown") async
    (canon lift (core func $i "stream-read-unknown") async (callback (core func $i "callback"))
      (memory (core memory $libc "mem"))))
  (func (export "future-read-unknown") async
    (canon lift (core func $i "future-read-unknown") async (callback (core func $i "callback"))
      (memory (core memory $libc "mem"))))
  (func (export "bad-callback-code") async
    (canon lift (core func $i "bad-callback-code") async (callback (core func $i "callback"))
      (memory (core memory $libc "mem"))))
)
