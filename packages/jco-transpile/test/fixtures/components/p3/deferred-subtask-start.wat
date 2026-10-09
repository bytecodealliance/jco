;; A sync-lifted, async-typed export makes two async-lowered calls into a
;; callback-lifted export of another component. The first callee yields, which
;; suspends it while the second call is prepared, then makes a sync-lowered
;; call into a third component and returns. The second callee's entry is
;; deferred (the first holds the component's slice), and must still be
;; attributed to the right task and never fail outside the call.
(component
  (component $leaf
    (core module $m (func (export "leaf")))
    (core instance $i (instantiate $m))
    (func (export "leaf") (canon lift (core func $i "leaf")))
  )
  (instance $leaf (instantiate $leaf))

  (component $mid
    (import "leaf" (func $leaf))

    (core module $libc (memory (export "mem") 1))
    (core instance $libc (instantiate $libc))

    (core func $leaf (canon lower (func $leaf)))
    (core func $yield (canon thread.yield))
    (core func $task-return (canon task.return))

    (core module $m
      (import "" "leaf" (func $leaf))
      (import "" "thread.yield" (func $yield (result i32)))
      (import "" "task.return" (func $task-return))

      (func (export "mid") (result i32)
        (drop (call $yield))
        (call $leaf)
        (call $task-return)
        (i32.const 0))

      (func (export "callback") (param i32 i32 i32) (result i32)
        (i32.const 0))
    )

    (core instance $i
      (instantiate $m
        (with "" (instance
          (export "leaf" (func $leaf))
          (export "thread.yield" (func $yield))
          (export "task.return" (func $task-return))
        ))
      )
    )

    (func (export "mid") async
      (canon lift (core func $i "mid") async (callback (core func $i "callback"))
        (memory (core memory $libc "mem"))))
  )
  (instance $mid (instantiate $mid (with "leaf" (func $leaf "leaf"))))

  (component $top
    (import "mid" (func $mid async))

    (core module $libc (memory (export "mem") 1))
    (core instance $libc (instantiate $libc))

    ;; async-lowered
    (core func $mid (canon lower (func $mid) async (memory (core memory $libc "mem"))))

    (core module $m
      (import "" "mid" (func $mid (result i32)))

      ;; Returns the two calls' packed subtask states, first call in the high byte.
      (func (export "run") (result i32)
        (local $first i32)
        (local.set $first (call $mid))
        (i32.or (i32.shl (local.get $first) (i32.const 8)) (call $mid)))
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
)
