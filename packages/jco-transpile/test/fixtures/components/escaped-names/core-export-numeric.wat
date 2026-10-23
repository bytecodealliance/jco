;; A numeric core export needs asm.js identifier mangling ("0" becomes "$0").
;; The lifted run function must still find that export and return 42.
(component
  (core module $m
    (func (export "0") (result i32) (i32.const 42)))
  (core instance $i (instantiate $m))
  (func (export "run") (result u32)
    (canon lift (core func $i "0"))))
