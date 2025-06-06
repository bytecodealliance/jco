(component

  ;; The helper module exposes transparently it's managed context values
  ;; via exported functions.
  ;;
  ;; In normal components, the value being saved/retrieved from context is
  ;; more likely to be a pointer to memory that contains thread local storage (TLS)
  (core module $helper
    (import "" "context.set" (func $context.set (param i32)))
    (import "" "context.get" (func $context.get (result i32)))

    (memory 1)

    ;; This function enables setting context synchronously
    (func $push-context
          (export "push-context")
          (param $val i32)
          (result i32)
          (call $context.set (local.get $val))
          (local.get $val))

    ;; This function enables getting context, synchronously
    (func $pull-context
          (export "pull-context")
          (result i32)
          (call $context.get))
  ) ;; /core module $helper

  ;; Create core functions that represent the canon instructions
  (canon context.set i32 0 (core func $context.set))
  (canon context.get i32 0 (core func $context.get))

  (core instance $helper_inst
    (instantiate $helper
      (with ""
        (instance
          (export "context.get" (func $context.get))
          (export "context.set" (func $context.set))
        )
      )
    )
  )

  ;; Sync function that enables setting the context value
  (func
   (export "push-context")
   (param "val" u32)
   (result u32)
   (canon lift (core func $helper_inst "push-context")))

  ;; Sync function that enables getting the context value
  (func
   (export "pull-context")
   (result u32)
   (canon lift (core func $helper_inst "pull-context")))

) ;; /component
