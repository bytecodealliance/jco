;; A component instance has one handle table for resource handles, waitables,
;; waitable sets and error contexts (Canonical ABI `inst.handles`): indices
;; are allocated from one space, and a freed index is reused (LIFO) whatever
;; kind of handle freed it.
(component
  (type $thing (resource (rep i32)))
  (type $future-u32 (future u32))

  (core func $new (canon resource.new $thing))
  (core func $drop (canon resource.drop $thing))
  (core func $future-new (canon future.new $future-u32))
  (core func $wset-new (canon waitable-set.new))
  (core func $wset-drop (canon waitable-set.drop))

  (core module $m
    (import "" "resource.new" (func $new (param i32) (result i32)))
    (import "" "resource.drop" (func $drop (param i32)))
    (import "" "future.new" (func $future-new (result i64)))
    (import "" "waitable-set.new" (func $wset-new (result i32)))
    (import "" "waitable-set.drop" (func $wset-drop (param i32)))

    ;; future.new takes indices 1 and 2; the resource gets 3.
    (func (export "resource-after-future") (result i32)
      (drop (call $future-new))
      (call $new (i32.const 7)))

    ;; A waitable set takes 1; dropping it frees 1 for the resource; the
    ;; resource's drop frees 1 again for the next set. Returns
    ;; (set << 16) | (resource << 8) | next-set.
    (func (export "reuse-across-kinds") (result i32)
      (local $set i32) (local $r i32) (local $next i32)
      (local.set $set (call $wset-new))
      (call $wset-drop (local.get $set))
      (local.set $r (call $new (i32.const 9)))
      (call $drop (local.get $r))
      (local.set $next (call $wset-new))
      (i32.or
        (i32.or (i32.shl (local.get $set) (i32.const 16)) (i32.shl (local.get $r) (i32.const 8)))
        (local.get $next)))
  )

  (core instance $i
    (instantiate $m
      (with "" (instance
        (export "resource.new" (func $new))
        (export "resource.drop" (func $drop))
        (export "future.new" (func $future-new))
        (export "waitable-set.new" (func $wset-new))
        (export "waitable-set.drop" (func $wset-drop))
      ))
    )
  )

  (func (export "resource-after-future") (result u32)
    (canon lift (core func $i "resource-after-future")))
  (func (export "reuse-across-kinds") (result u32)
    (canon lift (core func $i "reuse-across-kinds")))
)
