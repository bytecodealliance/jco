;; A sync-lifted, async-typed export makes two async-lowered calls into a
;; callback-lifted export of another component. The first callee raises
;; backpressure and yields, which suspends it while the second call is
;; prepared. The second callee is therefore forced through delayed entry.
;; Once the first resumes it clears backpressure, makes a sync-lowered call
;; into a third component, and returns. String lowering in the delayed fused
;; start adapter calls the callee's realloc, which observes context slot 0 and
;; therefore requires the deferred task metadata to be installed first.
(component
  (component $leaf
    (core module $m (func (export "leaf")))
    (core instance $i (instantiate $m))
    (func (export "leaf") (canon lift (core func $i "leaf")))
  )
  (instance $leaf (instantiate $leaf))

  (component $mid
    (import "leaf" (func $leaf))

    (core func $get0 (canon context.get i32 0))
    (core module $libc
      (import "context" "get0" (func $get0 (result i32)))
      (memory (export "mem") 1)
      (func (export "realloc") (param i32 i32 i32 i32) (result i32)
        (if (call $get0) (then unreachable))
        (i32.const 64)))
    (core instance $context (export "get0" (func $get0)))
    (core instance $libc
      (instantiate $libc (with "context" (instance $context))))

    (core func $leaf (canon lower (func $leaf)))
    (core func $backpressure-inc (canon backpressure.inc))
    (core func $backpressure-dec (canon backpressure.dec))
    (core func $yield (canon thread.yield))
    (core func $task-return (canon task.return))

    (core module $m
      (import "" "leaf" (func $leaf))
      (import "" "backpressure.inc" (func $backpressure-inc))
      (import "" "backpressure.dec" (func $backpressure-dec))
      (import "" "thread.yield" (func $yield (result i32)))
      (import "" "task.return" (func $task-return))

      (global $completed (mut i32) (i32.const 0))

      (func (export "mid") (param i32 i32) (result i32)
        (call $backpressure-inc)
        (drop (call $yield))
        (call $backpressure-dec)
        (call $leaf)
        (global.set $completed (i32.add (global.get $completed) (i32.const 1)))
        (call $task-return)
        (i32.const 0))

      (func (export "callback") (param i32 i32 i32) (result i32)
        (i32.const 0))

      (func (export "completed") (result i32)
        (global.get $completed))
    )

    (core instance $i
      (instantiate $m
        (with "" (instance
          (export "leaf" (func $leaf))
          (export "backpressure.inc" (func $backpressure-inc))
          (export "backpressure.dec" (func $backpressure-dec))
          (export "thread.yield" (func $yield))
          (export "task.return" (func $task-return))
        ))
      )
    )

    (func (export "mid") async (param "value" string)
      (canon lift (core func $i "mid") async (callback (core func $i "callback"))
        (memory (core memory $libc "mem")) (realloc (core func $libc "realloc"))))
    (func (export "completed") (result u32)
      (canon lift (core func $i "completed")))
  )
  (instance $mid (instantiate $mid (with "leaf" (func $leaf "leaf"))))

  (component $top
    (import "mid" (func $mid async (param "value" string)))

    (core module $libc
      (memory (export "mem") 1)
      (data (i32.const 64) "hey"))
    (core instance $libc (instantiate $libc))

    ;; async-lowered
    (core func $mid (canon lower (func $mid) async (memory (core memory $libc "mem"))))

    (core module $m
      (import "" "mid" (func $mid (param i32 i32) (result i32)))

      ;; Returns the two calls' packed subtask states, first call in the high byte.
      (func (export "run") (result i32)
        (local $first i32)
        (local.set $first (call $mid (i32.const 64) (i32.const 3)))
        (i32.or
          (i32.shl (local.get $first) (i32.const 8))
          (call $mid (i32.const 64) (i32.const 3))))
    )

    (core instance $i
      (instantiate $m
        (with "" (instance
          (export "mid" (func $mid))
        ))
      )
    )

    ;; sync-lifted, async-typed
    (func (export "run") async (result u32)
      (canon lift (core func $i "run") (memory (core memory $libc "mem"))))
  )
  (instance $top (instantiate $top (with "mid" (func $mid "mid"))))

  (export "run" (func $top "run"))
  (export "completed" (func $mid "completed"))
)
