;; A handle index is a u32: setting bit 31 of a live index names an
;; out-of-range entry, so the built-in must trap (Canonical ABI `Table.get`)
;; rather than resolve the live entry the low 31 bits name.
(component
  (type $thing (resource (rep i32)))
  (core func $resource-new (canon resource.new $thing))
  (core func $resource-rep (canon resource.rep $thing))
  (core func $resource-drop (canon resource.drop $thing))

  (core module $Table (table (export "t") 2 funcref))
  (core instance $table (instantiate $Table))
  (alias core export $table "t" (core table $tbl))

  (core type $start-ty (func (param i32)))
  (core func $thread-new (canon thread.new-indirect $start-ty (core table $tbl)))
  (core func $thread-resume-later (canon thread.resume-later))
  (core func $ws-new (canon waitable-set.new))
  (core func $ws-drop (canon waitable-set.drop))

  (core module $m
    (import "" "resource.new" (func $resource-new (param i32) (result i32)))
    (import "" "resource.rep" (func $resource-rep (param i32) (result i32)))
    (import "" "resource.drop" (func $resource-drop (param i32)))
    (import "" "thread.new-indirect" (func $thread-new (param i32 i32) (result i32)))
    (import "" "thread.resume-later" (func $thread-resume-later (param i32)))
    (import "" "waitable-set.new" (func $ws-new (result i32)))
    (import "" "waitable-set.drop" (func $ws-drop (param i32)))
    (import "" "t" (table $t 2 funcref))

    (func $start (param i32))
    (elem (table $t) (i32.const 0) func $start)

    (func (export "resume-alias") (result i32)
      (local $i i32)
      (local.set $i (call $thread-new (i32.const 0) (i32.const 0)))
      (call $thread-resume-later (i32.or (local.get $i) (i32.const 0x80000000)))
      (local.get $i))

    (func (export "ws-drop-alias") (result i32)
      (local $s i32)
      (local.set $s (call $ws-new))
      (call $ws-drop (i32.or (local.get $s) (i32.const 0x80000000)))
      (local.get $s))

    (func (export "rep-alias") (result i32)
      (local $h i32)
      (local.set $h (call $resource-new (i32.const 7)))
      (call $resource-rep (i32.or (local.get $h) (i32.const 0x80000000))))

    (func (export "drop-alias") (result i32)
      (local $h i32)
      (local.set $h (call $resource-new (i32.const 7)))
      (call $resource-drop (i32.or (local.get $h) (i32.const 0x80000000)))
      (local.get $h))
  )

  (core instance $i
    (instantiate $m
      (with "" (instance
        (export "resource.new" (func $resource-new))
        (export "resource.rep" (func $resource-rep))
        (export "resource.drop" (func $resource-drop))
        (export "thread.new-indirect" (func $thread-new))
        (export "thread.resume-later" (func $thread-resume-later))
        (export "waitable-set.new" (func $ws-new))
        (export "waitable-set.drop" (func $ws-drop))
        (export "t" (table $tbl))
      ))
    )
  )

  (func (export "resume-alias") (result u32) (canon lift (core func $i "resume-alias")))
  (func (export "ws-drop-alias") (result u32) (canon lift (core func $i "ws-drop-alias")))
  (func (export "rep-alias") (result u32) (canon lift (core func $i "rep-alias")))
  (func (export "drop-alias") (result u32) (canon lift (core func $i "drop-alias")))
)
