;; A call of a non-async-typed function traps where it blocks with no ready
;; thread of its instance to switch to (Canonical ABI `canon_lift`,
;; `not ft.async_`). Host work of another instance cannot help it, since that
;; instance may not run until the call returns.
;;
;; $P's `start` waits on the async host import `pending`, and its
;; `read-future` and `read-stream` read a future and a stream the host has
;; yet to write. $Q's sync-typed
;; exports each block with nothing of $Q left to run:
;; - `wait-empty` waits on an empty waitable set;
;; - `suspend-after-exit` makes a thread that exits at once, then suspends,
;;   so that the call goes on once the thread exits and finds nothing ready.
(component
  (import "pending" (func $pending async))
  (type $future-u32 (future u32))
  (type $stream-u8 (stream u8))

  (component $P
    (import "pending" (func $pending async))
    (type $future-u32 (future u32))
    (type $stream-u8 (stream u8))
    (core module $Memory (memory (export "mem") 1))
    (core instance $memory (instantiate $Memory))
    (core func $pending (canon lower (func $pending)))
    (core func $future.read (canon future.read $future-u32 (memory (core memory $memory "mem"))))
    (core func $stream.read (canon stream.read $stream-u8 (memory (core memory $memory "mem"))))
    (core module $m
      (import "" "pending" (func $pending))
      (import "" "future.read" (func $future.read (param i32 i32) (result i32)))
      (import "" "stream.read" (func $stream.read (param i32 i32 i32) (result i32)))
      (func (export "start")
        (call $pending))
      (func (export "read-future") (param i32) (result i32)
        (call $future.read (local.get 0) (i32.const 0)))
      (func (export "read-stream") (param i32) (result i32)
        (call $stream.read (local.get 0) (i32.const 0) (i32.const 1)))
    )
    (core instance $i (instantiate $m (with "" (instance
      (export "pending" (func $pending))
      (export "future.read" (func $future.read))
      (export "stream.read" (func $stream.read))
    ))))
    (func (export "start") async
      (canon lift (core func $i "start")))
    (func (export "read-future") async (param "f" $future-u32) (result u32)
      (canon lift (core func $i "read-future") (memory (core memory $memory "mem"))))
    (func (export "read-stream") async (param "s" $stream-u8) (result u32)
      (canon lift (core func $i "read-stream") (memory (core memory $memory "mem"))))
  )

  (component $Q
    (core module $Memory (memory (export "mem") 1))
    (core instance $memory (instantiate $Memory))
    (core module $Table (table (export "table") 1 funcref))
    (core instance $table (instantiate $Table))
    (alias core export $table "table" (core table $table))
    (core type $start-func-ty (func (param i32)))

    (core func $waitable-set.new (canon waitable-set.new))
    (core func $waitable-set.wait (canon waitable-set.wait (memory (core memory $memory "mem"))))
    (core func $thread.new-indirect (canon thread.new-indirect $start-func-ty (core table $table)))
    (core func $thread.resume-later (canon thread.resume-later))
    (core func $thread.suspend (canon thread.suspend))

    (core module $m
      (import "" "waitable-set.new" (func $waitable-set.new (result i32)))
      (import "" "waitable-set.wait" (func $waitable-set.wait (param i32 i32) (result i32)))
      (import "" "thread.new-indirect" (func $thread.new-indirect (param i32 i32) (result i32)))
      (import "" "thread.resume-later" (func $thread.resume-later (param i32)))
      (import "" "thread.suspend" (func $thread.suspend (result i32)))
      (import "" "table" (table 1 funcref))

      (func $exit-at-once (param i32))
      (elem (i32.const 0) func $exit-at-once)

      (func (export "wait-empty")
        (drop (call $waitable-set.wait (call $waitable-set.new) (i32.const 0)))
        unreachable)

      (func (export "suspend-after-exit")
        (call $thread.resume-later (call $thread.new-indirect (i32.const 0) (i32.const 0)))
        (drop (call $thread.suspend))
        unreachable)
    )
    (core instance $i (instantiate $m (with "" (instance
      (export "waitable-set.new" (func $waitable-set.new))
      (export "waitable-set.wait" (func $waitable-set.wait))
      (export "thread.new-indirect" (func $thread.new-indirect))
      (export "thread.resume-later" (func $thread.resume-later))
      (export "thread.suspend" (func $thread.suspend))
      (export "table" (table $table))
    ))))
    (func (export "wait-empty")
      (canon lift (core func $i "wait-empty")))
    (func (export "suspend-after-exit")
      (canon lift (core func $i "suspend-after-exit")))
  )

  (instance $p (instantiate $P (with "pending" (func $pending))))
  (instance $q (instantiate $Q))
  (export "start" (func $p "start"))
  (export "read-future" (func $p "read-future"))
  (export "read-stream" (func $p "read-stream"))
  (export "wait-empty" (func $q "wait-empty"))
  (export "suspend-after-exit" (func $q "suspend-after-exit"))
)
