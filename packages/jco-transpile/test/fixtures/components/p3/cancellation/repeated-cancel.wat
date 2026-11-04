(component
  (type $S (stream u32))
  (core module $Mem (memory (export "mem") 1))
  (core instance $mem (instantiate $Mem))
  (canon stream.read $S async (memory (core memory $mem "mem")) (core func $read))
  (canon stream.cancel-read $S async (core func $cancel))
  (core module $M
    (import "" "read" (func $read (param i32 i32 i32) (result i32)))
    (import "" "cancel" (func $cancel (param i32) (result i32)))
    (func (export "run") (param $source i32) (result i32)
      (drop (call $read (local.get $source) (i32.const 0) (i32.const 1)))
      (drop (call $cancel (local.get $source)))
      (call $cancel (local.get $source))))
  (core instance $m (instantiate $M (with "" (instance
    (export "read" (func $read)) (export "cancel" (func $cancel))))))
  (func (export "run") (param "source" $S) (result u32) (canon lift (core func $m "run"))))
