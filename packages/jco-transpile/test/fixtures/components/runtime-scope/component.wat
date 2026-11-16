(component

  ;; The names of these imports become local names in generated bindings that
  ;; are also the names of globals used by the Component Model runtime: classes
  ;; for the resources (`WeakSet`, `Symbol`, `Number`), and functions for the
  ;; rest (`setTimeout`, `queueMicrotask`).
  (import "test:scope/host" (instance $host
    (export "weak-set" (type $weak-set (sub resource)))
    (export "symbol" (type $symbol (sub resource)))
    (export "number" (type $number (sub resource)))
    (export "[constructor]weak-set" (func (result (own $weak-set))))
    (export "[constructor]symbol" (func (result (own $symbol))))
    (export "[constructor]number" (func (result (own $number))))
    (export "set-timeout" (func))
    (export "queue-microtask" (func))
  ))

  ;; Getting and setting a context value runs the runtime's task bookkeeping
  (core module $helper
    (import "" "context.set" (func $context.set (param i32)))
    (import "" "context.get" (func $context.get (result i32)))
    (import "host" "weak-set" (func (result i32)))
    (import "host" "symbol" (func (result i32)))
    (import "host" "number" (func (result i32)))
    (import "host" "set-timeout" (func))
    (import "host" "queue-microtask" (func))

    (func (export "push-context") (param $val i32) (result i32)
      (call $context.set (local.get $val))
      (local.get $val))

    (func (export "pull-context") (result i32)
      (call $context.get))
  )

  (canon context.set i32 0 (core func $context.set))
  (canon context.get i32 0 (core func $context.get))
  (core func $weak-set (canon lower (func $host "[constructor]weak-set")))
  (core func $symbol (canon lower (func $host "[constructor]symbol")))
  (core func $number (canon lower (func $host "[constructor]number")))
  (core func $set-timeout (canon lower (func $host "set-timeout")))
  (core func $queue-microtask (canon lower (func $host "queue-microtask")))

  (core instance $helper_inst
    (instantiate $helper
      (with "" (instance
        (export "context.get" (func $context.get))
        (export "context.set" (func $context.set))))
      (with "host" (instance
        (export "weak-set" (func $weak-set))
        (export "symbol" (func $symbol))
        (export "number" (func $number))
        (export "set-timeout" (func $set-timeout))
        (export "queue-microtask" (func $queue-microtask))))
    )
  )

  (func (export "push-context") (param "val" u32) (result u32)
    (canon lift (core func $helper_inst "push-context")))

  (func (export "pull-context") (result u32)
    (canon lift (core func $helper_inst "pull-context")))
)
