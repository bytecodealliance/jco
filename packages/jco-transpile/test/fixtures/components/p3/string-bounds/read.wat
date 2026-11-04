(component
  (core module $M
    (memory (export "mem") 1)
    (data (i32.const 8) "\ff\c3")
    (data (i32.const 16) "ok")
    (func (export "read") (param $ptr i32) (param $len i32) (result i32)
      (i32.store (i32.const 0) (local.get $ptr))
      (i32.store (i32.const 4) (local.get $len))
      (i32.const 0)))
  (core instance $m (instantiate $M))
  (func (export "read") (param "ptr" u32) (param "len" u32) (result string)
    (canon lift (core func $m "read") (memory (core memory $m "mem")))))
