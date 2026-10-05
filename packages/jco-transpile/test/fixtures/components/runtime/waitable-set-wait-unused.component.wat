;; Lowers `waitable-set.wait` without calling it; `run` returns 42.
(component
  (core module $Memory (memory (export "mem") 1))
  (core instance $memory (instantiate $Memory))
  (core module $M
    (import "" "mem" (memory 1))
    (import "" "waitable-set.wait" (func $wait (param i32 i32) (result i32)))
    (func (export "run") (result i32) (i32.const 42)))
  (core func $waitable-set.wait (canon waitable-set.wait (memory (core memory $memory "mem"))))
  (core instance $m (instantiate $M (with "" (instance
    (export "mem" (memory $memory "mem"))
    (export "waitable-set.wait" (func $waitable-set.wait))))))
  (func (export "run") (result u32) (canon lift (core func $m "run"))))
