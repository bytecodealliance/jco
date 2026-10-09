;; `resource.drop` and `resource.rep` trap on a handle index past the end of
;; the handle table (Canonical ABI `Table.get`), not only on index 0.
(component
  (type $thing (resource (rep i32)))
  (core func $new (canon resource.new $thing))
  (core func $rep (canon resource.rep $thing))
  (core func $drop (canon resource.drop $thing))

  (core module $m
    (import "resource" "new" (func $new (param i32) (result i32)))
    (import "resource" "rep" (func $rep (param i32) (result i32)))
    (import "resource" "drop" (func $drop (param i32)))

    (func (export "drop-missing")
      (call $drop (i32.const 1)))

    (func (export "rep-missing") (result i32)
      (call $rep (i32.const 1)))

    (func (export "roundtrip") (result i32)
      (local $h i32) (local $r i32)
      (local.set $h (call $new (i32.const 7)))
      (local.set $r (call $rep (local.get $h)))
      (call $drop (local.get $h))
      (local.get $r))
  )

  (core instance $i
    (instantiate $m
      (with "resource" (instance
        (export "new" (func $new))
        (export "rep" (func $rep))
        (export "drop" (func $drop))
      ))
    )
  )

  (func (export "drop-missing") (canon lift (core func $i "drop-missing")))
  (func (export "rep-missing") (result u32) (canon lift (core func $i "rep-missing")))
  (func (export "roundtrip") (result u32) (canon lift (core func $i "roundtrip")))
)
