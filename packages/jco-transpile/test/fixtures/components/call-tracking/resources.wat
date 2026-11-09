;; Resource constructor and method with an explicit receiver.
(component
  (component $api
    (type $r (resource (rep i32)))
    (core func $new (canon resource.new $r))
    (core module $m
      (import "" "new" (func $new (param i32) (result i32)))
      (func (export "new") (param i32) (result i32) (call $new (local.get 0)))
      (func (export "get") (param i32) (result i32) (local.get 0)))
    (core instance $i (instantiate $m (with "" (instance (export "new" (func $new))))))
    (export $thing "thing" (type $r))
    (func (export "[constructor]thing") (param "value" u32) (result (own $thing))
      (canon lift (core func $i "new")))
    (func (export "[method]thing.get") (param "self" (borrow $thing)) (result u32)
      (canon lift (core func $i "get")))
  )
  (instance $api (instantiate $api))
  (export "api" (instance $api)))
