;; Identity export for invocation handles and generated type checks.
(component
  (core module $m (func (export "run") (param i32) (result i32) (local.get 0)))
  (core instance $i (instantiate $m))
  (func (export "run") (param "value" u32) (result u32) (canon lift (core func $i "run"))))
