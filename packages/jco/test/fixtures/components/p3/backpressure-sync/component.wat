(component

  ;; This module exposes the ability to manipulate (call) backpressure.set via exported functions.
  (core module $helper
    (import "" "backpressure.set" (func $backpressure.set (param i32)))
    (memory 1)
    (func $set-backpressure
          (export "set-backpressure")
          (param $val i32)
          (result i32)
          (call $backpressure.set (local.get $val))
          (local.get $val))
  ) ;; /core module $helper

  ;; Create core functions that represent the canon instructions
  (canon backpressure.set (core func $backpressure.set))

  ;; Instantiate the helper module, w/ access to backpressure.set canon func
  (core instance $helper_inst
    (instantiate $helper
      (with ""
        (instance
          (export "backpressure.set" (func $backpressure.set))
        )
      )
    )
  )

  ;; Sync function that enables setting backpressure to a given value
  (func
   (export "set-backpressure")
   (param "val" u32)
   (result u32)
   (canon lift (core func $helper_inst "set-backpressure")))
) ;; /component
