;; A destructor's context belongs to its own call, even when the resource is
;; dropped inside its defining component. SDK 34 uses slot 0 for its stack.
(component
  (core func $get0 (canon context.get i32 0))
  (core func $set0 (canon context.set i32 0))
  (core instance $context
    (export "get0" (func $get0))
    (export "set0" (func $set0)))
  (core module $destructor
    (import "context" "get0" (func $get0 (result i32)))
    (import "context" "set0" (func $set0 (param i32)))
    (global $drops (mut i32) (i32.const 0))
    (func (export "drop") (param i32)
      (if (call $get0) (then unreachable))
      (call $set0 (i32.const 99))
      (global.set $drops (i32.add (global.get $drops) (i32.const 1))))
    (func (export "drops") (result i32) (global.get $drops)))
  (core instance $destructor (instantiate $destructor (with "context" (instance $context))))
  (type $thing (resource (rep i32) (dtor (func $destructor "drop"))))
  (core func $new (canon resource.new $thing))
  (core func $drop (canon resource.drop $thing))
  (core module $caller
    (import "context" "get0" (func $get0 (result i32)))
    (import "context" "set0" (func $set0 (param i32)))
    (import "resource" "new" (func $new (param i32) (result i32)))
    (import "resource" "drop" (func $drop (param i32)))
    (func (export "make") (result i32) (call $new (i32.const 1)))
    (func (export "run")
      (if (call $get0) (then unreachable))
      (call $set0 (i32.const 42))
      (call $drop (call $new (i32.const 1)))
      (if (i32.ne (call $get0) (i32.const 42)) (then unreachable))))
  (core instance $caller (instantiate $caller
    (with "context" (instance $context))
    (with "resource" (instance
      (export "new" (func $new))
      (export "drop" (func $drop))))))
  (func $make (result (own $thing)) (canon lift (core func $caller "make")))
  (instance $api
    (export "thing" (type $thing))
    (export "make" (func $make)))
  (export "api" (instance $api))
  (func (export "run") (canon lift (core func $caller "run")))
  (func (export "drops") (result u32) (canon lift (core func $destructor "drops"))))
