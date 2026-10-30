(component
  (component $callee
    (type $r (resource (rep i32)))
    (export $r-export "r" (type $r))
    (core func $new (canon resource.new $r-export))
    (core module $m
      (import "" "new" (func $new (param i32) (result i32)))
      (func (export "make") (result i32) (call $new (i32.const 7))))
    (core instance $i (instantiate $m (with "" (instance (export "new" (func $new))))))
    (func (export "make") (result (own $r-export)) (canon lift (core func $i "make"))))
  (instance $callee (instantiate $callee))
  (component $caller
    (import "r" (type $r (sub resource)))
    (import "make" (func $make (result (own $r))))
    (core func $make (canon lower (func $make)))
    (core func $set-new (canon waitable-set.new))
    (core module $m
      (import "" "make" (func $make (result i32)))
      (import "" "set-new" (func $set-new (result i32)))
      (func (export "run") (result i32)
        (i32.or (i32.shl (call $make) (i32.const 8)) (call $set-new))))
    (core instance $i (instantiate $m (with "" (instance
      (export "make" (func $make)) (export "set-new" (func $set-new))))))
    (func (export "run") (result u32) (canon lift (core func $i "run"))))
  (instance $caller (instantiate $caller
    (with "r" (type $callee "r")) (with "make" (func $callee "make"))))
  (export "run" (func $caller "run")))
