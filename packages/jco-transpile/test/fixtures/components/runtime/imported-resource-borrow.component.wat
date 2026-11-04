(component
  (import "host" (instance $host
    (export "thing" (type $thing (sub resource)))
    (export "[constructor]thing" (func (result (own $thing))))
    (export "observe" (func (param "value" (borrow $thing)) (result u32)))
  ))
  (alias export $host "[constructor]thing" (func $new))
  (alias export $host "observe" (func $observe))
  (core func $new (canon lower (func $new)))
  (core func $observe (canon lower (func $observe)))
  (core module $module
    (import "host" "new" (func $new (result i32)))
    (import "host" "observe" (func $observe (param i32) (result i32)))
    (global $live (mut i32) (i32.const 0))
    (func (export "seed") (result i32)
      call $new
      global.set $live
      global.get $live)
    (func (export "run") (param i32) (result i32)
      local.get 0
      call $observe)
    (func (export "identity") (param i32) (result i32) local.get 0)
  )
  (core instance $instance (instantiate $module
    (with "host" (instance
      (export "new" (func $new))
      (export "observe" (func $observe))
    ))
  ))
  (func (export "seed") (result u32) (canon lift (core func $instance "seed")))
  (func (export "run") (param "handle" u32) (result u32)
    (canon lift (core func $instance "run")))
  (alias export $host "thing" (type $thing))
  (func (export "forge-own") (param "value" (borrow $thing)) (result (own $thing))
    (canon lift (core func $instance "identity")))
  (func (export "roundtrip-own") (param "value" (own $thing)) (result (own $thing))
    (canon lift (core func $instance "identity")))
)
