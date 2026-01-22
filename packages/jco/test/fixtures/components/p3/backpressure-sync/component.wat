(component

  ;; This module exposes the ability to manipulate (call) backpressure.set via exported functions.
  (core module $helper
    (import "" "backpressure.inc" (func $backpressure.inc))
    (import "" "backpressure.dec" (func $backpressure.dec))
    (memory 1)
    (func $inc-backpressure
          (export "inc-backpressure")
          (call $backpressure.inc))
    (func $dec-backpressure
          (export "dec-backpressure")
          (call $backpressure.dec))
  ) ;; /core module $helper

  ;; Create core functions that represent the canon instructions
  (canon backpressure.inc (core func $backpressure.inc))
  (canon backpressure.dec (core func $backpressure.dec))

  ;; Instantiate the helper module, w/ access to backpressure.inc/dec canon funcs
  (core instance $helper_inst
    (instantiate $helper
      (with ""
        (instance
          (export "backpressure.inc" (func $backpressure.inc))
          (export "backpressure.dec" (func $backpressure.dec))
        )
      )
    )
  )

  ;; Sync function that enables incrementing backpressure
  (func
   (export "inc-backpressure")
   (canon lift (core func $helper_inst "inc-backpressure")))

  ;; Sync function that enables decrementing backpressure
  (func
   (export "dec-backpressure")
   (canon lift (core func $helper_inst "dec-backpressure")))
) ;; /component
