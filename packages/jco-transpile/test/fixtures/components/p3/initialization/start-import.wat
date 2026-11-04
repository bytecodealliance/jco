(component
  (component $C
    (core module $M (func (export "answer") (result i32) (i32.const 42)))
    (core instance $m (instantiate $M))
    (func (export "answer") (result u32) (canon lift (core func $m "answer"))))
  (instance $c (instantiate $C))
  (core func $answer (canon lower (func $c "answer")))
  (core module $M
    (import "" "answer" (func $answer (result i32)))
    (global $value (mut i32) (i32.const 0))
    (func $start (global.set $value (call $answer)))
    (start $start)
    (func (export "run") (result i32) (global.get $value)))
  (core instance $m (instantiate $M (with "" (instance (export "answer" (func $answer))))))
  (func (export "run") (result u32) (canon lift (core func $m "run"))))
