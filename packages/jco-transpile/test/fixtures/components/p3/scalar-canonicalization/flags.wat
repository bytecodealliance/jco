(component
  (type $f9 (flags "a" "b" "c" "d" "e" "f" "g" "h" "i"))
  (export $public "f9" (type $f9))
  (core module $M (func (export "junk") (result i32) (i32.const 0xffffff11)))
  (core instance $m (instantiate $M))
  (func (export "junk") (result $public) (canon lift (core func $m "junk"))))
