;; A trap raised by the engine inside wasm itself (`unreachable`), not by a
;; built-in, also stops a call that was already queued to enter: the next
;; call is admitted only once the previous one's first slice ended, by which
;; time its trap has been recorded.
(component
  (import "progress" (func $progress (param "step" u32)))

  (core module $libc (memory (export "mem") 1))
  (core instance $libc (instantiate $libc))

  (core func $progress (canon lower (func $progress)))

  (core module $m
    (import "" "progress" (func $progress (param i32)))

    (func (export "trap") (result i32)
      (call $progress (i32.const 1))
      (unreachable))

    (func (export "callback") (param i32 i32 i32) (result i32)
      (i32.const 0))
  )

  (core instance $i
    (instantiate $m
      (with "" (instance
        (export "progress" (func $progress))
      ))
    )
  )

  (func (export "trap") async
    (canon lift (core func $i "trap") async (callback (core func $i "callback"))
      (memory (core memory $libc "mem"))))
)
