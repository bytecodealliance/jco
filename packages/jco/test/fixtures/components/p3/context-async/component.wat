(component

  ;; The helper module exposes transparently it's managed context values
  ;; via exported functions.
  ;;
  ;; In normal components, the value being saved/retrieved from context is
  ;; more likely to be a pointer to memory that contains thread local storage (TLS)
  (core module $helper
    (import "" "context.set" (func $context.set (param i32)))
    (import "" "context.get" (func $context.get (result i32)))
    (import "" "task.return0" (func $task.return0))
    (import "" "task.return1" (func $task.return1 (param i32)))

    (memory 1)

    ;; This function enables setting context,
    ;; with an stackless async callback that always exits cleanly
    ;; (i.e. after the initial save + yield)
    (func $push-context
          (export "push-context")
          (param $val i32)
          (result i32)
          (call $context.set (local.get $val))
          (i32.const 1)) ;; YIELD
    (func $push-context-cb
          (export "push-context-cb")
          (param i32 i32 i32)
          (result i32)
          (call $task.return0)
          (i32.const 0)) ;; EXIT

    ;; This function enables getting context,
    ;; with an stackless async callback that always exits cleanly
    ;; (i.e. after the initial yield)
    (func $pull-context
          (export "pull-context")
          (result i32)
          (i32.const 1)) ;; YIELD
    (func $pull-context-cb
          (export "pull-context-cb")
          (param i32 i32 i32)
          (result i32)
          (call $task.return1 (call $context.get))
          (i32.const 0)) ;; EXIT
  ) ;; /core module $helper

  ;; Create core functions that represent the canon instructions
  (canon context.set i32 0 (core func $context.set))
  (canon context.get i32 0 (core func $context.get))
  (canon task.return (core func $task.return0))
  (canon task.return (result u32) (core func $task.return1))

  (core instance $helper_inst
    (instantiate $helper
      (with ""
        (instance
          (export "context.get" (func $context.get))
          (export "context.set" (func $context.set))
          (export "task.return0" (func $task.return0))
          (export "task.return1" (func $task.return1))
        )
      )
    )
  )

  ;; Async function that enables "pushing" context (stackless)
  ;; (this function always yields after performing work but before returning)
  (func
   (export "push-context")
   (param "val" u32)
   (result u32)
   (canon lift
          (core func $helper_inst "push-context")
          async
          (callback (func $helper_inst "push-context-cb"))))

  ;; Async function that enables "pulling" context (stackless)
  ;; (this function always yields after performing work but before returning)
  (func
   (export "pull-context")
   (result u32)
   (canon lift
          (core func $helper_inst "pull-context")
          async
          (callback (func $helper_inst "pull-context-cb"))))

) ;; /component
