(component
  (core module $core
    (import "" "future.new" (func $future-new (result i64)))
    (import "" "future.drop-writable" (func $future-drop-writable (param i32)))

    (func (export "trap")
      (local $handles i64)

      (local.set $handles (call $future-new))
      (call $future-drop-writable
        (i32.wrap_i64
          (i64.shr_u (local.get $handles) (i64.const 32))))
    )

    (func (export "ok") (result i32)
      (i32.const 42)
    )

    (func (export "take-u32") (param i32))
  )

  (type $future-u8 (future u8))
  (canon future.new $future-u8 (core func $future-new))
  (canon future.drop-writable $future-u8 (core func $future-drop-writable))

  (core instance $instance
    (instantiate $core
      (with "" (instance
        (export "future.new" (func $future-new))
        (export "future.drop-writable" (func $future-drop-writable))
      ))
    )
  )

  (func (export "trap") async
    (canon lift (core func $instance "trap"))
  )

  (func (export "ok") (result u32)
    (canon lift (core func $instance "ok"))
  )
  (func (export "take-u32") (param "value" u32)
    (canon lift (core func $instance "take-u32"))
  )
)
