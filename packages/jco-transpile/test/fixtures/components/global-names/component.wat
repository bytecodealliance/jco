(component

  ;; The names of these imports become local names in generated bindings that
  ;; are also the names of globals used by the bindings and their runtime:
  ;; classes for the resources (`Map`, `Set`, `Symbol`, `Number`, `WeakSet`),
  ;; and functions for the rest (`console`, `setTimeout`, `queueMicrotask`).
  (import "test:names/host" (instance $host
    (export "map" (type $map (sub resource)))
    (export "set" (type $set (sub resource)))
    (export "symbol" (type $symbol (sub resource)))
    (export "number" (type $number (sub resource)))
    (export "weak-set" (type $weak-set (sub resource)))
    (export "[constructor]map" (func (result (own $map))))
    (export "[constructor]set" (func (result (own $set))))
    (export "[constructor]symbol" (func (result (own $symbol))))
    (export "[constructor]number" (func (result (own $number))))
    (export "[constructor]weak-set" (func (result (own $weak-set))))
    (export "console" (func))
    (export "set-timeout" (func))
    (export "queue-microtask" (func))
  ))

  ;; Getting and setting a context value runs the runtime's task bookkeeping
  (core module $helper
    (import "" "context.set" (func $context.set (param i32)))
    (import "" "context.get" (func $context.get (result i32)))
    (import "host" "map" (func (result i32)))
    (import "host" "set" (func (result i32)))
    (import "host" "symbol" (func (result i32)))
    (import "host" "number" (func (result i32)))
    (import "host" "weak-set" (func (result i32)))
    (import "host" "console" (func))
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
  (core func $new-map (canon lower (func $host "[constructor]map")))
  (core func $new-set (canon lower (func $host "[constructor]set")))
  (core func $new-symbol (canon lower (func $host "[constructor]symbol")))
  (core func $new-number (canon lower (func $host "[constructor]number")))
  (core func $new-weak-set (canon lower (func $host "[constructor]weak-set")))
  (core func $console (canon lower (func $host "console")))
  (core func $set-timeout (canon lower (func $host "set-timeout")))
  (core func $queue-microtask (canon lower (func $host "queue-microtask")))

  (core instance $helper_inst
    (instantiate $helper
      (with "" (instance
        (export "context.get" (func $context.get))
        (export "context.set" (func $context.set))))
      (with "host" (instance
        (export "map" (func $new-map))
        (export "set" (func $new-set))
        (export "symbol" (func $new-symbol))
        (export "number" (func $new-number))
        (export "weak-set" (func $new-weak-set))
        (export "console" (func $console))
        (export "set-timeout" (func $set-timeout))
        (export "queue-microtask" (func $queue-microtask))))
    )
  )

  (func (export "push-context") (param "val" u32) (result u32)
    (canon lift (core func $helper_inst "push-context")))

  (func (export "pull-context") (result u32)
    (canon lift (core func $helper_inst "pull-context")))
)
