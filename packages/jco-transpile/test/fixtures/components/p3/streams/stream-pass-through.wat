;; Returns the readable end of each stream it is given, without reading from it.
(component
  (type $bytes (stream u8))
  (type $strings (stream string))

  (core module $m
    (memory (export "mem") 1)
    (func (export "realloc") (param i32 i32 i32 i32) (result i32) (i32.const 1024))
    (func (export "pass") (param i32) (result i32) (local.get 0))
  )
  (core instance $i (instantiate $m))

  (func (export "pass-bytes") (param "s" $bytes) (result $bytes)
    (canon lift (core func $i "pass")))
  (func (export "pass-strings") (param "s" $strings) (result $strings)
    (canon lift (core func $i "pass")
      (memory (core memory $i "mem")) (realloc (core func $i "realloc"))))
)
