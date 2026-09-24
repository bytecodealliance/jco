(component
  ;; The callee exposes explicit backpressure controls around an async export.
  ;; The export body is unreachable: both test paths cancel it before entry.
  (component $C
    (core module $M
      (import "" "backpressure.inc" (func $backpressure.inc))
      (import "" "backpressure.dec" (func $backpressure.dec))
      (func (export "inc") (call $backpressure.inc))
      (func (export "dec") (call $backpressure.dec))
      (func (export "f") (result i32) unreachable)
      (func (export "f-cb") (param i32 i32 i32) (result i32) unreachable)
    )
    (canon backpressure.inc (core func $backpressure.inc))
    (canon backpressure.dec (core func $backpressure.dec))
    (core instance $m (instantiate $M (with "" (instance
      (export "backpressure.inc" (func $backpressure.inc))
      (export "backpressure.dec" (func $backpressure.dec))
    ))))
    (func (export "inc") (canon lift (core func $m "inc")))
    (func (export "dec") (canon lift (core func $m "dec")))
    (func (export "f") async (canon lift
      (core func $m "f") async (callback (core func $m "f-cb"))))
  )
  (instance $c (instantiate $C))

  (component $D
    (import "inc" (func $inc))
    (import "dec" (func $dec))
    (import "f" (func $f async))
    (core module $M
      (import "" "inc" (func $inc))
      (import "" "dec" (func $dec))
      (import "" "f" (func $f (result i32)))
      (import "" "task.return" (func $task.return (param i32)))
      (import "" "subtask.cancel" (func $subtask.cancel (param i32) (result i32)))
      (import "" "subtask.drop" (func $subtask.drop (param i32)))

      (func $cancel (result i32)
        (local $packed i32)
        (local $subtask i32)
        (local.set $packed (call $f))
        (if (i32.ne (i32.const 0 (; STARTING ;))
                    (i32.and (local.get $packed) (i32.const 0xf)))
          (then unreachable))
        (local.set $subtask (i32.shr_u (local.get $packed) (i32.const 4)))
        (if (i32.ne (i32.const 3 (; CANCELLED_BEFORE_STARTED ;))
                    (call $subtask.cancel (local.get $subtask)))
          (then unreachable))
        (call $subtask.drop (local.get $subtask))
        (i32.const 42)
      )

      ;; Leaves backpressure enabled after cancellation. The runtime must still
      ;; discard its suspended entry and allow the host process to become idle.
      (func (export "run-persistent") (result i32)
        (call $inc)
        (call $task.return (call $cancel))
        (i32.const 0 (; EXIT ;)))

      ;; Clears backpressure after cancellation so repeated calls can verify
      ;; that each canceled task is removed from the runtime task registry.
      (func (export "run-release") (result i32)
        (local $result i32)
        (call $inc)
        (local.set $result (call $cancel))
        (call $dec)
        (call $task.return (local.get $result))
        (i32.const 0 (; EXIT ;)))

      (func (export "callback") (param i32 i32 i32) (result i32) unreachable)
    )
    (canon lower (func $inc) (core func $inc'))
    (canon lower (func $dec) (core func $dec'))
    (canon lower (func $f) async (core func $f'))
    (canon task.return (result u32) (core func $task.return))
    (canon subtask.cancel (core func $subtask.cancel))
    (canon subtask.drop (core func $subtask.drop))
    (core instance $m (instantiate $M (with "" (instance
      (export "inc" (func $inc'))
      (export "dec" (func $dec'))
      (export "f" (func $f'))
      (export "task.return" (func $task.return))
      (export "subtask.cancel" (func $subtask.cancel))
      (export "subtask.drop" (func $subtask.drop))
    ))))
    (func (export "run-persistent") async (result u32) (canon lift
      (core func $m "run-persistent") async (callback (core func $m "callback"))))
    (func (export "run-release") async (result u32) (canon lift
      (core func $m "run-release") async (callback (core func $m "callback"))))
  )
  (instance $d (instantiate $D
    (with "inc" (func $c "inc"))
    (with "dec" (func $c "dec"))
    (with "f" (func $c "f"))))

  (func (export "run-persistent") (alias export $d "run-persistent"))
  (func (export "run-release") (alias export $d "run-release"))
)
