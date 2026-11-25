;; The $Tester component of upstream component-model
;; test/async/exit-without-resolving.wast (#767). Jco skips that WAST fixture
;; because its synchronous case reports deadlock instead of the synchronous
;; blocking trap; canonical-abi-traps.ts runs all three cases against this copy.
(component
  (component $C
    (core module $Core
      (func (export "exit") (result i32)
        (i32.const 0 (; EXIT ;)))
      (func (export "unreachable-cb") (param i32 i32 i32) (result i32)
        unreachable)
    )
    (core instance $core (instantiate $Core))
    (func (export "exit") async
      (canon lift (core func $core "exit") async (callback (core func $core "unreachable-cb"))))
  )
  (component $D
    (import "c" (instance $c
      (export "exit" (func async))
    ))
    (core module $Core
      (import "" "sync-exit" (func $sync-exit))
      (import "" "async-exit" (func $async-exit (result i32)))
      (import "" "waitable-set.new" (func $waitable-set.new (result i32)))
      (import "" "waitable.join" (func $waitable.join (param i32 i32)))

      ;; non-async-typed: synchronously wait for a subtask that will never
      ;; resolve
      (func (export "sync-typed-wait") (result i32)
        (call $sync-exit)
        unreachable)

      ;; async-typed: start a subtask that runs until its thread exits, leaving
      ;; the subtask unresolved, and then WAIT for the subtask to resolve
      (func (export "async-typed-wait") (result i32)
        (local $ret i32) (local $ws i32)
        (local.set $ret (call $async-exit))
        (if (i32.ne (i32.and (local.get $ret) (i32.const 0xf)) (i32.const 1 (; STARTED ;)))
          (then unreachable))
        (local.set $ws (call $waitable-set.new))
        (call $waitable.join (i32.shr_u (local.get $ret) (i32.const 4)) (local.get $ws))
        (i32.or (i32.const 2 (; WAIT ;)) (i32.shl (local.get $ws) (i32.const 4))))
      (func (export "unreachable-cb") (param i32 i32 i32) (result i32)
        unreachable)

      ;; non-async-typed: start a subtask that runs until its thread exits,
      ;; leaving the subtask unresolved, and then return a value anyway
      (func (export "no-wait") (result i32)
        (if (i32.ne (i32.and (call $async-exit) (i32.const 0xf)) (i32.const 1 (; STARTED ;)))
          (then unreachable))
        (i32.const 42))
    )
    (canon lower (func $c "exit") (core func $sync-exit))
    (canon lower (func $c "exit") async (core func $async-exit))
    (canon waitable-set.new (core func $waitable-set.new))
    (canon waitable.join (core func $waitable.join))
    (core instance $core (instantiate $Core (with "" (instance
      (export "sync-exit" (func $sync-exit))
      (export "async-exit" (func $async-exit))
      (export "waitable-set.new" (func $waitable-set.new))
      (export "waitable.join" (func $waitable.join))
    ))))
    (func (export "sync-typed-wait") (result u32)
      (canon lift (core func $core "sync-typed-wait")))
    (func (export "async-typed-wait") async (result u32)
      (canon lift (core func $core "async-typed-wait") async (callback (core func $core "unreachable-cb"))))
    (func (export "no-wait") (result u32)
      (canon lift (core func $core "no-wait")))
  )
  (instance $c (instantiate $C))
  (instance $d (instantiate $D (with "c" (instance $c))))
  (func (export "sync-typed-wait") (alias export $d "sync-typed-wait"))
  (func (export "async-typed-wait") (alias export $d "async-typed-wait"))
  (func (export "no-wait") (alias export $d "no-wait"))
)
