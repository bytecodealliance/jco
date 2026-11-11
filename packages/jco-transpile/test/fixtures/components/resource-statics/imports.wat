(component
  (type $ty-test:resource-statics/things (;0;)
    (instance
      (export (;0;) "thing" (type (sub resource)))
      (type (;1;) (func (result u32)))
      (export (;0;) "[static]thing.prototype" (func (type 1)))
      (export (;1;) "[static]thing.name" (func (type 1)))
      (export (;2;) "[static]thing.length" (func (type 1)))
      (export (;3;) "[static]thing.arguments" (func (type 1)))
      (export (;4;) "[static]thing.caller" (func (type 1)))
    )
  )
  (import "test:resource-statics/things" (instance $test:resource-statics/things (;0;) (type $ty-test:resource-statics/things)))
  (core module $main (;0;)
    (type (;0;) (func (result i32)))
    (import "test:resource-statics/things" "[static]thing.prototype" (func $prototype (;0;) (type 0) (result i32)))
    (import "test:resource-statics/things" "[static]thing.name" (func $name (;1;) (type 0) (result i32)))
    (import "test:resource-statics/things" "[static]thing.length" (func $length (;2;) (type 0) (result i32)))
    (import "test:resource-statics/things" "[static]thing.arguments" (func $arguments (;3;) (type 0) (result i32)))
    (import "test:resource-statics/things" "[static]thing.caller" (func $caller (;4;) (type 0) (result i32)))
    (memory (;0;) 1)
    (export "memory" (memory 0))
    (export "run" (func 5))
    (func (;5;) (type 0) (result i32)
      call $prototype
      call $name
      i32.add
      call $length
      i32.add
      call $arguments
      i32.add
      call $caller
      i32.add
    )
    (@producers
      (processed-by "wit-component" "0.262.0")
    )
  )
  (alias export $test:resource-statics/things "[static]thing.prototype" (func $"[static]thing.prototype" (;0;)))
  (core func $"[static]thing.prototype" (;0;) (canon lower (func $"[static]thing.prototype")))
  (alias export $test:resource-statics/things "[static]thing.name" (func $"[static]thing.name" (;1;)))
  (core func $"[static]thing.name" (;1;) (canon lower (func $"[static]thing.name")))
  (alias export $test:resource-statics/things "[static]thing.length" (func $"[static]thing.length" (;2;)))
  (core func $"[static]thing.length" (;2;) (canon lower (func $"[static]thing.length")))
  (alias export $test:resource-statics/things "[static]thing.arguments" (func $"[static]thing.arguments" (;3;)))
  (core func $"[static]thing.arguments" (;3;) (canon lower (func $"[static]thing.arguments")))
  (alias export $test:resource-statics/things "[static]thing.caller" (func $"[static]thing.caller" (;4;)))
  (core func $"[static]thing.caller" (;4;) (canon lower (func $"[static]thing.caller")))
  (core instance $test:resource-statics/things (;0;)
    (export "[static]thing.prototype" (func $"[static]thing.prototype"))
    (export "[static]thing.name" (func $"[static]thing.name"))
    (export "[static]thing.length" (func $"[static]thing.length"))
    (export "[static]thing.arguments" (func $"[static]thing.arguments"))
    (export "[static]thing.caller" (func $"[static]thing.caller"))
  )
  (core instance $main (;1;) (instantiate $main
      (with "test:resource-statics/things" (instance $test:resource-statics/things))
    )
  )
  (alias core export $main "memory" (core memory $memory (;0;)))
  (type (;1;) (func (result u32)))
  (alias core export $main "run" (core func $run (;5;)))
  (func $run (;5;) (type 1) (canon lift (core func $run)))
  (export $"#func6 run" (@name "run") (;6;) "run" (func $run))
  (@producers
    (processed-by "wit-component" "0.262.0")
  )
)
