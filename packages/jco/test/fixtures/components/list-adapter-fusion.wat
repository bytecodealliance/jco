(component
  (type $test (instance
    (export "list-u8" (func (param "x" (list u8)) (result (list u8))))
    (export "list-s8" (func (param "x" (list s8)) (result (list s8))))
    (export "list-u16" (func (param "x" (list u16)) (result (list u16))))
    (export "list-s16" (func (param "x" (list s16)) (result (list s16))))
    (export "list-u32" (func (param "x" (list u32)) (result (list u32))))
    (export "list-s32" (func (param "x" (list s32)) (result (list s32))))
    (export "list-u64" (func (param "x" (list u64)) (result (list u64))))
    (export "list-s64" (func (param "x" (list s64)) (result (list s64))))
    (export "list-float32" (func (param "x" (list float32)) (result (list float32))))
    (export "list-float64" (func (param "x" (list float64)) (result (list float64))))
  ))
  (import "test" (instance $test (type $test)))

  (component $C
    (import "test" (instance $test (type $test)))

    (core module $libc
      (memory (export "memory") 1)
      (global $next (mut i32) i32.const 128)
      (func $realloc (export "realloc") (param i32 i32 i32 i32) (result i32)
        (local $ret i32)
        (local $next i32)
        (local $page i32)

        ;; assert no realloc is actually happening and this is only an
        ;; allocation function
        (if (local.get 0) (then (unreachable)))
        (if (local.get 1) (then (unreachable)))

        (local.set $ret (global.get $next))

        (local.set $next (i32.add (global.get $next) (local.get 3)))
        (local.set $next (i32.add (local.get $next) (i32.const 15)))
        (local.set $next (i32.and (local.get $next) (i32.const 0xfffffff0)))
        (global.set $next (local.get $next))

        (local.set $page (i32.div_u (local.get $next) (i32.const 65536)))

        (loop $grow
          (i32.ge_u (local.get $page) (memory.size))
          if
            i32.const 1
            memory.grow
            drop
            br $grow
          end
        )

        (local.get $next)
      )
    )
    (core instance $libc (instantiate $libc))
    (alias core export $libc "memory" (core memory $mem))
    (alias core export $libc "realloc" (core func $realloc))

    (core func $list-u8
      (canon lower (func $test "list-u8") (memory $mem) (realloc (func $realloc))))
    (core func $list-s8
      (canon lower (func $test "list-s8") (memory $mem) (realloc (func $realloc))))
    (core func $list-u16
      (canon lower (func $test "list-u16") (memory $mem) (realloc (func $realloc))))
    (core func $list-s16
      (canon lower (func $test "list-s16") (memory $mem) (realloc (func $realloc))))
    (core func $list-u32
      (canon lower (func $test "list-u32") (memory $mem) (realloc (func $realloc))))
    (core func $list-s32
      (canon lower (func $test "list-s32") (memory $mem) (realloc (func $realloc))))
    (core func $list-u64
      (canon lower (func $test "list-u64") (memory $mem) (realloc (func $realloc))))
    (core func $list-s64
      (canon lower (func $test "list-s64") (memory $mem) (realloc (func $realloc))))
    (core func $list-float32
      (canon lower (func $test "list-float32") (memory $mem) (realloc (func $realloc))))
    (core func $list-float64
      (canon lower (func $test "list-float64") (memory $mem) (realloc (func $realloc))))

    (core module $m
      (import "" "list-u8" (func $list-u8 (param i32 i32 i32)))
      (import "" "list-s8" (func $list-s8 (param i32 i32 i32)))
      (import "" "list-u16" (func $list-u16 (param i32 i32 i32)))
      (import "" "list-s16" (func $list-s16 (param i32 i32 i32)))
      (import "" "list-u32" (func $list-u32 (param i32 i32 i32)))
      (import "" "list-s32" (func $list-s32 (param i32 i32 i32)))
      (import "" "list-u64" (func $list-u64 (param i32 i32 i32)))
      (import "" "list-s64" (func $list-s64 (param i32 i32 i32)))
      (import "" "list-float32" (func $list-float32 (param i32 i32 i32)))
      (import "" "list-float64" (func $list-float64 (param i32 i32 i32)))
      (import "libc" "memory" (memory 1))

      (func (export "list-u8") (param i32 i32) (result i32)
        (call $list-u8 (local.get 0) (local.get 1) (i32.const 8)) (i32.const 8))
      (func (export "list-s8") (param i32 i32) (result i32)
        (call $list-s8 (local.get 0) (local.get 1) (i32.const 8)) (i32.const 8))
      (func (export "list-u16") (param i32 i32) (result i32)
        (call $list-u16 (local.get 0) (local.get 1) (i32.const 8)) (i32.const 8))
      (func (export "list-s16") (param i32 i32) (result i32)
        (call $list-s16 (local.get 0) (local.get 1) (i32.const 8)) (i32.const 8))
      (func (export "list-u32") (param i32 i32) (result i32)
        (call $list-u32 (local.get 0) (local.get 1) (i32.const 8)) (i32.const 8))
      (func (export "list-s32") (param i32 i32) (result i32)
        (call $list-s32 (local.get 0) (local.get 1) (i32.const 8)) (i32.const 8))
      (func (export "list-u64") (param i32 i32) (result i32)
        (call $list-u64 (local.get 0) (local.get 1) (i32.const 8)) (i32.const 8))
      (func (export "list-s64") (param i32 i32) (result i32)
        (call $list-s64 (local.get 0) (local.get 1) (i32.const 8)) (i32.const 8))
      (func (export "list-float32") (param i32 i32) (result i32)
        (call $list-float32 (local.get 0) (local.get 1) (i32.const 8)) (i32.const 8))
      (func (export "list-float64") (param i32 i32) (result i32)
        (call $list-float64 (local.get 0) (local.get 1) (i32.const 8)) (i32.const 8))
    )

    (core instance $i (instantiate $m
      (with "libc" (instance $libc))
      (with "" (instance
        (export "list-u8" (func $list-u8))
        (export "list-s8" (func $list-s8))
        (export "list-u16" (func $list-u16))
        (export "list-s16" (func $list-s16))
        (export "list-u32" (func $list-u32))
        (export "list-s32" (func $list-s32))
        (export "list-u64" (func $list-u64))
        (export "list-s64" (func $list-s64))
        (export "list-float32" (func $list-float32))
        (export "list-float64" (func $list-float64))
      ))
    ))

    (func (export "list-u8") (param "x" (list u8)) (result (list u8))
      (canon lift (core func $i "list-u8") (memory $mem) (realloc (func $realloc))))
    (func (export "list-s8") (param "x" (list s8)) (result (list s8))
      (canon lift (core func $i "list-s8") (memory $mem) (realloc (func $realloc))))
    (func (export "list-u16") (param "x" (list u16)) (result (list u16))
      (canon lift (core func $i "list-u16") (memory $mem) (realloc (func $realloc))))
    (func (export "list-s16") (param "x" (list s16)) (result (list s16))
      (canon lift (core func $i "list-s16") (memory $mem) (realloc (func $realloc))))
    (func (export "list-u32") (param "x" (list u32)) (result (list u32))
      (canon lift (core func $i "list-u32") (memory $mem) (realloc (func $realloc))))
    (func (export "list-s32") (param "x" (list s32)) (result (list s32))
      (canon lift (core func $i "list-s32") (memory $mem) (realloc (func $realloc))))
    (func (export "list-u64") (param "x" (list u64)) (result (list u64))
      (canon lift (core func $i "list-u64") (memory $mem) (realloc (func $realloc))))
    (func (export "list-s64") (param "x" (list s64)) (result (list s64))
      (canon lift (core func $i "list-s64") (memory $mem) (realloc (func $realloc))))
    (func (export "list-float32") (param "x" (list float32)) (result (list float32))
      (canon lift (core func $i "list-float32") (memory $mem) (realloc (func $realloc))))
    (func (export "list-float64") (param "x" (list float64)) (result (list float64))
      (canon lift (core func $i "list-float64") (memory $mem) (realloc (func $realloc))))
  )

  (instance $i1 (instantiate $C (with "test" (instance $test))))
  (instance $i2 (instantiate $C (with "test" (instance $i1))))

  (export "result" (instance $i2))
)
