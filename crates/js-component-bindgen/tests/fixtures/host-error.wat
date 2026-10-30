(component
  (import "fail" (func $fail))
  (core func $fail (canon lower (func $fail)))
  (core module $m
    (import "" "fail" (func $fail))
    (func (export "run") (call $fail)))
  (core instance $i (instantiate $m (with "" (instance (export "fail" (func $fail))))))
  (func (export "run") (canon lift (core func $i "run"))))
