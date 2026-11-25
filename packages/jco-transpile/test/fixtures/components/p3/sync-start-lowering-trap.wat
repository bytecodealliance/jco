;; A synchronously lowered call of an async-typed function lowers its
;; arguments once the callee's task has entered (Canonical ABI `canon_lift`).
;; Here the callee's `realloc` traps while they are lowered, after `take`'s
;; task has taken the exclusive lock of $C on entry. The failed task releases
;; what entry took, so a later call of `ping`, which needs the lock too, does
;; not wait on it forever.
(component
  (component $C
    (core module $m
      (memory (export "mem") 1)
      (func (export "realloc") (param i32 i32 i32 i32) (result i32) unreachable)
      (func (export "take") (param i32 i32))
      (func (export "ping") (result i32) (i32.const 9))
    )
    (core instance $i (instantiate $m))
    (func (export "take") async (param "s" string)
      (canon lift (core func $i "take") (memory (core memory $i "mem")) (realloc (core func $i "realloc"))))
    (func (export "ping") async (result u32)
      (canon lift (core func $i "ping")))
  )

  (component $D
    (import "take" (func $take async (param "s" string)))
    (core module $mem (memory (export "mem") 1) (data (i32.const 0) "hello"))
    (core instance $mem (instantiate $mem))
    (core func $take (canon lower (func $take) (memory (core memory $mem "mem"))))
    (core module $m
      (import "" "take" (func $take (param i32 i32)))
      (func (export "run") (call $take (i32.const 0) (i32.const 5)))
    )
    (core instance $i (instantiate $m (with "" (instance (export "take" (func $take))))))
    (func (export "run") (canon lift (core func $i "run")))
  )

  (instance $c (instantiate $C))
  (instance $d (instantiate $D (with "take" (func $c "take"))))
  (export "run" (func $d "run"))
  (export "ping" (func $c "ping"))
)
