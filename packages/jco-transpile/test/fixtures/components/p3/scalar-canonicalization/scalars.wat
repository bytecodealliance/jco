(component
  (core module $M
    (func (export "id") (param i32) (result i32) (local.get 0)))
  (core instance $m (instantiate $M))
  (func (export "u8") (param "value" u32) (result u8) (canon lift (core func $m "id")))
  (func (export "s8") (param "value" u32) (result s8) (canon lift (core func $m "id")))
  (func (export "u16") (param "value" u32) (result u16) (canon lift (core func $m "id")))
  (func (export "s16") (param "value" u32) (result s16) (canon lift (core func $m "id")))
  (func (export "bool") (param "value" u32) (result bool) (canon lift (core func $m "id")))
  (func (export "char") (param "value" u32) (result char) (canon lift (core func $m "id"))))
