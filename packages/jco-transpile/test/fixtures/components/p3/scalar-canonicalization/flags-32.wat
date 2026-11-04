(component
  (type $flags (flags "f0" "f1" "f2" "f3" "f4" "f5" "f6" "f7" "f8" "f9" "f10" "f11" "f12" "f13" "f14" "f15" "f16" "f17" "f18" "f19" "f20" "f21" "f22" "f23" "f24" "f25" "f26" "f27" "f28" "f29" "f30" "f31"))
  (export $public "f32" (type $flags))
  (core module $M
    (func (export "junk") (result i32) (i32.const -1)))
  (core instance $m (instantiate $M))
  (func (export "junk") (result $public)
    (canon lift (core func $m "junk"))))
